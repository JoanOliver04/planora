/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";

const ids = {
  task: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  schedule: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};
const state = {
  taskResult: { id: ids.task },
  schedule: { id: ids.schedule } as { id: string } | null,
  category: null as { schedule_id: string | null } | null,
  calls: [] as Array<{ table: string; operation: string; payload?: unknown }>,
  error: null as { code: string; message: string } | null,
};
function query(table: string) {
  const q: any = {
    select() {
      return q;
    },
    eq() {
      return q;
    },
    update(payload: unknown) {
      state.calls.push({ table, operation: "update", payload });
      return q;
    },
    insert(payload: unknown) {
      state.calls.push({ table, operation: "insert", payload });
      return q;
    },
    maybeSingle: async () => ({
      error: state.error,
      data:
        table === "schedules"
          ? state.schedule
          : table === "tasks"
            ? state.taskResult
            : state.category,
    }),
    single: async () => ({
      error: state.error,
      data: table === "tasks" ? state.taskResult : state.category,
    }),
  };
  return q;
}
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => query(table),
  }),
}));
const { saveTask } = await import("@/app/actions/domain");
const base = (extra: Record<string, unknown> = {}) => ({
  title: "Task",
  scope: "schedule",
  scheduleId: ids.schedule,
  categoryId: null,
  recurrence: { type: "once" },
  startDate: "2026-08-03",
  endDate: null,
  timing: { mode: "anytime" },
  ...extra,
});
beforeEach(() => {
  state.calls.length = 0;
  state.category = null;
  state.error = null;
});
describe("task editing persistence", () => {
  it("updates the existing row when only the title changes", async () => {
    const result = await saveTask(base({ title: "Renamed" }), ids.task);
    expect(result).toEqual({ ok: true, taskId: ids.task });
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]).toMatchObject({
      table: "tasks",
      operation: "update",
    });
    expect(state.calls[0].payload).not.toHaveProperty("user_id");
  });
  it("keeps local dates and clears an empty end date to null", async () => {
    await saveTask(base({ startDate: "2026-12-31", endDate: "" }), ids.task);
    expect(state.calls[0].payload).toMatchObject({
      start_date: "2026-12-31",
      end_date: null,
    });
  });
  it("keeps global tasks detached from schedules", async () => {
    await saveTask(base({ scope: "global", scheduleId: null }), ids.task);
    expect(state.calls[0].payload).toMatchObject({
      scope: "global",
      schedule_id: null,
    });
  });
  it("does not insert when editing", async () => {
    await saveTask(base(), ids.task);
    expect(state.calls[0].operation).toBe("update");
  });
  it("returns a serializable database error instead of throwing", async () => {
    state.error = { code: "23514", message: "check violation" };
    const result = await saveTask(
      base({ scope: "global", scheduleId: null }),
      ids.task,
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Unable to save task",
        supabaseCode: "23514",
      },
    });
  });
  it("rejects a schedule that does not belong to the user", async () => {
    state.schedule = null;
    const result = await saveTask(base());
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(state.calls).toHaveLength(0);
    state.schedule = { id: ids.schedule };
  });
});
