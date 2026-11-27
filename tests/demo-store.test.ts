import { describe, expect, it, vi } from "vitest";
import {
  createDemoState,
  addDemoTask,
  finishDemoFocus,
  getDemoAgenda,
  getDemoProgress,
  DEMO_TTL,
  parseDemoState,
  toggleDemoCompletion,
} from "@/features/demo/demo-store";
import { getMonthGridCellCount, isDemoView } from "@/features/demo/demo-views";

describe("demo store", () => {
  const now = new Date("2026-08-01T10:00:00.000Z");

  it("creates a realistic isolated dataset with a 24 hour expiry", () => {
    const state = createDemoState(now);
    expect(state.expiresAt).toBe(now.getTime() + DEMO_TTL);
    expect(state.schedules.length).toBeGreaterThanOrEqual(2);
    expect(state.categories.length).toBeGreaterThanOrEqual(4);
    expect(state.tasks.length).toBeGreaterThanOrEqual(5);
    expect(state.events.length).toBeGreaterThanOrEqual(3);
    expect(state.completions.length).toBeGreaterThanOrEqual(3);
  });

  it("creates English sample copy when asked", () => {
    const state = createDemoState(now, "en");
    expect(state.locale).toBe("en");
    expect(state.tasks[0].title).toBe("Drink water after waking up");
    expect(state.schedules[1].name).toBe("Focus week");
  });

  it("keeps the daily total and weekly agenda scoped to the selected schedule and date", () => {
    const state = addDemoTask(
      createDemoState(now),
      "Prepare slides",
      "slides",
      "2026-08-01",
    );
    expect(getDemoAgenda(state, "2026-08-01").map((task) => task.id)).toContain(
      "slides",
    );
    expect(
      getDemoAgenda(state, "2026-08-02").map((task) => task.id),
    ).not.toContain("slides");
    expect(getDemoAgenda(state, "2026-08-01").map((task) => task.id)).toContain(
      "read",
    );
    expect(
      getDemoProgress(
        { ...state, activeScheduleId: "schedule-focus" },
        "2026-08-01",
      ).completed,
    ).toBe(0);
  });

  it("restores legacy tasks and records a completed preview just once", () => {
    const state = createDemoState(now);
    const legacy = parseDemoState(
      JSON.stringify({ ...state, focus: undefined, sessions: undefined }),
      now.getTime(),
    );
    expect(legacy?.tasks).toEqual(state.tasks);
    expect(legacy?.sessions).toEqual([]);
    const running = {
      ...state,
      focus: {
        taskId: "plan",
        duration: 15,
        remaining: 15,
        deadline: now.getTime() + 15000,
      },
    };
    expect(finishDemoFocus(running, now.getTime())).toBe(running);
    const finished = finishDemoFocus(running, now.getTime() + 15000);
    expect(finished.sessions.at(-1)).toEqual({
      taskId: "plan",
      date: "2026-08-01",
      seconds: 15,
    });
    expect(finishDemoFocus(finished, now.getTime() + 30000)).toBe(finished);
  });

  it("rejects expired and malformed persisted demos", () => {
    const state = createDemoState(now);
    expect(parseDemoState(JSON.stringify(state), now.getTime())).toEqual(state);
    expect(parseDemoState(JSON.stringify(state), state.expiresAt)).toBeNull();
    expect(
      parseDemoState(
        JSON.stringify({ ...state, expiresAt: now.getTime() + DEMO_TTL + 1 }),
        now.getTime(),
      ),
    ).toBeNull();
    expect(parseDemoState("{broken", now.getTime())).toBeNull();
    expect(
      parseDemoState(
        JSON.stringify({ ...state, completions: "invalid" }),
        now.getTime(),
      ),
    ).toBeNull();
    expect(
      parseDemoState(
        JSON.stringify({ ...state, categories: [{ name: "Incomplete" }] }),
        now.getTime(),
      ),
    ).toBeNull();
    expect(parseDemoState("x".repeat(250_001), now.getTime())).toBeNull();
    expect(
      parseDemoState(
        JSON.stringify({ ...state, locale: "es" }),
        now.getTime(),
        "en",
      ),
    ).toBeNull();
  });

  it("keeps demo routing and six-week months complete", () => {
    expect(isDemoView("focus")).toBe(true);
    expect(isDemoView("unknown")).toBe(false);
    expect(getMonthGridCellCount(5, 31)).toBe(42);
    expect(getMonthGridCellCount(0, 28)).toBe(28);
  });

  it("toggles completion without mutating the input state", () => {
    vi.setSystemTime(now);
    const state = createDemoState(now);
    const date = "2026-08-01";
    const completed = toggleDemoCompletion(state, "plan", date);
    expect(completed).not.toBe(state);
    expect(
      completed.completions.some(
        (item) => item.taskId === "plan" && item.date === date,
      ),
    ).toBe(true);
    expect(
      toggleDemoCompletion(completed, "plan", date).completions.some(
        (item) => item.taskId === "plan" && item.date === date,
      ),
    ).toBe(false);
    vi.useRealTimers();
  });
});
