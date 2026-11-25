import { normalizeTaskSearch } from "@/lib/workspace/task-search";
import { uniqueMetadata, workspaceItemHref } from "./presentation";
import type { Category, Event, Schedule, Task } from "./types";

type SearchKind = "task" | "event" | "category" | "schedule";
export type SearchFilter = "all" | SearchKind;

type SearchData = {
  tasks: Pick<
    Task,
    | "id"
    | "title"
    | "description"
    | "category_id"
    | "schedule_id"
    | "recurrence_type"
    | "start_date"
  >[];
  events: Pick<
    Event,
    | "id"
    | "title"
    | "description"
    | "category_id"
    | "schedule_id"
    | "event_date"
  >[];
  categories: Pick<Category, "id" | "name" | "schedule_id">[];
  schedules: Pick<Schedule, "id" | "name" | "description">[];
};

export function buildSearchIndex(data: SearchData, locale: string) {
  const scheduleNames = new Map(data.schedules.map((s) => [s.id, s.name]));
  const categoryNames = new Map(data.categories.map((c) => [c.id, c.name]));
  const dates = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  function entry(
    kind: SearchKind,
    id: string,
    title: string,
    description: string | null,
    metadata: (string | undefined)[] = [],
    day?: string,
  ) {
    const name = normalizeTaskSearch(title);
    const labels = uniqueMetadata(metadata);
    const instant = day && new Date(day + "T12:00:00Z");
    const dateLabel =
      instant && Number.isFinite(instant.getTime())
        ? dates.format(instant)
        : undefined;
    return {
      kind,
      id,
      title,
      description,
      context: uniqueMetadata([dateLabel, ...labels]).join(" · "),
      name,
      text: normalizeTaskSearch([title, description, ...labels].join(" ")),
      dateWords:
        day && dateLabel
          ? [day, ...normalizeTaskSearch(dateLabel).split(" ")]
          : [],
    };
  }
  return [
    ...data.tasks.map((task) =>
      entry(
        "task",
        task.id,
        task.title,
        task.description,
        [
          categoryNames.get(task.category_id ?? ""),
          scheduleNames.get(task.schedule_id ?? ""),
        ],
        task.recurrence_type === "once" ? task.start_date : undefined,
      ),
    ),
    ...data.events.map((event) =>
      entry(
        "event",
        event.id,
        event.title,
        event.description,
        [
          categoryNames.get(event.category_id ?? ""),
          scheduleNames.get(event.schedule_id ?? ""),
        ],
        event.event_date,
      ),
    ),
    ...data.categories.map((category) =>
      entry("category", category.id, category.name, null, [
        scheduleNames.get(category.schedule_id ?? ""),
      ]),
    ),
    ...data.schedules.map((schedule) =>
      entry("schedule", schedule.id, schedule.name, schedule.description),
    ),
  ];
}

type Entry = ReturnType<typeof buildSearchIndex>[number];

export function findSearchResults(
  index: Entry[],
  query: string,
  filter: SearchFilter = "all",
) {
  const needle = normalizeTaskSearch(query);
  if (filter === "all" && needle.length < 2) return [];
  const candidates =
    filter === "all" ? index : index.filter((item) => item.kind === filter);
  if (!needle) return candidates;
  const words = needle.split(" ");
  // Convert day/month/year for calendar matches only. Text can contain a literal date.
  const dateWords = words.map((word) => {
    const date = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(word);
    return date
      ? `${date[3]}-${date[2].padStart(2, "0")}-${date[1].padStart(2, "0")}`
      : word;
  });
  const exact: Entry[] = [],
    prefix: Entry[] = [],
    title: Entry[] = [],
    description: Entry[] = [];
  for (const entry of candidates) {
    if (entry.name === needle) exact.push(entry);
    else if (entry.name.startsWith(needle)) prefix.push(entry);
    else if (words.every((word) => entry.name.includes(word)))
      title.push(entry);
    else if (
      words.every(
        (word, i) =>
          entry.text.includes(word) || entry.dateWords.includes(dateWords[i]),
      )
    )
      description.push(entry);
  }
  return [...exact, ...prefix, ...title, ...description];
}

export function searchResultHref({ kind, id }: Entry) {
  if (kind === "category") return `/categories#category-${id}`;
  if (kind === "schedule") return `/schedules#schedule-${id}`;
  return workspaceItemHref(kind, id);
}
