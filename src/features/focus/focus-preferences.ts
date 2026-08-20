import type { Json } from "@/types/database";
import type { FocusMode } from "./types";

/** Synced with the account via profiles.preferences.focus */
export type FocusAccountPreferences = {
  defaultPresetId: string | null;
  defaultMode: FocusMode;
  askIntentionOnStart: boolean;
  askReviewOnEnd: boolean;
  /** Always off by default — never surprise-complete tasks. */
  completeTaskOnEndDefault: boolean;
  timerDisplay: "large" | "compact";
  homeLanding: "start" | "presets" | "history";
  showWeeklyGoal: boolean;
  /** When true, weekly goal context is weekdays-oriented in copy (not a hard filter). */
  goalWeekdaysOnly: boolean;
};

/** Stays on this browser/device only (localStorage). */
export type FocusDevicePreferences = {
  soundEnabled: boolean;
  /** 0–1 gain for soft phase chimes. */
  soundVolume: number;
  vibrationEnabled: boolean;
  systemNotifyEnabled: boolean;
  wakeLockPreferred: boolean;
  preferFullscreen: boolean;
  showCompactBar: boolean;
  /**
   * Best-effort when the tab is backgrounded / screen locks.
   * Browsers cannot guarantee behaviour while fully suspended.
   */
  lockScreenBehavior: "continue" | "pause";
  /** Desktop keyboard shortcuts on the active session view. */
  keyboardShortcutsEnabled: boolean;
};

export const defaultFocusAccountPreferences: FocusAccountPreferences = {
  defaultPresetId: null,
  defaultMode: "countdown",
  askIntentionOnStart: false,
  askReviewOnEnd: true,
  completeTaskOnEndDefault: false,
  timerDisplay: "large",
  homeLanding: "start",
  showWeeklyGoal: true,
  goalWeekdaysOnly: false,
};

export const defaultFocusDevicePreferences: FocusDevicePreferences = {
  soundEnabled: true,
  soundVolume: 0.5,
  vibrationEnabled: true,
  systemNotifyEnabled: true,
  wakeLockPreferred: false,
  preferFullscreen: false,
  showCompactBar: true,
  lockScreenBehavior: "continue",
  keyboardShortcutsEnabled: true,
};

export const FOCUS_DEVICE_PREFS_KEY = "planora-focus-device-preferences-v1";
export const FOCUS_DEVICE_PREFS_EVENT = "planora-focus-device-preferences";

export function normalizeFocusAccountPreferences(
  value: unknown,
): FocusAccountPreferences {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const mode = input.defaultMode;
  return {
    defaultPresetId:
      typeof input.defaultPresetId === "string" &&
      /^[0-9a-f-]{36}$/i.test(input.defaultPresetId)
        ? input.defaultPresetId
        : null,
    defaultMode:
      mode === "countdown" ||
      mode === "stopwatch" ||
      mode === "cycles" ||
      mode === "structured_plan"
        ? mode
        : defaultFocusAccountPreferences.defaultMode,
    askIntentionOnStart:
      typeof input.askIntentionOnStart === "boolean"
        ? input.askIntentionOnStart
        : defaultFocusAccountPreferences.askIntentionOnStart,
    askReviewOnEnd:
      typeof input.askReviewOnEnd === "boolean"
        ? input.askReviewOnEnd
        : defaultFocusAccountPreferences.askReviewOnEnd,
    completeTaskOnEndDefault:
      typeof input.completeTaskOnEndDefault === "boolean"
        ? input.completeTaskOnEndDefault
        : false,
    timerDisplay: input.timerDisplay === "compact" ? "compact" : "large",
    homeLanding:
      input.homeLanding === "presets" || input.homeLanding === "history"
        ? input.homeLanding
        : "start",
    showWeeklyGoal:
      typeof input.showWeeklyGoal === "boolean"
        ? input.showWeeklyGoal
        : defaultFocusAccountPreferences.showWeeklyGoal,
    goalWeekdaysOnly:
      typeof input.goalWeekdaysOnly === "boolean"
        ? input.goalWeekdaysOnly
        : defaultFocusAccountPreferences.goalWeekdaysOnly,
  };
}

export function normalizeFocusDevicePreferences(
  value: unknown,
): FocusDevicePreferences {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const volume =
    typeof input.soundVolume === "number" && Number.isFinite(input.soundVolume)
      ? Math.min(1, Math.max(0, input.soundVolume))
      : defaultFocusDevicePreferences.soundVolume;
  return {
    soundEnabled:
      typeof input.soundEnabled === "boolean"
        ? input.soundEnabled
        : defaultFocusDevicePreferences.soundEnabled,
    soundVolume: volume,
    vibrationEnabled:
      typeof input.vibrationEnabled === "boolean"
        ? input.vibrationEnabled
        : defaultFocusDevicePreferences.vibrationEnabled,
    systemNotifyEnabled:
      typeof input.systemNotifyEnabled === "boolean"
        ? input.systemNotifyEnabled
        : defaultFocusDevicePreferences.systemNotifyEnabled,
    wakeLockPreferred:
      typeof input.wakeLockPreferred === "boolean"
        ? input.wakeLockPreferred
        : defaultFocusDevicePreferences.wakeLockPreferred,
    preferFullscreen:
      typeof input.preferFullscreen === "boolean"
        ? input.preferFullscreen
        : defaultFocusDevicePreferences.preferFullscreen,
    showCompactBar:
      typeof input.showCompactBar === "boolean"
        ? input.showCompactBar
        : defaultFocusDevicePreferences.showCompactBar,
    lockScreenBehavior:
      input.lockScreenBehavior === "pause" ? "pause" : "continue",
    keyboardShortcutsEnabled:
      typeof input.keyboardShortcutsEnabled === "boolean"
        ? input.keyboardShortcutsEnabled
        : defaultFocusDevicePreferences.keyboardShortcutsEnabled,
  };
}

export function readFocusAccountFromProfilePreferences(
  preferences: Json | undefined,
): FocusAccountPreferences {
  const root =
    preferences &&
    typeof preferences === "object" &&
    !Array.isArray(preferences)
      ? (preferences as Record<string, unknown>)
      : {};
  return normalizeFocusAccountPreferences(root.focus);
}

export function loadFocusDevicePreferences(): FocusDevicePreferences {
  if (typeof window === "undefined") return defaultFocusDevicePreferences;
  try {
    const raw = window.localStorage.getItem(FOCUS_DEVICE_PREFS_KEY);
    if (!raw) return defaultFocusDevicePreferences;
    return normalizeFocusDevicePreferences(JSON.parse(raw));
  } catch {
    return defaultFocusDevicePreferences;
  }
}

export function saveFocusDevicePreferences(value: FocusDevicePreferences) {
  if (typeof window === "undefined") return;
  const next = normalizeFocusDevicePreferences(value);
  try {
    window.localStorage.setItem(FOCUS_DEVICE_PREFS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(FOCUS_DEVICE_PREFS_EVENT));
  } catch {
    // Private mode / quota — ignore.
  }
}

export function subscribeFocusDevicePreferences(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => onChange();
  window.addEventListener(FOCUS_DEVICE_PREFS_EVENT, handler);
  window.addEventListener("storage", (event) => {
    if (event.key === FOCUS_DEVICE_PREFS_KEY || event.key === null) handler();
  });
  return () => {
    window.removeEventListener(FOCUS_DEVICE_PREFS_EVENT, handler);
  };
}

/** Explicit, contextual notification permission — never auto on route enter. */
export async function requestFocusNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function focusNotificationPermission():
  NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}
