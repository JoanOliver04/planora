/** Explicit opt-in: copy the curated library into the requested portfolio. */
import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
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
const demoCopy = {
  66: {
    label: { en: "Demo agenda", es: "Agenda de la demo" },
    caption: {
      en: "Today shows the day's tasks and a shortcut to Focus",
      es: "Hoy muestra las tareas del día y un acceso directo a Enfoque",
    },
  },
  67: {
    label: { en: "Try Focus", es: "Probar Enfoque" },
    caption: {
      en: "The 15-second demo timer linked to a task on mobile",
      es: "El temporizador de prueba de 15 segundos vinculado a una tarea en móvil",
    },
  },
  68: {
    label: { en: "Demo results", es: "Resultados de la demo" },
    caption: {
      en: "The completed session appears in the weekly focus report",
      es: "La sesión completada aparece en el informe semanal de enfoque",
    },
  },
  69: {
    label: { en: "Demo theme", es: "Tema de la demo" },
    caption: {
      en: "Demo settings on mobile after switching from light to dark",
      es: "Ajustes de la demo en móvil después de cambiar del modo claro al oscuro",
    },
  },
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
const existing = JSON.parse(
  source.slice(start, end).trim().slice("images: ".length, -1),
);
const cover = await sharp(join(ROOT, "docs/images", selections[0].file))
  .resize({ width: 520 })
  .webp({ quality: 84 })
  .toBuffer();
const coverName =
  "planora-" +
  createHash("sha256").update(cover).digest("hex").slice(0, 10) +
  ".webp";
const entries = selections.map((item, index) => {
  const src = "/projects/planora/" + basename(item.file);
  const copy = demoCopy[item.id] ?? existing.find((entry) => entry.src === src);
  if (!copy?.label || !copy?.caption)
    throw new Error("Missing bilingual gallery copy for " + src);
  return {
    src,
    ...(index === 0 ? { thumbnail: "/project-covers/" + coverName } : {}),
    aspectRatio: item.width + " / " + item.height,
    label: copy.label,
    caption: copy.caption,
  };
});
const gallery =
  "    images: " +
  JSON.stringify(entries, null, 2).replaceAll("\n", "\n    ") +
  ",\n";
const destination = join(portfolio, "public/projects/planora");
await access(join(portfolio, "package.json"));
await mkdir(destination, { recursive: true });
await writeFile(join(portfolio, "public/project-covers", coverName), cover);
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
