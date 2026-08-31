import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canAttemptAssetReload,
  clearPlanoraAssetCaches,
  isAssetLoadError,
  recoverFromStaleAssets,
  shouldRecoverFromAssetError,
  snapshotOfflineKeys,
} from "@/lib/pwa/chunk-recovery";
import { serviceWorkerUrl } from "@/lib/pwa/register-sw";
import { ASSET_RELOAD_AT_KEY } from "@/lib/pwa/chunk-recovery";

const worker = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const nextConfig = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
const providers = readFileSync(
  join(process.cwd(), "src/components/providers.tsx"),
  "utf8",
);
const logo = readFileSync(
  join(process.cwd(), "src/components/navigation.tsx"),
  "utf8",
);

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("service worker update safety", () => {
  it("versions caches per build and skips RSC plus private navigations", () => {
    expect(worker).toContain("planora-assets-");
    expect(worker).toContain('searchParams.get("v")');
    expect(worker).toContain("skipWaiting");
    expect(worker).toContain("clients.claim");
    expect(worker).toContain("planora-clear-asset-cache");
    expect(worker).toContain("_rsc");
    expect(worker).not.toContain('const VERSION = "planora-shell-v2"');
    expect(worker).not.toMatch(/cache\.addAll\(\s*SHELL/);
    expect(worker).toContain("networkFirstAsset");
    expect(worker).toContain("networkFirstPublicNavigation");
  });

  it("registers the worker with a build query and disables HTTP caching of sw.js", () => {
    expect(providers).toContain("registerPlanoraServiceWorker");
    expect(serviceWorkerUrl("abc123")).toBe("/sw.js?v=abc123");
    expect(nextConfig).toContain("no-cache, no-store, must-revalidate");
    expect(nextConfig).toContain('source: "/sw.js"');
    expect(nextConfig).toContain("NEXT_PUBLIC_PLANORA_BUILD_ID");
  });

  it("keeps brand images small even if CSS has not arrived", () => {
    expect(logo).not.toContain("width={1024}");
    expect(logo).toContain("width={140}");
    expect(logo).toContain("width={180}");
  });
});

describe("stale asset recovery", () => {
  it("detects chunk, CSS and dynamic import failures", () => {
    expect(isAssetLoadError({ name: "ChunkLoadError", message: "fail" })).toBe(
      true,
    );
    expect(
      isAssetLoadError(
        new Error(
          "Failed to fetch dynamically imported module: /_next/static/x.js",
        ),
      ),
    ).toBe(true);
    expect(isAssetLoadError(new Error("Loading CSS chunk 12 failed"))).toBe(
      true,
    );
    expect(isAssetLoadError(new Error("network down"))).toBe(false);
    expect(isAssetLoadError({ name: "AbortError", message: "Aborted" })).toBe(
      false,
    );
    expect(
      shouldRecoverFromAssetError(
        { name: "ChunkLoadError", message: "fail" },
        { unloading: true },
      ),
    ).toBe(false);
  });

  it("reloads once for a missing chunk without clearing the offline queue", async () => {
    localStorage.setItem(
      "planora-offline-completions-v1",
      JSON.stringify([{ id: "queued" }]),
    );
    localStorage.setItem(
      "planora-workspace-cache-v1:user:today",
      JSON.stringify({ savedAt: Date.now() }),
    );
    const deleted: string[] = [];
    vi.stubGlobal("caches", {
      keys: async () => ["planora-assets-old", "unrelated"],
      delete: async (key: string) => {
        deleted.push(key);
        return true;
      },
    });
    const reload = vi.fn();
    const first = await recoverFromStaleAssets({ reload, now: 1_000 });
    const second = await recoverFromStaleAssets({ reload, now: 2_000 });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
    expect(deleted).toEqual(["planora-assets-old"]);
    expect(localStorage.getItem("planora-offline-completions-v1")).toContain(
      "queued",
    );
    expect(
      localStorage.getItem("planora-workspace-cache-v1:user:today"),
    ).not.toBeNull();
  });

  it("restores offline keys if a cache wipe races with storage", async () => {
    localStorage.setItem("planora-offline-completions-v1", "[1]");
    const snapshot = snapshotOfflineKeys();
    localStorage.removeItem("planora-offline-completions-v1");
    expect(snapshot["planora-offline-completions-v1"]).toBe("[1]");
  });

  it("blocks a reload loop inside the cooldown window", () => {
    sessionStorage.setItem(ASSET_RELOAD_AT_KEY, "1000");
    expect(canAttemptAssetReload(2000)).toBe(false);
    expect(canAttemptAssetReload(20_000)).toBe(true);
  });

  it("only deletes Planora Cache Storage entries", async () => {
    const deleted: string[] = [];
    vi.stubGlobal("caches", {
      keys: async () => ["planora-assets-1", "other-app"],
      delete: async (key: string) => {
        deleted.push(key);
        return true;
      },
    });
    await clearPlanoraAssetCaches();
    expect(deleted).toEqual(["planora-assets-1"]);
  });
});
