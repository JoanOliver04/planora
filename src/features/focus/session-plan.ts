import type { FocusInterval, FocusSegment, FocusSession } from "./types";
import { durationSecBetween } from "./time";
import { FOCUS_MAX_SEGMENTS } from "./validation";

export const SESSION_PLAN_TEMPLATE_KEYS = [
  "programming",
  "english",
  "piano",
] as const;
export type SessionPlanTemplateKey =
  (typeof SESSION_PLAN_TEMPLATE_KEYS)[number];

export type SessionPlanTemplate = {
  key: SessionPlanTemplateKey;
  emoji: string;
  segments: FocusSegment[];
};

/** Editable starter plans — never rigid system categories. */
export const SESSION_PLAN_TEMPLATES: readonly SessionPlanTemplate[] = [
  {
    key: "programming",
    emoji: "💻",
    segments: [
      {
        name: "Define goal",
        emoji: "🎯",
        kind: "focus",
        durationSec: 5 * 60,
        description: "Write the outcome you want from this block.",
        autoAdvance: true,
      },
      {
        name: "Build",
        emoji: "🛠️",
        kind: "focus",
        durationSec: 40 * 60,
        description: "Implement the main change.",
        autoAdvance: true,
      },
      {
        name: "Test",
        emoji: "✅",
        kind: "focus",
        durationSec: 15 * 60,
        description: "Run checks and fix obvious issues.",
        autoAdvance: true,
      },
      {
        name: "Review & next step",
        emoji: "📝",
        kind: "focus",
        durationSec: 10 * 60,
        description: "Note what remains for the next session.",
        autoAdvance: false,
      },
    ],
  },
  {
    key: "english",
    emoji: "🗣️",
    segments: [
      {
        name: "Vocabulary",
        emoji: "📚",
        kind: "focus",
        durationSec: 15 * 60,
        description: null,
        autoAdvance: true,
      },
      {
        name: "Listening",
        emoji: "🎧",
        kind: "focus",
        durationSec: 20 * 60,
        description: null,
        autoAdvance: true,
      },
      {
        name: "Speaking",
        emoji: "💬",
        kind: "focus",
        durationSec: 15 * 60,
        description: null,
        autoAdvance: false,
      },
      {
        name: "Review",
        emoji: "🔁",
        kind: "focus",
        durationSec: 10 * 60,
        description: null,
        autoAdvance: true,
      },
    ],
  },
  {
    key: "piano",
    emoji: "🎹",
    segments: [
      {
        name: "Warm-up",
        emoji: "🔥",
        kind: "focus",
        durationSec: 10 * 60,
        description: null,
        autoAdvance: true,
      },
      {
        name: "Technique",
        emoji: "✋",
        kind: "focus",
        durationSec: 15 * 60,
        description: null,
        autoAdvance: true,
      },
      {
        name: "Scales",
        emoji: "🎵",
        kind: "focus",
        durationSec: 10 * 60,
        description: null,
        autoAdvance: true,
      },
      {
        name: "Repertoire",
        emoji: "🎼",
        kind: "focus",
        durationSec: 25 * 60,
        description: null,
        autoAdvance: false,
      },
      {
        name: "Final review",
        emoji: "✨",
        kind: "focus",
        durationSec: 10 * 60,
        description: null,
        autoAdvance: true,
      },
    ],
  },
] as const;

export function hasStructuredPlan(
  session:
    Pick<FocusSession, "config"> | { config: { segments: FocusSegment[] } },
): boolean {
  return session.config.segments.length > 0;
}

export function segmentPhaseKind(
  segment: FocusSegment,
): "focus" | "short_break" {
  return segment.kind === "focus" ? "focus" : "short_break";
}

export function segmentStatus(segment: FocusSegment): "running" | "on_break" {
  return segment.kind === "focus" ? "running" : "on_break";
}

/** 0-based index of the currently open segment (by finished count). */
export function currentSegmentIndex(session: FocusSession): number {
  const finished = session.intervals.filter(
    (item) => item.endedAt != null,
  ).length;
  if (session.intervals.some((item) => item.endedAt == null)) {
    return Math.min(finished, Math.max(0, session.config.segments.length - 1));
  }
  return Math.min(finished, session.config.segments.length);
}

export function currentSegment(session: FocusSession): FocusSegment | null {
  if (!hasStructuredPlan(session)) return null;
  const index = currentSegmentIndex(session);
  return session.config.segments[index] ?? null;
}

export function nextSegment(session: FocusSession): FocusSegment | null {
  if (!hasStructuredPlan(session)) return null;
  const index = currentSegmentIndex(session) + 1;
  return session.config.segments[index] ?? null;
}

export function plannedPlanFocusSec(segments: FocusSegment[]): number | null {
  let total = 0;
  let anyTimed = false;
  for (const segment of segments) {
    if (segment.kind !== "focus") continue;
    if (segment.durationSec == null) return null;
    anyTimed = true;
    total += segment.durationSec;
  }
  return anyTimed ? total : null;
}

export function totalPlannedSec(segments: FocusSegment[]): number | null {
  let total = 0;
  for (const segment of segments) {
    if (segment.durationSec == null) return null;
    total += segment.durationSec;
  }
  return total;
}

export type PlanTotals = {
  focusSec: number;
  breakSec: number;
  totalSec: number;
  hasOpenFocus: boolean;
};

export function calculatePlanTotals(segments: FocusSegment[]): PlanTotals {
  let focusSec = 0;
  let breakSec = 0;
  let hasOpenFocus = false;
  for (const segment of segments) {
    if (segment.durationSec == null) {
      if (segment.kind === "focus") hasOpenFocus = true;
      continue;
    }
    if (segment.kind === "focus") focusSec += segment.durationSec;
    else breakSec += segment.durationSec;
  }
  return {
    focusSec,
    breakSec,
    totalSec: focusSec + breakSec,
    hasOpenFocus,
  };
}

export type SegmentRuntimeSummary = {
  index: number;
  segment: FocusSegment;
  plannedSec: number | null;
  actualSec: number;
  skippedEarly: boolean;
};

function intervalActualSec(interval: FocusInterval, nowIso?: string): number {
  const end = interval.endedAt ?? nowIso;
  if (!end) return 0;
  return Math.max(0, durationSecBetween(interval.startedAt, end));
}

/**
 * Map closed (+ optional open) intervals onto plan segments by sequence order.
 * Rule: one interval sequence maps to one segment index (no going backward).
 */
export function summarizePlanRuntime(
  session: FocusSession,
  now: Date | number = Date.now(),
): SegmentRuntimeSummary[] {
  const segments = session.config.segments;
  if (segments.length === 0) return [];
  const nowIso = new Date(now).toISOString();
  const ordered = [...session.intervals].sort(
    (left, right) => left.sequence - right.sequence,
  );
  return segments.map((segment, index) => {
    const interval = ordered[index];
    const actualSec = interval ? intervalActualSec(interval, nowIso) : 0;
    const plannedSec = segment.durationSec;
    const skippedEarly =
      Boolean(interval?.endedAt) &&
      plannedSec != null &&
      actualSec + 5 < plannedSec;
    return {
      index,
      segment,
      plannedSec,
      actualSec,
      skippedEarly,
    };
  });
}

export function emptySegment(partial?: Partial<FocusSegment>): FocusSegment {
  return {
    name: partial?.name ?? "Block",
    emoji: partial?.emoji ?? "🎯",
    kind: partial?.kind ?? "focus",
    durationSec:
      partial?.durationSec === undefined ? 25 * 60 : partial.durationSec,
    description: partial?.description ?? null,
    autoAdvance: partial?.autoAdvance ?? true,
  };
}

export function moveSegment<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function duplicateSegmentAt(
  segments: FocusSegment[],
  index: number,
): FocusSegment[] {
  if (index < 0 || index >= segments.length) return segments;
  if (segments.length >= FOCUS_MAX_SEGMENTS) return segments;
  const copy = {
    ...segments[index],
    name: `${segments[index].name}`.slice(0, 70),
  };
  const next = [...segments];
  next.splice(index + 1, 0, copy);
  return next;
}

export function validatePlanSegments(segments: FocusSegment[]): string | null {
  if (segments.length > FOCUS_MAX_SEGMENTS) {
    return "too_many";
  }
  for (const segment of segments) {
    if (!segment.name.trim()) return "name_required";
    if (
      segment.durationSec != null &&
      (segment.durationSec < 60 || segment.durationSec > 8 * 60 * 60)
    ) {
      return "duration_invalid";
    }
    if (segment.kind === "break" && segment.durationSec == null) {
      return "break_duration_required";
    }
  }
  return null;
}

export function validateStructuredPlan(
  segments: FocusSegment[],
): string | null {
  if (segments.length === 0) return "plan_required";
  const error = validatePlanSegments(segments);
  if (error) return error;
  if (!segments.some((segment) => segment.kind === "focus")) {
    return "focus_block_required";
  }
  return null;
}
