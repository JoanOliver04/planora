import { readyServiceWorker } from "@/lib/pwa/register-sw";
import type { SystemNoticeResult } from "@/features/reminders/notices";

const statusKey = "planora-system-notification-status";

export type SystemNotificationInput = {
  title: string;
  body: string;
  tag: string;
  url: string;
  silent: boolean;
  requireInteraction: boolean;
};

export function readSystemNotificationProblem() {
  try {
    return sessionStorage.getItem(statusKey) === "failed";
  } catch {
    return false;
  }
}

function rememberProblem(failed: boolean) {
  try {
    if (failed) sessionStorage.setItem(statusKey, "failed");
    else sessionStorage.removeItem(statusKey);
    window.dispatchEvent(new CustomEvent("planora-system-notification-status"));
  } catch {
    // Private mode can reject storage. Delivery still continues.
  }
}

function logShow(errorType: string, permission: string) {
  console.info("planora.notification", {
    errorType,
    phase: "show",
    channel: "system",
    permission,
    api: "ServiceWorkerRegistration",
  });
}

function permission() {
  return "Notification" in window ? Notification.permission : "unsupported";
}

function noticeOptions(
  input: SystemNotificationInput,
  renotify: boolean,
): NotificationOptions {
  return {
    body: input.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: input.tag,
    renotify,
    requireInteraction: input.requireInteraction,
    silent: input.silent,
    data: { url: input.url },
  } as NotificationOptions;
}

function askWorker(worker: ServiceWorker, input: SystemNotificationInput) {
  return new Promise<"shown" | "failed" | "timeout">((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => {
      channel.port1.onmessage = null;
      resolve("timeout");
    }, 3_000);
    channel.port1.onmessage = (event: MessageEvent<{ ok?: boolean }>) => {
      window.clearTimeout(timer);
      resolve(event.data?.ok === true ? "shown" : "failed");
    };
    try {
      worker.postMessage(
        { type: "planora-show-notification", payload: input },
        [channel.port2],
      );
    } catch {
      window.clearTimeout(timer);
      resolve("failed");
    }
  });
}

export async function showPlanoraSystemNotification(
  input: SystemNotificationInput,
): Promise<SystemNoticeResult> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    logShow("unsupported", "unsupported");
    return "unsupported";
  }
  const state = permission();
  if (state === "denied") return "denied";
  if (state !== "granted") return "default";

  try {
    const registration = await readyServiceWorker();
    if (!registration?.showNotification) {
      logShow("unavailable", state);
      return "unavailable";
    }
    const worker = registration.active;
    if (worker) {
      const viaWorker = await askWorker(worker, input);
      if (viaWorker === "shown") {
        rememberProblem(false);
        return "shown";
      }
    }
    // Android Chrome shows a system notification from the service worker.
    // The page Notification constructor does not, so it is not a fallback.
    await registration.showNotification(
      input.title,
      noticeOptions(input, false),
    );
    rememberProblem(false);
    return "shown";
  } catch (error) {
    const errorType = error instanceof Error ? error.name : "Error";
    const unavailable =
      errorType === "InvalidStateError" || errorType === "TimeoutError";
    logShow(errorType, state);
    if (!unavailable) rememberProblem(true);
    return unavailable ? "unavailable" : "failed";
  }
}
