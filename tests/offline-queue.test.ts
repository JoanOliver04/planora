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

  it("trims an oversized queue instead of wiping it", () => {
    const items = Array.from({ length: 2_000 }, (_, index) => ({
      id: String(index).padStart(4, "0"),
      userId: "user",
      taskId: "task",
      occurrenceDate: "2026-08-01",
      completed: true,
      snapshot: { title: "T".repeat(140) },
      queuedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    }));
    const raw = JSON.stringify(items);
    expect(raw.length).toBeGreaterThan(500_000);
    localStorage.setItem("planora-offline-completions-v1", raw);

    const queued = getQueuedCompletions("user");
    const stored = localStorage.getItem("planora-offline-completions-v1") ?? "";
    expect(stored.length).toBeLessThanOrEqual(500_000);
    expect(queued.length).toBeGreaterThan(0);
    expect(queued.length).toBeLessThan(items.length);
    expect(queued.at(-1)?.id).toBe("1999");
    expect(queued.some((item) => item.id === "0000")).toBe(false);
    expect(JSON.parse(stored)).toHaveLength(queued.length);

    enqueueCompletion({
      userId: "user",
      taskId: "fresh",
      occurrenceDate: "2026-08-02",
      completed: true,
      snapshot: { title: "Newest" },
    });
    const afterEnqueue =
      localStorage.getItem("planora-offline-completions-v1") ?? "";
    const saved = JSON.parse(afterEnqueue) as Array<{ taskId: string }>;
    expect(afterEnqueue.length).toBeLessThanOrEqual(500_000);
    expect(saved.some((item) => item.taskId === "fresh")).toBe(true);
    expect(saved.some((item) => item.taskId === "task")).toBe(true);
  });

  it("does not overwrite or sync a corrupt queue", async () => {
    localStorage.setItem("planora-offline-completions-v1", "{");
    const db = {
      from: () => {
        throw new Error("corrupt queue must not be flushed");
      },
    } as unknown as SupabaseClient<Database>;

    const result = await flushCompletionQueue(db, "user");
    expect(result).toEqual({ synced: 0, conflicts: 0, remaining: 0 });
    expect(localStorage.getItem("planora-offline-completions-v1")).toBe("{");
    expect(getQueuedCompletions()).toEqual([]);
    expect(localStorage.getItem("planora-offline-completions-v1")).toBe("{");

    enqueueCompletion({
      userId: "user",
      taskId: "task",
      occurrenceDate: "2026-08-01",
      completed: true,
      snapshot: { title: "Recovered" },
    });
    const replaced = JSON.parse(
      localStorage.getItem("planora-offline-completions-v1") ?? "null",
    ) as Array<{ taskId: string }>;
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.taskId).toBe("task");
  });

  it("removes an illegible queue on sign-out because it has no owner", async () => {
    localStorage.setItem("planora-offline-completions-v1", "{");
    await clearPrivateOfflineData("user");
    expect(localStorage.getItem("planora-offline-completions-v1")).toBeNull();
  });

  it("rejects malformed and oversized browser state", () => {
    localStorage.setItem(
      "planora-offline-completions-v1",
      JSON.stringify([{ userId: "user", completed: "yes" }]),
    );
    expect(getQueuedCompletions()).toEqual([]);

    localStorage.setItem(
      "planora-workspace-cache-v1:user:today",
      JSON.stringify({
        savedAt: Date.now(),
        data: { user: { id: "other" }, tasks: [] },
      }),
    );
    expect(loadCachedWorkspace("user", "today")).toBeNull();

    localStorage.setItem(
      "planora-workspace-cache-v1:user:today",
      "x".repeat(500_001),
    );
    expect(loadCachedWorkspace("user", "today")).toBeNull();
  });
});
