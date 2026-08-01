import { describe, expect, it, vi } from "vitest";
import {
  createDemoState,
  DEMO_TTL,
  parseDemoState,
  toggleDemoCompletion,
} from "@/features/demo/demo-store";

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

  it("rejects expired and malformed persisted demos", () => {
    const state = createDemoState(now);
    expect(parseDemoState(JSON.stringify(state), now.getTime())).toEqual(state);
    expect(parseDemoState(JSON.stringify(state), state.expiresAt)).toBeNull();
    expect(parseDemoState("{broken", now.getTime())).toBeNull();
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
