import { formatInTimeZone } from "date-fns-tz";
import type { WorkspaceData } from "@/features/workspace/types";
import { localDate, localWeek } from "@/lib/dates/timezone";

export type ActivityDay = { date: string; count: number; level: number };
/** Inclusive activity window shown on the statistics page. */
export const STATISTICS_WINDOW_DAYS = 90;

export type Statistics = {
  week: { current: number; previous: number; change: number };
  month: { current: number; previous: number; change: number };
  streak: number;
  bestStreak: number;
  categories: Array<{
    id: string;
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

function calendarDaysBetween(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) -
      Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      86_400_000,
  );
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
  const previousWeekStart = addCalendarDays(week.start, -7);
  const monthStart = `${today.slice(0, 8)}01`;
  const previousMonthEnd = addCalendarDays(monthStart, -1);
  const previousMonthStart = `${previousMonthEnd.slice(0, 8)}01`;
  const windowStart = addCalendarDays(today, 1 - STATISTICS_WINDOW_DAYS);
  const completions = [
    ...new Map(
      data.completions.map((item) => [
        `${item.task_id}:${item.occurrence_date}`,
        item,
      ]),
    ).values(),
  ].filter(
    (item) =>
      item.occurrence_date >= windowStart && item.occurrence_date <= today,
  );
  const between = (from: string, to: string) =>
    completions.filter(
      (item) => item.occurrence_date >= from && item.occurrence_date <= to,
    ).length;
  const elapsedWeekDays = calendarDaysBetween(week.start, today);
  const comparableWeekEnd = addCalendarDays(previousWeekStart, elapsedWeekDays);
  const previousMonthLength = Number(previousMonthEnd.slice(8, 10));
  const comparableMonthDay = Math.min(
    Number(today.slice(8, 10)),
    previousMonthLength,
  );
  const comparableMonthEnd = `${previousMonthStart.slice(0, 8)}${String(comparableMonthDay).padStart(2, "0")}`;
  const weekCurrent = between(week.start, today);
  const weekPrevious = between(previousWeekStart, comparableWeekEnd);
  const monthCurrent = between(monthStart, today);
  const monthPrevious = between(previousMonthStart, comparableMonthEnd);
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
  const namesByCategory = new Map<string, string[]>();
  for (const category of data.categories) {
    const owners = namesByCategory.get(category.name) ?? [];
    owners.push(category.id);
    namesByCategory.set(category.name, owners);
  }
  const countsById = new Map<string, number>();
  const orphans = new Map<
    string,
    { name: string; colour: string; completed: number }
  >();
  completions.forEach((item) => {
    const snapshot = item.task_snapshot as Record<string, unknown>;
    const categoryId =
      typeof snapshot.category_id === "string" ? snapshot.category_id : "";
    const name =
      typeof snapshot.category_name === "string" ? snapshot.category_name : "";
    const colour =
      typeof snapshot.category_colour === "string"
        ? snapshot.category_colour
        : "var(--primary)";
    const current = categoryId
      ? data.categories.find((category) => category.id === categoryId)
      : undefined;
    if (current) {
      countsById.set(current.id, (countsById.get(current.id) ?? 0) + 1);
      return;
    }
    const owners = name ? (namesByCategory.get(name) ?? []) : [];
    if (!categoryId && owners.length === 1) {
      countsById.set(owners[0], (countsById.get(owners[0]) ?? 0) + 1);
      return;
    }
    if (!name) return;
    const key = categoryId ? `deleted:${categoryId}` : `name:${name}`;
    const existing = orphans.get(key);
    if (existing) existing.completed += 1;
    else orphans.set(key, { name, colour, completed: 1 });
  });
  const categories = [
    ...data.categories.map((category) => {
      const completed = countsById.get(category.id) ?? 0;
      const taskCount = data.tasks.filter(
        (task) =>
          task.category_id === category.id &&
          task.is_active &&
          !task.archived_at,
      ).length;
      return {
        id: category.id,
        name: category.name,
        colour: category.colour,
        completed,
        rate: taskCount
          ? Math.min(
              100,
              Math.round(
                (completed / (taskCount * STATISTICS_WINDOW_DAYS)) * 100,
              ),
            )
          : 0,
      };
    }),
    ...[...orphans.entries()].map(([id, orphan]) => ({
      id,
      name: orphan.name,
      colour: orphan.colour,
      completed: orphan.completed,
      rate: 0,
    })),
  ]
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
  const heatmap = Array.from({ length: STATISTICS_WINDOW_DAYS }, (_, index) => {
    const date = addCalendarDays(today, index - (STATISTICS_WINDOW_DAYS - 1));
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
