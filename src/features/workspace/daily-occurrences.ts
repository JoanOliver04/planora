import { format } from "date-fns";
import { getWeekRange, isTaskExpectedOnDate } from "@/lib/recurrence";
import type { Completion, Task } from "./types";
import { recurrenceFromJson } from "./types";

const recurrenceTask = (task: Task) => ({
  startDate: task.start_date,
  endDate: task.end_date,
  archivedAt: task.archived_at?.slice(0, 10),
  recurrence: recurrenceFromJson(task.recurrence_config, task.recurrence_type),
});

export const isTaskInSchedule = (task: Task, scheduleId: string | null) =>
  task.scope === "global" || task.schedule_id === scheduleId;

export function tasksForDay(
  tasks: Task[],
  day: string,
  scheduleId: string | null,
) {
  return tasks.filter(
    (task) =>
      isTaskInSchedule(task, scheduleId) &&
      task.is_active &&
      (!task.archived_at || task.archived_at.slice(0, 10) >= day) &&
      isTaskExpectedOnDate(recurrenceTask(task), day),
  );
}

export function overdueOneTimeTasks(
  tasks: Task[],
  completions: Completion[],
  today: string,
  scheduleId: string | null,
) {
  const completed = new Set(
    completions.map((item) => `${item.task_id}:${item.occurrence_date}`),
  );
  return tasks.filter(
    (task) =>
      isTaskInSchedule(task, scheduleId) &&
      task.is_active &&
      !task.archived_at &&
      task.recurrence_type === "once" &&
      task.start_date < today &&
      !completed.has(`${task.id}:${task.start_date}`),
  );
}

export function canToggleOccurrence(
  task: Task,
  day: string,
  today: string,
  completions: Completion[] = [],
  weekStartsOn: 0 | 1 = 1,
) {
  if (
    day > today ||
    !task.is_active ||
    (task.archived_at && task.archived_at.slice(0, 10) < day) ||
    !isTaskExpectedOnDate(recurrenceTask(task), day)
  ) {
    return false;
  }
  const recurrence = recurrenceFromJson(
    task.recurrence_config,
    task.recurrence_type,
  );
  if (recurrence.type !== "times_per_week") return true;
  const alreadyToday = completions.some(
    (item) => item.task_id === task.id && item.occurrence_date === day,
  );
  if (alreadyToday) return true;
  const week = getWeekRange(day, weekStartsOn);
  const weekStart = format(week.start, "yyyy-MM-dd");
  const weekEnd = format(week.end, "yyyy-MM-dd");
  const completedThisWeek = completions.filter(
    (item) =>
      item.task_id === task.id &&
      item.occurrence_date >= weekStart &&
      item.occurrence_date <= weekEnd,
  ).length;
  return completedThisWeek < recurrence.target;
}

export const shouldShowOccurrence = (
  isToday: boolean,
  showCompletedToday: boolean,
  completed: boolean,
) => !isToday || showCompletedToday || !completed;
