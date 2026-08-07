import type {
  FocusInterval,
  FocusPhaseKind,
  FocusPhaseView,
  FocusSession,
  FocusSessionClock,
  FocusSessionSummary,
} from "./types";

export function toInstant(value: string | Date | number): number {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  return Date.parse(value);
}

export function toIso(value: string | Date | number): string {
  if (typeof value === "string") return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

/** Inclusive duration in whole seconds between two instants. Never negative. */
export function durationSecBetween(
  startedAt: string | Date | number,
  endedAt: string | Date | number,
): number {
  const start = toInstant(startedAt);
  const end = toInstant(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

export function openInterval(session: FocusSession): FocusInterval | null {
  return session.intervals.find((interval) => interval.endedAt == null) ?? null;
}

export function closedIntervals(session: FocusSession): FocusInterval[] {
  return session.intervals.filter(
    (interval): interval is FocusInterval & { endedAt: string } =>
      interval.endedAt != null,
  );
}

function kindGroup(kind: FocusPhaseKind): "focus" | "pause" | "break" {
  if (kind === "focus") return "focus";
  if (kind === "pause") return "pause";
  return "break";
}

export function elapsedOfKinds(
  intervals: FocusInterval[],
  kinds: readonly FocusPhaseKind[],
  now: Date | number,
): number {
  const nowMs = toInstant(now);
  let total = 0;
  for (const interval of intervals) {
    if (!kinds.includes(interval.kind)) continue;
    const end = interval.endedAt ? toInstant(interval.endedAt) : nowMs;
    total += durationSecBetween(interval.startedAt, end);
  }
  return total;
}

export function elapsedFocusSec(
  session: FocusSession,
  now: Date | number,
): number {
  return elapsedOfKinds(session.intervals, ["focus"], now);
}

export function elapsedPausedSec(
  session: FocusSession,
  now: Date | number,
): number {
  return elapsedOfKinds(session.intervals, ["pause"], now);
}

export function elapsedBreakSec(
  session: FocusSession,
  now: Date | number,
): number {
  return elapsedOfKinds(
    session.intervals,
    ["short_break", "long_break"],
    now,
  );
}

export function recomputeClosedTotals(session: FocusSession): {
  focusSec: number;
  pausedSec: number;
  breakSec: number;
} {
  const closed = closedIntervals(session);
  return {
    focusSec: elapsedOfKinds(closed, ["focus"], 0),
    pausedSec: elapsedOfKinds(closed, ["pause"], 0),
    breakSec: elapsedOfKinds(closed, ["short_break", "long_break"], 0),
  };
}

export function plannedPhaseSec(
  session: FocusSession,
  kind: FocusPhaseKind | null = session.currentPhaseKind,
): number | null {
  if (!kind || kind === "pause") return null;
  const open = openInterval(session);
  if (open && open.kind === kind && open.plannedDurationSec != null) {
    return open.plannedDurationSec;
  }
  if (kind === "focus") {
    return (
      session.config.focusDurationSec ??
      session.plannedFocusSec ??
      null
    );
  }
  if (kind === "short_break") return session.config.shortBreakSec;
  if (kind === "long_break") return session.config.longBreakSec;
  return null;
}

export function phaseElapsedSec(
  session: FocusSession,
  now: Date | number,
): number {
  const open = openInterval(session);
  if (!open) return 0;
  return durationSecBetween(open.startedAt, now);
}

export function remainingPhaseSec(
  session: FocusSession,
  now: Date | number,
): number | null {
  const open = openInterval(session);
  if (!open) return null;
  if (session.mode === "stopwatch" && open.kind === "focus") {
    const goal = open.plannedDurationSec;
    if (goal == null) return null;
    return Math.max(0, goal - durationSecBetween(open.startedAt, now));
  }
  const planned = open.plannedDurationSec;
  if (planned == null) return null;
  return Math.max(0, planned - durationSecBetween(open.startedAt, now));
}

export function phaseProgress(
  session: FocusSession,
  now: Date | number,
): number {
  const open = openInterval(session);
  if (!open) return session.status === "completed" ? 1 : 0;
  const planned = open.plannedDurationSec;
  if (planned == null || planned <= 0) {
    // Stopwatch without goal: indeterminate progress stays at 0.
    return 0;
  }
  const elapsed = durationSecBetween(open.startedAt, now);
  return Math.min(1, Math.max(0, elapsed / planned));
}

export function isPhaseComplete(
  session: FocusSession,
  now: Date | number,
): boolean {
  const remaining = remainingPhaseSec(session, now);
  if (remaining == null) return false;
  return remaining <= 0;
}

export function expectedPhaseEndAt(session: FocusSession): string | null {
  const open = openInterval(session);
  if (!open || open.plannedDurationSec == null) return null;
  return toIso(toInstant(open.startedAt) + open.plannedDurationSec * 1000);
}

export function buildPhaseView(
  session: FocusSession,
  now: Date | number,
): FocusPhaseView {
  const kind = openInterval(session)?.kind ?? session.currentPhaseKind;
  const planned = plannedPhaseSec(session, kind);
  const elapsed = phaseElapsedSec(session, now);
  const remaining = remainingPhaseSec(session, now);
  return {
    kind,
    elapsedSec: elapsed,
    remainingSec: remaining,
    plannedSec: planned,
    progress: phaseProgress(session, now),
    isComplete: isPhaseComplete(session, now),
  };
}

/**
 * Derive the full display clock from timestamps. Safe to call every render;
 * never mutates session state.
 */
export function deriveSessionClock(
  session: FocusSession,
  now: Date | number = Date.now(),
): FocusSessionClock {
  const phase = buildPhaseView(session, now);
  return {
    focusElapsedSec: elapsedFocusSec(session, now),
    pausedElapsedSec: elapsedPausedSec(session, now),
    breakElapsedSec: elapsedBreakSec(session, now),
    remainingSec: phase.remainingSec,
    phase,
    expectedEndAt: expectedPhaseEndAt(session),
  };
}

export function sessionSummary(
  session: FocusSession,
  now: Date | number = Date.now(),
): FocusSessionSummary {
  const totals =
    session.status === "completed" || session.status === "cancelled"
      ? {
          focusSec: session.focusSec,
          pausedSec: session.pausedSec,
          breakSec: session.breakSec,
        }
      : {
          focusSec: elapsedFocusSec(session, now),
          pausedSec: elapsedPausedSec(session, now),
          breakSec: elapsedBreakSec(session, now),
        };

  const focusIntervals = session.intervals.filter(
    (interval) => interval.kind === "focus" && interval.endedAt != null,
  );

  return {
    sessionId: session.id,
    mode: session.mode,
    status: session.status,
    title: session.title,
    focusSec: totals.focusSec,
    pausedSec: totals.pausedSec,
    breakSec: totals.breakSec,
    cyclesCompleted: Math.max(
      0,
      focusIntervals.length -
        (session.status === "running" || session.status === "paused" ? 0 : 0),
    ),
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    completeTaskOnEnd: session.completeTaskOnEnd,
  };
}

export function normalizeSession(session: FocusSession): FocusSession {
  const sorted = [...session.intervals].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const open = sorted.filter((interval) => interval.endedAt == null);
  const intervals =
    open.length <= 1
      ? sorted
      : sorted.map((interval, index) =>
          index === sorted.length - 1 || interval.endedAt != null
            ? interval
            : {
                ...interval,
                // Keep the latest open interval; seal earlier ones at their start (degenerate).
                endedAt: interval.startedAt,
              },
        );

  const normalized: FocusSession = { ...session, intervals };
  const totals = recomputeClosedTotals(normalized);
  const liveOpen = openInterval(normalized);

  return {
    ...normalized,
    focusSec: totals.focusSec,
    pausedSec: totals.pausedSec,
    breakSec: totals.breakSec,
    currentPhaseKind: liveOpen?.kind ?? normalized.currentPhaseKind,
    currentCycle:
      liveOpen?.cycleIndex ??
      normalized.currentCycle ??
      1,
  };
}

export function isActiveStatus(
  status: FocusSession["status"],
): status is "running" | "paused" | "on_break" {
  return status === "running" || status === "paused" || status === "on_break";
}

export function intervalKindForGroup(
  kind: FocusPhaseKind,
): ReturnType<typeof kindGroup> {
  return kindGroup(kind);
}
