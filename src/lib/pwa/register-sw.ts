import { logBootstrap } from "@/lib/bootstrap/log";
import { withTimeout } from "@/lib/bootstrap/timeout";
import { planoraBuildId } from "./build-id";
import { recoverFromStaleAssets } from "./chunk-recovery";

export function serviceWorkerUrl(buildId = planoraBuildId) {
  return `/sw.js?v=${encodeURIComponent(buildId)}`;
}

export async function readyServiceWorker(ms = 4_000) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return null;
  try {
    return await withTimeout(navigator.serviceWorker.ready, ms);
  } catch {
    return navigator.serviceWorker.getRegistration();
  }
}

export async function registerPlanoraServiceWorker() {
  if (process.env.NODE_ENV !== "production") return null;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return null;
  navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as { type?: string; build?: string } | undefined;
    if (data?.type !== "planora-sw-activated") return;
    if (!data.build || data.build === planoraBuildId) return;
    void recoverFromStaleAssets();
  });
  try {
    const registration = await navigator.serviceWorker.register(
      serviceWorkerUrl(),
      { scope: "/", updateViaCache: "none" },
    );
    void registration.update();
    return registration;
  } catch (error) {
    logBootstrap({
      phase: "service_worker",
      errorType: error instanceof Error ? error.name : "register_failed",
    });
    return null;
  }
}
