import type { FocusSession } from "./types";
import { loadFocusDevicePreferences } from "./focus-preferences";

export type PhaseCueKind = "phase_change" | "session_complete" | "soft_goal";

/**
 * Progressive enhancement cues for phase changes.
 * Never throws; never blocks the timer. Honours session flags, device prefs and browser limits.
 */
export async function playPhaseCue(
  session: FocusSession,
  kind: PhaseCueKind = "phase_change",
): Promise<{ sound: boolean; vibration: boolean; notification: boolean }> {
  const result = { sound: false, vibration: false, notification: false };
  if (typeof window === "undefined") return result;
  const device = loadFocusDevicePreferences();

  if (session.config.soundEnabled && device.soundEnabled) {
    result.sound = playSoftChime(device.soundVolume);
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
    result.notification = await tryNotifyPhase(session, kind);
  }

  return result;
}

function playSoftChime(volume = 0.5): boolean {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return false;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const peak = Math.max(0.0001, Math.min(0.08, 0.05 * volume));
    osc.type = "sine";
    osc.frequency.value = 528;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.4);
    void ctx.resume().catch(() => {
      // Autoplay blocked — ignore quietly.
    });
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 600);
    return true;
  } catch {
    return false;
  }
}

async function tryNotifyPhase(
  session: FocusSession,
  kind: PhaseCueKind,
): Promise<boolean> {
  try {
    if (!("Notification" in window)) return false;
    const permission = Notification.permission;
    if (permission === "default") {
      // Only request after a user gesture elsewhere; never force here.
      return false;
    }
    if (permission !== "granted") return false;

    const title =
      kind === "session_complete"
        ? "Planora · Enfoque"
        : "Planora · Cambio de fase";
    const body =
      kind === "session_complete"
        ? "La sesión ha terminado."
        : session.currentPhaseKind === "focus"
          ? "Toca para continuar cuando quieras."
          : "El descanso ha terminado.";

    // Avoid private content (task titles / notes) in notifications.
    new Notification(title, {
      body,
      silent: true,
      tag: `planora-focus-${session.id}`,
    });
    return true;
  } catch {
    return false;
  }
}
