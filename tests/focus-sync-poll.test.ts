import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusSession } from "@/features/focus/types";

const state = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  userError: null as { message: string } | null,
  sessionReads: 0,
  head: {
    data: null as Record<string, unknown> | null,
    error: null as { message: string } | null,
  },
  full: {
    data: null as Record<string, unknown> | null,
    error: null as { message: string } | null,
  },
  intervals: {
    data: [] as unknown[],
    error: null as { message: string } | null,
  },
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.user },
        error: state.userError,
      }),
    },
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const result = () => {
        if (table === "focus_intervals") return state.intervals;
        state.sessionReads += 1;
        return state.sessionReads === 1 ? state.head : state.full;
      };
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.in = () => builder;
      builder.order = () => builder;
      builder.maybeSingle = () => Promise.resolve(result());
      builder.then = (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(result()).then(onFulfilled, onRejected);
      return builder;
    },
  }),
}));

import {
  FocusPollError,
  pollActiveFocusSessionHead,
  reconcileFocusSessionFromServer,
} from "@/features/focus/focus-sync-poll";

function localSession(): FocusSession {
  return {
    id: "local-session",
    status: "running",
    revision: 1,
  } as FocusSession;
}

describe("focus session poll", () => {
  beforeEach(() => {
    state.user = { id: "user-1" };
    state.userError = null;
    state.sessionReads = 0;
    state.head = { data: null, error: null };
    state.full = { data: null, error: null };
    state.intervals = { data: [], error: null };
  });

  it("keeps the local session when the active-row query fails", async () => {
    state.head = { data: null, error: { message: "500" } };
    const local = localSession();
    await expect(pollActiveFocusSessionHead()).rejects.toBeInstanceOf(
      FocusPollError,
    );
    state.sessionReads = 0;
    const result = await reconcileFocusSessionFromServer(local);
    expect(result).toEqual({
      changed: false,
      session: local,
      reason: "unchanged",
    });
  });

  it("keeps the local session when authentication fails", async () => {
    state.user = null;
    state.userError = { message: "Auth session missing" };
    const local = localSession();
    const result = await reconcileFocusSessionFromServer(local);
    expect(result).toEqual({
      changed: false,
      session: local,
      reason: "unchanged",
    });
    expect(state.sessionReads).toBe(0);
  });

  it("ends the local session only when the server confirms there is no active row", async () => {
    state.head = { data: null, error: null };
    const result = await reconcileFocusSessionFromServer(localSession());
    expect(result).toEqual({
      changed: true,
      session: null,
      reason: "ended",
    });
  });

  it("keeps the local session when the full fetch fails after a changed head", async () => {
    state.head = {
      data: {
        id: "local-session",
        revision: 4,
        status: "paused",
        updated_at: "2026-08-07T10:00:00.000Z",
      },
      error: null,
    };
    state.full = { data: null, error: { message: "500" } };
    const local = localSession();
    const result = await reconcileFocusSessionFromServer(local);
    expect(result).toEqual({
      changed: false,
      session: local,
      reason: "unchanged",
    });
    expect(state.sessionReads).toBe(2);
  });

  it("keeps the local session when interval loading fails", async () => {
    state.head = {
      data: {
        id: "other-session",
        revision: 2,
        status: "running",
        updated_at: "2026-08-07T10:00:00.000Z",
      },
      error: null,
    };
    state.full = {
      data: {
        id: "other-session",
        revision: 2,
        status: "running",
      },
      error: null,
    };
    state.intervals = { data: [], error: { message: "500" } };
    const local = localSession();
    const result = await reconcileFocusSessionFromServer(local);
    expect(result).toEqual({
      changed: false,
      session: local,
      reason: "unchanged",
    });
  });
});
