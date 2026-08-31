import { logBootstrap } from "@/lib/bootstrap/log";
import {
  OFFLINE_STORAGE_KEYS,
  OFFLINE_STORAGE_PREFIXES,
  PLANORA_CACHE_PREFIX,
  planoraBuildId,
} from "./build-id";

export const ASSET_RELOAD_AT_KEY = "planora-asset-reload-at";
const RELOAD_COOLDOWN_MS = 15_000;

function errorField(error: unknown, key: "name" | "message") {
  if (error instanceof Error) return error[key];
  if (error && typeof error === "object" && key in error) {
    const value = (error as Record<"name" | "message", unknown>)[key];
    return typeof value === "string" ? value : "";
  }
  return key === "message" ? String(error ?? "") : "";
}

export function isAssetLoadError(error: unknown) {
  const name = errorField(error, "name");
  const message = errorField(error, "message");
  const target =
    error && typeof error === "object" && "target" in error
      ? (error as { target?: EventTarget | null }).target
      : null;
  const url =
    target instanceof HTMLScriptElement
      ? target.src
      : target instanceof HTMLLinkElement
        ? target.href
        : "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Loading CSS chunk/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /\/_next\/static\//.test(url)
  );
}

export function snapshotOfflineKeys(storage: Storage = window.localStorage) {
  const snapshot: Record<string, string> = {};
  for (const key of OFFLINE_STORAGE_KEYS) {
    const value = storage.getItem(key);
    if (value !== null) snapshot[key] = value;
  }
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (
      key &&
      OFFLINE_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      const value = storage.getItem(key);
      if (value !== null) snapshot[key] = value;
    }
  }
  return snapshot;
}

export async function clearPlanoraAssetCaches() {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage({ type: "planora-clear-asset-cache" });
  }
  if (!("caches" in globalThis)) return;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(PLANORA_CACHE_PREFIX))
      .map((key) => caches.delete(key)),
  );
}

export function canAttemptAssetReload(now = Date.now()) {
  if (typeof sessionStorage === "undefined") return false;
  const last = Number(sessionStorage.getItem(ASSET_RELOAD_AT_KEY) ?? "0");
  return !last || now - last > RELOAD_COOLDOWN_MS;
}

export async function recoverFromStaleAssets(options?: {
  reload?: () => void;
  now?: number;
}) {
  logBootstrap({
    phase: "assets",
    errorType: "stale_assets",
    code: "chunk_or_css_404",
  });
  const offline = snapshotOfflineKeys();
  if (!canAttemptAssetReload(options?.now)) return false;
  sessionStorage.setItem(
    ASSET_RELOAD_AT_KEY,
    String(options?.now ?? Date.now()),
  );
  await clearPlanoraAssetCaches();
  for (const [key, value] of Object.entries(offline)) {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  }
  (options?.reload ?? (() => location.reload()))();
  return true;
}

export function bindAssetLoadRecovery() {
  const onError = (event: ErrorEvent) => {
    if (!isAssetLoadError(event.error ?? event)) return;
    void recoverFromStaleAssets();
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    if (!isAssetLoadError(event.reason)) return;
    event.preventDefault();
    void recoverFromStaleAssets();
  };
  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

export function pageBuildId() {
  return planoraBuildId;
}
