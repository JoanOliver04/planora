/**
 * Real Planora screenshots, with isolated local data and a reviewable catalog.
 * No production credentials, CSP bypass, existing-account reseeding or publishing.
 * Run with --help or --list before a capture.
 */
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { readFile, mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scenes, selectScenes } from "./screenshots/catalog.mjs";
import {
  startEnvironment,
  stopEnvironment,
  acquireRunLock,
  ROOT,
  command,
  redact,
} from "./screenshots/environment.mjs";
import {
  createFixture,
  cleanupFixtureAccounts,
  FIXTURE_VERSION,
  currentMadridDate,
} from "./screenshots/fixtures.mjs";
import { captureScene, openBrowser } from "./screenshots/capture.mjs";
import {
  OUT,
  readManifest,
  saveManifest,
  generateAssets,
  approveImages,
  checkLibrary,
} from "./screenshots/assets.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const help = [
  "Planora real screenshot library (local-only; never publishes).",
  "",
  "  npm run docs:captures                         full library",
  "  npm run docs:captures -- --list               catalog only",
  "  npm run docs:captures -- --only 04,08,47      selected IDs or keys",
  "  npm run docs:captures -- --group focus        functional area",
  "  npm run docs:captures -- --device mobile      mobile captures",
  "  npm run docs:captures -- --locale en --theme dark",
  "  npm run docs:captures -- --connect            reuse managed local app",
  "  npm run docs:captures -- --keep-environment   keep services for iteration",
  "  npm run docs:captures -- --stop-environment   stop only owned capture services",
  "  npm run docs:captures -- --assets-only --update-readme",
  "  npm run docs:captures -- --approve all --note 'Visual review completed'",
  "  npm run docs:captures -- --check              read-only library validation",
  "",
  "Options: --base-url http://127.0.0.1:3110, --supabase-bin PATH, --no-assets.",
  "Environment: SUPABASE_BIN and PLAYWRIGHT_BROWSERS_PATH.",
  "Synthetic accounts live only in planora-docs (Supabase ports 5732x).",
].join("\n");

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      help: { type: "boolean" },
      list: { type: "boolean" },
      only: { type: "string" },
      group: { type: "string" },
      device: { type: "string" },
      locale: { type: "string" },
      theme: { type: "string" },
      connect: { type: "boolean" },
      "base-url": { type: "string" },
      "supabase-bin": { type: "string" },
      "keep-environment": { type: "boolean" },
      "stop-environment": { type: "boolean" },
      "assets-only": { type: "boolean" },
      "update-readme": { type: "boolean" },
      "no-assets": { type: "boolean" },
      approve: { type: "string" },
      note: { type: "string" },
      check: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  if (values["stop-environment"]) {
    await stopEnvironment({ supabase: values["supabase-bin"] });
    return;
  }
  if (values.check) {
    await checkLibrary();
    return;
  }
  if (values.approve) {
    await approveImages(values.approve, values.note);
    return;
  }
  if (values["assets-only"]) {
    await generateAssets(await readManifest(), {
      updateReadme: values["update-readme"],
    });
    return;
  }
  const selection = selectScenes(values);
  if (values.list) {
    for (const scene of selection)
      console.log(
        scene.id +
          "  " +
          scene.filename +
          "  " +
          scene.width +
          "x" +
          scene.height +
          "  " +
          scene.title,
      );
    console.log(
      selection.length +
        " scenes; " +
        scenes.filter((scene) => scene.portfolio).length +
        " portfolio; " +
        scenes.filter((scene) => scene.linkedin).length +
        " LinkedIn.",
    );
    return;
  }
  await mkdir(OUT, { recursive: true });
  const commit = (
    await command("git", ["rev-parse", "HEAD"], { silent: true })
  ).stdout.trim();
  const appDiff = (
    await command("git", ["diff", "--", "src", "public", "next.config.ts"], {
      silent: true,
    })
  ).stdout;
  const readme = await readFile(join(ROOT, "README.md"), "utf8");
  const featureText = readme.slice(
    readme.indexOf("## Features"),
    readme.indexOf("## Product preview"),
  );
  const captureFiles = [
    "scripts/capture-docs-screenshots.mjs",
    ...(await readdir(join(ROOT, "scripts", "screenshots")))
      .filter((file) => file.endsWith(".mjs"))
      .sort()
      .map((file) => "scripts/screenshots/" + file),
  ];
  const captureCode = await Promise.all(
    captureFiles.map(
      async (file) => file + "\n" + (await readFile(join(ROOT, file), "utf8")),
    ),
  );
  const captureCodeSha256 = hash(captureCode.join("\n"));
  const releaseLock = await acquireRunLock();
  const previous = await readManifest();
  const manifest = {
    ...previous,
    formatVersion: 1,
    fixtureVersion: FIXTURE_VERSION,
    referenceDate: currentMadridDate(),
    generatedAt: new Date().toISOString(),
    source: {
      commit,
      appDiffSha256: hash(appDiff),
      readmeFeaturesSha256: hash(featureText),
      captureCodeSha256,
    },
    images: previous.images || [],
    failedIds: [],
  };
  let environment;
  let browser;
  const fixtures = new Map();
  try {
    environment = await startEnvironment({
      base: values["base-url"],
      supabase: values["supabase-bin"],
      connect: values.connect,
      keepEnvironment: values["keep-environment"],
    });
    manifest.schemaSha256 = environment.schemaHash;
    await cleanupFixtureAccounts(environment);
    browser = await openBrowser();
    for (const scene of selection) {
      const key = scene.locale + (scene.emptyFocus ? "-intro" : "");
      if (!fixtures.has(key)) {
        console.log("[capture] Curating synthetic " + key + " workspace.");
        fixtures.set(
          key,
          await createFixture(environment, scene.locale, {
            emptyFocus: scene.emptyFocus,
          }),
        );
      }
      const fixture = fixtures.get(key);
      console.log("[capture] " + scene.id + " " + scene.filename);
      const image = await captureScene(browser, environment, fixture, scene);
      image.fixtureDate = fixture.day;
      image.fixtureVersion = FIXTURE_VERSION;
      image.sourceCommit = commit;
      image.captureCodeSha256 = captureCodeSha256;
      image.fixtureCounts = fixture.counts;
      const existing = manifest.images.findIndex(
        (item) => item.id === image.id,
      );
      if (existing >= 0) manifest.images[existing] = image;
      else manifest.images.push(image);
      if (image.status === "failed") manifest.failedIds.push(image.id);
      else
        console.log(
          "[capture] Accepted " +
            scene.id +
            " (" +
            Math.round(image.bytes / 1024) +
            " KiB; attempt " +
            image.attempt +
            ").",
        );
      await saveManifest(manifest);
    }
    const finalDiff = (
      await command("git", ["diff", "--", "src", "public", "next.config.ts"], {
        silent: true,
      })
    ).stdout;
    if (hash(finalDiff) !== manifest.source.appDiffSha256)
      throw new Error(
        "Application source changed during capture. Keep one source version per run.",
      );
    manifest.images.sort((a, b) => a.id.localeCompare(b.id));
    manifest.failedIds = manifest.images
      .filter((image) => image.status === "failed")
      .map((image) => image.id);
    manifest.libraryComplete = scenes.every((scene) =>
      manifest.images.some(
        (image) => image.id === scene.id && image.status === "captured",
      ),
    );
    await saveManifest(manifest);
    if (!values["no-assets"])
      await generateAssets(manifest, { updateReadme: values["update-readme"] });
    if (manifest.failedIds.length)
      throw new Error(
        "Capture scenes require attention: " +
          manifest.failedIds.join(", ") +
          ". Diagnostics are under .vercel/docs-capture.",
      );
    console.log(
      "[capture] Finished " +
        selection.length +
        " real captures. No commits, uploads or publishing.",
    );
  } finally {
    try {
      await browser?.close();
      for (const fixture of fixtures.values())
        await fixture
          .close()
          .catch((error) =>
            console.error("[capture] Cleanup: " + redact(error.message)),
          );
      await environment?.close();
    } finally {
      await releaseLock();
    }
  }
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(redact(error.stack || error.message));
    process.exitCode = 1;
  });
}
