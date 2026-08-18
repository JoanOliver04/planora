import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/security/redirect";
import {
  exceedsContentLength,
  hasJsonContentType,
  isSameOriginRequest,
} from "@/lib/security/request";
import { isPrivateAppPath } from "@/lib/security/routes";
import { contentSecurityPolicy } from "@/lib/security/csp";
import { requestKey } from "@/lib/security/rate-limit";
import { guidedOnboardingSchema } from "@/app/actions/domain-validation";

describe("security boundaries", () => {
  it("allows internal redirect paths with query strings", () => {
    expect(safeRedirectPath("/en/today?view=week", "/fallback")).toBe(
      "/en/today?view=week",
    );
  });

  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/\\evil.example/path",
    "\\\\evil.example/path",
    "/path\nSet-Cookie: injected=true",
  ])("rejects unsafe redirect %s", (value) => {
    expect(safeRedirectPath(value, "/fallback")).toBe("/fallback");
  });

  it("validates request origin, content type and bounded payloads", () => {
    const request = new Request("https://planora.app/api/telemetry", {
      method: "POST",
      headers: {
        origin: "https://planora.app",
        "content-type": "application/json; charset=utf-8",
        "content-length": "4097",
      },
    });
    expect(isSameOriginRequest(request)).toBe(true);
    expect(hasJsonContentType(request)).toBe(true);
    expect(exceedsContentLength(request, 4096)).toBe(true);
    expect(
      isSameOriginRequest(
        new Request("https://planora.app/api/telemetry", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toBe(false);
  });

  it("marks every authenticated workspace route as private", () => {
    expect(isPrivateAppPath("/es/today")).toBe(true);
    expect(isPrivateAppPath("/en/data")).toBe(true);
    expect(isPrivateAppPath("/es/tasks/new")).toBe(true);
    expect(isPrivateAppPath("/es/focus")).toBe(true);
    expect(isPrivateAppPath("/en/focus")).toBe(true);
    expect(isPrivateAppPath("/es/month")).toBe(true);
    expect(isPrivateAppPath("/en/search")).toBe(true);
    expect(isPrivateAppPath("/es/summary")).toBe(true);
    expect(isPrivateAppPath("/es/privacy")).toBe(false);
    expect(isPrivateAppPath("/en/demo/today")).toBe(false);
  });

  it("prefers the forwarded client address over a spoofable real-ip header", () => {
    const request = new Request("https://planora.app/api/telemetry", {
      headers: {
        "x-real-ip": "1.2.3.4",
        "x-forwarded-for": "9.9.9.9, 10.0.0.1",
      },
    });
    expect(requestKey(request, "telemetry")).toBe("telemetry:9.9.9.9");
  });

  it("rejects an invalid onboarding timezone before it reaches SQL", () => {
    expect(() =>
      guidedOnboardingSchema.parse({
        goal: "habits",
        scheduleName: "Rutina",
        timezone: "Not/AZone",
        weekStart: 1,
        accent: "#4f6b45",
        skip: false,
      }),
    ).toThrow();
  });

  it("blocks script attributes and limits executable scripts to the app", () => {
    const policy = contentSecurityPolicy();
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).not.toContain("https: 'unsafe-inline'");
  });

  it("uses a per-request nonce instead of script unsafe-inline when provided", () => {
    const policy = contentSecurityPolicy({ nonce: "abc123" });
    expect(policy).toContain("'nonce-abc123'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("serves a hydratable CSP because Next 16 does not stamp script nonces", () => {
    const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
    expect(proxy).toContain("contentSecurityPolicy({");
    expect(proxy).not.toMatch(/contentSecurityPolicy\(\{[\s\S]*nonce,/);
    expect(contentSecurityPolicy()).toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});
