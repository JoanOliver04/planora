import { spawnSync } from "node:child_process";

// braces@3.0.3 has no patched release (GHSA-vfj7-8cjw-p6xm). It is only
// installed for ESLint, through eslint-config-next → fast-glob → micromatch.
// npm's suggested fix downgrades eslint-config-next to 14, which cannot lint
// this Next.js 16 app. Any other high or critical advisory still fails CI.
const allowedAdvisories = new Set(["GHSA-vfj7-8cjw-p6xm"]);

const result = spawnSync("npm", ["audit", "--json"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

const stdout = result.stdout ?? "";
const start = stdout.indexOf("{");
let report;
try {
  report = JSON.parse(start === -1 ? stdout : stdout.slice(start));
} catch {
  console.error(result.stderr || stdout || "npm audit did not return JSON");
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};

function advisoryId(url) {
  if (typeof url !== "string") return "";
  const id = url.split("/").filter(Boolean).pop() ?? "";
  return id.startsWith("GHSA-") ? id : "";
}

function isAllowed(name, seen = new Set()) {
  if (seen.has(name)) return false;
  seen.add(name);
  const vulnerability = vulnerabilities[name];
  const via = vulnerability?.via;
  if (!Array.isArray(via) || via.length === 0) return false;
  return via.every((item) => {
    if (typeof item === "string") return isAllowed(item, seen);
    return allowedAdvisories.has(advisoryId(item?.url));
  });
}

const blocking = Object.values(vulnerabilities).filter((vulnerability) => {
  const severity = vulnerability?.severity;
  if (severity !== "high" && severity !== "critical") return false;
  return !isAllowed(vulnerability.name);
});

if (blocking.length > 0) {
  for (const vulnerability of blocking) {
    console.error(
      `${vulnerability.severity} ${vulnerability.name} ${vulnerability.range ?? ""}`.trim(),
    );
  }
  process.exit(1);
}

const allowed = Object.values(vulnerabilities).filter(
  (vulnerability) =>
    (vulnerability?.severity === "high" ||
      vulnerability?.severity === "critical") &&
    isAllowed(vulnerability.name),
);

if (allowed.length === 0) {
  console.log("npm audit: no high or critical vulnerabilities");
} else {
  const names = allowed.map((vulnerability) => vulnerability.name).join(", ");
  console.log(
    `npm audit: high findings limited to the unfixed dev-only braces advisory (${names})`,
  );
}
