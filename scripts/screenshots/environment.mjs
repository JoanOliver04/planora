import { spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
  copyFile,
  unlink,
  open,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocalTestEnvironment } from "../assert-local-test-env.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const WORK = join(ROOT, ".vercel", "docs-capture");
export const PROJECT = "planora-docs";
export const API = "http://127.0.0.1:57321";
export const DEFAULT_BASE = "http://127.0.0.1:3110";

export function redact(text) {
  return String(text)
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<local-token>")
    .replace(/sb_(?:secret|publishable)_[\w-]+/g, "<local-key>")
    .replace(
      /((?:ANON_KEY|SERVICE_ROLE_KEY|SECRET_KEY|PUBLISHABLE_KEY)["'\s:=]+)[^\s",]+/gi,
      "$1<local-key>",
    );
}

export function command(
  binary,
  args,
  { env, label = "command", silent = false } = {},
) {
  return new Promise((accept, reject) => {
    const child = spawn(binary, args, {
      cwd: ROOT,
      env: env || process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", async (code) => {
      if (!silent) {
        await mkdir(join(WORK, "logs"), { recursive: true });
        await writeFile(
          join(WORK, "logs", label + ".log"),
          redact(stdout + "\n" + stderr),
        );
      }
      if (code === 0) accept({ stdout, stderr });
      else
        reject(
          new Error(
            label + " failed (exit " + code + "). See the redacted local log.",
          ),
        );
    });
  });
}

export function assertCaptureBase(value) {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "Capture app must be an HTTP loopback origin, without credentials or a path.",
    );
  }
  return parsed.origin;
}

export async function acquireRunLock() {
  await mkdir(WORK, { recursive: true });
  const file = join(WORK, "capture.lock");
  let handle;
  try {
    handle = await open(file, "wx");
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const owner = JSON.parse(await readFile(file, "utf8"));
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0)
      throw new Error("Inspect the invalid capture lock before continuing.");
    try {
      process.kill(owner.pid, 0);
    } catch (checkError) {
      if (checkError.code === "ESRCH") {
        await unlink(file);
        return acquireRunLock();
      }
      throw checkError;
    }
    throw new Error(
      "Another capture run is active. Do not reseed its synthetic workspaces.",
    );
  }
  await handle.writeFile(
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
  );
  await handle.close();
  return () => unlink(file);
}

async function stopManagedApp() {
  let owner;
  const file = join(WORK, "app-owner.json");
  try {
    owner = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (
    owner.project !== PROJECT ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid <= 0
  )
    throw new Error("Unexpected managed app owner.");
  const base = assertCaptureBase(owner.base);
  let line;
  if (process.platform === "win32") {
    line = (
      await command(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "(Get-CimInstance Win32_Process -Filter 'ProcessId = " +
            owner.pid +
            "').CommandLine",
        ],
        { silent: true },
      )
    ).stdout.trim();
  } else {
    try {
      line = (
        await readFile("/proc/" + owner.pid + "/cmdline", "utf8")
      ).replaceAll("\0", " ");
    } catch {
      line = (
        await command("ps", ["-p", String(owner.pid), "-o", "command="], {
          silent: true,
        }).catch(() => ({ stdout: "" }))
      ).stdout.trim();
    }
  }
  if (line) {
    const expected = join(
      ROOT,
      "node_modules",
      "next",
      "dist",
      "bin",
      "next",
    ).toLowerCase();
    if (
      !line.toLowerCase().includes(expected) ||
      !line.includes(" start ") ||
      !line.includes("--port " + (new URL(base).port || "80"))
    )
      throw new Error(
        "Managed PID no longer matches the capture app; refusing to stop it.",
      );
    try {
      process.kill(owner.pid);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  await unlink(file);
}

export async function stopEnvironment(options = {}) {
  const owner = JSON.parse(await readFile(join(WORK, "owner.json"), "utf8"));
  const config = await readFile(join(WORK, "supabase", "config.toml"), "utf8");
  if (
    owner.project !== PROJECT ||
    owner.api !== API ||
    !config.includes('project_id = "' + PROJECT + '"')
  )
    throw new Error(
      "Refusing to stop an environment not owned by documentation capture.",
    );
  await stopManagedApp();
  await command(
    options.supabase || process.env.SUPABASE_BIN || "supabase",
    ["stop", "--no-backup", "--workdir", WORK],
    { label: "supabase-stop" },
  );
  console.log("[capture] Stopped only the owned documentation environment.");
}

async function prepareConfig(base) {
  const configPath = join(WORK, "supabase", "config.toml");
  await mkdir(dirname(configPath), { recursive: true });
  let config = await readFile(join(ROOT, "supabase", "config.toml"), "utf8");
  config = config
    .replace(/^project_id\s*=.*$/m, 'project_id = "' + PROJECT + '"')
    .replace(/\b5432(\d)\b/g, "5732$1")
    .replace(/http:\/\/(?:localhost|127\.0\.0\.1):3000/g, base);
  await writeFile(configPath, config);
  await writeFile(
    join(WORK, "supabase", "seed.sql"),
    "-- Capture data is created only for synthetic, owned fixture accounts.\n",
  );
  const migrations = join(WORK, "supabase", "migrations");
  await mkdir(migrations, { recursive: true });
  const names = (await readdir(join(ROOT, "supabase", "migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const hash = createHash("sha256");
  for (const name of names) {
    const source = join(ROOT, "supabase", "migrations", name);
    hash.update(name).update(await readFile(source));
    await copyFile(source, join(migrations, name));
  }
  await writeFile(
    join(WORK, "owner.json"),
    JSON.stringify(
      { purpose: "Planora documentation capture", project: PROJECT, api: API },
      null,
      2,
    ),
  );
  return hash.digest("hex");
}

export async function startEnvironment(options) {
  const lifecycle = {};
  try {
    return await bootEnvironment(options, lifecycle);
  } catch (error) {
    await lifecycle.close?.().catch(() => undefined);
    throw error;
  }
}

async function bootEnvironment(options, lifecycle) {
  const base = assertCaptureBase(options.base || DEFAULT_BASE);
  const binary = options.supabase || process.env.SUPABASE_BIN || "supabase";
  const schemaHash = await prepareConfig(base);
  const cli = (args, label, silent = false) =>
    command(binary, [...args, "--workdir", WORK], { label, silent });
  let server;
  let ownedDatabase = false;
  let closed = false;
  lifecycle.close = async () => {
    if (closed || options.keepEnvironment) return;
    closed = true;
    if (server) {
      server.kill();
      await new Promise((resolveWait) => {
        if (server.exitCode !== null) resolveWait();
        else {
          server.once("close", resolveWait);
          setTimeout(resolveWait, 5000).unref();
        }
      });
      await unlink(join(WORK, "app-owner.json")).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    } else if (options.connect) {
      await stopManagedApp();
    }
    if (ownedDatabase) {
      const config = await readFile(
        join(WORK, "supabase", "config.toml"),
        "utf8",
      );
      if (
        !config.includes('project_id = "' + PROJECT + '"') ||
        resolve(WORK) !== join(ROOT, ".vercel", "docs-capture")
      ) {
        throw new Error("Refusing cleanup of an unexpected project.");
      }
      await cli(["stop", "--no-backup"], "supabase-stop");
    }
  };
  console.log(
    "[capture] Preparing isolated Supabase " + PROJECT + " on ports 5732x.",
  );
  let status;
  try {
    const result = await cli(["status", "-o", "json"], "supabase-status", true);
    status = JSON.parse(result.stdout);
  } catch {
    await cli(
      [
        "start",
        "--exclude",
        "studio,imgproxy,edge-runtime,logflare,vector,supavisor",
      ],
      "supabase-start",
    );
    const result = await cli(["status", "-o", "json"], "supabase-status", true);
    status = JSON.parse(result.stdout);
  }
  if (status.API_URL !== API || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error(
      "Refusing capture: Supabase status does not match the isolated documentation project.",
    );
  }
  assertLocalTestEnvironment({
    url: status.API_URL,
    serviceRole: status.SERVICE_ROLE_KEY,
  });
  ownedDatabase = true;
  await cli(["migration", "up", "--local"], "supabase-migrations");
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: API,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SITE_URL: base,
    VERCEL: "",
    VERCEL_ENV: "",
    VERCEL_GIT_COMMIT_SHA: "",
    VERCEL_DEPLOYMENT_ID: "",
    PLANORA_FORCE_HTTPS: "false",
    NODE_ENV: "production",
  };
  if (!options.connect) {
    let occupied = false;
    try {
      occupied = (
        await fetch(base + "/api/health", { signal: AbortSignal.timeout(1500) })
      ).ok;
    } catch {
      /* not listening */
    }
    if (occupied)
      throw new Error(
        "A server is already listening at " +
          base +
          ". Use --connect only for a matching local instance.",
      );
    console.log(
      "[capture] Building the current application, with its real CSP.",
    );
    await command(
      process.execPath,
      [join(ROOT, "node_modules", "next", "dist", "bin", "next"), "build"],
      { env, label: "next-build" },
    );
    console.log("[capture] Starting the production build at " + base + ".");
    const parsed = new URL(base);
    await mkdir(join(WORK, "logs"), { recursive: true });
    const log = openSync(join(WORK, "logs", "next-start.log"), "a");
    server = spawn(
      process.execPath,
      [
        join(ROOT, "node_modules", "next", "dist", "bin", "next"),
        "start",
        "--hostname",
        parsed.hostname,
        "--port",
        parsed.port || "80",
      ],
      {
        cwd: ROOT,
        env,
        windowsHide: true,
        detached: Boolean(options.keepEnvironment),
        stdio: ["ignore", log, log],
      },
    );
    closeSync(log);
    server.once("error", () => {
      /* health check below reports a controlled startup error */
    });
    if (options.keepEnvironment) server.unref();
    await writeFile(
      join(WORK, "app-owner.json"),
      JSON.stringify({ project: PROJECT, base, pid: server.pid }, null, 2),
    );
  }
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      ready = (
        await fetch(base + "/api/health", { signal: AbortSignal.timeout(1500) })
      ).ok;
    } catch {
      /* starting */
    }
    if (ready) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  if (!ready) {
    server?.kill();
    throw new Error("The local production server did not become healthy.");
  }
  return {
    base,
    api: API,
    anon: status.ANON_KEY,
    service: status.SERVICE_ROLE_KEY,
    schemaHash,
    close: lifecycle.close,
  };
}
