import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canToggleOccurrence,
  overdueOneTimeTasks,
  shouldShowOccurrence,
  tasksForDay,
} from "@/features/workspace/daily-occurrences";
import { calculateWeeklyProgress } from "@/lib/recurrence";
import { localDate } from "@/lib/dates/timezone";
import type { Completion, Task } from "@/features/workspace/types";

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1",
  user_id: "user-1",
  schedule_id: "schedule-1",
  scope: "schedule",
  category_id: null,
  title: "Task",
  description: null,
  emoji: null,
  focus_enabled: false,
  task_kind: "one_time",
  recurrence_type: "once",
  recurrence_config: { type: "once" },
  time_mode: "anytime",
  day_part: null,
  start_time: null,
  end_time: null,
  start_date: "2026-08-12",
  end_date: null,
  is_active: true,
  sort_order: 0,
  created_at: "2026-08-12T08:00:00Z",
  updated_at: "2026-08-12T08:00:00Z",
  archived_at: null,
  ...overrides,
});

const completion = (taskId: string, occurrenceDate: string): Completion => ({
  id: `${taskId}-${occurrenceDate}`,
  user_id: "user-1",
  task_id: taskId,
  occurrence_date: occurrenceDate,
  completed_at: "2026-08-14T18:00:00Z",
  task_snapshot: {},
});

describe("daily occurrences", () => {
  it("keeps one overdue one-time task once across later days", () => {
    const once = task();
    expect(overdueOneTimeTasks([once], [], "2026-08-13", "schedule-1")).toEqual(
      [once],
    );
    expect(overdueOneTimeTasks([once], [], "2026-08-20", "schedule-1")).toEqual(
      [once],
    );
  });

  it("removes an overdue task only when its original occurrence is complete", () => {
    const once = task();
    expect(
      overdueOneTimeTasks(
        [once],
        [completion(once.id, once.start_date)],
        "2026-08-14",
        "schedule-1",
      ),
    ).toEqual([]);
  });

  it("never rolls missed recurring occurrences into overdue", () => {
    expect(
      overdueOneTimeTasks(
        [task({ recurrence_type: "daily", task_kind: "habit" })],
        [],
        "2026-08-14",
        "schedule-1",
      ),
    ).toEqual([]);
  });

  it("shows a global overdue task once and excludes other schedules", () => {
    const global = task({ id: "global", scope: "global", schedule_id: null });
    const other = task({ id: "other", schedule_id: "schedule-2" });
    expect(
      overdueOneTimeTasks([global, other], [], "2026-08-14", "schedule-1"),
    ).toEqual([global]);
  });

  it("excludes future, archived, inactive and completed overdue candidates", () => {
    const candidates = [
      task({ id: "future", start_date: "2026-08-15" }),
      task({ id: "archived", archived_at: "2026-08-13T10:00:00Z" }),
      task({ id: "inactive", is_active: false }),
      task({ id: "done" }),
    ];
    expect(
      overdueOneTimeTasks(
        candidates,
        [completion("done", "2026-08-12")],
        "2026-08-14",
        "schedule-1",
      ),
    ).toEqual([]);
  });

  it("reconstructs the actual recurring and global occurrences for a past day", () => {
    const weekday = task({
      id: "weekday",
      task_kind: "habit",
      recurrence_type: "weekdays",
      recurrence_config: { type: "weekdays", weekdays: [3] },
    });
    const interval = task({
      id: "interval",
      task_kind: "habit",
      recurrence_type: "interval",
      recurrence_config: { type: "interval", every: 2, unit: "day" },
      start_date: "2026-08-10",
    });
    const global = task({ id: "global", scope: "global", schedule_id: null });
    expect(
      tasksForDay([weekday, interval, global], "2026-08-12", "schedule-1").map(
        ({ id }) => id,
      ),
    ).toEqual(["weekday", "interval", "global"]);
    expect(tasksForDay([weekday], "2026-08-13", "schedule-1")).toEqual([]);
  });

  it("allows only real, non-future occurrences", () => {
    const everyOtherDay = task({
      task_kind: "habit",
      recurrence_type: "interval",
      recurrence_config: { type: "interval", every: 2, unit: "day" },
      start_date: "2026-08-10",
    });
    expect(canToggleOccurrence(everyOtherDay, "2026-08-12", "2026-08-14")).toBe(
      true,
    );
    expect(canToggleOccurrence(everyOtherDay, "2026-08-13", "2026-08-14")).toBe(
      false,
    );
    expect(canToggleOccurrence(everyOtherDay, "2026-08-16", "2026-08-14")).toBe(
      false,
    );
  });

  it("blocks extra times-per-week toggles after the weekly target", () => {
    const weekly = task({
      id: "weekly",
      recurrence_type: "times_per_week",
      recurrence_config: { type: "times_per_week", target: 2 },
      start_date: "2026-08-10",
    });
    const completions = [
      {
        id: "1",
        user_id: "user",
        task_id: "weekly",
        occurrence_date: "2026-08-10",
        completed_at: "2026-08-10T10:00:00Z",
        task_snapshot: {},
      },
      {
        id: "2",
        user_id: "user",
        task_id: "weekly",
        occurrence_date: "2026-08-11",
        completed_at: "2026-08-11T10:00:00Z",
        task_snapshot: {},
      },
    ];
    expect(
      canToggleOccurrence(weekly, "2026-08-12", "2026-08-14", completions, 1),
    ).toBe(false);
    expect(
      canToggleOccurrence(weekly, "2026-08-11", "2026-08-14", completions, 1),
    ).toBe(true);
  });

  it("keeps historical and current completion progress independent", () => {
    const recurring = {
      startDate: "2026-08-01",
      recurrence: { type: "daily" as const },
    };
    const pastOnly = new Map([[recurring, ["2026-08-12"]]]);
    expect(
      calculateWeeklyProgress([recurring], pastOnly, "2026-08-12").completed,
    ).toBe(1);
    expect(
      calculateWeeklyProgress([recurring], pastOnly, "2026-08-19").completed,
    ).toBe(0);
  });

  it("keeps completed past occurrences visible so they can be undone", () => {
    expect(shouldShowOccurrence(false, false, true)).toBe(true);
    expect(shouldShowOccurrence(true, false, true)).toBe(false);
  });

  it("does not shift the logical day across timezones or DST", () => {
    expect(localDate("Europe/Madrid", new Date("2026-08-11T22:30:00Z"))).toBe(
      "2026-08-12",
    );
    expect(
      localDate("America/New_York", new Date("2026-11-01T04:30:00Z")),
    ).toBe("2026-11-01");
  });

  it("keeps database identity unique and validates historical dates", () => {
    const initial = readFileSync(
      "supabase/migrations/20260726140000_initial_schema.sql",
      "utf8",
    );
    const guard = readFileSync(
      "supabase/migrations/20260814120000_historical_completion_invariants.sql",
      "utf8",
    );
    expect(initial).toContain("unique(task_id,occurrence_date)");
    expect(guard).toContain("new.occurrence_date >");
    expect(guard).toContain("Invalid interval occurrence");
    expect(guard).toContain("new.task_snapshot = jsonb_build_object");
  });
});
