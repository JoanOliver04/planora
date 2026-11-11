/** Explicit opt-in: copy the curated library into the requested portfolio. */
import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { createHash } from "node:crypto";
import { ROOT } from "./environment.mjs";

const target = process.argv[2];
if (!target) throw new Error("Provide the portfolio directory explicitly.");
const portfolio = resolve(target);
const file = join(portfolio, "src/content/developerTools.ts");
const source = await readFile(file, "utf8");
const manifest = JSON.parse(
  await readFile(join(ROOT, "docs/images/manifest.json"), "utf8"),
);
const selections = manifest.selections.portfolio;
const english = {
  "01": "A calmer way to plan",
  "04": "Daily planning and weekly progress",
  "08": "The complete week at a glance",
  15: "Tasks, filters and recurrence",
  43: "Focus presets and four weeks of goals",
  47: "Deep work in progress",
  50: "Structured plans: current and next block",
  52: "Planned versus actual session summary",
  27: "Progress and patterns",
  12: "The month ahead",
  33: "Reminders and alarms",
  "07": "Daily planning on mobile",
  56: "Mobile concentration mode",
  38: "Appearance and personalization",
};
if (selections.length !== 14 || !source.includes('id: "planora"'))
  throw new Error("Unexpected gallery or portfolio structure.");
const start = source.indexOf("    images: [", source.indexOf('id: "planora"'));
const end = source.indexOf("    technologies:", start);
if (start < 0 || end < 0) throw new Error("Cannot locate the Planora gallery.");
for (const item of selections) {
  const image = manifest.images.find((image) => image.id === item.id);
  if (
    image.visualReview?.status !== "accepted" ||
    image.visualReview.sha256 !== image.sha256
  )
    throw new Error("Review required: " + item.id);
  const input = join(ROOT, "docs/images", item.file);
  if (
    createHash("sha256")
      .update(await readFile(input))
      .digest("hex") !== item.sha256
  )
    throw new Error("Asset hash mismatch: " + item.file);
}
const entries = selections.map((item) => ({
  src: "/projects/planora/" + basename(item.file),
  caption: { en: english[item.id], es: item.title },
}));
const gallery =
  "    images: " +
  JSON.stringify(entries, null, 2).replaceAll("\n", "\n    ") +
  ",\n";
const destination = join(portfolio, "public/projects/planora");
await access(join(portfolio, "package.json"));
await mkdir(destination, { recursive: true });
for (const item of selections)
  await copyFile(
    join(ROOT, "docs/images", item.file),
    join(destination, basename(item.file)),
  );
if ((await readFile(file, "utf8")) !== source)
  throw new Error(
    "Portfolio content changed during synchronization; refusing to overwrite it.",
  );
await writeFile(file, source.slice(0, start) + gallery + source.slice(end));
console.log(
  "Updated only the Planora gallery: " +
    entries.length +
    " reviewed WebP images.",
);
