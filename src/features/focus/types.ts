export const FOCUS_MODES = ["countdown", "stopwatch", "cycles"] as const;
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

export type FocusSegment = {
  kind: "focus" | "short_break" | "long_break";
  durationSec: number;
  label?: string;
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

export type FocusGoal = {
  id: string;
  userId: string;
  period: "weekly";
  targetFocusSec: number;
  timezone: string;
  weekStartsOn: number;
  active: boolean;
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
  targetFocusSec: number;
  completedFocusSec: number;
  remainingFocusSec: number;
  progress: number;
  weekStart: string;
  weekEnd: string;
  timezone: string;
};

export type FocusEventName =
  | "started"
  | "paused"
  | "resumed"
  | "break_started"
  | "break_skipped"
  | "break_extended"
  | "phase_finished"
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
