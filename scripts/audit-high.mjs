import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const severities = ["info", "low", "moderate", "high", "critical"];
const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Validate the audit outcome before deciding whether CI may proceed. */
export function evaluateAuditResult(result) {
  if (result.error || result.signal || ![0, 1].includes(result.status)) {
    throw new Error(
      "npm audit failed to complete; dependency safety is unknown",
    );
  }

  let report;
  try {
    report = JSON.parse(result.stdout ?? "");
  } catch {
    throw new Error(
      "npm audit returned invalid JSON; dependency safety is unknown",
    );
  }
  const counts = report?.metadata?.vulnerabilities;
  if (
    !isRecord(report) ||
    Object.hasOwn(report, "error") ||
    report.auditReportVersion !== 2 ||
    !isRecord(report.vulnerabilities) ||
    !isRecord(counts) ||
    [...severities, "total"].some(
      (severity) =>
        !Number.isSafeInteger(counts[severity]) || counts[severity] < 0,
    )
  ) {
    throw new Error(
      "npm audit returned an incomplete report; dependency safety is unknown",
    );
  }

  const vulnerabilities = Object.values(report.vulnerabilities);
  if (
    vulnerabilities.some(
      (entry) =>
        !isRecord(entry) ||
        typeof entry.name !== "string" ||
        !entry.name ||
        !severities.includes(entry.severity),
    ) ||
    counts.total !== vulnerabilities.length ||
    severities.some(
      (severity) =>
        counts[severity] !==
        vulnerabilities.filter((entry) => entry.severity === severity).length,
    ) ||
    (result.status === 1 && counts.total === 0)
  ) {
    throw new Error(
      "npm audit returned inconsistent results; dependency safety is unknown",
    );
  }

  return vulnerabilities.filter(
    (entry) => entry.severity === "high" || entry.severity === "critical",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = spawnSync("npm", ["audit", "--json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  try {
    const blocking = evaluateAuditResult(result);
    if (blocking.length > 0) {
      for (const entry of blocking) {
        console.error(`${entry.severity} ${entry.name}`);
      }
      process.exitCode = 1;
    } else {
      console.log("npm audit: no high or critical vulnerabilities");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "npm audit failed");
    process.exitCode = 1;
  }
}
