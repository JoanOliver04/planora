export const FOCUS_MODES = [
  "countdown",
  "stopwatch",
  "cycles",
  "structured_plan",
] as const;
export type FocusMode = (typeof FOCUS_MODES)[number];

export const FOCUS_SESSION_STATUSES = [
  "running",
  "paused",
  "on_break",
  "completed",
  "cancelled",
] as const;
export type FocusSessionStatus = (typeof FOCUS_SESSION_STATUSES)[number];

export const FOCUS_ACTIVE_STATUSES = [
  "running",
  "paused",
  "on_break",
] as const satisfies readonly FocusSessionStatus[];
export type FocusActiveStatus = (typeof FOCUS_ACTIVE_STATUSES)[number];

export const FOCUS_PHASE_KINDS = [
  "focus",
  "short_break",
  "long_break",
  "pause",
] as const;
export type FocusPhaseKind = (typeof FOCUS_PHASE_KINDS)[number];

/**
 * Structured session plan block (snapshot-friendly).
 * `durationSec: null` = open practice advanced only manually.
 */
export type FocusSegment = {
  name: string;
  emoji?: string | null;
  kind: "focus" | "break";
  durationSec: number | null;
  description?: string | null;
  /** When timed, finish automatically at zero. Open segments ignore this. */
  autoAdvance: boolean;
};

export type FocusSessionConfig = {
  focusDurationSec: number | null;
  shortBreakSec: number | null;
  longBreakSec: number | null;
  cyclesBeforeLongBreak: number | null;
  targetCycles: number | null;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  notifyOnPhaseEnd: boolean;
  completeTaskOnSessionEnd: boolean;
  keepScreenAwake: boolean;
  preferFullscreen: boolean;
  segments: FocusSegment[];
};

export type FocusLinkSnapshot = {
  taskTitle?: string;
  taskEmoji?: string | null;
  taskKind?: "one_time" | "habit";
  categoryName?: string | null;
  categoryColour?: string | null;
  scheduleName?: string | null;
  /** Private optional session outcome (done / progress / blocked / other). */
  outcome?: "done" | "progress" | "blocked" | "other" | null;
  /** Private optional next-step note after the session. */
  nextStep?: string | null;
};

export type FocusTaskOption = {
  id: string;
  title: string;
  emoji: string | null;
  taskKind: "one_time" | "habit";
  categoryId: string | null;
  scheduleId: string | null;
  recommendedFocusPresetId?: string | null;
};

export type SessionStartDraft = {
  mode?: FocusMode;
  focusDurationSec?: number | null;
  shortBreakSec?: number | null;
  longBreakSec?: number | null;
  cyclesBeforeLongBreak?: number | null;
  targetCycles?: number | null;
  title?: string | null;
  presetId?: string | null;
  quickKey?: string | null;
  taskId?: string | null;
  occurrenceDate?: string | null;
  linkSnapshot?: {
    taskTitle?: string;
    taskEmoji?: string | null;
    taskKind?: "one_time" | "habit";
    categoryName?: string | null;
    categoryColour?: string | null;
    scheduleName?: string | null;
  };
  autoStartBreaks?: boolean;
  autoStartFocus?: boolean;
  soundEnabled?: boolean;
  vibrationEnabled?: boolean;
  notifyOnPhaseEnd?: boolean;
  completeTaskOnEnd?: boolean;
  keepScreenAwake?: boolean;
  preferFullscreen?: boolean;
  segments?: FocusSegment[];
};

export type FocusInterval = {
  id: string;
  kind: FocusPhaseKind;
  sequence: number;
  cycleIndex: number | null;
  startedAt: string;
  endedAt: string | null;
  plannedDurationSec: number | null;
};

export type FocusSession = {
  id: string;
  userId: string;
  status: FocusSessionStatus;
  mode: FocusMode;
  title: string | null;
  presetId: string | null;
  taskId: string | null;
  categoryId: string | null;
  scheduleId: string | null;
  occurrenceDate: string | null;
  plannedFocusSec: number | null;
  focusSec: number;
  pausedSec: number;
  breakSec: number;
  currentPhaseKind: FocusPhaseKind | null;
  currentCycle: number;
  config: FocusSessionConfig;
  linkSnapshot: FocusLinkSnapshot;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  distractions: string[];
  subjectiveFocus: number | null;
  subjectiveEnergy: number | null;
  completeTaskOnEnd: boolean;
  taskCompletionApplied: boolean;
  revision: number;
  intervals: FocusInterval[];
  createdAt: string;
  updatedAt: string;
};

export type FocusPreset = {
  id: string;
  userId: string;
  name: string;
  emoji: string | null;
  intention: string | null;
  mode: FocusMode;
  focusDurationSec: number | null;
  shortBreakSec: number | null;
  longBreakSec: number | null;
  cyclesBeforeLongBreak: number | null;
  targetCycles: number | null;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  notifyOnPhaseEnd: boolean;
  completeTaskOnSessionEnd: boolean;
  keepScreenAwake: boolean;
  preferFullscreen: boolean;
  segments: FocusSegment[];
  isFavorite: boolean;
  sortOrder: number;
  defaultCategoryId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FocusGoalMetric = "focus_seconds" | "sessions" | "active_days";
export type FocusGoalScope = "global" | "category" | "preset";

export type FocusGoal = {
  id: string;
  userId: string;
  period: "weekly";
  /** Legacy alias of targetValue when metric is focus_seconds. */
  targetFocusSec: number;
  metric: FocusGoalMetric;
  targetValue: number;
  scope: FocusGoalScope;
  categoryId: string | null;
  presetId: string | null;
  startDate: string;
  /** Local weekdays 0=Sun … 6=Sat that count toward the goal. */
  consideredDays: number[];
  isPrimary: boolean;
  sortOrder: number;
  timezone: string;
  weekStartsOn: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FocusPhaseView = {
  kind: FocusPhaseKind | null;
  elapsedSec: number;
  remainingSec: number | null;
  plannedSec: number | null;
  progress: number;
  isComplete: boolean;
};

export type FocusSessionClock = {
  focusElapsedSec: number;
  pausedElapsedSec: number;
  breakElapsedSec: number;
  remainingSec: number | null;
  phase: FocusPhaseView;
  expectedEndAt: string | null;
};

export type FocusSessionSummary = {
  sessionId: string;
  mode: FocusMode;
  status: FocusSessionStatus;
  title: string | null;
  focusSec: number;
  pausedSec: number;
  breakSec: number;
  cyclesCompleted: number;
  startedAt: string;
  endedAt: string | null;
  completeTaskOnEnd: boolean;
};

export type FocusWeeklyGoalProgress = {
  goalId: string;
  metric: FocusGoalMetric;
  targetValue: number;
  /** Backward-compatible: same as targetValue for focus_seconds. */
  targetFocusSec: number;
  completedValue: number;
  /** Backward-compatible completed focus seconds (0 for non-time metrics). */
  completedFocusSec: number;
  remainingValue: number;
  remainingFocusSec: number;
  progress: number;
  completed: boolean;
  /** Neutral pace hint: remaining / remaining considered days (null if done or no days left). */
  suggestedPerRemainingDay: number | null;
  remainingConsideredDays: number;
  weekStart: string;
  weekEnd: string;
  timezone: string;
};

export type FocusGoalWeekHistoryEntry = {
  weekStart: string;
  weekEnd: string;
  completedValue: number;
  targetValue: number;
  progress: number;
  completed: boolean;
};

export type FocusEventName =
  | "started"
  | "paused"
  | "resumed"
  | "break_started"
  | "break_skipped"
  | "break_extended"
  | "phase_finished"
  | "segment_skipped"
  | "completed"
  | "cancelled"
  | "recovered"
  | "takeover";

export type FocusTransitionResult = {
  session: FocusSession;
  events: FocusEventName[];
  /** True when recovery advanced one or more overdue phases. */
  recovered: boolean;
};
