import { toast } from "sonner";
import type { FocusSession } from "./types";
import { openInterval, remainingPhaseSec, isActiveStatus } from "./time";
import {
  loadFocusDevicePreferences,
  focusNotificationPermission,
} from "./focus-preferences";
import { playPhaseCue, playSoftChime, type PhaseCueKind } from "./phase-cues";

export type FocusAlertLocale = "es" | "en";

export type FocusPhaseAlertSchedule = {
  sessionId: string;
  revision: number;
  intervalId: string;
  endsAtMs: number;
  timerId: number | null;
};

type DeliverOptions = {
  locale?: FocusAlertLocale;
  kind?: PhaseCueKind | "phase_end";
  /** When true, skip in-app toast (e.g. soft goal already toasted). */
  silentInApp?: boolean;
};

const MAX_SCHEDULE_MS = 8 * 60 * 60 * 1000;
const DEDUPE_MS = 4_000;

let schedule: FocusPhaseAlertSchedule | null = null;
const recentDeliveries = new Map<string, number>();

function localeOf(value?: string): FocusAlertLocale {
  return value === "en" ? "en" : "es";
}

function copyFor(
  kind: PhaseCueKind | "phase_end",
  session: FocusSession,
  locale: FocusAlertLocale,
): { title: string; body: string } {
  const es = locale === "es";
  if (kind === "session_complete") {
    return {
      title: es ? "Planora · Enfoque" : "Planora · Focus",
      body: es ? "La sesión ha terminado." : "Your Focus session has ended.",
    };
  }
  if (kind === "soft_goal") {
    return {
      title: es ? "Planora · Meta suave" : "Planora · Soft goal",
      body: es
        ? "Has alcanzado la meta opcional del cronómetro."
        : "You reached the optional stopwatch goal.",
    };
  }
  const phase = session.currentPhaseKind;
  if (phase === "short_break" || phase === "long_break") {
    return {
      title: es ? "Planora · Descanso" : "Planora · Break",
      body: es
        ? "El descanso ha terminado. Toca para volver al enfoque."
        : "Break is over. Tap to return to focus.",
    };
  }
  return {
    title: es ? "Planora · Fase de enfoque" : "Planora · Focus phase",
    body: es
      ? "La fase ha terminado. Toca para continuar."
      : "This phase has ended. Tap to continue.",
  };
}

function markDelivered(key: string) {
  const now = Date.now();
  recentDeliveries.set(key, now);
  for (const [entry, at] of recentDeliveries) {
    if (now - at > DEDUPE_MS * 3) recentDeliveries.delete(entry);
  }
}

function wasRecentlyDelivered(key: string): boolean {
  const at = recentDeliveries.get(key);
  if (at == null) return false;
  return Date.now() - at < DEDUPE_MS;
}

/**
 * Compute when the open timed phase should end, or null if open/paused/untimed.
 */
export function focusPhaseEndsAtMs(
  session: FocusSession,
  now: number = Date.now(),
): number | null {
  if (!isActiveStatus(session.status) || session.status === "paused") {
    return null;
  }
  const open = openInterval(session);
  if (!open || open.plannedDurationSec == null) return null;
  const remaining = remainingPhaseSec(session, now);
  if (remaining == null) return null;
  if (remaining <= 0) return now;
  return now + remaining * 1000;
}

export function getActiveFocusPhaseSchedule(): FocusPhaseAlertSchedule | null {
  return schedule;
}

/** Cancel any pending phase-end timer for Focus. */
export function cancelFocusPhaseAlert(): void {
  if (typeof window === "undefined") {
    schedule = null;
    return;
  }
  if (schedule?.timerId != null) {
    window.clearTimeout(schedule.timerId);
  }
  schedule = null;
}

/**
 * Schedule a single phase-end alert. Cancels any previous schedule first.
 * Uses the page timer while Planora is open; delivery still depends on the OS
 * when the page is fully suspended.
 */
export function scheduleFocusPhaseAlert(
  session: FocusSession,
  options: { locale?: string; now?: number } = {},
): FocusPhaseAlertSchedule | null {
  if (typeof window === "undefined") return null;

  const endsAtMs = focusPhaseEndsAtMs(session, options.now ?? Date.now());
  const open = openInterval(session);
  if (endsAtMs == null || !open) {
    cancelFocusPhaseAlert();
    return null;
  }

  const next: FocusPhaseAlertSchedule = {
    sessionId: session.id,
    revision: session.revision,
    intervalId: open.id,
    endsAtMs,
    timerId: null,
  };

  // Idempotent: same open interval + same end (±1s) → keep existing timer.
  if (
    schedule &&
    schedule.sessionId === next.sessionId &&
    schedule.intervalId === next.intervalId &&
    schedule.revision === next.revision &&
    Math.abs(schedule.endsAtMs - next.endsAtMs) < 1000
  ) {
    return schedule;
  }

  cancelFocusPhaseAlert();

  const delay = Math.max(0, Math.min(MAX_SCHEDULE_MS, endsAtMs - Date.now()));
  const locale = localeOf(options.locale);
  next.timerId = window.setTimeout(() => {
    schedule = null;
    void deliverFocusPhaseAlert(session, {
      locale,
      kind: "phase_end",
    });
  }, delay);

  schedule = next;
  return next;
}

/**
 * Deliver cues for a phase boundary. Dedupes rapid schedule + state-change pairs.
 * Never throws; never blocks the timer.
 */
export async function deliverFocusPhaseAlert(
  session: FocusSession,
  options: DeliverOptions = {},
): Promise<{
  sound: boolean;
  vibration: boolean;
  notification: boolean;
  inApp: boolean;
  skipped: boolean;
}> {
  const kind: PhaseCueKind =
    options.kind === "phase_end"
      ? "phase_change"
      : (options.kind ?? "phase_change");
  // Collapse schedule-fire + state-change pairs for the same session.
  const dedupeKey =
    kind === "soft_goal"
      ? `${session.id}:soft:${openInterval(session)?.id ?? "x"}`
      : `${session.id}:phase-boundary`;
  if (wasRecentlyDelivered(dedupeKey)) {
    return {
      sound: false,
      vibration: false,
      notification: false,
      inApp: false,
      skipped: true,
    };
  }
  markDelivered(dedupeKey);

  const locale = localeOf(options.locale);
  const copy = copyFor(kind, session, locale);
  let inApp = false;

  // Session complete / soft goal already surface dedicated toasts from the runtime.
  const allowInApp =
    !options.silentInApp &&
    kind !== "session_complete" &&
    kind !== "soft_goal";

  if (allowInApp) {
    try {
      toast.info(copy.title, {
        description: copy.body,
        duration: 7_000,
      });
      inApp = true;
    } catch {
      inApp = false;
    }
  }

  const cues = await playPhaseCue(session, kind, { locale, title: copy.title, body: copy.body });

  // Optional PWA badge while the tab is in the background.
  try {
    if (
      typeof navigator !== "undefined" &&
      "setAppBadge" in navigator &&
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      await (
        navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void> }
      ).setAppBadge?.(1);
    }
  } catch {
    // Badge is progressive enhancement only.
  }

  return { ...cues, inApp, skipped: false };
}

export async function clearFocusAppBadge(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && "clearAppBadge" in navigator) {
      await (
        navigator as Navigator & { clearAppBadge?: () => Promise<void> }
      ).clearAppBadge?.();
    }
  } catch {
    // ignore
  }
}

/** Explicit user-triggered sound preview (settings). */
export function previewFocusSound(volume?: number): boolean {
  const device = loadFocusDevicePreferences();
  if (!device.soundEnabled && volume == null) return false;
  return playSoftChime(volume ?? device.soundVolume);
}

/** Explicit user-triggered notification preview (settings). */
export async function previewFocusNotification(
  locale: string = "es",
): Promise<"shown" | "denied" | "unsupported" | "default"> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  const permission = focusNotificationPermission();
  if (permission === "unsupported") return "unsupported";
  if (permission === "denied") return "denied";
  if (permission === "default") return "default";

  const loc = localeOf(locale);
  const title = loc === "es" ? "Planora · Prueba" : "Planora · Test";
  const body =
    loc === "es"
      ? "Así se verá un aviso de Enfoque en este dispositivo."
      : "This is how a Focus alert looks on this device.";

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "planora-focus-preview",
        silent: false,
        data: { url: `/${loc}/focus` },
      });
      return "shown";
    }
    new Notification(title, {
      body,
      tag: "planora-focus-preview",
      silent: false,
    });
    return "shown";
  } catch {
    return "denied";
  }
}

/** Test helper. */
export function __resetFocusPhaseAlertsForTests() {
  cancelFocusPhaseAlert();
  recentDeliveries.clear();
}
