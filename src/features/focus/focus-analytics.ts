import { addDays, format, parseISO, subDays } from "date-fns";
import type { FocusGoal, FocusSession } from "./types";
import { calculateWeeklyGoalProgress } from "./goals";
import { sessionStartedLocalDay } from "./goals";
import { localDate } from "@/lib/dates/timezone";

export type FocusStatsRange = "7d" | "30d" | "custom";

export type FocusStatsFilters = {
  range: FocusStatsRange;
  /** Inclusive local dates when range is custom. */
  from?: string;
  to?: string;
  categoryId?: string | null;
  presetId?: string | null;
  mode?: FocusSession["mode"] | "all";
};

export type FocusDailyBar = {
  date: string;
  focusSec: number;
  sessions: number;
};

export type FocusNamedBucket = {
  key: string;
  label: string;
  colour?: string;
  focusSec: number;
  sessions: number;
  percentage: number;
};

export type FocusInsight =
  | { kind: "insufficient"; messageKey: "insufficient" }
  | {
      kind: "dayPart";
      messageKey: "dayPart";
      dayPart: "morning" | "afternoon" | "night";
      focusSec: number;
    }
  | {
      kind: "typicalDuration";
      messageKey: "typicalDuration";
      medianSec: number;
    }
  | {
      kind: "category";
      messageKey: "category";
      label: string;
      sessions: number;
    }
  | {
      kind: "weekCompare";
      messageKey: "weekCompare";
      currentSec: number;
      previousSec: number;
      changePct: number | null;
    };

export type FocusStatistics = {
  empty: boolean;
  sampleSize: number;
  from: string;
  to: string;
  totalFocusSec: number;
  totalPausedSec: number;
  completedSessions: number;
  cancelledSessions: number;
  /** Neutral finish rate among terminal sessions; null if none. */
  completionRate: number | null;
  meanDurationSec: number | null;
  medianDurationSec: number | null;
  completedBlocks: number;
  daily: FocusDailyBar[];
  categories: FocusNamedBucket[];
  tasks: FocusNamedBucket[];
  modes: FocusNamedBucket[];
  goalProgress: ReturnType<typeof calculateWeeklyGoalProgress> | null;
  insights: FocusInsight[];
};

/** Minimum completed sessions before optional insights appear. */
export const FOCUS_INSIGHT_MIN_SAMPLE = 5;

const iso = (date: Date) => format(date, "yyyy-MM-dd");

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function dayPartFromHour(hour: number): "morning" | "afternoon" | "night" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 19) return "afternoon";
  return "night";
}

function localHour(startedAt: string, timezone: string): number {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(startedAt));
    return Number(hour);
  } catch {
    return new Date(startedAt).getUTCHours();
  }
}

function resolveRange(
  filters: FocusStatsFilters,
  timezone: string,
  now: Date,
): { from: string; to: string } {
  const today = localDate(timezone, now);
  if (filters.range === "custom" && filters.from && filters.to) {
    const from = filters.from <= filters.to ? filters.from : filters.to;
    const to = filters.from <= filters.to ? filters.to : filters.from;
    return { from, to };
  }
  const days = filters.range === "7d" ? 6 : 29;
  const toDate = parseISO(today);
  const fromDate = subDays(toDate, days);
  return { from: iso(fromDate), to: today };
}

function eachDay(from: string, to: string): string[] {
  const start = parseISO(from);
  const end = parseISO(to);
  const days: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    days.push(iso(cursor));
  }
  return days;
}

function matchesFilters(
  session: FocusSession,
  filters: FocusStatsFilters,
): boolean {
  if (filters.categoryId && session.categoryId !== filters.categoryId) {
    return false;
  }
  if (filters.presetId && session.presetId !== filters.presetId) {
    return false;
  }
  if (filters.mode && filters.mode !== "all" && session.mode !== filters.mode) {
    return false;
  }
  return true;
}

function countCompletedBlocks(session: FocusSession): number {
  const fromIntervals = session.intervals.filter(
    (interval) => interval.kind === "focus" && interval.endedAt != null,
  ).length;
  if (fromIntervals > 0 || session.intervals.length > 0) {
    return fromIntervals;
  }
  // Fallback when intervals were not loaded (e.g. compact aggregates).
  if (session.status === "completed" || session.status === "cancelled") {
    return Math.max(0, session.currentCycle);
  }
  return 0;
}

function toBuckets(
  map: Map<string, { label: string; colour?: string; focusSec: number; sessions: number }>,
  totalFocus: number,
): FocusNamedBucket[] {
  return [...map.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      colour: value.colour,
      focusSec: value.focusSec,
      sessions: value.sessions,
      percentage: totalFocus
        ? Math.round((value.focusSec / totalFocus) * 100)
        : 0,
    }))
    .sort((a, b) => b.focusSec - a.focusSec || b.sessions - a.sessions)
    .slice(0, 8);
}

/**
 * Pure Focus analytics for the signed-in user's own sessions.
 * Never logs titles/notes; callers must not send them to product analytics.
 */
export function calculateFocusStatistics(input: {
  sessions: FocusSession[];
  timezone: string;
  weekStartsOn?: number;
  filters?: Partial<FocusStatsFilters>;
  goals?: FocusGoal[];
  now?: Date;
  categoryNames?: Map<string, { name: string; colour: string }>;
}): FocusStatistics {
  const now = input.now ?? new Date();
  const timezone = input.timezone;
  const filters: FocusStatsFilters = {
    range: input.filters?.range ?? "30d",
    from: input.filters?.from,
    to: input.filters?.to,
    categoryId: input.filters?.categoryId ?? null,
    presetId: input.filters?.presetId ?? null,
    mode: input.filters?.mode ?? "all",
  };
  const { from, to } = resolveRange(filters, timezone, now);

  const inRange = input.sessions.filter((session) => {
    const day = sessionStartedLocalDay(session.startedAt, timezone);
    if (day < from || day > to) return false;
    return matchesFilters(session, filters);
  });

  const completed = inRange.filter((session) => session.status === "completed");
  const cancelled = inRange.filter((session) => session.status === "cancelled");
  const terminal = completed.length + cancelled.length;

  const durations = completed.map((session) => Math.max(0, session.focusSec));
  const totalFocusSec = completed.reduce(
    (sum, session) => sum + Math.max(0, session.focusSec),
    0,
  );
  const totalPausedSec = completed.reduce(
    (sum, session) => sum + Math.max(0, session.pausedSec),
    0,
  );
  const completedBlocks = completed.reduce(
    (sum, session) => sum + countCompletedBlocks(session),
    0,
  );

  const dayMap = new Map<string, FocusDailyBar>();
  for (const day of eachDay(from, to)) {
    dayMap.set(day, { date: day, focusSec: 0, sessions: 0 });
  }
  for (const session of completed) {
    const day = sessionStartedLocalDay(session.startedAt, timezone);
    const bucket = dayMap.get(day);
    if (!bucket) continue;
    bucket.focusSec += Math.max(0, session.focusSec);
    bucket.sessions += 1;
  }

  const categoryMap = new Map<
    string,
    { label: string; colour?: string; focusSec: number; sessions: number }
  >();
  const taskMap = new Map<
    string,
    { label: string; colour?: string; focusSec: number; sessions: number }
  >();
  const modeMap = new Map<
    string,
    { label: string; colour?: string; focusSec: number; sessions: number }
  >();

  for (const session of completed) {
    const categoryKey = session.categoryId ?? "none";
    const categoryMeta = session.categoryId
      ? input.categoryNames?.get(session.categoryId)
      : undefined;
    const categoryLabel =
      session.linkSnapshot.categoryName ??
      categoryMeta?.name ??
      "—";
    const category = categoryMap.get(categoryKey) ?? {
      label: categoryLabel,
      colour:
        session.linkSnapshot.categoryColour ??
        categoryMeta?.colour ??
        undefined,
      focusSec: 0,
      sessions: 0,
    };
    category.focusSec += Math.max(0, session.focusSec);
    category.sessions += 1;
    categoryMap.set(categoryKey, category);

    if (session.taskId || session.linkSnapshot.taskTitle) {
      const taskKey = session.taskId ?? session.linkSnapshot.taskTitle ?? "task";
      const task = taskMap.get(taskKey) ?? {
        label: session.linkSnapshot.taskTitle ?? "—",
        focusSec: 0,
        sessions: 0,
      };
      task.focusSec += Math.max(0, session.focusSec);
      task.sessions += 1;
      taskMap.set(taskKey, task);
    }

    const mode = modeMap.get(session.mode) ?? {
      label: session.mode,
      focusSec: 0,
      sessions: 0,
    };
    mode.focusSec += Math.max(0, session.focusSec);
    mode.sessions += 1;
    modeMap.set(session.mode, mode);
  }

  const primaryGoal =
    input.goals?.find((goal) => goal.active && goal.isPrimary) ??
    input.goals?.find((goal) => goal.active) ??
    null;
  const goalProgress = primaryGoal
    ? calculateWeeklyGoalProgress(primaryGoal, input.sessions, now)
    : null;

  const insights = buildInsights({
    completed,
    timezone,
    now,
    totalFocusSec,
  });

  return {
    empty: inRange.length === 0,
    sampleSize: completed.length,
    from,
    to,
    totalFocusSec,
    totalPausedSec,
    completedSessions: completed.length,
    cancelledSessions: cancelled.length,
    completionRate:
      terminal === 0 ? null : completed.length / terminal,
    meanDurationSec: mean(durations),
    medianDurationSec: median(durations),
    completedBlocks,
    daily: [...dayMap.values()],
    categories: toBuckets(categoryMap, totalFocusSec),
    tasks: toBuckets(taskMap, totalFocusSec),
    modes: toBuckets(modeMap, totalFocusSec),
    goalProgress,
    insights,
  };
}

function buildInsights(input: {
  completed: FocusSession[];
  timezone: string;
  now: Date;
  totalFocusSec: number;
}): FocusInsight[] {
  if (input.completed.length < FOCUS_INSIGHT_MIN_SAMPLE) {
    return [{ kind: "insufficient", messageKey: "insufficient" }];
  }

  const insights: FocusInsight[] = [];
  const dayParts = {
    morning: 0,
    afternoon: 0,
    night: 0,
  };
  for (const session of input.completed) {
    const hour = localHour(session.startedAt, input.timezone);
    dayParts[dayPartFromHour(hour)] += Math.max(0, session.focusSec);
  }
  const topPart = (
    Object.entries(dayParts) as Array<
      ["morning" | "afternoon" | "night", number]
    >
  ).sort((a, b) => b[1] - a[1])[0];
  if (topPart && topPart[1] > 0) {
    insights.push({
      kind: "dayPart",
      messageKey: "dayPart",
      dayPart: topPart[0],
      focusSec: topPart[1],
    });
  }

  const medianSec = median(
    input.completed.map((session) => Math.max(0, session.focusSec)),
  );
  if (medianSec != null) {
    insights.push({
      kind: "typicalDuration",
      messageKey: "typicalDuration",
      medianSec,
    });
  }

  const categoryCounts = new Map<string, number>();
  for (const session of input.completed) {
    const label = session.linkSnapshot.categoryName;
    if (!label) continue;
    categoryCounts.set(label, (categoryCounts.get(label) ?? 0) + 1);
  }
  const topCategory = [...categoryCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];
  if (topCategory && topCategory[1] >= 3) {
    insights.push({
      kind: "category",
      messageKey: "category",
      label: topCategory[0],
      sessions: topCategory[1],
    });
  }

  const today = localDate(input.timezone, input.now);
  const todayDate = parseISO(today);
  const thisWeekStart = iso(subDays(todayDate, 6));
  const prevWeekStart = iso(subDays(todayDate, 13));
  const prevWeekEnd = iso(subDays(todayDate, 7));
  let currentSec = 0;
  let previousSec = 0;
  for (const session of input.completed) {
    const day = sessionStartedLocalDay(session.startedAt, input.timezone);
    if (day >= thisWeekStart && day <= today) {
      currentSec += Math.max(0, session.focusSec);
    } else if (day >= prevWeekStart && day <= prevWeekEnd) {
      previousSec += Math.max(0, session.focusSec);
    }
  }
  insights.push({
    kind: "weekCompare",
    messageKey: "weekCompare",
    currentSec,
    previousSec,
    changePct: previousSec
      ? Math.round(((currentSec - previousSec) / previousSec) * 100)
      : currentSec
        ? 100
        : null,
  });

  return insights;
}
