import { readyServiceWorker } from "@/lib/pwa/register-sw";
import type { NotificationPreferences } from "./preferences";

export async function updatePushDevice(
  action: "subscribe" | "unsubscribe" | "test",
  subscription: PushSubscription,
  preferences?: NotificationPreferences,
) {
  const response = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      action === "subscribe"
        ? { action, subscription: subscription.toJSON(), preferences }
        : { action, endpoint: subscription.endpoint },
    ),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Push device update failed");
}

export async function disconnectPushDevice() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await readyServiceWorker();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  // Invalidate delivery locally even if the server cannot currently be reached.
  try {
    await updatePushDevice("unsubscribe", subscription);
  } finally {
    await subscription.unsubscribe();
  }
}

export function applicationServerKey(value: string) {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
