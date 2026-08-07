import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildFocusSyncEvent,
  decideRemoteSession,
  eventTypeForSession,
  FOCUS_CLIENT_ID_KEY,
  FOCUS_SYNC_STORAGE_KEY,
  getFocusClientId,
  isFocusSyncEvent,
  shouldRefetchFromPoll,
  controlModeAfterRemoteEvent,
  createFocusSyncBus,
} from "@/features/focus/focus-sync";
import {
  applyFocusAction,
  createStartedSession,
} from "@/features/focus/state-machine";
import type { FocusSession } from "@/features/focus/types";

function idFactory(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function sessionAt(
  revision: number,
  status: FocusSession["status"] = "running",
  id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
): FocusSession {
  const started = createStartedSession(
    {
      mode: "countdown",
      focusDurationSec: 300,
    },
    "user",
    {
      createId: idFactory("s"),
      now: Date.parse("2026-08-07T10:00:00.000Z"),
      sessionId: id,
      intervalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    },
  );
  if (status === "running" && revision === started.revision) return started;
  if (status === "paused") {
    const paused = applyFocusAction(
      started,
      { type: "pause" },
      {
        expectedRevision: started.revision,
        now: Date.parse("2026-08-07T10:00:10.000Z"),
        createId: idFactory("p"),
      },
    ).session;
    return { ...paused, revision };
  }
  if (status === "completed" || status === "cancelled") {
    const terminal = applyFocusAction(
      started,
      { type: status === "completed" ? "complete" : "cancel" },
      {
        expectedRevision: started.revision,
        now: Date.parse("2026-08-07T10:05:00.000Z"),
        createId: idFactory("t"),
      },
    ).session;
    return { ...terminal, revision };
  }
  return { ...started, revision, status };
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("decideRemoteSession", () => {
  it("applies a higher revision of the same session", () => {
    const local = sessionAt(2);
    const remote = sessionAt(3, "paused");
    expect(decideRemoteSession(local, remote)).toBe("apply");
  });

  it("ignores a stale lower revision (old tab returns hours later)", () => {
    const local = sessionAt(5);
    const remote = sessionAt(2, "paused");
    expect(decideRemoteSession(local, remote)).toBe("ignore");
  });

  it("clears local active state when remote session is gone", () => {
    expect(decideRemoteSession(sessionAt(1), null)).toBe("clear");
  });

  it("applies a different active session id (DB one-active winner)", () => {
    const local = sessionAt(
      1,
      "running",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    const remote = sessionAt(
      1,
      "running",
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
    expect(decideRemoteSession(local, remote)).toBe("apply");
  });

  it("starts from empty when remote is active", () => {
    expect(decideRemoteSession(null, sessionAt(1))).toBe("apply");
  });
});

describe("shouldRefetchFromPoll", () => {
  it("refetches when revision drifts", () => {
    expect(
      shouldRefetchFromPoll({
        local: sessionAt(2),
        remoteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        remoteRevision: 3,
        remoteStatus: "running",
      }),
    ).toBe(true);
  });

  it("skips refetch when head matches local", () => {
    const local = sessionAt(4);
    expect(
      shouldRefetchFromPoll({
        local,
        remoteId: local.id,
        remoteRevision: local.revision,
        remoteStatus: local.status,
      }),
    ).toBe(false);
  });

  it("refetches when remote active disappears", () => {
    expect(
      shouldRefetchFromPoll({
        local: sessionAt(1),
        remoteId: null,
        remoteRevision: null,
        remoteStatus: null,
      }),
    ).toBe(true);
  });
});

describe("takeover and concurrent writes", () => {
  it("bumps revision on takeover without changing phase", () => {
    const started = sessionAt(1);
    const result = applyFocusAction(
      started,
      { type: "takeover" },
      {
        expectedRevision: started.revision,
        now: Date.parse("2026-08-07T10:01:00.000Z"),
        createId: idFactory("tk"),
      },
    );
    expect(result.session.revision).toBe(started.revision + 1);
    expect(result.session.status).toBe(started.status);
    expect(result.events).toContain("takeover");
  });

  it("rejects simultaneous pause when expected revision is stale", () => {
    const started = sessionAt(1);
    const first = applyFocusAction(
      started,
      { type: "pause" },
      {
        expectedRevision: started.revision,
        now: Date.parse("2026-08-07T10:00:15.000Z"),
        createId: idFactory("a"),
      },
    );
    expect(first.session.status).toBe("paused");

    expect(() =>
      applyFocusAction(
        first.session,
        { type: "pause" },
        {
          expectedRevision: started.revision,
          now: Date.parse("2026-08-07T10:00:16.000Z"),
          createId: idFactory("b"),
        },
      ),
    ).toThrow(/updated elsewhere|revision/i);
  });

  it("rejects simultaneous complete on a stale revision", () => {
    const started = sessionAt(1);
    const paused = applyFocusAction(
      started,
      { type: "pause" },
      {
        expectedRevision: started.revision,
        now: Date.parse("2026-08-07T10:00:15.000Z"),
        createId: idFactory("c"),
      },
    ).session;

    expect(() =>
      applyFocusAction(
        paused,
        { type: "complete" },
        {
          expectedRevision: started.revision,
          now: Date.parse("2026-08-07T10:00:20.000Z"),
          createId: idFactory("d"),
        },
      ),
    ).toThrow();
  });
});

describe("focus sync bus helpers", () => {
  it("creates a stable per-tab client id", () => {
    const a = getFocusClientId();
    const b = getFocusClientId();
    expect(a).toBe(b);
    expect(window.sessionStorage.getItem(FOCUS_CLIENT_ID_KEY)).toBe(a);
  });

  it("validates event shape", () => {
    expect(
      isFocusSyncEvent({
        type: "session_updated",
        clientId: "x",
        sessionId: null,
        revision: 1,
        status: "running",
        at: 1,
      }),
    ).toBe(true);
    expect(isFocusSyncEvent({ type: "nope" })).toBe(false);
  });

  it("maps session lifecycle to event types", () => {
    expect(eventTypeForSession(sessionAt(1), "start")).toBe("session_started");
    expect(eventTypeForSession(sessionAt(1, "completed"), "end")).toBe(
      "session_ended",
    );
    expect(eventTypeForSession(sessionAt(1), "takeover")).toBe("takeover");
  });

  it("marks remote writers as follower control mode", () => {
    const event = buildFocusSyncEvent("other-tab", sessionAt(2), "takeover");
    expect(controlModeAfterRemoteEvent(event, "this-tab")).toBe("follower");
    expect(controlModeAfterRemoteEvent(event, "other-tab")).toBeNull();
  });

  it("publishes to localStorage fallback without throwing", () => {
    const received: unknown[] = [];
    const bus = createFocusSyncBus((event) => received.push(event));
    bus.publishSession(sessionAt(1), "session_updated");
    expect(window.localStorage.getItem(FOCUS_SYNC_STORAGE_KEY)).toContain(
      "session_updated",
    );
    // Own client is filtered.
    expect(received).toHaveLength(0);
    bus.close();
  });
});
