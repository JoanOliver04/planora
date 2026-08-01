import { z } from "zod";

const row = z.record(z.string(), z.unknown());
export const backupSchema = z.object({
  format: z.literal("planora-backup"),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  data: z.object({
    profile: row.nullable(),
    schedules: z.array(row).max(200),
    categories: z.array(row).max(500),
    tasks: z.array(row).max(5000),
    events: z.array(row).max(5000),
    completions: z.array(row).max(20000),
    templates: z.array(row).max(500),
    reminders: z.array(row).max(1000),
  }),
});
export type PlanoraBackup = z.infer<typeof backupSchema>;
export type BackupData = PlanoraBackup["data"];

export function createBackup(data: BackupData): PlanoraBackup {
  return backupSchema.parse({
    format: "planora-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  });
}

export function parseBackup(value: unknown) {
  return backupSchema.safeParse(value);
}

export function summarizeBackup(backup: PlanoraBackup) {
  return {
    schedules: backup.data.schedules.length,
    categories: backup.data.categories.length,
    tasks: backup.data.tasks.length,
    events: backup.data.events.length,
    completions: backup.data.completions.length,
    templates: backup.data.templates.length,
    reminders: backup.data.reminders.length,
  };
}

const csvCell = (value: unknown) => {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[\",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
};

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "\uFEFF";
  const headers = Array.from(new Set(rows.flatMap((item) => Object.keys(item))));
  return "\uFEFF" + [headers, ...rows.map((item) => headers.map((key) => item[key]))]
    .map((values) => values.map(csvCell).join(","))
    .join("\r\n");
}

const icsEscape = (value: unknown) => String(value ?? "").replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll(/\r?\n/g, "\\n");
const compactDate = (value: unknown) => String(value ?? "").replaceAll("-", "");
const compactTime = (value: unknown) => String(value ?? "00:00").slice(0, 8).replaceAll(":", "").padEnd(6, "0");

export function toIcs(data: Pick<BackupData, "events" | "tasks">, timezone: string) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Planora//Backup 1.0//EN", "CALSCALE:GREGORIAN"];
  for (const event of data.events) {
    lines.push("BEGIN:VEVENT", "UID:" + icsEscape(event.id) + "@planora", "SUMMARY:" + icsEscape(event.title));
    if (event.description) lines.push("DESCRIPTION:" + icsEscape(event.description));
    if (event.all_day) {
      lines.push("DTSTART;VALUE=DATE:" + compactDate(event.event_date));
    } else {
      lines.push("DTSTART;TZID=" + icsEscape(timezone) + ":" + compactDate(event.event_date) + "T" + compactTime(event.start_time));
      if (event.end_time) lines.push("DTEND;TZID=" + icsEscape(timezone) + ":" + compactDate(event.event_date) + "T" + compactTime(event.end_time));
    }
    lines.push("END:VEVENT");
  }
  for (const task of data.tasks) {
    lines.push("BEGIN:VTODO", "UID:" + icsEscape(task.id) + "@planora", "SUMMARY:" + icsEscape(task.title));
    if (task.description) lines.push("DESCRIPTION:" + icsEscape(task.description));
    if (task.start_date) lines.push("DTSTART;VALUE=DATE:" + compactDate(task.start_date));
    lines.push("STATUS:" + (task.is_active === false ? "CANCELLED" : "NEEDS-ACTION"), "END:VTODO");
  }
  return lines.concat("END:VCALENDAR", "").join("\r\n");
}
