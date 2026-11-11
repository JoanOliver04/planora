import sharp from "sharp";
import { format } from "prettier";
import { createHash } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  access,
  readdir,
  unlink,
} from "node:fs/promises";
import { join, basename } from "node:path";
import { ROOT, WORK } from "./environment.mjs";
import { scenes } from "./catalog.mjs";
import { FIXTURE_VERSION } from "./fixtures.mjs";

export const OUT = join(ROOT, "docs", "images");
export const MANIFEST = join(OUT, "manifest.json");
export async function readManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST, "utf8"));
  } catch {
    return { images: [] };
  }
}
export async function saveManifest(manifest) {
  await mkdir(OUT, { recursive: true });
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
}
const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  );
const yes = (value) => (value ? "✓" : "—");
const dimensions = async (file) => {
  const metadata = await sharp(file).metadata();
  return { width: metadata.width, height: metadata.height };
};
const writeMarkdown = async (file, contents) =>
  writeFile(
    file,
    await format(contents, { filepath: file, endOfLine: "auto" }),
  );
const captions = {
  "01": "A calmer way to plan",
  "04": "Today at a glance",
  "07": "Today on mobile",
  "08": "Weekly planning",
  11: "A week in your pocket",
  12: "The month ahead",
  15: "Tasks, filters and recurrence",
  21: "Events in context",
  24: "Completion history",
  27: "Progress and patterns",
  30: "Independent schedules",
  31: "Color-coded categories",
  33: "Reminders and alarms",
  40: "Your data, your control",
  41: "Mobile personalization",
  43: "Focus: presets and weekly rhythm",
  45: "Reusable Focus presets",
  47: "Deep work in progress",
  50: "Structured Focus plans",
  52: "A thoughtful session summary",
  53: "Flexible weekly goals",
  54: "Focus statistics",
  56: "Mobile concentration mode",
  61: "Reusable planning templates",
  62: "Search the whole workspace",
};
const orders = {
  portfolio: [
    "01",
    "04",
    "08",
    "15",
    "43",
    "47",
    "50",
    "52",
    "27",
    "12",
    "33",
    "07",
    "56",
    "38",
  ],
  linkedin: ["01", "04", "08", "15", "43", "51", "27", "07", "56", "40"],
};

export async function generateAssets(manifest, { updateReadme = false } = {}) {
  const accepted = manifest.images.filter(
    (image) => image.status === "captured",
  );
  const selections = { readme: [], portfolio: [], linkedin: [] };
  let reviews = {};
  try {
    reviews = JSON.parse(await readFile(join(OUT, "review.json"), "utf8"));
  } catch {
    /* first review */
  }
  for (const image of accepted) {
    const editorial = scenes.find((scene) => scene.id === image.id);
    for (const kind of Object.keys(selections)) image[kind] = editorial?.[kind];
    const source = join(OUT, image.filename);
    if (!(await exists(source)))
      throw new Error("Missing accepted image: " + image.filename);
    const sha = createHash("sha256")
      .update(await readFile(source))
      .digest("hex");
    if (sha !== image.sha256)
      throw new Error(
        "Capture changed outside the recorded run: " + image.filename,
      );
    image.pixels = await dimensions(source);
    image.visualReview =
      reviews[image.id]?.sha256 === image.sha256
        ? reviews[image.id]
        : { status: "pending" };
    for (const kind of Object.keys(selections)) {
      if (!image[kind]) continue;
      await mkdir(join(OUT, kind), { recursive: true });
      const extension = kind === "linkedin" ? ".png" : ".webp";
      const filename = basename(image.filename, ".png") + extension;
      const destination = join(OUT, kind, filename);
      const transformer = sharp(source);
      transformer.resize({
        width:
          image.device === "mobile"
            ? kind === "readme"
              ? 780
              : 1170
            : kind === "readme"
              ? 1440
              : kind === "portfolio"
                ? 2400
                : 1600,
        withoutEnlargement: true,
      });
      if (extension === ".webp")
        await transformer
          .webp({ quality: kind === "portfolio" ? 94 : 91, effort: 6 })
          .toFile(destination);
      else
        await transformer
          .png({ compressionLevel: 9, effort: 10 })
          .toFile(destination);
      selections[kind].push({
        id: image.id,
        file: kind + "/" + filename,
        title: image.title,
        sha256: createHash("sha256")
          .update(await readFile(destination))
          .digest("hex"),
        ...(await dimensions(destination)),
      });
    }
  }
  for (const [kind, order] of Object.entries(orders))
    selections[kind].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const [kind, items] of Object.entries(selections)) {
    await mkdir(join(OUT, kind), { recursive: true });
    const extension = kind === "linkedin" ? ".png" : ".webp";
    const managed = new Set(
      scenes.map((scene) => basename(scene.filename, ".png") + extension),
    );
    const selected = new Set(items.map((item) => basename(item.file)));
    for (const file of await readdir(join(OUT, kind))) {
      if (managed.has(file) && !selected.has(file))
        await unlink(join(OUT, kind, file));
    }
  }
  manifest.assetPipelineSha256 = createHash("sha256")
    .update(await readFile(join(ROOT, "scripts", "screenshots", "assets.mjs")))
    .digest("hex");
  manifest.selections = selections;
  await saveManifest(manifest);
  await writeFile(
    join(OUT, "selections.json"),
    JSON.stringify(selections, null, 2) + "\n",
  );
  const rows = accepted
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (image) =>
        "| [" +
        image.filename +
        "](images/" +
        image.filename +
        ") | " +
        image.title +
        " | " +
        image.width +
        "×" +
        image.height +
        " @" +
        image.scale +
        "x" +
        (image.crop ? " · detalle de panel" : "") +
        " | " +
        image.theme +
        " | " +
        image.locale +
        " | " +
        yes(image.readme) +
        " | " +
        yes(image.portfolio) +
        " | " +
        yes(image.linkedin) +
        " |",
    );
  const doc = [
    "# Biblioteca visual de Planora",
    "",
    "Capturas reales del producto, preparadas localmente a partir del README. No hay imágenes generadas, respuestas simuladas ni cambios en la política CSP.",
    "",
    "- Fuente de producto: README, sección Features.",
    "- Commit base de la app: " +
      manifest.source?.commit +
      "; los cambios locales se identifican mediante appDiffSha256 en el manifiesto.",
    "- Fixture: " +
      manifest.fixtureVersion +
      "; referencia " +
      manifest.referenceDate +
      ", Europe/Madrid.",
    "- Resolución: masters PNG a 2x en escritorio y 3x en móvil. Los detalles de panel conservan su viewport de renderizado y se identifican en el inventario.",
    "- Selecciones listas para revisar: [README](images/readme/), [portfolio](images/portfolio/) y [LinkedIn](images/linkedin/).",
    "- Datos completamente sintéticos. Notificaciones y alarmas muestran configuración real, sin afirmar recepción física.",
    "",
    "## Criterio editorial",
    "",
    "La historia combina un proyecto de producto, aprendizaje de inglés, programación, piano y bienestar. El horario principal reúne trabajo y hábitos globales; los otros horarios muestran contextos alternativos. El historial, los objetivos y las estadísticas se calculan desde los mismos registros.",
    "",
    "Predomina el tema claro en español para planificación y gestión. Inglés en las vistas de presentación y Focus amplía la utilidad profesional. El oscuro se reserva para concentración, preferencias y algunas vistas móviles. Las razones concretas constan en manifest.json.",
    "Los límites de captura se alinean con grupos, tarjetas o paneles completos. Semana usa un formato panorámico; Mes adapta la altura para conservar todas las filas. Las vistas móviles mantienen la barra inferior, excepto el modo de concentración nativo y los detalles de panel identificados como tales.",
    "",
    "## Selecciones recomendadas",
    "",
    "README: una portada, ocho vistas principales, doce adicionales en un desplegable y cuatro móviles. Las imágenes enlazan al master PNG. Las variantes WebP reducen el peso de lectura en GitHub.",
    "",
    ...["portfolio", "linkedin"].flatMap((kind) => [
      "### " +
        (kind === "portfolio"
          ? "Portfolio — " + selections[kind].length + " imágenes"
          : "LinkedIn — " + selections[kind].length + " imágenes"),
      "",
      kind === "portfolio"
        ? "Orden sugerido: producto, planificación, gestión, profundidad de Focus, progreso y experiencia móvil. WebP de hasta 2400 px de ancho; las vistas móviles conservan 1170 px."
        : "Orden sugerido para una publicación o carrusel: visión general, uso diario, Focus, resultados, móvil y control de los datos. PNG de hasta 1600 px de ancho; móviles a 1170 px. No se ha publicado nada.",
      "",
      ...selections[kind].map(
        (item, index) =>
          String(index + 1) +
          ". [" +
          basename(item.file) +
          "](images/" +
          item.file +
          ") — " +
          item.title +
          ".",
      ),
      "",
    ]),
    "",
    "## Regeneración",
    "",
    "Requiere Node.js, Docker, Supabase CLI y Chromium de Playwright. El comando crea un proyecto local exclusivo en puertos 5732x y arranca un build de producción en 3110. No carga credenciales de producción del entorno para sembrar datos.",
    "",
    "~~~powershell",
    "npm run docs:captures -- --list",
    "npm run docs:captures",
    "npm run docs:captures -- --only 04,08,47",
    "npm run docs:captures -- --group focus",
    "npm run docs:captures -- --device mobile",
    "~~~",
    "",
    "SUPABASE_BIN permite indicar la ruta al ejecutable oficial de Supabase. PLAYWRIGHT_BROWSERS_PATH permite reutilizar navegadores instalados. --connect --base-url http://127.0.0.1:3110 reutiliza exclusivamente una instancia local del entorno de captura. --keep-environment conserva sus servicios durante la revisión; --stop-environment cierra únicamente ese entorno. El valor por defecto los cierra al terminar. Un bloqueo de proceso impide reseed simultáneo de las cuentas demo.",
    "",
    "El proceso espera hidratación, fuentes, datos, imágenes, ausencia de errores/avisos accidentales y dos frames idénticos. Reintenta cada escena hasta tres veces. Una captura defectuosa no sustituye un master válido. Los diagnósticos quedan fuera de la biblioteca, en .vercel/docs-capture.",
    "",
    "~~~powershell",
    "npm run docs:captures -- --assets-only --update-readme",
    "npm run docs:captures -- --approve all --note 'Revisión visual del set completo'",
    "npm run docs:captures -- --check",
    "~~~",
    "",
    "--approve registra una revisión visual ya realizada, vinculada al hash de cada imagen; no debe usarse como sustituto de mirarlas. Una regeneración invalida la aprobación si cambian los píxeles. --check verifica cobertura, hashes, resoluciones, selecciones, enlaces y aceptación visual sin arrancar servicios.",
    "",
    "## Inventario",
    "",
    "| Archivo | Qué muestra | Viewport CSS | Tema | Idioma | README | Portfolio | LinkedIn |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "El inventario completo legible por máquina, los hashes y las comprobaciones están en [manifest.json](images/manifest.json). Las recomendaciones son selecciones editoriales; no publican archivos en ninguna plataforma.",
    "",
    "## Incidencias y revisión",
    "",
    "Véase [el registro de revisión](images/review.json) para la inspección visual y [las incidencias del proceso](screenshots-incidents.md).",
    "",
  ].join("\n");
  await writeMarkdown(join(ROOT, "docs", "screenshots.md"), doc);
  await writeMarkdown(
    join(OUT, "README.md"),
    [
      "# Capturas de Planora",
      "",
      "Los PNG de esta carpeta son masters reales. Las subcarpetas readme, portfolio y linkedin contienen únicamente versiones optimizadas de esos mismos píxeles, sin mockups ni contenido añadido.",
      "",
      "Consulta [el inventario y los comandos](../screenshots.md), [manifest.json](manifest.json) y [selections.json](selections.json). La revisión se vincula a los hashes en review.json.",
      "",
    ].join("\n"),
  );
  await contactSheets(accepted);
  if (updateReadme) await updateReadmeGallery(accepted, selections);
}

async function contactSheets(images) {
  const folder = join(WORK, "review");
  await mkdir(folder, { recursive: true });
  for (let offset = 0; offset < images.length; offset += 8) {
    const group = images.slice(offset, offset + 8);
    const width = 1800,
      tileWidth = 450,
      tileHeight = 400;
    const layers = [];
    for (const [index, image] of group.entries()) {
      const thumb = await sharp(join(OUT, image.filename))
        .resize({
          width: tileWidth - 20,
          height: tileHeight - 55,
          fit: "inside",
        })
        .png()
        .toBuffer();
      const metadata = await sharp(thumb).metadata();
      const left =
        (index % 4) * tileWidth + Math.round((tileWidth - metadata.width) / 2);
      const top = Math.floor(index / 4) * tileHeight + 35;
      layers.push({ input: thumb, left, top });
      const label =
        image.id +
        " · " +
        image.key +
        " · " +
        image.theme +
        " · " +
        image.locale;
      const svg =
        '<svg width="450" height="30"><rect width="450" height="30" fill="#eef1eb"/><text x="12" y="21" font-family="Arial" font-size="15" fill="#172015">' +
        label +
        "</text></svg>";
      layers.push({
        input: Buffer.from(svg),
        left: (index % 4) * tileWidth,
        top: Math.floor(index / 4) * tileHeight,
      });
    }
    await sharp({
      create: { width, height: 800, channels: 3, background: "#eef1eb" },
    })
      .composite(layers)
      .jpeg({ quality: 92 })
      .toFile(
        join(
          folder,
          "sheet-" + String(offset / 8 + 1).padStart(2, "0") + ".jpg",
        ),
      );
  }
}

async function updateReadmeGallery(images, selections) {
  const caption = (image) => captions[image.id] || image.title;
  const derivative = (image) =>
    "docs/images/" +
    selections.readme.find((item) => item.id === image.id).file;
  const imageTag = (image, width = "100%") =>
    '<a href="docs/images/' +
    image.filename +
    '"><img src="' +
    derivative(image) +
    '" alt="Planora: ' +
    caption(image) +
    '" width="' +
    width +
    '" /></a>';
  const table = (items) =>
    [
      "<table>",
      ...Array.from(
        { length: Math.ceil(items.length / 2) },
        (_, row) =>
          "  <tr>\n" +
          items
            .slice(row * 2, row * 2 + 2)
            .map(
              (image) =>
                '    <td width="50%" align="center"><strong>' +
                caption(image) +
                "</strong><br/>" +
                imageTag(image) +
                "</td>",
            )
            .join("\n") +
          "\n  </tr>",
      ),
      "</table>",
    ].join("\n");
  const hero = images.find((image) => image.readme === "hero");
  const main = images.filter((image) => image.readme === "main");
  const extra = images.filter((image) => image.readme === "extra");
  const phones = images.filter((image) => image.readme === "mobile");
  if (
    !hero ||
    main.length !== 8 ||
    phones.length < 4 ||
    selections.portfolio.length < 10 ||
    selections.linkedin.length < 6
  ) {
    throw new Error(
      "README/selection coverage is incomplete. Regenerate the missing scenes before updating it.",
    );
  }
  let readme = await readFile(join(ROOT, "README.md"), "utf8");
  const section = [
    "## Product preview",
    "",
    '<p align="center">',
    "  " + imageTag(hero),
    "</p>",
    "",
    "Planora is a portfolio case study in turning irregular routines into a calm planning system. Recurrence, timezone boundaries, data isolation and offline changes are handled as domain rules rather than visual shortcuts. A public demo makes the complete product easy to evaluate while real workspaces remain private.",
    "",
    "## Screenshots",
    "",
    "Real product captures with a coherent synthetic workspace. Click an image for the full-resolution PNG. The [complete visual library](docs/screenshots.md) includes every area, capture settings and selections for portfolio and LinkedIn.",
    "",
    table(main),
    "",
    "<details>",
    "<summary><strong>More workspace and Focus views</strong></summary>",
    "<br/>",
    table(extra),
    "</details>",
    "",
    "### Mobile experience",
    "",
    '<p align="center">',
    phones.map((image) => "  " + imageTag(image, "23%")).join("\n  &nbsp;\n"),
    "</p>",
    "",
  ].join("\n");
  readme = readme.replace(
    /## Product preview[\s\S]*?(?=## Architecture)/,
    section + "\n",
  );
  readme = readme.replace(
    /Product screenshots live under[\s\S]*?(?=## Deployment)/,
    "The real product screenshot library lives under docs/images/. Its [inventory and repeatable capture workflow](docs/screenshots.md) cover desktop/mobile, both languages, themes and all major Focus states. The runner creates disposable accounts in an isolated local Supabase project and keeps the application's real CSP.\n\n~~~bash\nnpm run docs:captures\nnpm run docs:captures -- --only 04,08,47\n~~~\n\n",
  );
  await writeMarkdown(join(ROOT, "README.md"), readme);
}

export async function approveImages(ids, note) {
  if (!note) throw new Error("A visual review note is required.");
  const manifest = await readManifest();
  let previous = {};
  try {
    previous = JSON.parse(await readFile(join(OUT, "review.json"), "utf8"));
  } catch {
    /* first review */
  }
  const wanted =
    ids === "all"
      ? manifest.images.map((image) => image.id)
      : ids.split(",").map((value) => value.trim().padStart(2, "0"));
  for (const image of manifest.images.filter((image) =>
    wanted.includes(image.id),
  )) {
    if (image.status !== "captured")
      throw new Error("Cannot approve an uncaptured scene: " + image.id);
    const sha256 = createHash("sha256")
      .update(await readFile(join(OUT, image.filename)))
      .digest("hex");
    if (sha256 !== image.sha256)
      throw new Error("Image hash does not match its capture record.");
    previous[image.id] = {
      status: "accepted",
      sha256,
      reviewedAt: new Date().toISOString(),
      note,
    };
  }
  await writeFile(
    join(OUT, "review.json"),
    JSON.stringify(previous, null, 2) + "\n",
  );
  await generateAssets(manifest);
}

export async function checkLibrary() {
  const manifest = await readManifest();
  const issues = [];
  const images = manifest.images || [];
  const reviews = JSON.parse(await readFile(join(OUT, "review.json"), "utf8"));
  const selections = JSON.parse(
    await readFile(join(OUT, "selections.json"), "utf8"),
  );
  const sha256 = async (file) =>
    createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  if (!manifest.libraryComplete || manifest.failedIds?.length)
    issues.push("Library is incomplete or has failed scenes.");
  if (new Set(images.map((item) => item.id)).size !== images.length)
    issues.push("Duplicate scene IDs.");
  for (const scene of scenes) {
    const item = images.find((image) => image.id === scene.id);
    if (!item || item.status !== "captured") {
      issues.push("Missing scene " + scene.id);
      continue;
    }
    try {
      const file = join(OUT, item.filename);
      const actualHash = await sha256(file);
      if (actualHash !== item.sha256)
        issues.push("Master hash mismatch: " + item.id);
      const pixels = await dimensions(file);
      if (
        pixels.width !== item.pixels?.width ||
        pixels.height !== item.pixels?.height
      )
        issues.push("Master size mismatch: " + item.id);
      if (
        !item.crop &&
        (Math.abs(pixels.width - item.width * item.scale) > 1 ||
          Math.abs(pixels.height - item.height * item.scale) > 1)
      )
        issues.push("Viewport/DPR mismatch: " + item.id);
      if (
        item.fixtureVersion !== FIXTURE_VERSION ||
        item.fixtureDate !== manifest.referenceDate
      )
        issues.push("Mixed fixture versions/dates: " + item.id);
      if (
        item.sourceCommit !== manifest.source.commit ||
        !item.captureCodeSha256
      )
        issues.push("Missing source trace: " + item.id);
      if (
        reviews[item.id]?.status !== "accepted" ||
        reviews[item.id]?.sha256 !== actualHash
      )
        issues.push("Visual review required: " + item.id);
      if (
        item.audit?.overflow > 1 ||
        item.audit?.theme !== item.theme ||
        item.audit?.locale !== item.locale
      )
        issues.push("Viewport/theme/locale audit: " + item.id);
      for (const field of [
        "brokenImages",
        "loading",
        "alerts",
        "clippedControls",
      ])
        if (item.audit?.[field]?.length)
          issues.push("Rendering audit " + field + ": " + item.id);
      for (const kind of ["readme", "portfolio", "linkedin"]) {
        const matches = selections[kind].filter(
          (selection) => selection.id === item.id,
        );
        if (matches.length !== (scene[kind] ? 1 : 0))
          issues.push("Selection coverage " + kind + ": " + item.id);
        for (const derivative of matches) {
          const destination = join(OUT, derivative.file);
          if ((await sha256(destination)) !== derivative.sha256)
            issues.push("Derivative hash: " + derivative.file);
          const size = await dimensions(destination);
          if (
            size.width !== derivative.width ||
            size.height !== derivative.height
          )
            issues.push("Derivative size: " + derivative.file);
        }
      }
    } catch (error) {
      issues.push(item.id + ": " + error.message);
    }
  }
  const currentNames = new Set(scenes.map((scene) => scene.filename));
  for (const file of await readdir(OUT))
    if (/^\d.*\.png$/.test(file) && !currentNames.has(file))
      issues.push("Uncatalogued master: " + file);
  const readme = await readFile(join(ROOT, "README.md"), "utf8");
  for (const match of readme.matchAll(
    /(?:src|href)="(docs\/images\/[^"#]+)"/g,
  )) {
    if (!(await exists(join(ROOT, match[1]))))
      issues.push("Broken README image link: " + match[1]);
  }
  const featureText = readme.slice(
    readme.indexOf("## Features"),
    readme.indexOf("## Product preview"),
  );
  if (
    createHash("sha256").update(featureText).digest("hex") !==
    manifest.source.readmeFeaturesSha256
  )
    issues.push("README feature truth changed since capture.");
  if (issues.length)
    throw new Error("Library checks failed:\n- " + issues.join("\n- "));
  const bytes = images.reduce((sum, item) => sum + item.bytes, 0);
  console.log(
    "[capture] Verified " +
      scenes.length +
      " reviewed masters (" +
      (bytes / 1024 / 1024).toFixed(1) +
      " MiB), " +
      selections.readme.length +
      " README, " +
      selections.portfolio.length +
      " portfolio and " +
      selections.linkedin.length +
      " LinkedIn derivatives. Hashes, dimensions, links and coverage passed.",
  );
}
