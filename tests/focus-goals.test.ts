import { describe, expect, it } from "vitest";
import {
  calculateGoalWeekHistory,
  calculateWeeklyGoalProgress,
  localWeekday,
  pickPrimaryGoal,
} from "@/features/focus/goals";
import type { FocusGoal, FocusSession } from "@/features/focus/types";
import { createStartedSession, applyFocusAction } from "@/features/focus/state-machine";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260807190000_focus_goals_flexible.sql",
  ),
  "utf8",
);

function goal(partial: Partial<FocusGoal> = {}): FocusGoal {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    userId: "user",
    period: "weekly",
    targetFocusSec: 5 * 3600,
    metric: "focus_seconds",
    targetValue: 5 * 3600,
    scope: "global",
    categoryId: null,
    presetId: null,
    startDate: "2026-01-01",
    consideredDays: [0, 1, 2, 3, 4, 5, 6],
    isPrimary: true,
    sortOrder: 0,
    timezone: "Europe/Madrid",
    weekStartsOn: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function idFactory(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function completeSession(
  atStart: string,
  focusSec: number,
  overrides: Partial<Parameters<typeof createStartedSession>[0]> = {},
): FocusSession {
  const createId = idFactory("g");
  const start = Date.parse(atStart);
  const started = createStartedSession(
    {
      mode: "countdown",
      focusDurationSec: Math.max(focusSec, 60),
      ...overrides,
    },
    "user",
    {
      createId,
      now: start,
      sessionId: createId(),
      intervalId: createId(),
    },
  );
  return applyFocusAction(
    started,
    { type: "complete" },
    {
      expectedRevision: started.revision,
      now: start + focusSec * 1000,
      createId,
    },
  ).session;
}

describe("flexible weekly focus goals", () => {
  it("extends schema for metrics, scope and primary goals", () => {
    expect(migration).toContain("metric text");
    expect(migration).toContain("active_days");
    expect(migration).toContain("focus_goals_one_primary_active_weekly");
    expect(migration).toContain("considered_days");
  });

  it("computes weekday anchors for Monday and Sunday starts", () => {
    // 2026-08-03 is Monday
    expect(localWeekday("2026-08-03", "Europe/Madrid")).toBe(1);
    // 2026-08-02 is Sunday
    expect(localWeekday("2026-08-02", "Europe/Madrid")).toBe(0);
  });

  it("counts only completed sessions for session goals", () => {
    const sessions = [
      completeSession("2026-08-04T08:00:00.000Z", 25 * 60),
      completeSession("2026-08-05T08:00:00.000Z", 25 * 60),
    ];
    const progress = calculateWeeklyGoalProgress(
      goal({ metric: "sessions", targetValue: 3, targetFocusSec: 3 }),
      sessions,
      new Date("2026-08-06T12:00:00.000Z"),
      { includeLive: false },
    );
    expect(progress.completedValue).toBe(2);
    expect(progress.remainingValue).toBe(1);
    expect(progress.completed).toBe(false);
  });

  it("counts unique active days and respects considered weekdays", () => {
    const sessions = [
      completeSession("2026-08-03T08:00:00.000Z", 20 * 60), // Mon
      completeSession("2026-08-03T18:00:00.000Z", 10 * 60), // Mon again
      completeSession("2026-08-04T08:00:00.000Z", 15 * 60), // Tue
    ];
    const weekdaysOnly = calculateWeeklyGoalProgress(
      goal({
        metric: "active_days",
        targetValue: 5,
        targetFocusSec: 5,
        consideredDays: [1, 2, 3, 4, 5],
      }),
      sessions,
      new Date("2026-08-06T12:00:00.000Z"),
      { includeLive: false },
    );
    expect(weekdaysOnly.completedValue).toBe(2);
  });

  it("filters by category scope", () => {
    const cat = "22222222-2222-4222-8222-222222222222";
    const matched = completeSession("2026-08-04T08:00:00.000Z", 30 * 60, {
      categoryId: cat,
    });
    const other = completeSession("2026-08-05T08:00:00.000Z", 30 * 60, {
      categoryId: "33333333-3333-4333-8333-333333333333",
    });
    const progress = calculateWeeklyGoalProgress(
      goal({
        scope: "category",
        categoryId: cat,
        targetValue: 3600,
        targetFocusSec: 3600,
      }),
      [matched, other],
      new Date("2026-08-06T12:00:00.000Z"),
      { includeLive: false },
    );
    expect(progress.completedValue).toBe(30 * 60);
  });

  it("picks the primary goal and builds recent week history", () => {
    const goals = [
      goal({ id: "a", isPrimary: false, sortOrder: 1 }),
      goal({ id: "b", isPrimary: true, sortOrder: 0 }),
    ];
    expect(pickPrimaryGoal(goals)?.id).toBe("b");
    const history = calculateGoalWeekHistory(
      goal(),
      [completeSession("2026-08-04T08:00:00.000Z", 40 * 60)],
      new Date("2026-08-06T12:00:00.000Z"),
      3,
    );
    expect(history).toHaveLength(3);
    const first = history[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(first.weekStart <= first.weekEnd).toBe(true);
  });
});

