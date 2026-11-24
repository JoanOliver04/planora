import { normalizeTaskSearch } from "@/lib/workspace/task-search";
import { workspaceItemHref } from "./presentation";
import type { WorkspaceData } from "./types";

type SearchKind = "task" | "event" | "category" | "schedule";

export function buildSearchIndex(
  data: Pick<WorkspaceData, "tasks" | "events" | "categories" | "schedules">,
) {
  const scheduleNames = new Map(data.schedules.map((s) => [s.id, s.name]));
  function entry(
    kind: SearchKind,
    id: string,
    title: string,
    description: string | null,
    context?: string,
  ) {
    const name = normalizeTaskSearch(title);
    return {
      kind,
      id,
      title,
      description,
      context,
      name,
      text: name + " " + normalizeTaskSearch(description ?? ""),
    };
  }
  return [
    ...data.tasks.map((task) =>
      entry(
        "task",
        task.id,
        task.title,
        task.description,
        scheduleNames.get(task.schedule_id ?? ""),
      ),
    ),
    ...data.events.map((event) =>
      entry(
        "event",
        event.id,
        event.title,
        event.description,
        event.event_date,
      ),
    ),
    ...data.categories.map((category) =>
      entry(
        "category",
        category.id,
        category.name,
        null,
        scheduleNames.get(category.schedule_id ?? ""),
      ),
    ),
    ...data.schedules.map((schedule) =>
      entry("schedule", schedule.id, schedule.name, schedule.description),
    ),
  ];
}

type Entry = ReturnType<typeof buildSearchIndex>[number];

export function findSearchResults(index: Entry[], query: string) {
  const needle = normalizeTaskSearch(query);
  if (needle.length < 2) return [];
  const words = needle.split(" ");
  const exact: Entry[] = [],
    prefix: Entry[] = [],
    title: Entry[] = [],
    description: Entry[] = [];
  for (const entry of index) {
    if (entry.name === needle) exact.push(entry);
    else if (entry.name.startsWith(needle)) prefix.push(entry);
    else if (words.every((word) => entry.name.includes(word)))
      title.push(entry);
    else if (words.every((word) => entry.text.includes(word)))
      description.push(entry);
  }
  return [...exact, ...prefix, ...title, ...description];
}

export function searchResultHref({ kind, id }: Entry) {
  if (kind === "category") return `/categories#category-${id}`;
  if (kind === "schedule") return `/schedules#schedule-${id}`;
  return workspaceItemHref(kind, id);
}
