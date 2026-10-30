// @vitest-environment node
import { describe, expect, it } from "vitest";
import { evaluateAuditResult } from "../scripts/audit-high.mjs";
import { assertLocalTestEnvironment } from "../scripts/assert-local-test-env.mjs";

type Severity = "info" | "low" | "moderate" | "high" | "critical";
function auditResult(severities: Severity[] = []) {
  const counts = {
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
    total: 0,
  };
  const vulnerabilities: Record<string, { name: string; severity: Severity }> =
    {};
  severities.forEach((severity, index) => {
    counts[severity] += 1;
    counts.total += 1;
    vulnerabilities[`package-${index}`] = {
      name: `package-${index}`,
      severity,
    };
  });
  return {
    status: severities.length ? 1 : 0,
    stdout: JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities,
      metadata: { vulnerabilities: counts },
    }),
  };
}

describe("dependency audit gate", () => {
  it("accepts a complete clean report and keeps the high/critical threshold", () => {
    expect(evaluateAuditResult(auditResult())).toEqual([]);
    expect(evaluateAuditResult(auditResult(["low", "moderate"]))).toEqual([]);
    expect(evaluateAuditResult(auditResult(["high", "critical"]))).toHaveLength(
      2,
    );
  });

  it("never allowlists the previous braces advisory", () => {
    const result = auditResult(["high"]);
    const report = JSON.parse(result.stdout);
    report.vulnerabilities["package-0"].via = [
      { url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" },
    ];
    result.stdout = JSON.stringify(report);
    expect(evaluateAuditResult(result)).toHaveLength(1);
  });

  it.each([
    { status: 1, stdout: JSON.stringify({ error: { code: "ENOAUDIT" } }) },
    { status: 1, stdout: "network unavailable" },
    { status: 0, stdout: "{}" },
    { status: 2, stdout: auditResult().stdout },
    { status: null, signal: "SIGTERM", stdout: auditResult().stdout },
    {
      status: 0,
      error: new Error("spawn failed"),
      stdout: auditResult().stdout,
    },
    { status: 1, stdout: auditResult().stdout },
  ])("fails closed for incomplete or failed audit execution: %j", (result) => {
    expect(() => evaluateAuditResult(result)).toThrow(
      /dependency safety is unknown/,
    );
  });

  it("rejects inconsistent severity counters instead of claiming success", () => {
    const result = auditResult(["high"]);
    const report = JSON.parse(result.stdout);
    report.metadata.vulnerabilities.high = 0;
    result.stdout = JSON.stringify(report);
    expect(() => evaluateAuditResult(result)).toThrow(/inconsistent/);
  });
});

describe("privileged integration environment", () => {
  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://[::1]:54321",
  ])("allows a loopback Supabase instance: %s", (url) => {
    expect(() =>
      assertLocalTestEnvironment({ url, serviceRole: "test-only-key" }),
    ).not.toThrow();
  });

  it.each([
    undefined,
    "invalid",
    "https://production.supabase.co",
    "https://localhost.example.com",
    "https://127.0.0.1.example.com",
    "https://localhost@production.supabase.co",
    "https://user:password@127.0.0.1:54321",
    "ftp://localhost:54321",
  ])(
    "refuses unsafe administration targets without exposing credentials: %s",
    (url) => {
      expect(() =>
        assertLocalTestEnvironment({
          url,
          serviceRole: "never-print-this-key",
        }),
      ).toThrow(/Refusing privileged E2E tests/);
    },
  );

  it("does not block public tests with no service-role credential", () => {
    expect(() =>
      assertLocalTestEnvironment({ url: "https://example.supabase.co" }),
    ).not.toThrow();
  });
});
