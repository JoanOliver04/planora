import {
  addDays,
  differenceInCalendarDays,
  differenceInCalendarWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  getDate,
  isAfter,
  isBefore,
  isSameDay,
  startOfWeek,
} from "date-fns";
import { enGB, es } from "date-fns/locale";
import type { RecurrenceConfig } from "@/lib/validation/task";
export type RecurringTask = {
  startDate: string;
  endDate?: string | null;
  recurrence: RecurrenceConfig;
  archivedAt?: string | null;
};
const date = (v: string | Date) =>
  typeof v === "string" ? new Date(`${v}T00:00:00`) : v;
export function isTaskExpectedOnDate(task: RecurringTask, on: string | Date) {
  const d = date(on),
    start = date(task.startDate);
  if (isBefore(d, start) || (task.endDate && isAfter(d, date(task.endDate))))
    return false;
  if (task.archivedAt && isAfter(d, date(task.archivedAt))) return false;
  const r = task.recurrence;
  if (r.type === "once") return isSameDay(d, start);
  if (r.type === "daily" || r.type === "times_per_week") return true;
  if (r.type === "weekdays") return r.weekdays.includes(d.getDay());
  if (r.unit === "day")
    return differenceInCalendarDays(d, start) % r.every === 0;
  if (r.unit === "week")
    return (
      d.getDay() === start.getDay() &&
      differenceInCalendarWeeks(d, start, { weekStartsOn: 1 }) % r.every === 0
    );
  const months =
    (d.getFullYear() - start.getFullYear()) * 12 +
    d.getMonth() -
    start.getMonth();
  if (months < 0 || months % r.every !== 0) return false;
  const target = Math.min(
    getDate(start),
    getDate(addDays(new Date(d.getFullYear(), d.getMonth() + 1, 0), 0)),
  );
  return getDate(d) === target;
}
export function getExpectedTaskOccurrences(
  task: RecurringTask,
  from: string | Date,
  to: string | Date,
) {
  return eachDayOfInterval({ start: date(from), end: date(to) }).filter((d) =>
    isTaskExpectedOnDate(task, d),
  );
}
export function getWeekRange(on: string | Date) {
  const start = startOfWeek(date(on), { weekStartsOn: 1 });
  return { start, end: endOfWeek(start, { weekStartsOn: 1 }) };
}
export function getWeeklyTarget(task: RecurringTask, week: string | Date) {
  if (task.recurrence.type === "times_per_week") return task.recurrence.target;
  const w = getWeekRange(week);
  return getExpectedTaskOccurrences(task, w.start, w.end).length;
}
export function calculateWeeklyProgress(
  tasks: RecurringTask[],
  completionDates:
    | Map<RecurringTask, string[]>
    | Array<{ task: RecurringTask; dates: string[] }>,
  week: string | Date,
) {
  const entries =
    completionDates instanceof Map
      ? [...completionDates]
      : completionDates.map((x) => [x.task, x.dates] as const);
  let expected = 0,
    completed = 0;
  for (const task of tasks) {
    const target = getWeeklyTarget(task, week);
    expected += target;
    const record = entries.find(([t]) => t === task);
    const w = getWeekRange(week);
    const count = new Set(
      (record?.[1] ?? []).filter((x) => {
        const d = date(x);
        return !isBefore(d, w.start) && !isAfter(d, w.end);
      }),
    ).size;
    completed += Math.min(count, target);
  }
  return {
    completed,
    expected,
    percentage: expected ? Math.round((completed / expected) * 100) : 0,
  };
}
export function formatRecurrenceDescription(
  r: RecurrenceConfig,
  locale: "es" | "en" = "es",
) {
  if (r.type === "once") return locale === "es" ? "Una vez" : "Once";
  if (r.type === "daily") return locale === "es" ? "Cada día" : "Every day";
  if (r.type === "times_per_week")
    return locale === "es"
      ? `${r.target} veces por semana`
      : `${r.target} times per week`;
  if (r.type === "interval")
    return locale === "es"
      ? `Cada ${r.every} ${r.unit === "day" ? "días" : r.unit === "week" ? "semanas" : "meses"}`
      : `Every ${r.every} ${r.unit}${r.every === 1 ? "" : "s"}`;
  const base = new Date(2026, 6, 5);
  const names = r.weekdays.map((w) =>
    format(addDays(base, w), "EEEE", { locale: locale === "es" ? es : enGB }),
  );
  return names.join(", ");
}
export function classifyDayPart(
  time: string,
  b = {
    morning: { start: "05:00", end: "12:00" },
    afternoon: { start: "12:00", end: "18:00" },
    night: { start: "18:00", end: "05:00" },
  },
) {
  if (time >= b.morning.start && time < b.morning.end) return "morning";
  if (time >= b.afternoon.start && time < b.afternoon.end) return "afternoon";
  return "night";
}
