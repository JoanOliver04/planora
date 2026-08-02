import { z } from "zod";

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const BACKUP_SCHEMA_VERSION = 2;

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const timestamp = z.string().datetime({ offset: true });
const nullableTime = time.nullable();
const nullableUuid = uuid.nullable();
const jsonObject = z.record(z.string(), z.unknown());

const profileSchema = z.object({
  locale: z.enum(["es", "en"]).default("es"),
  timezone: z.string().min(1).max(100),
  theme: z.enum(["light", "dark", "system"]).default("system"),
  week_starts_on: z.number().int().min(0).max(6).default(1),
  active_schedule_id: nullableUuid.default(null),
  day_part_settings: jsonObject.default({}),
  preferences: jsonObject.default({}),
  onboarding_completed: z.boolean().default(true),
});

const scheduleSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullable(),
  emoji: z.string().max(16).nullable(),
  is_archived: z.boolean(),
  sort_order: z.number().int(),
});

const categorySchema = z.object({
  id: uuid,
  name: z.string().min(1).max(60),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  emoji: z.string().max(16).nullable(),
  sort_order: z.number().int(),
});

const taskSchema = z.object({
  id: uuid,
  schedule_id: uuid,
  category_id: nullableUuid,
  title: z.string().min(1).max(140),
  description: z.string().max(2000).nullable(),
  emoji: z.string().max(16).nullable(),
  task_kind: z.enum(["one_time", "habit"]),
  recurrence_type: z.enum([
    "once",
    "daily",
    "weekdays",
    "times_per_week",
    "interval",
  ]),
  recurrence_config: jsonObject,
  time_mode: z.enum(["anytime", "day_part", "specific_time", "time_range"]),
  day_part: z.enum(["morning", "afternoon", "night"]).nullable(),
  start_time: nullableTime,
  end_time: nullableTime,
  start_date: date,
  end_date: date.nullable(),
  is_active: z.boolean(),
  sort_order: z.number().int(),
  archived_at: timestamp.nullable(),
});

const eventSchema = z.object({
  id: uuid,
  schedule_id: nullableUuid,
  category_id: nullableUuid,
  title: z.string().min(1).max(140),
  description: z.string().max(2000).nullable(),
  emoji: z.string().max(16).nullable(),
  event_date: date,
  all_day: z.boolean(),
  start_time: nullableTime,
  end_time: nullableTime,
});

const completionSchema = z.object({
  id: uuid,
  task_id: uuid,
  occurrence_date: date,
  completed_at: timestamp,
  task_snapshot: jsonObject,
});

const templateSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(80),
  emoji: z.string().max(16).nullable(),
  content: jsonObject,
});

const reminderSchema = z.object({
  id: uuid,
  task_id: nullableUuid,
  event_id: nullableUuid,
  kind: z.enum(["relative", "daily_summary", "alarm"]),
  title: z.string().min(1).max(140).nullable(),
  minutes_before: z.number().int().min(0).max(10080).nullable(),
  recurrence: z.enum(["once", "daily", "weekly"]),
  time_of_day: nullableTime,
  timezone: z.string().min(1).max(100),
  next_trigger_at: timestamp,
});

const backupDataSchema = z
  .object({
    profile: profileSchema.nullable(),
    schedules: z.array(scheduleSchema).max(200),
    categories: z.array(categorySchema).max(500),
    tasks: z.array(taskSchema).max(5000),
    events: z.array(eventSchema).max(5000),
    completions: z.array(completionSchema).max(20000),
    templates: z.array(templateSchema).max(500),
    reminders: z.array(reminderSchema).max(1000),
  })
  .superRefine((data, context) => {
    const unique = (name: string, values: string[]) => {
      if (new Set(values).size !== values.length)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate ${name} identifier`,
        });
    };
    unique(
      "schedule",
      data.schedules.map((item) => item.id),
    );
    unique(
      "category",
      data.categories.map((item) => item.id),
    );
    unique(
      "task",
      data.tasks.map((item) => item.id),
    );
    unique(
      "event",
      data.events.map((item) => item.id),
    );
    unique(
      "completion",
      data.completions.map((item) => item.id),
    );
    unique(
      "template",
      data.templates.map((item) => item.id),
    );
    unique(
      "reminder",
      data.reminders.map((item) => item.id),
    );

    const schedules = new Set(data.schedules.map((item) => item.id));
    const categories = new Set(data.categories.map((item) => item.id));
    const tasks = new Set(data.tasks.map((item) => item.id));
    const events = new Set(data.events.map((item) => item.id));
    const invalid = (message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, message });

    if (
      data.profile?.active_schedule_id &&
      !schedules.has(data.profile.active_schedule_id)
    )
      invalid("Profile references an unknown schedule");
    for (const item of data.tasks) {
      if (!schedules.has(item.schedule_id))
        invalid("Task references an unknown schedule");
      if (item.category_id && !categories.has(item.category_id))
        invalid("Task references an unknown category");
      if (item.end_date && item.end_date < item.start_date)
        invalid("Task ends before it starts");
      const timingValid =
        (item.time_mode === "anytime" &&
          !item.day_part &&
          !item.start_time &&
          !item.end_time) ||
        (item.time_mode === "day_part" &&
          item.day_part &&
          !item.start_time &&
          !item.end_time) ||
        (item.time_mode === "specific_time" &&
          !item.day_part &&
          item.start_time &&
          !item.end_time) ||
        (item.time_mode === "time_range" &&
          !item.day_part &&
          item.start_time &&
          item.end_time &&
          item.start_time < item.end_time);
      if (!timingValid) invalid("Task timing is inconsistent");
      const config = item.recurrence_config;
      if (
        item.recurrence_type === "weekdays" &&
        (!Array.isArray(config.weekdays) ||
          config.weekdays.length === 0 ||
          config.weekdays.some(
            (day) =>
              !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6,
          ))
      )
        invalid("Task weekday recurrence is invalid");
      if (
        item.recurrence_type === "times_per_week" &&
        (!Number.isInteger(config.target) ||
          Number(config.target) < 1 ||
          Number(config.target) > 7)
      )
        invalid("Task weekly target is invalid");
      if (
        item.recurrence_type === "interval" &&
        (!Number.isInteger(config.every) ||
          Number(config.every) < 1 ||
          Number(config.every) > 365 ||
          !["day", "week", "month"].includes(String(config.unit)))
      )
        invalid("Task interval recurrence is invalid");
    }
    for (const item of data.events) {
      if (item.schedule_id && !schedules.has(item.schedule_id))
        invalid("Event references an unknown schedule");
      if (item.category_id && !categories.has(item.category_id))
        invalid("Event references an unknown category");
      if (
        (item.all_day && (item.start_time || item.end_time)) ||
        (!item.all_day &&
          (!item.start_time ||
            (item.end_time !== null && item.start_time >= item.end_time)))
      )
        invalid("Event timing is inconsistent");
    }
    for (const item of data.completions)
      if (!tasks.has(item.task_id))
        invalid("Completion references an unknown task");
    for (const item of data.reminders) {
      if (item.task_id && !tasks.has(item.task_id))
        invalid("Reminder references an unknown task");
      if (item.event_id && !events.has(item.event_id))
        invalid("Reminder references an unknown event");
      const targets =
        Number(Boolean(item.task_id)) + Number(Boolean(item.event_id));
      if (item.kind === "relative" && targets !== 1)
        invalid("Relative reminder must reference exactly one item");
      if (item.kind !== "relative" && targets !== 0)
        invalid("Standalone reminder cannot reference an item");
      if (
        (item.kind === "relative" &&
          (item.minutes_before === null || item.time_of_day || item.title)) ||
        (item.kind === "daily_summary" &&
          (!item.time_of_day || item.minutes_before !== null || item.title)) ||
        (item.kind === "alarm" &&
          (!item.title || item.minutes_before !== null || item.time_of_day))
      )
        invalid("Reminder fields are inconsistent");
    }
    unique(
      "completion occurrence",
      data.completions.map((item) => `${item.task_id}:${item.occurrence_date}`),
    );
    unique(
      "template name",
      data.templates.map((item) => item.name),
    );
    if (
      data.reminders.filter((item) => item.kind === "daily_summary").length > 1
    )
      invalid("Only one daily summary is supported");
  });

export const backupSchema = z.object({
  format: z.literal("planora-backup"),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  backupId: uuid,
  createdAt: timestamp,
  exportedBy: z.literal("planora"),
  locale: z.enum(["es", "en"]),
  timezone: z.string().min(1).max(100),
  data: backupDataSchema,
});

const legacyBackupSchema = z.object({
  format: z.literal("planora-backup"),
  version: z.literal(1),
  exportedAt: timestamp,
  data: z.object({
    profile: z.record(z.string(), z.unknown()).nullable(),
    schedules: z.array(z.record(z.string(), z.unknown())).max(200),
    categories: z.array(z.record(z.string(), z.unknown())).max(500),
    tasks: z.array(z.record(z.string(), z.unknown())).max(5000),
    events: z.array(z.record(z.string(), z.unknown())).max(5000),
    completions: z.array(z.record(z.string(), z.unknown())).max(20000),
    templates: z.array(z.record(z.string(), z.unknown())).max(500),
    reminders: z.array(z.record(z.string(), z.unknown())).max(1000),
  }),
});

export type PlanoraBackup = z.infer<typeof backupSchema>;
export type BackupData = PlanoraBackup["data"];

export function createBackup(data: BackupData): PlanoraBackup {
  const locale = data.profile?.locale ?? "es";
  const timezone = data.profile?.timezone ?? "Europe/Madrid";
  return backupSchema.parse({
    format: "planora-backup",
    schemaVersion: BACKUP_SCHEMA_VERSION,
    backupId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    exportedBy: "planora",
    locale,
    timezone,
    data,
  });
}

function legacyBackupId(value: string) {
  const seeds = [2166136261, 2246822519, 3266489917, 668265263];
  const hex = seeds
    .map((seed) => {
      let hash = seed;
      for (const character of value)
        hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
      return (hash >>> 0).toString(16).padStart(8, "0");
    })
    .join("")
    .split("");
  hex[12] = "4";
  hex[16] = "8";
  const valueHex = hex.join("");
  return `${valueHex.slice(0, 8)}-${valueHex.slice(8, 12)}-${valueHex.slice(12, 16)}-${valueHex.slice(16, 20)}-${valueHex.slice(20)}`;
}
export function parseBackup(value: unknown) {
  const current = backupSchema.safeParse(value);
  if (current.success) return current;
  const legacy = legacyBackupSchema.safeParse(value);
  if (!legacy.success) return current;
  const profile = legacy.data.data.profile;
  return backupSchema.safeParse({
    format: "planora-backup",
    schemaVersion: BACKUP_SCHEMA_VERSION,
    backupId: legacyBackupId(legacy.data.exportedAt),
    createdAt: legacy.data.exportedAt,
    exportedBy: "planora",
    locale: profile?.locale === "en" ? "en" : "es",
    timezone:
      typeof profile?.timezone === "string"
        ? profile.timezone
        : "Europe/Madrid",
    data: legacy.data.data,
  });
}

export function prepareRestorePayload(backup: PlanoraBackup) {
  const scheduleIds = new Map(
    backup.data.schedules.map((item) => [item.id, crypto.randomUUID()]),
  );
  const categoryIds = new Map(
    backup.data.categories.map((item) => [item.id, crypto.randomUUID()]),
  );
  const taskIds = new Map(
    backup.data.tasks.map((item) => [item.id, crypto.randomUUID()]),
  );
  const eventIds = new Map(
    backup.data.events.map((item) => [item.id, crypto.randomUUID()]),
  );
  const mapped = (ids: Map<string, string>, value: string | null) =>
    value ? (ids.get(value) ?? null) : null;

  return {
    backupId: backup.backupId,
    profile: backup.data.profile
      ? {
          ...backup.data.profile,
          active_schedule_id: mapped(
            scheduleIds,
            backup.data.profile.active_schedule_id,
          ),
        }
      : null,
    schedules: backup.data.schedules.map((item) => ({
      ...item,
      id: scheduleIds.get(item.id)!,
    })),
    categories: backup.data.categories.map((item) => ({
      ...item,
      id: categoryIds.get(item.id)!,
    })),
    tasks: backup.data.tasks.map((item) => ({
      ...item,
      id: taskIds.get(item.id)!,
      schedule_id: scheduleIds.get(item.schedule_id)!,
      category_id: mapped(categoryIds, item.category_id),
    })),
    events: backup.data.events.map((item) => ({
      ...item,
      id: eventIds.get(item.id)!,
      schedule_id: mapped(scheduleIds, item.schedule_id),
      category_id: mapped(categoryIds, item.category_id),
    })),
    completions: backup.data.completions.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      task_id: taskIds.get(item.task_id)!,
    })),
    templates: backup.data.templates.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
    })),
    reminders: backup.data.reminders.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      task_id: mapped(taskIds, item.task_id),
      event_id: mapped(eventIds, item.event_id),
    })),
  };
}
export function summarizeBackup(backup: PlanoraBackup) {
  return {
    schedules: backup.data.schedules.length,
    categories: backup.data.categories.length,
    tasks: backup.data.tasks.length,
    events: backup.data.events.length,
    completions: backup.data.completions.length,
    templates: backup.data.templates.length,
    reminders: backup.data.reminders.filter((item) => item.kind !== "alarm")
      .length,
    alarms: backup.data.reminders.filter((item) => item.kind === "alarm")
      .length,
  };
}

const csvCell = (value: unknown) => {
  const text =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return /[\",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
};

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "\uFEFF";
  const headers = Array.from(
    new Set(rows.flatMap((item) => Object.keys(item))),
  );
  return (
    "\uFEFF" +
    [headers, ...rows.map((item) => headers.map((key) => item[key]))]
      .map((values) => values.map(csvCell).join(","))
      .join("\r\n")
  );
}

const icsEscape = (value: unknown) =>
  String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r?\n/g, "\\n");
const compactDate = (value: unknown) => String(value ?? "").replaceAll("-", "");
const compactTime = (value: unknown) =>
  String(value ?? "00:00")
    .slice(0, 8)
    .replaceAll(":", "")
    .padEnd(6, "0");

export function toIcs(
  data: Pick<BackupData, "events" | "tasks">,
  timezone: string,
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Planora//Backup 2.0//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const event of data.events) {
    lines.push(
      "BEGIN:VEVENT",
      "UID:" + icsEscape(event.id) + "@planora",
      "SUMMARY:" + icsEscape(event.title),
    );
    if (event.description)
      lines.push("DESCRIPTION:" + icsEscape(event.description));
    if (event.all_day)
      lines.push("DTSTART;VALUE=DATE:" + compactDate(event.event_date));
    else {
      lines.push(
        "DTSTART;TZID=" +
          icsEscape(timezone) +
          ":" +
          compactDate(event.event_date) +
          "T" +
          compactTime(event.start_time),
      );
      if (event.end_time)
        lines.push(
          "DTEND;TZID=" +
            icsEscape(timezone) +
            ":" +
            compactDate(event.event_date) +
            "T" +
            compactTime(event.end_time),
        );
    }
    lines.push("END:VEVENT");
  }
  for (const task of data.tasks) {
    lines.push(
      "BEGIN:VTODO",
      "UID:" + icsEscape(task.id) + "@planora",
      "SUMMARY:" + icsEscape(task.title),
    );
    if (task.description)
      lines.push("DESCRIPTION:" + icsEscape(task.description));
    lines.push(
      "DTSTART;VALUE=DATE:" + compactDate(task.start_date),
      "STATUS:" + (task.is_active ? "NEEDS-ACTION" : "CANCELLED"),
      "END:VTODO",
    );
  }
  return lines.concat("END:VCALENDAR", "").join("\r\n");
}
