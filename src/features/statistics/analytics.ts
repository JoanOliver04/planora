import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  subDays,
} from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { WorkspaceData } from "@/features/workspace/types";
import { localDate } from "@/lib/dates/timezone";

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
const iso = (date: Date) => format(date, "yyyy-MM-dd");
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
  const todayDate = parseISO(today);
  const weekday = (todayDate.getDay() + 6) % 7;
  const weekStart = subDays(todayDate, weekday);
  const previousWeekStart = subDays(weekStart, 7);
  const monthStart = startOfMonth(todayDate);
  const previousMonthEnd = subDays(monthStart, 1);
  const previousMonthStart = startOfMonth(previousMonthEnd);
  const between = (from: Date, to: Date) =>
    data.completions.filter(
      (item) =>
        item.occurrence_date >= iso(from) && item.occurrence_date <= iso(to),
    ).length;
  const weekCurrent = between(weekStart, todayDate);
  const weekPrevious = between(previousWeekStart, subDays(weekStart, 1));
  const monthCurrent = between(monthStart, todayDate);
  const monthPrevious = between(previousMonthStart, previousMonthEnd);
  const counts = new Map<string, number>();
  data.completions.forEach((item) =>
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
    run =
      prior && differenceInCalendarDays(parseISO(date), parseISO(prior)) === 1
        ? run + 1
        : 1;
    bestStreak = Math.max(bestStreak, run);
    prior = date;
  }
  let streak = 0;
  for (
    let cursor = todayDate;
    counts.has(iso(cursor));
    cursor = subDays(cursor, 1)
  )
    streak += 1;
  if (!streak && counts.has(iso(subDays(todayDate, 1)))) {
    for (
      let cursor = subDays(todayDate, 1);
      counts.has(iso(cursor));
      cursor = subDays(cursor, 1)
    )
      streak += 1;
  }
  const categoryCounts = new Map<string, number>();
  data.completions.forEach((item) => {
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
  data.completions.forEach((item) => {
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
  const total = data.completions.length || 1;
  const dayParts = (["morning", "afternoon", "night"] as const).map((key) => ({
    key,
    count: dayPartCounts[key],
    percentage: Math.round((dayPartCounts[key] / total) * 100),
  }));
  const heatmap = Array.from({ length: 91 }, (_, index) => {
    const date = iso(addDays(subDays(todayDate, 90), index));
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
