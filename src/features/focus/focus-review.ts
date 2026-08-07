import type { FocusSession } from "./types";
import {
  FOCUS_MAX_DISTRACTION_LENGTH,
  FOCUS_MAX_DISTRACTIONS,
} from "./validation";
import { summarizeEndedSession } from "./cycles";

export const FOCUS_OUTCOMES = [
  "done",
  "progress",
  "blocked",
  "other",
] as const;
export type FocusOutcome = (typeof FOCUS_OUTCOMES)[number];

export type FocusReviewInput = {
  notes: string | null;
  subjectiveFocus: number | null;
  subjectiveEnergy: number | null;
  outcome: FocusOutcome | null;
  nextStep: string | null;
  distractions: string[];
};

export type FocusSessionReviewSummary = {
  focusSec: number;
  breakSec: number;
  pausedSec: number;
  completedFocusBlocks: number;
  targetCycles: number | null;
  plannedFocusSec: number | null;
  plannedVsActualSec: number | null;
  intention: string | null;
  taskTitle: string | null;
  mode: FocusSession["mode"];
  status: FocusSession["status"];
  reachedTarget: boolean;
};

export function buildSessionReviewSummary(
  session: FocusSession,
): FocusSessionReviewSummary {
  const base = summarizeEndedSession(session);
  const planned = session.plannedFocusSec;
  return {
    focusSec: base.focusSec,
    breakSec: base.breakSec,
    pausedSec: base.pausedSec,
    completedFocusBlocks: base.completedFocusBlocks,
    targetCycles: base.targetCycles,
    plannedFocusSec: planned,
    plannedVsActualSec:
      planned != null ? base.focusSec - planned : null,
    intention: session.title,
    taskTitle: session.linkSnapshot.taskTitle ?? null,
    mode: session.mode,
    status: session.status,
    reachedTarget: base.reachedTarget,
  };
}

export function normalizeDistractionText(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, FOCUS_MAX_DISTRACTION_LENGTH);
}

export function addDistraction(
  current: string[],
  text: string,
): { ok: true; distractions: string[] } | { ok: false; reason: "empty" | "limit" } {
  const normalized = normalizeDistractionText(text);
  if (!normalized) return { ok: false, reason: "empty" };
  if (current.length >= FOCUS_MAX_DISTRACTIONS) {
    return { ok: false, reason: "limit" };
  }
  return { ok: true, distractions: [...current, normalized] };
}

export function removeDistractionAt(
  current: string[],
  index: number,
): string[] {
  if (index < 0 || index >= current.length) return current;
  return current.filter((_, i) => i !== index);
}

export function parseFocusOutcome(
  value: unknown,
): FocusOutcome | null {
  if (
    value === "done" ||
    value === "progress" ||
    value === "blocked" ||
    value === "other"
  ) {
    return value;
  }
  return null;
}

export function reviewFromSession(session: FocusSession): FocusReviewInput {
  return {
    notes: session.notes,
    subjectiveFocus: session.subjectiveFocus,
    subjectiveEnergy: session.subjectiveEnergy,
    outcome: parseFocusOutcome(session.linkSnapshot.outcome),
    nextStep:
      typeof session.linkSnapshot.nextStep === "string"
        ? session.linkSnapshot.nextStep
        : null,
    distractions: [...session.distractions],
  };
}

/** Empty review defaults for a just-ended session. */
export function emptyReviewDraft(session: FocusSession): FocusReviewInput {
  return {
    notes: session.notes,
    subjectiveFocus: session.subjectiveFocus,
    subjectiveEnergy: session.subjectiveEnergy,
    outcome: parseFocusOutcome(session.linkSnapshot.outcome),
    nextStep:
      typeof session.linkSnapshot.nextStep === "string"
        ? session.linkSnapshot.nextStep
        : null,
    distractions: [...session.distractions],
  };
}

export function isRating(value: number | null): value is number {
  return value != null && Number.isInteger(value) && value >= 1 && value <= 5;
}
