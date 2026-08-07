import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetFocusOfflineForTests,
  cacheFocusSession,
  canStartFocusOffline,
  clearFocusOfflineData,
  enqueueFocusTransition,
  flushFocusOfflineQueue,
  getQueuedFocusTransitions,
  isQueuedFocusTransition,
  loadCachedFocusSession,
} from "@/features/focus/focus-offline";
import {
  applyFocusAction,
  createStartedSession,
} from "@/features/focus/state-machine";
import type { FocusSession } from "@/features/focus/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function idFactory(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function startSession(
  now = Date.parse("2026-08-07T10:00:00.000Z"),
): FocusSession {
  return createStartedSession(
    {
      mode: "countdown",
      focusDurationSec: 600,
    },
    "user-1",
    {
      createId: idFactory("off"),
      now,
      sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      intervalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    },
  );
}

beforeEach(() => {
  __resetFocusOfflineForTests();
  vi.restoreAllMocks();
});

afterEach(() => {
  __resetFocusOfflineForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("focus offline policy", () => {
  it("does not allow starting Focus offline", () => {
    expect(canStartFocusOffline()).toBe(false);
  });
});

describe("focus offline queue", () => {
  it("enqueues pause transitions with idempotent action ids", () => {
    const session = startSession();
    const paused = applyFocusAction(
      session,
      { type: "pause" },
      {
        expectedRevision: session.revision,
        now: Date.parse("2026-08-07T10:01:00.000Z"),
        createId: idFactory("p"),
      },
    ).session;

    const first = enqueueFocusTransition({
      userId: "user-1",
      actionId: "11111111-1111-4111-8111-111111111111",
      session: paused,
      expectedRevision: session.revision,
      clientTimestamp: "2026-08-07T10:01:00.000Z",
      transition: {
        type: "pause",
        sessionId: session.id,
        expectedRevision: session.revision,
      },
    });
    const dup = enqueueFocusTransition({
      userId: "user-1",
      actionId: "11111111-1111-4111-8111-111111111111",
      session: paused,
      expectedRevision: session.revision,
      transition: {
        type: "pause",
        sessionId: session.id,
        expectedRevision: session.revision,
      },
    });

    expect(first.ok).toBe(true);
    expect(dup.ok).toBe(false);
    expect(getQueuedFocusTransitions("user-1")).toHaveLength(1);
    expect(
      isQueuedFocusTransition(getQueuedFocusTransitions("user-1")[0]),
    ).toBe(true);
  });

  it("queues several pauses in order without per-second rows", () => {
    let session = startSession();
    for (let i = 0; i < 3; i += 1) {
      const before = session;
      session = applyFocusAction(
        session,
        { type: i % 2 === 0 ? "pause" : "resume" },
        {
          expectedRevision: session.revision,
          now: Date.parse("2026-08-07T10:00:00.000Z") + (i + 1) * 60_000,
          createId: idFactory(`t${i}`),
        },
      ).session;
      enqueueFocusTransition({
        userId: "user-1",
        actionId: `22222222-2222-4222-8222-22222222222${i}`,
        session,
        expectedRevision: before.revision,
        clientTimestamp:
          Date.parse("2026-08-07T10:00:00.000Z") + (i + 1) * 60_000,
        transition: {
          type: i % 2 === 0 ? "pause" : "resume",
          sessionId: session.id,
          expectedRevision: before.revision,
        },
      });
    }
    expect(getQueuedFocusTransitions("user-1")).toHaveLength(3);
    expect(
      getQueuedFocusTransitions("user-1").map((item) => item.expectedRevision),
    ).toEqual([1, 2, 3]);
  });

  it("restores a cached session after close/reopen", () => {
    const session = startSession();
    cacheFocusSession("user-1", session);
    expect(loadCachedFocusSession("user-1")?.id).toBe(session.id);
    clearFocusOfflineData("user-1");
    expect(loadCachedFocusSession("user-1")).toBeNull();
  });

  it("survives corrupt queue data", () => {
    window.localStorage.setItem("planora-focus-offline-queue-v1", "{not-json");
    expect(getQueuedFocusTransitions()).toEqual([]);
    window.localStorage.setItem(
      "planora-focus-offline-queue-v1",
      JSON.stringify([{ bad: true }, null, 3]),
    );
    expect(getQueuedFocusTransitions()).toEqual([]);
  });

  it("handles storage failures without throwing", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    const session = startSession();
    expect(() =>
      enqueueFocusTransition({
        userId: "user-1",
        actionId: "33333333-3333-4333-8333-333333333333",
        session,
        expectedRevision: session.revision,
        transition: {
          type: "pause",
          sessionId: session.id,
          expectedRevision: session.revision,
        },
      }),
    ).not.toThrow();
    setItem.mockRestore();
  });
});

describe("flushFocusOfflineQueue", () => {
  it("replays actions in order when online", async () => {
    const session = startSession();
    const paused = applyFocusAction(
      session,
      { type: "pause" },
      {
        expectedRevision: session.revision,
        now: Date.parse("2026-08-07T10:01:00.000Z"),
        createId: idFactory("fp"),
      },
    ).session;

    enqueueFocusTransition({
      userId: "user-1",
      actionId: "44444444-4444-4444-8444-444444444444",
      session: paused,
      expectedRevision: session.revision,
      clientTimestamp: "2026-08-07T10:01:00.000Z",
      transition: {
        type: "pause",
        sessionId: session.id,
        expectedRevision: session.revision,
      },
    });

    const transition = vi.fn(async () => ({
      ok: true as const,
      data: { ...paused, revision: session.revision + 1 },
    }));

    vi.stubGlobal("navigator", { onLine: true });
    const result = await flushFocusOfflineQueue(
      {} as SupabaseClient<Database>,
      "user-1",
      { transition },
    );
    expect(result.synced).toBe(1);
    expect(result.remaining).toBe(0);
    expect(transition).toHaveBeenCalledTimes(1);
    const calls = transition.mock.calls as unknown as Array<[unknown]>;
    expect(calls[0]?.[0]).toMatchObject({
      type: "pause",
      expectedRevision: session.revision,
      actionId: "44444444-4444-4444-8444-444444444444",
    });
  });

  it("stops on revision conflict and does not invent further times", async () => {
    const session = startSession();
    enqueueFocusTransition({
      userId: "user-1",
      actionId: "55555555-5555-4555-8555-555555555555",
      session,
      expectedRevision: session.revision,
      transition: {
        type: "pause",
        sessionId: session.id,
        expectedRevision: session.revision,
      },
    });
    enqueueFocusTransition({
      userId: "user-1",
      actionId: "66666666-6666-4666-8666-666666666666",
      session: { ...session, revision: session.revision + 1 },
      expectedRevision: session.revision + 1,
      transition: {
        type: "resume",
        sessionId: session.id,
        expectedRevision: session.revision + 1,
      },
    });

    const transition = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "REVISION_CONFLICT" as const,
        message: "stale",
      },
    }));

    vi.stubGlobal("navigator", { onLine: true });
    const result = await flushFocusOfflineQueue(
      {} as SupabaseClient<Database>,
      "user-1",
      { transition },
    );
    expect(result.conflicts).toBe(1);
    expect(result.blocked).toBe(true);
    expect(result.synced).toBe(0);
    // Conflicted action dropped; following same-session actions dropped too.
    expect(getQueuedFocusTransitions("user-1")).toHaveLength(0);
    expect(transition).toHaveBeenCalledTimes(1);
  });

  it("keeps the queue when still offline", async () => {
    const session = startSession();
    enqueueFocusTransition({
      userId: "user-1",
      actionId: "77777777-7777-4777-8777-777777777777",
      session,
      expectedRevision: session.revision,
      transition: {
        type: "pause",
        sessionId: session.id,
        expectedRevision: session.revision,
      },
    });
    vi.stubGlobal("navigator", { onLine: false });
    const result = await flushFocusOfflineQueue(
      {} as SupabaseClient<Database>,
      "user-1",
    );
    expect(result.synced).toBe(0);
    expect(result.remaining).toBe(1);
  });
});
