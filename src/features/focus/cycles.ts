import type { FocusPhaseKind, FocusSession, FocusSessionConfig } from "./types";
import { hasStructuredPlan, segmentPhaseKind } from "./session-plan";

export type NextPhasePlan = {
  kind: "focus" | "short_break" | "long_break";
  cycleIndex: number;
  plannedDurationSec: number | null;
  completesSession: boolean;
};

function breakKindForCycle(
  config: FocusSessionConfig,
  completedFocusInCycle: number,
): "short_break" | "long_break" {
  const every = config.cyclesBeforeLongBreak ?? 4;
  if (every > 0 && completedFocusInCycle % every === 0) return "long_break";
  return "short_break";
}

/**
 * Decide the next phase after the current open (or just-closed) phase ends.
 * `completedFocusBlocks` counts focus intervals already finished (including the one just closed).
 */
export function planNextPhase(
  session: FocusSession,
  completedFocusBlocks: number,
): NextPhasePlan {
  const { mode, config } = session;

  // Structured plan overrides classic countdown/cycles progression.
  if (hasStructuredPlan(session)) {
    const finished = session.intervals.filter(
      (interval) => interval.endedAt != null,
    ).length;
    if (finished >= config.segments.length) {
      return {
        kind: "focus",
        cycleIndex: Math.max(1, config.segments.length),
        plannedDurationSec: null,
        completesSession: true,
      };
    }
    const next = config.segments[finished]!;
    return {
      kind: segmentPhaseKind(next),
      cycleIndex: finished + 1,
      plannedDurationSec: next.durationSec,
      completesSession: false,
    };
  }

  if (mode === "countdown" || mode === "stopwatch") {
    return {
      kind: "focus",
      cycleIndex: 1,
      plannedDurationSec: config.focusDurationSec,
      completesSession: true,
    };
  }

  // cycles mode
  const open = session.intervals.find((item) => item.endedAt == null);
  const currentKind = open?.kind ?? session.currentPhaseKind ?? "focus";

  if (currentKind === "focus" || currentKind === "pause") {
    const target = config.targetCycles;
    if (target != null && completedFocusBlocks >= target) {
      return {
        kind: "focus",
        cycleIndex: completedFocusBlocks,
        plannedDurationSec: config.focusDurationSec,
        completesSession: true,
      };
    }
    const kind = breakKindForCycle(config, completedFocusBlocks);
    const planned =
      kind === "long_break" ? config.longBreakSec : config.shortBreakSec;
    // Zero-length break: skip straight conceptually by marking break with 0 duration.
    return {
      kind,
      cycleIndex: completedFocusBlocks,
      plannedDurationSec: planned ?? 0,
      completesSession: false,
    };
  }

  // coming from a break → next focus block
  const nextCycle = completedFocusBlocks + 1;
  const target = config.targetCycles;
  if (target != null && completedFocusBlocks >= target) {
    return {
      kind: "focus",
      cycleIndex: completedFocusBlocks,
      plannedDurationSec: config.focusDurationSec,
      completesSession: true,
    };
  }

  return {
    kind: "focus",
    cycleIndex: nextCycle,
    plannedDurationSec: config.focusDurationSec,
    completesSession: false,
  };
}

export function countCompletedFocusBlocks(session: FocusSession): number {
  return session.intervals.filter(
    (interval) => interval.kind === "focus" && interval.endedAt != null,
  ).length;
}

export function isBreakKind(
  kind: FocusPhaseKind | null | undefined,
): kind is "short_break" | "long_break" {
  return kind === "short_break" || kind === "long_break";
}

export type FocusCycleProgress = {
  completedFocusBlocks: number;
  targetCycles: number | null;
  indefinite: boolean;
  currentCycle: number;
  /** 0–1 when target is set; null when indefinite. */
  progress: number | null;
  remainingFocusBlocks: number | null;
  next: NextPhasePlan;
};

export function getCycleProgress(
  session: FocusSession,
  nowCompletedFocus = countCompletedFocusBlocks(session),
): FocusCycleProgress {
  const target = session.config.targetCycles;
  const next = planNextPhase(session, nowCompletedFocus);
  return {
    completedFocusBlocks: nowCompletedFocus,
    targetCycles: target,
    indefinite: target == null,
    currentCycle: session.currentCycle,
    progress:
      target != null && target > 0
        ? Math.min(1, nowCompletedFocus / target)
        : null,
    remainingFocusBlocks:
      target != null ? Math.max(0, target - nowCompletedFocus) : null,
    next,
  };
}

export type FocusSessionEndSummary = {
  focusSec: number;
  breakSec: number;
  pausedSec: number;
  completedFocusBlocks: number;
  targetCycles: number | null;
  mode: FocusSession["mode"];
  reachedTarget: boolean;
};

export function summarizeEndedSession(
  session: FocusSession,
): FocusSessionEndSummary {
  const completedFocusBlocks = countCompletedFocusBlocks(session);
  const target = session.config.targetCycles;
  return {
    focusSec: session.focusSec,
    breakSec: session.breakSec,
    pausedSec: session.pausedSec,
    completedFocusBlocks,
    targetCycles: target,
    mode: session.mode,
    reachedTarget: target != null && completedFocusBlocks >= target,
  };
}

/** Extra focus block after finishing planned cycles (same durations, one cycle). */
export function buildExtraBlockStartInput(session: FocusSession) {
  return {
    mode: "cycles" as const,
    title: session.title,
    taskId: session.taskId,
    categoryId: session.categoryId,
    scheduleId: session.scheduleId,
    occurrenceDate: session.occurrenceDate,
    focusDurationSec: session.config.focusDurationSec,
    shortBreakSec: session.config.shortBreakSec,
    longBreakSec: session.config.longBreakSec,
    cyclesBeforeLongBreak: session.config.cyclesBeforeLongBreak,
    targetCycles: 1,
    autoStartBreaks: session.config.autoStartBreaks,
    autoStartFocus: session.config.autoStartFocus,
    soundEnabled: session.config.soundEnabled,
    vibrationEnabled: session.config.vibrationEnabled,
    notifyOnPhaseEnd: session.config.notifyOnPhaseEnd,
    completeTaskOnEnd: false,
    keepScreenAwake: session.config.keepScreenAwake,
    preferFullscreen: session.config.preferFullscreen,
    linkSnapshot: session.linkSnapshot,
  };
}
