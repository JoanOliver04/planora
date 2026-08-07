import { localWeek, zonedDate } from "@/lib/dates/timezone";
import type {
  FocusGoal,
  FocusGoalMetric,
  FocusGoalWeekHistoryEntry,
  FocusSession,
  FocusWeeklyGoalProgress,
} from "./types";
import { elapsedFocusSec } from "./time";

export const FOCUS_MAX_GOALS = 10;

export function sessionStartedLocalDay(
  startedAt: string,
  timezone: string,
): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(startedAt));
  } catch {
    return startedAt.slice(0, 10);
  }
}

/** 0=Sun … 6=Sat for a local calendar day in the goal timezone. */
export function localWeekday(day: string, timezone: string): number {
  try {
    const instant = zonedDate(day, timezone);
    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(instant);
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return map[label] ?? instant.getUTCDay();
  } catch {
    return new Date(`${day}T12:00:00.000Z`).getUTCDay();
  }
}

function weekStartsOnClamp(value: number): 0 | 1 {
  return value === 0 ? 0 : 1;
}

function sessionMatchesGoalScope(
  session: FocusSession,
  goal: Pick<FocusGoal, "scope" | "categoryId" | "presetId">,
): boolean {
  if (goal.scope === "global") return true;
  if (goal.scope === "category") {
    return Boolean(goal.categoryId && session.categoryId === goal.categoryId);
  }
  if (goal.scope === "preset") {
    return Boolean(goal.presetId && session.presetId === goal.presetId);
  }
  return true;
}

/**
 * Sessions that count toward goals:
 * - completed only (cancelled never count)
 * - live active sessions contribute provisional time/days only when includeLive
 */
function isCountableSession(
  session: FocusSession,
  includeLive: boolean,
): boolean {
  if (session.status === "completed") return true;
  if (!includeLive) return false;
  return (
    session.status === "running" ||
    session.status === "paused" ||
    session.status === "on_break"
  );
}

function dayInConsidered(
  day: string,
  timezone: string,
  consideredDays: number[],
): boolean {
  const weekday = localWeekday(day, timezone);
  return consideredDays.includes(weekday);
}

function filterSessionsForGoalWeek(
  goal: Pick<
    FocusGoal,
    | "timezone"
    | "weekStartsOn"
    | "consideredDays"
    | "scope"
    | "categoryId"
    | "presetId"
    | "startDate"
  >,
  sessions: FocusSession[],
  weekStart: string,
  weekEnd: string,
  includeLive: boolean,
): FocusSession[] {
  return sessions.filter((session) => {
    if (!isCountableSession(session, includeLive)) return false;
    if (!sessionMatchesGoalScope(session, goal)) return false;
    const startDay = sessionStartedLocalDay(session.startedAt, goal.timezone);
    if (startDay < weekStart || startDay > weekEnd) return false;
    if (goal.startDate && startDay < goal.startDate) return false;
    if (!dayInConsidered(startDay, goal.timezone, goal.consideredDays)) {
      return false;
    }
    return true;
  });
}

function metricValue(
  metric: FocusGoalMetric,
  sessions: FocusSession[],
  timezone: string,
  now: Date,
): number {
  if (metric === "focus_seconds") {
    return sessions.reduce((total, session) => {
      if (session.status === "completed") {
        return total + Math.max(0, session.focusSec);
      }
      return total + elapsedFocusSec(session, now);
    }, 0);
  }
  if (metric === "sessions") {
    return sessions.filter((session) => session.status === "completed").length;
  }
  // active_days: unique local days with at least one completed session
  const days = new Set<string>();
  for (const session of sessions) {
    if (session.status !== "completed") continue;
    days.add(sessionStartedLocalDay(session.startedAt, timezone));
  }
  return days.size;
}

function remainingConsideredDaysInWeek(
  weekDays: string[],
  today: string,
  timezone: string,
  consideredDays: number[],
): number {
  return weekDays.filter((day) => {
    if (day < today) return false;
    return dayInConsidered(day, timezone, consideredDays);
  }).length;
}

/**
 * Weekly goal progress.
 *
 * Mid-week edit rule (simple, documented):
 * progress always uses the **current** goal configuration for the requested week.
 * Session rows are never rewritten. Past weeks also re-read with the current config
 * (no goal-version snapshots) so history stays cheap and transparent.
 */
export function calculateWeeklyGoalProgress(
  goal: FocusGoal,
  sessions: FocusSession[],
  now: Date = new Date(),
  options: { includeLive?: boolean } = {},
): FocusWeeklyGoalProgress {
  const includeLive = options.includeLive ?? true;
  const weekStartsOn = weekStartsOnClamp(goal.weekStartsOn);
  const week = localWeek(goal.timezone, now, weekStartsOn);
  const today = sessionStartedLocalDay(now.toISOString(), goal.timezone);
  const matched = filterSessionsForGoalWeek(
    goal,
    sessions,
    week.start,
    week.end,
    includeLive,
  );
  const completedValue = metricValue(goal.metric, matched, goal.timezone, now);
  const targetValue = Math.max(1, goal.targetValue);
  const remainingValue = Math.max(0, targetValue - completedValue);
  const remainingDays = remainingConsideredDaysInWeek(
    week.days,
    today,
    goal.timezone,
    goal.consideredDays,
  );
  const progress = Math.min(1, completedValue / targetValue);
  const completed = completedValue >= targetValue;
  const suggestedPerRemainingDay =
    completed || remainingDays <= 0 ? null : remainingValue / remainingDays;

  return {
    goalId: goal.id,
    metric: goal.metric,
    targetValue,
    targetFocusSec: goal.metric === "focus_seconds" ? targetValue : 0,
    completedValue,
    completedFocusSec: goal.metric === "focus_seconds" ? completedValue : 0,
    remainingValue,
    remainingFocusSec: goal.metric === "focus_seconds" ? remainingValue : 0,
    progress,
    completed,
    suggestedPerRemainingDay,
    remainingConsideredDays: remainingDays,
    weekStart: week.start,
    weekEnd: week.end,
    timezone: goal.timezone,
  };
}

/** Recompute the last N local weeks with the current goal definition. */
export function calculateGoalWeekHistory(
  goal: FocusGoal,
  sessions: FocusSession[],
  now: Date = new Date(),
  weeks = 4,
): FocusGoalWeekHistoryEntry[] {
  const weekStartsOn = weekStartsOnClamp(goal.weekStartsOn);
  const entries: FocusGoalWeekHistoryEntry[] = [];
  let cursor = now;
  for (let i = 0; i < weeks; i += 1) {
    const week = localWeek(goal.timezone, cursor, weekStartsOn);
    const progress = calculateWeeklyGoalProgress(goal, sessions, cursor, {
      includeLive: i === 0,
    });
    entries.push({
      weekStart: week.start,
      weekEnd: week.end,
      completedValue: progress.completedValue,
      targetValue: progress.targetValue,
      progress: progress.progress,
      completed: progress.completed,
    });
    // Step one day before this week start to land in the previous week.
    cursor = new Date(`${week.start}T12:00:00.000Z`);
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return entries;
}

export function pickPrimaryGoal(goals: FocusGoal[]): FocusGoal | null {
  const active = goals.filter((goal) => goal.active);
  if (active.length === 0) return null;
  return (
    active.find((goal) => goal.isPrimary) ??
    [...active].sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt),
    )[0] ??
    null
  );
}

/** Keep one primary among active goals when toggling. */
export function withSinglePrimary(
  goals: FocusGoal[],
  primaryId: string | null,
): FocusGoal[] {
  return goals.map((goal) => ({
    ...goal,
    isPrimary: Boolean(primaryId && goal.id === primaryId && goal.active),
  }));
}
