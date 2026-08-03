import { fromZonedTime } from "date-fns-tz";
import type { Completion, Event, Task } from "@/features/workspace/types";

export type EventVisibility = "active" | "finished" | "all";
export type TaskVisibility = "active" | "completed" | "archived" | "all";

export function isEventFinished(
  event: Event,
  timezone: string,
  now: Date = new Date(),
) {
  const time = event.all_day
    ? "23:59:59.999"
    : (event.end_time ?? event.start_time ?? "23:59:59.999");
  return fromZonedTime(`${event.event_date}T${time}`, timezone) < now;
}

export function filterEvents(
  events: Event[],
  visibility: EventVisibility,
  timezone: string,
  now: Date = new Date(),
) {
  if (visibility === "all") return events;
  return events.filter(
    (event) =>
      isEventFinished(event, timezone, now) === (visibility === "finished"),
  );
}

export function filterTasks(
  tasks: Task[],
  completions: Completion[],
  visibility: TaskVisibility,
) {
  if (visibility === "all") return tasks;
  const completedTaskIds = new Set(completions.map((item) => item.task_id));
  return tasks.filter((task) => {
    if (visibility === "archived") return Boolean(task.archived_at);
    if (task.archived_at) return false;
    const completed =
      task.recurrence_type === "once" && completedTaskIds.has(task.id);
    return visibility === "completed" ? completed : !completed;
  });
}

export function isTaskAvailableInSchedule(task: Pick<Task, "scope" | "schedule_id" | "archived_at" | "is_active">, activeScheduleId: string | null) {
  if (task.archived_at || !task.is_active) return false;
  return task.scope === "global" ? task.schedule_id === null : task.schedule_id === activeScheduleId && activeScheduleId !== null;
}
