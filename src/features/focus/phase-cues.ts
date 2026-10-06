import type { FocusSession } from "./types";
import { loadFocusDevicePreferences } from "./focus-preferences";
import { startSoundPreview } from "@/lib/audio/shared-preview";
import { showPlanoraSystemNotification } from "@/features/reminders/system-notification";

export type PhaseCueKind = "phase_change" | "session_complete" | "soft_goal";

export type PhaseCueOptions = {
  locale?: "es" | "en";
  title?: string;
  body?: string;
};

/**
 * Progressive enhancement cues for phase changes.
 * Never throws; never blocks the timer. Honours session flags, device prefs and browser limits.
 */
export async function playPhaseCue(
  session: FocusSession,
  kind: PhaseCueKind = "phase_change",
  options: PhaseCueOptions = {},
): Promise<{ sound: boolean; vibration: boolean; notification: boolean }> {
  const result = { sound: false, vibration: false, notification: false };
  if (typeof window === "undefined") return result;
  const device = loadFocusDevicePreferences();

  if (session.config.soundEnabled && device.soundEnabled) {
    result.sound = playSoftChime(device.soundVolume, device.soundId);
  }

  if (
    session.config.vibrationEnabled &&
    device.vibrationEnabled &&
    typeof navigator.vibrate === "function"
  ) {
    try {
      // Short, non-alarming pattern.
      result.vibration = navigator.vibrate(
        kind === "session_complete" ? [40, 40, 40] : [28],
      );
    } catch {
      result.vibration = false;
    }
  }

  if (
    session.config.notifyOnPhaseEnd &&
    device.systemNotifyEnabled &&
    kind !== "soft_goal"
  ) {
    result.notification = await tryNotifyPhase(session, kind, options);
  }

  return result;
}

/** Synthesised chime — no external audio assets. Never throws. */
export function playSoftChime(volume = 0.5, soundId: string = "soft"): boolean {
  try {
    return startSoundPreview({ volume, soundId }).ok;
  } catch {
    return false;
  }
}

async function tryNotifyPhase(
  session: FocusSession,
  kind: PhaseCueKind,
  options: PhaseCueOptions,
): Promise<boolean> {
  try {
    if (!("Notification" in window)) return false;
    const permission = Notification.permission;
    if (permission === "default") {
      // Only request after a user gesture elsewhere; never force here.
      return false;
    }
    if (permission !== "granted") return false;

    const locale = options.locale === "en" ? "en" : "es";
    const title =
      options.title ??
      (kind === "session_complete"
        ? locale === "en"
          ? "Planora · Focus"
          : "Planora · Enfoque"
        : locale === "en"
          ? "Planora · Phase change"
          : "Planora · Cambio de fase");
    const body =
      options.body ??
      (kind === "session_complete"
        ? locale === "en"
          ? "Your Focus session has ended."
          : "La sesión ha terminado."
        : session.currentPhaseKind === "focus"
          ? locale === "en"
            ? "Tap to continue when you are ready."
            : "Toca para continuar cuando quieras."
          : locale === "en"
            ? "Break is over."
            : "El descanso ha terminado.");

    // Same service-worker path as reminders. Android Chrome ignores
    // `new Notification()`, so that constructor is not a fallback.
    // Never put task titles or private notes in the payload.
    const result = await showPlanoraSystemNotification({
      title,
      body,
      tag: `planora-focus-${session.id}`,
      url: `/${locale}/focus`,
      silent: true,
      requireInteraction: false,
    });
    return result === "shown";
  } catch {
    return false;
  }
}
