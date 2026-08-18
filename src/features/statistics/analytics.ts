import { formatInTimeZone } from "date-fns-tz";
import type { WorkspaceData } from "@/features/workspace/types";
import { localDate, localWeek } from "@/lib/dates/timezone";

export type ActivityDay = { date: string; count: number; level: number };
export type Statistics = {
  week: { current: number; previous: number; change: number };
  month: { current: number; previous: number; change: number };
  streak: number;
  bestStreak: number;
  categories: Array<{
    name: string;
    colour: string;
    completed: number;
    rate: number;
  }>;
  dayParts: Array<{
    key: "morning" | "afternoon" | "night";
    count: number;
    percentage: number;
  }>;
  heatmap: ActivityDay[];
};
function addCalendarDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

const change = (current: number, previous: number) =>
  previous
    ? Math.round(((current - previous) / previous) * 100)
    : current
      ? 100
      : 0;

export function calculateStatistics(
  data: WorkspaceData,
  now = new Date(),
): Statistics {
  const today = localDate(data.profile.timezone, now);
  const weekStartsOn = data.profile.week_starts_on === 0 ? 0 : 1;
  const week = localWeek(data.profile.timezone, now, weekStartsOn);
  const previousWeekEnd = addCalendarDays(week.start, -1);
  const previousWeekStart = addCalendarDays(previousWeekEnd, -6);
  const monthStart = `${today.slice(0, 8)}01`;
  const previousMonthEnd = addCalendarDays(monthStart, -1);
  const previousMonthStart = `${previousMonthEnd.slice(0, 8)}01`;
  const completions = [
    ...new Map(
      data.completions.map((item) => [
        `${item.task_id}:${item.occurrence_date}`,
        item,
      ]),
    ).values(),
  ];
  const between = (from: string, to: string) =>
    completions.filter(
      (item) => item.occurrence_date >= from && item.occurrence_date <= to,
    ).length;
  const weekCurrent = between(week.start, today);
  const weekPrevious = between(previousWeekStart, previousWeekEnd);
  const monthCurrent = between(monthStart, today);
  const monthPrevious = between(previousMonthStart, previousMonthEnd);
  const counts = new Map<string, number>();
  completions.forEach((item) =>
    counts.set(
      item.occurrence_date,
      (counts.get(item.occurrence_date) ?? 0) + 1,
    ),
  );
  const activeDates = [...counts.keys()].sort();
  let bestStreak = 0,
    run = 0,
    prior = "";
  for (const date of activeDates) {
    run = prior && addCalendarDays(prior, 1) === date ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prior = date;
  }
  let streak = 0;
  for (
    let cursor = today;
    counts.has(cursor);
    cursor = addCalendarDays(cursor, -1)
  )
    streak += 1;
  if (!streak && counts.has(addCalendarDays(today, -1))) {
    for (
      let cursor = addCalendarDays(today, -1);
      counts.has(cursor);
      cursor = addCalendarDays(cursor, -1)
    )
      streak += 1;
  }
  const categoryCounts = new Map<string, number>();
  completions.forEach((item) => {
    const snapshot = item.task_snapshot as Record<string, unknown>;
    const name = String(snapshot.category_name ?? "");
    if (name) categoryCounts.set(name, (categoryCounts.get(name) ?? 0) + 1);
  });
  const daysInWindow = 30;
  const categories = data.categories
    .map((category) => {
      const completed = categoryCounts.get(category.name) ?? 0;
      const taskCount = data.tasks.filter(
        (task) =>
          task.category_id === category.id &&
          task.is_active &&
          !task.archived_at,
      ).length;
      return {
        name: category.name,
        colour: category.colour,
        completed,
        rate: taskCount
          ? Math.min(
              100,
              Math.round((completed / (taskCount * daysInWindow)) * 100),
            )
          : 0,
      };
    })
    .filter((item) => item.completed > 0 || item.rate > 0)
    .sort((a, b) => b.completed - a.completed);
  const dayPartCounts = { morning: 0, afternoon: 0, night: 0 };
  completions.forEach((item) => {
    const hour = Number(
      formatInTimeZone(new Date(item.completed_at), data.profile.timezone, "H"),
    );
    dayPartCounts[
      hour >= 5 && hour < 12
        ? "morning"
        : hour >= 12 && hour < 18
          ? "afternoon"
          : "night"
    ] += 1;
  });
  const total = completions.length || 1;
  const dayParts = (["morning", "afternoon", "night"] as const).map((key) => ({
    key,
    count: dayPartCounts[key],
    percentage: Math.round((dayPartCounts[key] / total) * 100),
  }));
  const heatmap = Array.from({ length: 91 }, (_, index) => {
    const date = addCalendarDays(today, index - 90);
    const count = counts.get(date) ?? 0;
    return {
      date,
      count,
      level:
        count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4,
    };
  });
  return {
    week: {
      current: weekCurrent,
      previous: weekPrevious,
      change: change(weekCurrent, weekPrevious),
    },
    month: {
      current: monthCurrent,
      previous: monthPrevious,
      change: change(monthCurrent, monthPrevious),
    },
    streak,
    bestStreak,
    categories,
    dayParts,
    heatmap,
  };
}
