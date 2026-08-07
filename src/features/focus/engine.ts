import {
  applyFocusAction,
  recoverFocusSession,
  type FocusDomainAction,
} from "./state-machine";
import {
  deriveSessionClock,
  isActiveStatus,
  isPhaseComplete,
  openInterval,
  remainingPhaseSec,
} from "./time";
import type {
  FocusEventName,
  FocusSession,
  FocusSessionClock,
  FocusTransitionResult,
} from "./types";

export type FocusEngineSnapshot = {
  session: FocusSession;
  clock: FocusSessionClock;
  /** Clamped remaining for display; never negative. */
  displayRemainingSec: number | null;
  phaseComplete: boolean;
  /**
   * When true, the engine should persist a finish_phase (or complete) once.
   * Stopwatch never auto-finishes.
   */
  shouldAutoAdvance: boolean;
  /** Soft goal reached on stopwatch with optional planned duration. */
  softGoalReached: boolean;
  isTerminal: boolean;
};

/**
 * Pure evaluation of an active session at wall-clock `now`.
 * No I/O and no mutation — UI ticks call this every second.
 */
export function evaluateFocusEngine(
  session: FocusSession,
  now: Date | number = Date.now(),
): FocusEngineSnapshot {
  const clock = deriveSessionClock(session, now);
  const remaining = remainingPhaseSec(session, now);
  const displayRemainingSec = remaining == null ? null : Math.max(0, remaining);
  const phaseComplete = isPhaseComplete(session, now);
  const isTerminal =
    session.status === "completed" || session.status === "cancelled";

  const open = openInterval(session);
  const isStopwatchFocus =
    session.mode === "stopwatch" && open?.kind === "focus";

  const softGoalReached =
    isStopwatchFocus &&
    open?.plannedDurationSec != null &&
    remaining != null &&
    remaining <= 0;

  // Countdown always auto-finishes. Cycles respect auto-start preferences.
  // Stopwatch never auto-completes; soft goal is informational only.
  const shouldAutoAdvance =
    !isTerminal &&
    session.status !== "paused" &&
    phaseComplete &&
    !isStopwatchFocus &&
    open?.plannedDurationSec != null &&
    shouldAutoStartNextPhase(session);

  return {
    session,
    clock: {
      ...clock,
      remainingSec: displayRemainingSec,
      phase: {
        ...clock.phase,
        remainingSec: displayRemainingSec,
        isComplete: phaseComplete,
      },
    },
    displayRemainingSec,
    phaseComplete,
    shouldAutoAdvance,
    softGoalReached,
    isTerminal,
  };
}

/**
 * Rebuild session after reload/suspension. Advances overdue phases at their
 * planned boundaries (deterministic, no tick storage).
 */
export function prepareFocusSessionOnLoad(
  session: FocusSession,
  now: Date | number = Date.now(),
  createId?: () => string,
): FocusTransitionResult {
  if (!isActiveStatus(session.status)) {
    return { session, events: [], recovered: false };
  }
  return recoverFocusSession(session, now, createId);
}

/**
 * Apply a user/engine action with optional recovery first when coming back
 * from background. Pure — persistence is the caller's job.
 */
export function runFocusEngineAction(
  session: FocusSession,
  action: FocusDomainAction,
  options: {
    now?: Date | number;
    expectedRevision?: number;
    createId?: () => string;
    /** When true, recover overdue phases before applying the action. */
    recoverFirst?: boolean;
  } = {},
): FocusTransitionResult {
  const now = options.now ?? Date.now();
  let current = session;
  let events: FocusEventName[] = [];
  let recovered = false;

  if (options.recoverFirst && isActiveStatus(current.status)) {
    const prep = prepareFocusSessionOnLoad(current, now, options.createId);
    current = prep.session;
    events = [...prep.events];
    recovered = prep.recovered;
    if (!isActiveStatus(current.status) && action.type !== "recover") {
      return { session: current, events, recovered };
    }
  }

  if (action.type === "recover") {
    const prep = prepareFocusSessionOnLoad(current, now, options.createId);
    return {
      session: prep.session,
      events: [...events, ...prep.events],
      recovered: recovered || prep.recovered,
    };
  }

  // After recoverFirst, always use the post-recovery revision.
  const expectedRevision = options.recoverFirst
    ? current.revision
    : (options.expectedRevision ?? current.revision);

  const result = applyFocusAction(current, action, {
    now,
    expectedRevision,
    createId: options.createId,
  });

  return {
    session: result.session,
    events: [...events, ...result.events],
    recovered,
  };
}

/** Auto-advance decision: finish_phase at wall clock (or complete via domain). */
export function autoAdvanceAction(): FocusDomainAction {
  return { type: "finish_phase" };
}

/**
 * In-flight guard for client actions. Prevents double pause/complete from
 * creating duplicate intervals when the user double-clicks.
 */
export function createFocusActionGate() {
  let locked = false;
  let lastKey: string | null = null;
  let lastAt = 0;

  return {
    tryBegin(key: string, debounceMs = 400): boolean {
      const now = Date.now();
      if (locked) return false;
      if (lastKey === key && now - lastAt < debounceMs) return false;
      locked = true;
      lastKey = key;
      lastAt = now;
      return true;
    },
    end() {
      locked = false;
    },
    get isLocked() {
      return locked;
    },
  };
}

export type FocusActionGate = ReturnType<typeof createFocusActionGate>;

/**
 * Detect delayed render frames: elapsed from timestamps must match wall clock,
 * not the number of interval callbacks.
 */
export function assertNoDrift(
  session: FocusSession,
  samples: Array<{ at: number; expectedFocusElapsed: number }>,
): boolean {
  return samples.every((sample) => {
    const clock = deriveSessionClock(session, sample.at);
    return clock.focusElapsedSec === sample.expectedFocusElapsed;
  });
}

/**
 * Whether the engine may auto-call finish_phase when the current phase hits zero.
 * Neutral language: this is a preference, not a streak rule.
 */
export function shouldAutoStartNextPhase(session: FocusSession): boolean {
  if (session.config.segments.length > 0) {
    const finished = session.intervals.filter(
      (interval) => interval.endedAt != null,
    ).length;
    const current = session.config.segments[finished];
    if (!current) return false;
    // Open segments never auto-advance; timed ones honour autoAdvance.
    if (current.durationSec == null) return false;
    return current.autoAdvance;
  }
  if (session.mode === "countdown") return true;
  if (session.mode === "stopwatch") return false;
  // cycles
  if (session.status === "running") return session.config.autoStartBreaks;
  if (session.status === "on_break") return session.config.autoStartFocus;
  return false;
}

/** Mid-session: only these config keys may be changed without restarting. */
export const EDITABLE_MID_SESSION_CONFIG_KEYS = [
  "autoStartBreaks",
  "autoStartFocus",
  "soundEnabled",
  "vibrationEnabled",
  "notifyOnPhaseEnd",
  "keepScreenAwake",
  "preferFullscreen",
] as const;

export type EditableMidSessionConfigKey =
  (typeof EDITABLE_MID_SESSION_CONFIG_KEYS)[number];

export function isMidSessionConfigLocked(key: string): boolean {
  return !(EDITABLE_MID_SESSION_CONFIG_KEYS as readonly string[]).includes(key);
}
