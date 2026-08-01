import { describe, expect, it } from "vitest";
import { createBackup, parseBackup, summarizeBackup, toCsv, toIcs } from "@/features/backup/format";
const data = { profile: { timezone: "Europe/Madrid" }, schedules: [], categories: [], tasks: [{ id: "task-1", title: "Focus, deeply", start_date: "2026-08-01", is_active: true }], events: [{ id: "event-1", title: "Review; plan", event_date: "2026-08-02", all_day: true }], completions: [], templates: [], reminders: [] };
describe("portable backups", () => {
  it("creates and validates version one backups", () => { const backup = createBackup(data); expect(parseBackup(backup).success).toBe(true); expect(parseBackup({ ...backup, version: 2 }).success).toBe(false); expect(summarizeBackup(backup).tasks).toBe(1); });
  it("escapes CSV cells and adds a UTF-8 marker", () => { expect(toCsv([{ title: "Hello, world", note: 'a "quote"' }])).toContain('"Hello, world","a ""quote"""'); });
  it("exports events and tasks to ICS", () => { const ics = toIcs(data, "Europe/Madrid"); expect(ics).toContain("BEGIN:VEVENT"); expect(ics).toContain("SUMMARY:Review\\; plan"); expect(ics).toContain("BEGIN:VTODO"); });
});
