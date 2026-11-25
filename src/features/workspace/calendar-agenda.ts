import { tasksForDay } from "./daily-occurrences";
import { normalizeDayParts } from "@/lib/dates/day-parts";
import type { Event, Task, WorkspaceData } from "./types";

type AgendaItem = { kind: "event"; item: Event } | { kind: "task"; item: Task };

function orderKey(
  entry: AgendaItem,
  dayParts: ReturnType<typeof normalizeDayParts>,
) {
  if (entry.kind === "event" && entry.item.all_day) return "0";
  if (entry.item.start_time) return "1" + entry.item.start_time.slice(0, 5);
  if (
    entry.kind === "task" &&
    entry.item.time_mode === "day_part" &&
    entry.item.day_part
  ) {
    const part = entry.item.day_part;
    return "1" + dayParts[part].start;
  }
  return "2";
}

export function agendaForDay(data: WorkspaceData, day: string) {
  const schedule = data.profile.active_schedule_id;
  const tasks = tasksForDay(data.tasks, day, schedule);
  const events = data.events.filter(
    (event) =>
      event.event_date === day &&
      (!event.schedule_id || event.schedule_id === schedule),
  );
  const entries: AgendaItem[] = [
    ...events.map((item) => ({ kind: "event" as const, item })),
    ...tasks.map((item) => ({ kind: "task" as const, item })),
  ];
  // Stable sorting preserves the user's task order within the same time slot.
  const dayParts = normalizeDayParts(data.profile.day_part_settings);
  entries.sort((left, right) =>
    orderKey(left, dayParts).localeCompare(orderKey(right, dayParts)),
  );
  return { entries, taskCount: tasks.length, eventCount: events.length };
}
