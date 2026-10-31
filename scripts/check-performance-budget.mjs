import { readFile } from "node:fs/promises";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath)
  throw new Error(
    "Usage: node scripts/check-performance-budget.mjs before.json after.json",
  );
const before = JSON.parse(await readFile(beforePath, "utf8"));
const after = JSON.parse(await readFile(afterPath, "utf8"));
if (JSON.stringify(before.workload) !== JSON.stringify(after.workload))
  throw new Error("Performance comparison requires identical workloads");
const routes = [...new Set(before.results.map((sample) => sample.route))];
const median = (values) =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const regressions = [];
for (const route of routes) {
  const base = before.results.filter((sample) => sample.route === route);
  const candidate = after.results.filter((sample) => sample.route === route);
  if (
    base.length !== before.workload.samplesPerRoute ||
    candidate.length !== base.length
  )
    throw new Error(`Incomplete measurements for ${route}`);
  const oldBytes = median(base.map((sample) => sample.jsEncodedBytes));
  const newBytes = median(candidate.map((sample) => sample.jsEncodedBytes));
  console.log(
    `${route}: initial JavaScript ${oldBytes} -> ${newBytes} encoded bytes; median ready ${Math.round(median(base.map((sample) => sample.readyMs)))} -> ${Math.round(median(candidate.map((sample) => sample.readyMs)))} ms`,
  );
  // Chunk hashes and small compiler changes can vary slightly. Timing is
  // reported separately: three CI samples do not establish tail latency.
  if (newBytes > oldBytes * 1.02 + 2048) regressions.push(route);
}
if (regressions.length)
  throw new Error(
    `Initial JavaScript budget exceeded: ${regressions.join(", ")}`,
  );
