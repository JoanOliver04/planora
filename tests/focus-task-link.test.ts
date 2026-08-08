import { describe, expect, it } from "vitest";
import {
  aggregateTaskFocusStats,
  buildFocusDraftFromTask,
  isTaskFocusActionAvailable,
  isTaskOccurrenceAllowed,
} from "@/features/focus/task-link";
import type { Task } from "@/features/workspace/types";

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    user_id: "u1",
    emoji: "📚",
    description: null,
    focus_enabled: false,
    category_id: "c1",
    schedule_id: "s1",
    scope: "schedule",
    task_kind: "habit",
    recurrence_type: "daily",
    recurrence_config: {},
    time_mode: "anytime",
    day_part: null,
    start_time: null,
    end_time: null,
    start_date: "2026-08-01",
    end_date: null,
    is_active: true,
    sort_order: 0,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    archived_at: null,
    ...partial,
  } as Task;
}

describe("focus task linking", () => {
  it("offers task focus only when opted in and scheduled for today", () => {
    expect(
      isTaskFocusActionAvailable({
        focusEnabled: true,
        occurrenceDate: "2026-08-08",
        today: "2026-08-08",
      }),
    ).toBe(true);
    expect(
      isTaskFocusActionAvailable({
        focusEnabled: false,
        occurrenceDate: "2026-08-08",
        today: "2026-08-08",
      }),
    ).toBe(false);
    expect(
      isTaskFocusActionAvailable({
        focusEnabled: true,
        occurrenceDate: "2026-08-09",
        today: "2026-08-08",
      }),
    ).toBe(false);
  });
  it("builds a draft from a one-time task", () => {
    const oneTime = task({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Exam prep",
      task_kind: "one_time",
      recurrence_type: "once",
      start_date: "2026-08-07",
    });
    const draft = buildFocusDraftFromTask({
      task: oneTime,
      occurrenceDate: "2026-08-07",
      category: { name: "Study", colour: "#4f6b45", emoji: "📖" },
      schedule: { name: "School" },
    });
    expect(draft.taskId).toBe(oneTime.id);
    expect(draft.title).toBe("Exam prep");
    expect(draft.occurrenceDate).toBe("2026-08-07");
    expect(draft.completeTaskOnEnd).toBe(false);
    expect(draft.linkSnapshot?.categoryName).toBe("Study");
    expect(draft.linkSnapshot?.scheduleName).toBe("School");
    expect(isTaskOccurrenceAllowed(oneTime, "2026-08-07")).toBe(true);
    expect(isTaskOccurrenceAllowed(oneTime, "2026-08-08")).toBe(false);
  });

  it("allows daily habits on any day in range", () => {
    const daily = task({
      id: "22222222-2222-4222-8222-222222222222",
      title: "Piano",
      task_kind: "habit",
      recurrence_type: "daily",
    });
    expect(isTaskOccurrenceAllowed(daily, "2026-08-07")).toBe(true);
  });

  it("respects weekday habits", () => {
    const weekdays = task({
      id: "33333333-3333-4333-8333-333333333333",
      title: "Gym",
      task_kind: "habit",
      recurrence_type: "weekdays",
      recurrence_config: { type: "weekdays", weekdays: [1, 3, 5] },
    });
    // 2026-08-07 is Friday (5)
    expect(isTaskOccurrenceAllowed(weekdays, "2026-08-07")).toBe(true);
    // 2026-08-08 is Saturday
    expect(isTaskOccurrenceAllowed(weekdays, "2026-08-08")).toBe(false);
  });

  it("aggregates focus time stats for a task without leaking other tasks", () => {
    const stats = aggregateTaskFocusStats(
      [
        {
          taskId: "a",
          focusSec: 600,
          startedAt: "2026-08-07T10:00:00.000Z",
          status: "completed",
        },
        {
          taskId: "b",
          focusSec: 900,
          startedAt: "2026-08-07T12:00:00.000Z",
          status: "completed",
        },
        {
          taskId: "a",
          focusSec: 300,
          startedAt: "2026-08-06T09:00:00.000Z",
          status: "completed",
        },
      ],
      "a",
    );
    expect(stats.sessionCount).toBe(2);
    expect(stats.totalFocusSec).toBe(900);
    expect(stats.lastStartedAt).toBe("2026-08-07T10:00:00.000Z");
  });
});
