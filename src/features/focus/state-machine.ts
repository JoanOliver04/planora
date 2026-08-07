import { FocusError } from "./errors";
import {
  countCompletedFocusBlocks,
  isBreakKind,
  planNextPhase,
} from "./cycles";
import type { StartFocusSessionInput } from "./validation";
import {
  durationSecBetween,
  isActiveStatus,
  normalizeSession,
  openInterval,
  recomputeClosedTotals,
  toIso,
} from "./time";
import type {
  FocusEventName,
  FocusInterval,
  FocusPhaseKind,
  FocusSession,
  FocusSessionConfig,
  FocusTransitionResult,
} from "./types";
import {
  hasStructuredPlan,
  plannedPlanFocusSec,
  segmentPhaseKind,
  segmentStatus,
} from "./session-plan";

export type FocusDomainAction =
  | { type: "start"; input: StartFocusSessionInput; userId: string }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "begin_break"; breakKind?: "short_break" | "long_break" }
  | { type: "skip_break" }
  | { type: "extend_break"; extraSec: number }
  | { type: "finish_phase" }
  /** Advance the structured plan explicitly (skip records early leave). */
  | { type: "skip_segment" }
  | {
      type: "complete";
      notes?: string | null;
      subjectiveFocus?: number | null;
      subjectiveEnergy?: number | null;
    }
  | { type: "cancel" }
  | { type: "recover" }
  | { type: "takeover" };

export type ApplyFocusOptions = {
  expectedRevision?: number;
  createId?: () => string;
  sessionId?: string;
  now?: Date | number;
  /** When recovering, close/open at the planned boundary instead of wall clock. */
  at?: Date | number;
};

const MAX_RECOVERY_STEPS = 48;

function defaultId(): string {
  return crypto.randomUUID();
}

function assertRevision(session: FocusSession, expected?: number) {
  if (expected == null) return;
  if (session.revision !== expected) {
    throw new FocusError(
      "REVISION_CONFLICT",
      "This focus session was updated elsewhere. Reload and try again.",
    );
  }
}

function invalid(message: string): never {
  throw new FocusError("INVALID_TRANSITION", message);
}

function bump(session: FocusSession): FocusSession {
  return { ...session, revision: session.revision + 1 };
}

function withTotals(session: FocusSession): FocusSession {
  const totals = recomputeClosedTotals(session);
  return { ...session, ...totals };
}

function closeOpenInterval(
  session: FocusSession,
  at: Date | number,
): FocusSession {
  const open = openInterval(session);
  if (!open) return session;
  const endedAt = toIso(at);
  if (durationSecBetween(open.startedAt, endedAt) < 0) {
    invalid("Cannot end an interval before it started");
  }
  const intervals = session.intervals.map((interval) =>
    interval.id === open.id ? { ...interval, endedAt } : interval,
  );
  return withTotals({ ...session, intervals });
}

function nextSequence(session: FocusSession): number {
  if (session.intervals.length === 0) return 0;
  return Math.max(...session.intervals.map((item) => item.sequence)) + 1;
}

function openPhase(
  session: FocusSession,
  params: {
    id: string;
    kind: FocusPhaseKind;
    cycleIndex: number | null;
    plannedDurationSec: number | null;
    at: Date | number;
  },
): FocusSession {
  if (openInterval(session)) {
    invalid("Session already has an open interval");
  }
  const interval: FocusInterval = {
    id: params.id,
    kind: params.kind,
    sequence: nextSequence(session),
    cycleIndex: params.cycleIndex,
    startedAt: toIso(params.at),
    endedAt: null,
    plannedDurationSec: params.plannedDurationSec,
  };
  return {
    ...session,
    intervals: [...session.intervals, interval],
    currentPhaseKind: params.kind,
    currentCycle: params.cycleIndex ?? session.currentCycle,
  };
}

export function buildSessionConfig(
  input: StartFocusSessionInput,
): FocusSessionConfig {
  return {
    focusDurationSec: input.focusDurationSec ?? null,
    shortBreakSec: input.shortBreakSec ?? null,
    longBreakSec: input.longBreakSec ?? null,
    cyclesBeforeLongBreak: input.cyclesBeforeLongBreak ?? 4,
    targetCycles: input.targetCycles ?? null,
    autoStartBreaks: input.autoStartBreaks ?? true,
    autoStartFocus: input.autoStartFocus ?? false,
    soundEnabled: input.soundEnabled ?? true,
    vibrationEnabled: input.vibrationEnabled ?? true,
    notifyOnPhaseEnd: input.notifyOnPhaseEnd ?? true,
    completeTaskOnSessionEnd: input.completeTaskOnEnd ?? false,
    keepScreenAwake: input.keepScreenAwake ?? false,
    preferFullscreen: input.preferFullscreen ?? false,
    segments: input.segments ?? [],
  };
}

export function createStartedSession(
  input: StartFocusSessionInput,
  userId: string,
  options: {
    sessionId?: string;
    intervalId?: string;
    now?: Date | number;
    createId?: () => string;
  } = {},
): FocusSession {
  const createId = options.createId ?? defaultId;
  const now = options.now ?? Date.now();
  const startedAt = toIso(now);
  const config = buildSessionConfig(input);
  const plan = config.segments;
  const first = plan[0];
  const planned =
    plan.length > 0
      ? plannedPlanFocusSec(plan)
      : input.mode === "stopwatch"
        ? (input.focusDurationSec ?? null)
        : (input.focusDurationSec ?? null);

  const firstKind = first ? segmentPhaseKind(first) : "focus";
  const firstStatus = first ? segmentStatus(first) : "running";
  const firstPlanned = first
    ? first.durationSec
    : (input.focusDurationSec ?? null);

  const session: FocusSession = {
    id: options.sessionId ?? createId(),
    userId,
    status: firstStatus,
    mode: input.mode,
    title: input.title ?? null,
    presetId: input.presetId ?? null,
    taskId: input.taskId ?? null,
    categoryId: input.categoryId ?? null,
    scheduleId: input.scheduleId ?? null,
    occurrenceDate: input.occurrenceDate ?? null,
    plannedFocusSec: planned,
    focusSec: 0,
    pausedSec: 0,
    breakSec: 0,
    currentPhaseKind: firstKind,
    currentCycle: 1,
    config,
    linkSnapshot: input.linkSnapshot ?? {},
    startedAt,
    endedAt: null,
    notes: null,
    distractions: [],
    subjectiveFocus: null,
    subjectiveEnergy: null,
    completeTaskOnEnd: input.completeTaskOnEnd ?? false,
    taskCompletionApplied: false,
    revision: 1,
    intervals: [],
    createdAt: startedAt,
    updatedAt: startedAt,
  };

  return openPhase(session, {
    id: options.intervalId ?? createId(),
    kind: firstKind,
    cycleIndex: 1,
    plannedDurationSec: firstPlanned,
    at: now,
  });
}

/**
 * Structured plan advance: close current segment and open the next, or complete.
 * Going backward is intentionally unsupported so interval history stays append-only.
 */
function advancePlanSegment(
  session: FocusSession,
  at: Date | number,
  createId: () => string,
  skipped: boolean,
): { session: FocusSession; events: FocusEventName[] } {
  if (!hasStructuredPlan(session)) {
    invalid("No structured plan is active");
  }
  if (session.status === "paused") {
    invalid("Cannot advance a plan while paused");
  }
  if (!isActiveStatus(session.status)) {
    invalid("Only an active session can advance a plan segment");
  }

  const closed = closeOpenInterval(session, at);
  const finished = closed.intervals.filter(
    (item) => item.endedAt != null,
  ).length;
  const events: FocusEventName[] = skipped
    ? ["segment_skipped", "phase_finished"]
    : ["phase_finished"];

  if (finished >= closed.config.segments.length) {
    return {
      session: finishToTerminal(closed, "completed", at),
      events: [...events, "completed"],
    };
  }

  const nextSegment = closed.config.segments[finished]!;
  const kind = segmentPhaseKind(nextSegment);
  const status = segmentStatus(nextSegment);
  const next = openPhase(
    {
      ...closed,
      status,
      updatedAt: toIso(at),
    },
    {
      id: createId(),
      kind,
      cycleIndex: finished + 1,
      plannedDurationSec: nextSegment.durationSec,
      at,
    },
  );

  return {
    session: bump(withTotals(next)),
    events,
  };
}

function finishToTerminal(
  session: FocusSession,
  status: "completed" | "cancelled",
  at: Date | number,
  extras: Partial<FocusSession> = {},
): FocusSession {
  const closed = closeOpenInterval(session, at);
  const totals = recomputeClosedTotals(closed);
  return bump(
    withTotals({
      ...closed,
      ...totals,
      ...extras,
      status,
      endedAt: toIso(at),
      currentPhaseKind: null,
      updatedAt: toIso(at),
    }),
  );
}

function advanceFromFocus(
  session: FocusSession,
  at: Date | number,
  createId: () => string,
  breakKind?: "short_break" | "long_break",
): { session: FocusSession; events: FocusEventName[] } {
  const closed = closeOpenInterval(session, at);
  const completedFocus = countCompletedFocusBlocks(closed);
  const plan = planNextPhase(closed, completedFocus);

  if (plan.completesSession && session.mode !== "cycles") {
    return {
      session: finishToTerminal(closed, "completed", at),
      events: ["phase_finished", "completed"],
    };
  }

  if (plan.completesSession && session.mode === "cycles") {
    // Target cycles reached after this focus block.
    return {
      session: finishToTerminal(closed, "completed", at),
      events: ["phase_finished", "completed"],
    };
  }

  const kind: "short_break" | "long_break" =
    breakKind ?? (plan.kind === "long_break" ? "long_break" : "short_break");

  const planned =
    kind === "long_break"
      ? (session.config.longBreakSec ?? plan.plannedDurationSec)
      : (session.config.shortBreakSec ?? plan.plannedDurationSec);

  // Zero-length break: skip straight to the next focus block (no empty break UI).
  if ((planned ?? 0) === 0) {
    const afterSkip = openPhase(
      {
        ...closed,
        status: "running",
        updatedAt: toIso(at),
      },
      {
        id: createId(),
        kind: "focus",
        cycleIndex: completedFocus + 1,
        plannedDurationSec: session.config.focusDurationSec,
        at,
      },
    );
    return {
      session: bump(withTotals(afterSkip)),
      events: ["phase_finished", "break_skipped"],
    };
  }

  const next = openPhase(
    {
      ...closed,
      status: "on_break",
      updatedAt: toIso(at),
    },
    {
      id: createId(),
      kind,
      cycleIndex: completedFocus,
      plannedDurationSec: planned,
      at,
    },
  );
  return {
    session: bump(withTotals(next)),
    events: ["phase_finished", "break_started"],
  };
}

function advanceFromBreak(
  session: FocusSession,
  at: Date | number,
  createId: () => string,
): { session: FocusSession; events: FocusEventName[] } {
  const closed = closeOpenInterval(session, at);
  const completedFocus = countCompletedFocusBlocks(closed);
  const plan = planNextPhase(
    { ...closed, currentPhaseKind: "short_break" },
    completedFocus,
  );

  if (plan.completesSession) {
    return {
      session: finishToTerminal(closed, "completed", at),
      events: ["phase_finished", "completed"],
    };
  }

  const next = openPhase(
    {
      ...closed,
      status: "running",
      updatedAt: toIso(at),
    },
    {
      id: createId(),
      kind: "focus",
      cycleIndex: plan.cycleIndex,
      plannedDurationSec: plan.plannedDurationSec,
      at,
    },
  );
  return {
    session: bump(withTotals(next)),
    events: ["phase_finished"],
  };
}

function applyFinishPhase(
  session: FocusSession,
  at: Date | number,
  createId: () => string,
): { session: FocusSession; events: FocusEventName[] } {
  if (session.status === "paused") {
    // Closing a pause then finishing is not valid; resume first.
    invalid("Cannot finish a phase while paused");
  }
  if (hasStructuredPlan(session)) {
    return advancePlanSegment(session, at, createId, false);
  }
  if (session.status === "running") {
    return advanceFromFocus(session, at, createId);
  }
  if (session.status === "on_break") {
    return advanceFromBreak(session, at, createId);
  }
  invalid("Cannot finish phase in the current state");
}

/**
 * Advance overdue phases deterministically using planned boundaries.
 * Does not rely on render ticks.
 */
export function recoverFocusSession(
  session: FocusSession,
  now: Date | number,
  createId: () => string = defaultId,
): FocusTransitionResult {
  let current = normalizeSession(session);
  if (!isActiveStatus(current.status)) {
    return { session: current, events: [], recovered: false };
  }
  if (current.status === "paused") {
    return { session: current, events: [], recovered: false };
  }

  const events: FocusEventName[] = [];
  let recovered = false;
  let steps = 0;

  while (steps < MAX_RECOVERY_STEPS) {
    steps += 1;
    const open = openInterval(current);
    if (!open || open.plannedDurationSec == null) break;
    // Stopwatch focus goals are soft: never auto-finish on recovery.
    if (current.mode === "stopwatch" && open.kind === "focus") break;
    const phaseEndMs =
      Date.parse(open.startedAt) + open.plannedDurationSec * 1000;
    if (phaseEndMs > toInstantSafe(now)) break;

    // Phase ended in the past at phaseEndMs.
    const result = applyFinishPhase(current, phaseEndMs, createId);
    current = result.session;
    events.push(...result.events);
    recovered = true;

    if (!isActiveStatus(current.status)) break;

    // If auto-start is disabled, stop after closing the overdue phase and
    // opening the next waiting phase at the boundary (user still sees it).
    const opened = openInterval(current);
    if (!opened) break;
    if (isBreakKind(opened.kind) && !current.config.autoStartBreaks) break;
    if (opened.kind === "focus" && !current.config.autoStartFocus) {
      // Only stop auto-chaining further if we just entered focus from a break
      // and the new focus is not already overdue.
      const nextEnd =
        opened.plannedDurationSec == null
          ? null
          : Date.parse(opened.startedAt) + opened.plannedDurationSec * 1000;
      if (nextEnd == null || nextEnd > toInstantSafe(now)) break;
    }
  }

  if (recovered) {
    events.push("recovered");
    // Recovery consumes one revision bump overall if multiple steps happened.
    // applyFinishPhase already bumped per step; that is intentional for audit.
  }

  return { session: normalizeSession(current), events, recovered };
}

function toInstantSafe(value: Date | number): number {
  return typeof value === "number" ? value : value.getTime();
}

export function applyFocusAction(
  session: FocusSession | null,
  action: FocusDomainAction,
  options: ApplyFocusOptions = {},
): FocusTransitionResult {
  const createId = options.createId ?? defaultId;
  const now = options.now ?? Date.now();
  const at = options.at ?? now;

  if (action.type === "start") {
    if (session && isActiveStatus(session.status)) {
      throw new FocusError(
        "ACTIVE_SESSION_EXISTS",
        "An active focus session already exists.",
      );
    }
    const started = createStartedSession(action.input, action.userId, {
      sessionId: options.sessionId,
      createId,
      now,
    });
    return { session: started, events: ["started"], recovered: false };
  }

  if (!session) {
    throw new FocusError("NOT_FOUND", "Focus session not found.");
  }

  assertRevision(session, options.expectedRevision);
  const current = normalizeSession(session);

  switch (action.type) {
    case "pause": {
      if (current.status !== "running") {
        invalid("Only a running session can be paused");
      }
      const closed = closeOpenInterval(current, at);
      const next = openPhase(
        { ...closed, status: "paused", updatedAt: toIso(at) },
        {
          id: createId(),
          kind: "pause",
          cycleIndex: current.currentCycle,
          plannedDurationSec: null,
          at,
        },
      );
      return {
        session: bump(withTotals(next)),
        events: ["paused"],
        recovered: false,
      };
    }
    case "resume": {
      if (current.status !== "paused") {
        invalid("Only a paused session can be resumed");
      }
      const closed = closeOpenInterval(current, at);
      const next = openPhase(
        { ...closed, status: "running", updatedAt: toIso(at) },
        {
          id: createId(),
          kind: "focus",
          cycleIndex: current.currentCycle,
          plannedDurationSec:
            // Resume continues the same planned phase duration from scratch of remaining?
            // Product choice: open a new focus segment without transferring remaining.
            // Remaining is derived from planned on open interval; use config duration
            // only for fresh phases. For resume after pause mid-phase, preserve remainder.
            remainingPlannedAfterPause(current),
          at,
        },
      );
      return {
        session: bump(withTotals(next)),
        events: ["resumed"],
        recovered: false,
      };
    }
    case "begin_break": {
      if (current.status !== "running") {
        invalid("Breaks can only begin from a running focus phase");
      }
      return {
        ...advanceFromFocus(current, at, createId, action.breakKind),
        recovered: false,
      };
    }
    case "skip_break": {
      if (current.status !== "on_break") {
        invalid("Only an active break can be skipped");
      }
      const result = advanceFromBreak(current, at, createId);
      return {
        session: result.session,
        events: [
          "break_skipped",
          ...result.events.filter((e) => e !== "phase_finished"),
        ],
        recovered: false,
      };
    }
    case "extend_break": {
      // Also used as "add time" during a timed focus phase (countdown/cycles).
      if (current.status !== "on_break" && current.status !== "running") {
        invalid("Only a running phase or break can be extended");
      }
      const open = openInterval(current);
      if (!open || open.kind === "pause") {
        invalid("No active timed interval to extend");
      }
      if (current.status === "on_break" && !isBreakKind(open.kind)) {
        invalid("No active break interval to extend");
      }
      if (current.status === "running" && open.kind !== "focus") {
        invalid("No active focus interval to extend");
      }
      const planned = (open.plannedDurationSec ?? 0) + action.extraSec;
      const intervals = current.intervals.map((interval) =>
        interval.id === open.id
          ? { ...interval, plannedDurationSec: planned }
          : interval,
      );
      return {
        session: bump({
          ...current,
          intervals,
          updatedAt: toIso(at),
        }),
        events: ["break_extended"],
        recovered: false,
      };
    }
    case "finish_phase": {
      const result = applyFinishPhase(current, at, createId);
      return { ...result, recovered: false };
    }
    case "skip_segment": {
      if (!hasStructuredPlan(current)) {
        invalid("No structured plan is active");
      }
      const result = advancePlanSegment(current, at, createId, true);
      return { ...result, recovered: false };
    }
    case "complete": {
      if (!isActiveStatus(current.status)) {
        invalid("Only an active session can be completed");
      }
      return {
        session: finishToTerminal(current, "completed", at, {
          notes: action.notes ?? current.notes,
          subjectiveFocus: action.subjectiveFocus ?? current.subjectiveFocus,
          subjectiveEnergy: action.subjectiveEnergy ?? current.subjectiveEnergy,
        }),
        events: ["completed"],
        recovered: false,
      };
    }
    case "cancel": {
      if (!isActiveStatus(current.status)) {
        invalid("Only an active session can be cancelled");
      }
      return {
        session: finishToTerminal(current, "cancelled", at),
        events: ["cancelled"],
        recovered: false,
      };
    }
    case "recover": {
      return recoverFocusSession(current, now, createId);
    }
    case "takeover": {
      // Soft ownership bump for multi-tab UI; no interval change.
      return {
        session: bump({ ...current, updatedAt: toIso(at) }),
        events: ["takeover"],
        recovered: false,
      };
    }
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/**
 * When pausing mid-focus, remember remaining planned seconds on the closed focus interval
 * via the difference between original planned and elapsed; resume opens with that remainder.
 */
function remainingPlannedAfterPause(session: FocusSession): number | null {
  // Find the most recently closed focus interval (just closed on pause path, or earlier).
  // During resume(), closeOpenInterval already closed the pause; caller passes pre-close session
  // in applyFocusAction before close — we receive paused session with open pause interval.
  // Look at the last closed focus interval.
  const focusIntervals = [...session.intervals]
    .filter((item) => item.kind === "focus")
    .sort((a, b) => b.sequence - a.sequence);
  const lastFocus = focusIntervals[0];
  if (!lastFocus) return session.config.focusDurationSec;

  if (lastFocus.endedAt && lastFocus.plannedDurationSec != null) {
    const elapsed = durationSecBetween(lastFocus.startedAt, lastFocus.endedAt);
    return Math.max(0, lastFocus.plannedDurationSec - elapsed);
  }
  if (lastFocus.plannedDurationSec != null) {
    return lastFocus.plannedDurationSec;
  }
  return session.config.focusDurationSec;
}
