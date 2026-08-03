import { describe, expect, it } from "vitest";
import {
  BACKUP_SCHEMA_VERSION,
  createBackup,
  parseBackup,
  prepareRestorePayload,
  summarizeBackup,
  toCsv,
  toIcs,
} from "@/features/backup/format";
import { backupFixture, backupIds } from "./backup-fixture";

describe("portable backups", () => {
  it("creates a versioned backup with stable metadata", () => {
    const backup = createBackup(backupFixture());
    expect(backup).toMatchObject({
      format: "planora-backup",
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedBy: "planora",
      locale: "en",
      timezone: "Europe/Madrid",
    });
    expect(backup.backupId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(parseBackup(backup).success).toBe(true);
    expect(summarizeBackup(backup)).toMatchObject({
      tasks: 1,
      events: 1,
      alarms: 1,
    });
  });

  it("migrates genuine version one backups deterministically", () => {
    const current = createBackup(backupFixture());
    const legacy = {
      format: "planora-backup",
      version: 1,
      exportedAt: current.createdAt,
      data: current.data,
    };
    const first = parseBackup(legacy);
    const second = parseBackup(legacy);
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (first.success && second.success)
      expect(first.data.backupId).toBe(second.data.backupId);
  });

  it.each([
    ["corrupt root", null],
    ["incomplete structure", { format: "planora-backup" }],
    [
      "future version",
      { ...createBackup(backupFixture()), schemaVersion: 999 },
    ],
  ])("rejects %s", (_label, value) => {
    expect(parseBackup(value).success).toBe(false);
  });

  it("rejects broken internal references", () => {
    const backup = createBackup(backupFixture());
    backup.data.tasks[0].schedule_id = "99999999-9999-4999-8999-999999999999";
    expect(parseBackup(backup).success).toBe(false);
  });

  it("rejects duplicate identifiers but allows duplicate display names", () => {
    const duplicateId = createBackup(backupFixture());
    duplicateId.data.tasks.push({ ...duplicateId.data.tasks[0] });
    expect(parseBackup(duplicateId).success).toBe(false);

    const repeatedNames = createBackup(backupFixture());
    repeatedNames.data.tasks.push({
      ...repeatedNames.data.tasks[0],
      id: "99999999-9999-4999-8999-999999999999",
    });
    expect(parseBackup(repeatedNames).success).toBe(true);
  });

  it("rejects unreasonable entity counts", () => {
    const backup = createBackup(backupFixture());
    const task = backup.data.tasks[0];
    const oversized = {
      ...backup,
      data: {
        ...backup.data,
        tasks: Array.from({ length: 5001 }, (_, index) => ({
          ...task,
          id: `${String(index + 1).padStart(8, "0")}-9999-4999-8999-999999999999`,
        })),
      },
    };
    expect(parseBackup(oversized).success).toBe(false);
  });

  it("remaps every relationship without trusting exported ownership", () => {
    const backup = createBackup(backupFixture());
    const payload = prepareRestorePayload(backup);
    expect(payload.schedules[0].id).not.toBe(backupIds.schedule);
    expect(payload.tasks[0].schedule_id).toBe(payload.schedules[0].id);
    expect(payload.tasks[0].category_id).toBe(payload.categories[0].id);
    expect(payload.completions[0].task_id).toBe(payload.tasks[0].id);
    expect(payload.reminders[0].task_id).toBe(payload.tasks[0].id);
    expect(JSON.stringify(payload)).not.toContain("user_id");
  });

  it("produces one replacement payload when restored repeatedly", () => {
    const backup = createBackup(backupFixture());
    const first = prepareRestorePayload(backup);
    const second = prepareRestorePayload(backup);
    expect(first.backupId).toBe(second.backupId);
    expect(first.tasks).toHaveLength(1);
    expect(second.tasks).toHaveLength(1);
    expect(first.events).toHaveLength(1);
    expect(second.events).toHaveLength(1);
  });

  it("round-trips global tasks without schedule references", () => {
    const backup = createBackup(backupFixture());
    backup.data.tasks[0] = { ...backup.data.tasks[0], scope: "global", schedule_id: null };
    const parsed = parseBackup(backup);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const payload = prepareRestorePayload(parsed.data);
      expect(payload.tasks[0].scope).toBe("global");
      expect(payload.tasks[0].schedule_id).toBeNull();
    }
  });

  it("supports an empty backup", () => {
    const empty = backupFixture();
    empty.profile!.active_schedule_id = null;
    empty.schedules = [];
    empty.categories = [];
    empty.tasks = [];
    empty.events = [];
    empty.completions = [];
    empty.templates = [];
    empty.reminders = [];
    expect(parseBackup(createBackup(empty)).success).toBe(true);
  });

  it("escapes CSV and exports events and tasks to ICS", () => {
    expect(toCsv([{ title: "Hello, world", note: 'a "quote"' }])).toContain(
      '"Hello, world","a ""quote"""',
    );
    const ics = toIcs(backupFixture(), "Europe/Madrid");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("BEGIN:VTODO");
  });
});
