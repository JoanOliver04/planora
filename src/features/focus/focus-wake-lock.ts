import type { FocusSession } from "./types";
import { isActiveStatus } from "./time";
import { loadFocusDevicePreferences } from "./focus-preferences";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (
    type: "release",
    listener: () => void,
    options?: { once?: boolean },
  ) => void;
};

let sentinel: WakeLockSentinelLike | null = null;
let desired = false;

function wakeLockApi(): {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
} | null {
  if (typeof navigator === "undefined") return null;
  const api = (
    navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    }
  ).wakeLock;
  return api ?? null;
}

export function isFocusWakeLockSupported(): boolean {
  return wakeLockApi() != null;
}

export function isFocusWakeLockActive(): boolean {
  return sentinel != null && !sentinel.released;
}

/**
 * Request or release Screen Wake Lock based on session + prefs.
 * Never throws. Requires a user gesture on some browsers for the first request.
 */
export async function syncFocusWakeLock(
  session: FocusSession | null,
): Promise<"active" | "released" | "unsupported" | "denied"> {
  const api = wakeLockApi();
  if (!api) {
    desired = false;
    return "unsupported";
  }

  const device = loadFocusDevicePreferences();
  const shouldHold =
    session != null &&
    isActiveStatus(session.status) &&
    session.status !== "paused" &&
    (session.config.keepScreenAwake || device.wakeLockPreferred) &&
    (typeof document === "undefined" || document.visibilityState === "visible");

  desired = shouldHold;

  if (!shouldHold) {
    await releaseFocusWakeLock();
    return "released";
  }

  if (isFocusWakeLockActive()) return "active";

  try {
    const next = await api.request("screen");
    sentinel = next;
    next.addEventListener(
      "release",
      () => {
        if (sentinel === next) sentinel = null;
      },
      { once: true },
    );
    return "active";
  } catch {
    sentinel = null;
    return "denied";
  }
}

export async function releaseFocusWakeLock(): Promise<void> {
  desired = false;
  const current = sentinel;
  sentinel = null;
  if (!current || current.released) return;
  try {
    await current.release();
  } catch {
    // Already released or unsupported mid-flight.
  }
}

/** Re-acquire after visibility if the session still wants the lock. */
export async function reacquireFocusWakeLockIfNeeded(
  session: FocusSession | null,
): Promise<void> {
  if (!desired && session) {
    await syncFocusWakeLock(session);
    return;
  }
  if (desired) {
    await syncFocusWakeLock(session);
  }
}

/** Test helper — clears module state. */
export function __resetFocusWakeLockForTests() {
  sentinel = null;
  desired = false;
}
