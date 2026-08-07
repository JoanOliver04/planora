import { describe, expect, it } from "vitest";
import {
  calculateFocusStatistics,
  FOCUS_INSIGHT_MIN_SAMPLE,
} from "@/features/focus/focus-analytics";
import type { FocusSession } from "@/features/focus/types";
import {
  applyFocusAction,
  createStartedSession,
} from "@/features/focus/state-machine";

function idFactory(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function completeSession(
  atStart: string,
  focusSec: number,
  overrides: Partial<Parameters<typeof createStartedSession>[0]> = {},
): FocusSession {
  const createId = idFactory("a");
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

function cancelSession(
  atStart: string,
  focusSec: number,
): FocusSession {
  const createId = idFactory("c");
  const start = Date.parse(atStart);
  const started = createStartedSession(
    {
      mode: "countdown",
      focusDurationSec: Math.max(focusSec, 60),
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
    { type: "cancel" },
    {
      expectedRevision: started.revision,
      now: start + focusSec * 1000,
      createId,
    },
  ).session;
}

const now = new Date("2026-08-07T12:00:00Z");

describe("calculateFocusStatistics", () => {
  it("returns empty state for no sessions", () => {
    const stats = calculateFocusStatistics({
      sessions: [],
      timezone: "UTC",
      now,
      filters: { range: "7d" },
    });
    expect(stats.empty).toBe(true);
    expect(stats.sampleSize).toBe(0);
    expect(stats.totalFocusSec).toBe(0);
    expect(stats.completionRate).toBeNull();
    expect(stats.daily).toHaveLength(7);
    expect(stats.insights[0]?.kind).toBe("insufficient");
  });

  it("aggregates a single completed session", () => {
    const session = completeSession("2026-08-06T10:00:00Z", 1500, {
      categoryId: "cat-1",
      linkSnapshot: {
        categoryName: "Study",
        categoryColour: "#4F6B45",
        taskTitle: "Math",
      },
      taskId: "task-1",
    });
    const stats = calculateFocusStatistics({
      sessions: [session],
      timezone: "UTC",
      now,
      filters: { range: "7d" },
    });
    expect(stats.empty).toBe(false);
    expect(stats.completedSessions).toBe(1);
    expect(stats.totalFocusSec).toBe(1500);
    expect(stats.meanDurationSec).toBe(1500);
    expect(stats.medianDurationSec).toBe(1500);
    expect(stats.completionRate).toBe(1);
    expect(stats.categories[0]?.label).toBe("Study");
    expect(stats.tasks[0]?.label).toBe("Math");
    expect(stats.insights[0]?.kind).toBe("insufficient");
  });

  it("keeps insufficient insights below the minimum sample", () => {
    const sessions = Array.from({ length: FOCUS_INSIGHT_MIN_SAMPLE - 1 }, (_, i) =>
      completeSession(`2026-08-0${i + 1}T09:00:00Z`, 600 + i * 60),
    );
    const stats = calculateFocusStatistics({
      sessions,
      timezone: "UTC",
      now,
      filters: { range: "30d" },
    });
    expect(stats.sampleSize).toBe(FOCUS_INSIGHT_MIN_SAMPLE - 1);
    expect(stats.insights).toEqual([
      { kind: "insufficient", messageKey: "insufficient" },
    ]);
  });

  it("emits optional insights with enough completed sessions", () => {
    const sessions = Array.from({ length: 6 }, (_, i) =>
      completeSession(`2026-08-0${Math.min(i + 1, 7)}T09:30:00Z`, 900 + i * 30, {
        linkSnapshot: { categoryName: i < 4 ? "Study" : "Work" },
      }),
    );
    const stats = calculateFocusStatistics({
      sessions,
      timezone: "UTC",
      now,
      filters: { range: "30d" },
    });
    expect(stats.sampleSize).toBe(6);
    expect(stats.insights.some((item) => item.kind === "dayPart")).toBe(true);
    expect(stats.insights.some((item) => item.kind === "typicalDuration")).toBe(
      true,
    );
    expect(stats.insights.some((item) => item.kind === "weekCompare")).toBe(
      true,
    );
    expect(stats.insights.some((item) => item.kind === "insufficient")).toBe(
      false,
    );
  });

  it("applies range, mode, category and preset filters together", () => {
    const match = completeSession("2026-08-05T08:00:00Z", 1200, {
      mode: "cycles",
      categoryId: "cat-a",
      presetId: "preset-a",
    });
    const wrongMode = completeSession("2026-08-05T09:00:00Z", 800, {
      mode: "stopwatch",
      categoryId: "cat-a",
      presetId: "preset-a",
    });
    const wrongCat = completeSession("2026-08-05T10:00:00Z", 700, {
      mode: "cycles",
      categoryId: "cat-b",
      presetId: "preset-a",
    });
    const outside = completeSession("2026-06-01T10:00:00Z", 2000, {
      mode: "cycles",
      categoryId: "cat-a",
      presetId: "preset-a",
    });
    const stats = calculateFocusStatistics({
      sessions: [match, wrongMode, wrongCat, outside],
      timezone: "UTC",
      now,
      filters: {
        range: "7d",
        mode: "cycles",
        categoryId: "cat-a",
        presetId: "preset-a",
      },
    });
    expect(stats.completedSessions).toBe(1);
    expect(stats.totalFocusSec).toBe(1200);
  });

  it("supports custom inclusive date ranges", () => {
    const inside = completeSession("2026-08-03T12:00:00Z", 600);
    const outside = completeSession("2026-08-06T12:00:00Z", 900);
    const stats = calculateFocusStatistics({
      sessions: [inside, outside],
      timezone: "UTC",
      now,
      filters: {
        range: "custom",
        from: "2026-08-02",
        to: "2026-08-04",
      },
    });
    expect(stats.from).toBe("2026-08-02");
    expect(stats.to).toBe("2026-08-04");
    expect(stats.completedSessions).toBe(1);
    expect(stats.totalFocusSec).toBe(600);
    expect(stats.daily).toHaveLength(3);
  });

  it("uses local timezone for day buckets", () => {
    // 23:30 UTC on Aug 6 is Aug 7 morning in Tokyo
    const session = completeSession("2026-08-06T23:30:00Z", 600);
    const stats = calculateFocusStatistics({
      sessions: [session],
      timezone: "Asia/Tokyo",
      now: new Date("2026-08-07T12:00:00+09:00"),
      filters: { range: "7d" },
    });
    const day = stats.daily.find((item) => item.focusSec > 0);
    expect(day?.date).toBe("2026-08-07");
  });

  it("keeps snapshot labels when the category row is gone", () => {
    const session = completeSession("2026-08-05T11:00:00Z", 900, {
      categoryId: "deleted-cat",
      linkSnapshot: {
        categoryName: "Archived topic",
        categoryColour: "#999999",
      },
    });
    const stats = calculateFocusStatistics({
      sessions: [session],
      timezone: "UTC",
      now,
      filters: { range: "30d" },
      categoryNames: new Map(),
    });
    expect(stats.categories[0]?.label).toBe("Archived topic");
    expect(stats.categories[0]?.colour).toBe("#999999");
  });

  it("handles long sessions and cancelled finish rate neutrally", () => {
    const long = completeSession("2026-08-04T08:00:00Z", 4 * 3600);
    const cancelled = cancelSession("2026-08-04T14:00:00Z", 300);
    const stats = calculateFocusStatistics({
      sessions: [long, cancelled],
      timezone: "UTC",
      now,
      filters: { range: "7d" },
    });
    expect(stats.totalFocusSec).toBe(4 * 3600);
    expect(stats.completedSessions).toBe(1);
    expect(stats.cancelledSessions).toBe(1);
    expect(stats.completionRate).toBe(0.5);
    expect(stats.meanDurationSec).toBe(4 * 3600);
  });

  it("counts completed focus blocks from intervals", () => {
    const session = completeSession("2026-08-05T08:00:00Z", 1800);
    expect(session.intervals.some((item) => item.kind === "focus")).toBe(true);
    const stats = calculateFocusStatistics({
      sessions: [session],
      timezone: "UTC",
      now,
      filters: { range: "7d" },
    });
    expect(stats.completedBlocks).toBeGreaterThanOrEqual(1);
  });
});
