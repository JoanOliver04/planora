import type {
  FocusPhaseKind,
  FocusSession,
  FocusSessionConfig,
} from "./types";

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
