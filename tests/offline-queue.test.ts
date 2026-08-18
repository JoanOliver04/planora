import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheWorkspace,
  clearPrivateOfflineData,
  enqueueCompletion,
  flushCompletionQueue,
  getQueuedCompletions,
  loadCachedWorkspace,
} from "@/lib/offline/queue";
import type { WorkspaceData } from "@/features/workspace/types";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

function database(
  existing: { id: string; completed_at: string } | null,
  observed: {
    last_action: "complete" | "uncomplete";
    changed_at: string;
  } | null = null,
) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn();
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  remove.mockReturnValue(builder);
  builder.delete = remove;
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: existing, error: null });
  builder.then = (resolve: (value: unknown) => void) =>
    Promise.resolve({ error: null }).then(resolve);
  const stateBuilder: Record<string, unknown> = {};
  stateBuilder.select = vi.fn(() => stateBuilder);
  stateBuilder.eq = vi.fn(() => stateBuilder);
  stateBuilder.maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: observed, error: null });
  return {
    db: {
      from: vi.fn((table: string) =>
        table === "task_occurrence_state"
          ? stateBuilder
          : { ...builder, insert },
      ),
    } as unknown as SupabaseClient<Database>,
    insert,
    remove,
  };
}

describe("offline queue", () => {
  beforeEach(() => localStorage.clear());

  it("keeps only the latest intent for each task occurrence", () => {
    const base = {
      userId: "user",
      taskId: "task",
      occurrenceDate: "2026-08-01",
      snapshot: { title: "Read" },
    };
    enqueueCompletion({ ...base, completed: true });
    enqueueCompletion({ ...base, completed: false });
    expect(getQueuedCompletions("user")).toHaveLength(1);
    expect(getQueuedCompletions("user")[0].completed).toBe(false);
  });

  it("flushes supported changes and reports newer remote conflicts", async () => {
    enqueueCompletion({
      userId: "user",
      taskId: "task",
      occurrenceDate: "2026-08-01",
      completed: false,
      snapshot: {},
    });
    const { db, remove } = database({
      id: "completion",
      completed_at: "2999-01-01T00:00:00Z",
    });
    const result = await flushCompletionQueue(db, "user");
    expect(result).toEqual({ synced: 0, conflicts: 1, remaining: 0 });
    expect(remove).not.toHaveBeenCalled();
    expect(getQueuedCompletions("user")).toHaveLength(0);
  });

  it("removes private offline data for the signed-out user only", async () => {
    enqueueCompletion({
      userId: "user",
      taskId: "private-task",
      occurrenceDate: "2026-08-01",
      completed: true,
      snapshot: { title: "Private" },
    });
    enqueueCompletion({
      userId: "other",
      taskId: "other-task",
      occurrenceDate: "2026-08-01",
      completed: true,
      snapshot: {},
    });
    localStorage.setItem("planora-workspace-cache-v1:user:today", "private");
    localStorage.setItem("planora-workspace-cache-v1:other:today", "other");

    await clearPrivateOfflineData("user");

    expect(getQueuedCompletions("user")).toHaveLength(0);
    expect(getQueuedCompletions("other")).toHaveLength(1);
    expect(
      localStorage.getItem("planora-workspace-cache-v1:user:today"),
    ).toBeNull();
    expect(localStorage.getItem("planora-workspace-cache-v1:other:today")).toBe(
      "other",
    );
  });
  it("scopes cached read data by user and view without storing email", () => {
    const data = {
      user: { id: "user", email: "private@example.com" },
      schedules: [],
      categories: [],
      tasks: [],
      events: [],
      completions: [],
    } as unknown as WorkspaceData;
    cacheWorkspace("today", data);
    expect(loadCachedWorkspace("user", "today")?.user).toEqual({ id: "user" });
    expect(loadCachedWorkspace("other", "today")).toBeNull();
    expect(loadCachedWorkspace("user", "week")).toBeNull();
  });

  it("drops permanently rejected completions instead of looping them", async () => {
    enqueueCompletion({
      userId: "user",
      taskId: "task",
      occurrenceDate: "2026-08-01",
      completed: true,
      snapshot: {},
    });
    const insert = vi.fn().mockResolvedValue({
      error: { code: "23514", message: "Weekly target already reached" },
    });
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });
    const db = {
      from: vi.fn(() => ({ ...builder, insert })),
    } as unknown as SupabaseClient<Database>;
    const result = await flushCompletionQueue(db, "user");
    expect(result.conflicts).toBe(1);
    expect(result.remaining).toBe(0);
    expect(getQueuedCompletions("user")).toHaveLength(0);
  });

  it("does not resurrect a completion after a newer remote uncomplete", async () => {
    enqueueCompletion({
      userId: "user",
      taskId: "task",
      occurrenceDate: "2026-08-01",
      completed: true,
      snapshot: {},
    });
    const { db, insert } = database(null, {
      last_action: "uncomplete",
      changed_at: "2999-01-01T00:00:00Z",
    });
    const result = await flushCompletionQueue(db, "user");
    expect(result).toEqual({ synced: 0, conflicts: 1, remaining: 0 });
    expect(insert).not.toHaveBeenCalled();
    expect(getQueuedCompletions("user")).toHaveLength(0);
  });
});
