import { sanitizeTelemetry } from "@/lib/telemetry/sanitize";
import { planoraBuildId } from "@/lib/pwa/build-id";
import type { BootstrapPhase } from "./phase";

export type BootstrapLog = {
  phase: BootstrapPhase | "service_worker" | "auth" | "assets" | "hydrate";
  errorType?: string;
  code?: string;
  online?: boolean;
  swState?: string;
};

function serviceWorkerState() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return "unsupported";
  const worker = navigator.serviceWorker.controller;
  return worker?.state ?? "no-controller";
}

export function logBootstrap(event: BootstrapLog) {
  const payload = sanitizeTelemetry({
    type: "error",
    message: event.errorType ?? event.phase,
    context: {
      phase: event.phase,
      errorType: event.errorType ?? "",
      code: event.code ?? "",
      online:
        event.online ??
        (typeof navigator === "undefined" ? undefined : navigator.onLine),
      sw: event.swState ?? serviceWorkerState(),
      build: planoraBuildId,
    },
  });
  console.info("planora.bootstrap", payload);
  if (typeof window === "undefined") return;
  if (event.phase === "hydrate" || event.phase === "loading") return;
  void fetch("/api/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "error",
      path:
        location.pathname.startsWith("/") && location.pathname.length <= 160
          ? location.pathname
          : "/",
      message:
        typeof event.errorType === "string"
          ? event.errorType.slice(0, 300)
          : event.phase,
      context:
        payload && typeof payload === "object" && "context" in payload
          ? payload.context
          : undefined,
    }),
  }).catch(() => undefined);
}
