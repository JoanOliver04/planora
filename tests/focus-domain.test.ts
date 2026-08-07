import { describe, expect, it } from "vitest";
import { FocusError, isFocusError } from "@/features/focus/errors";
import { calculateWeeklyGoalProgress } from "@/features/focus/goals";
import {
  applyFocusAction,
  createStartedSession,
  recoverFocusSession,
} from "@/features/focus/state-machine";
import {
  deriveSessionClock,
  elapsedFocusSec,
  elapsedPausedSec,
  isPhaseComplete,
  remainingPhaseSec,
  sessionSummary,
} from "@/features/focus/time";
import type { FocusSession } from "@/features/focus/types";
import { startFocusSessionSchema } from "@/features/focus/validation";

function idFactory(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function startCountdown(
  overrides: Partial<Parameters<typeof createStartedSession>[0]> = {},
  now = Date.parse("2026-08-07T10:00:00.000Z"),
) {
  const createId = idFactory("c");
  return createStartedSession(
    {
      mode: "countdown",
      focusDurationSec: 25 * 60,
      title: "Deep work",
      ...overrides,
    },
    "user-1",
    { createId, now, sessionId: "session-1", intervalId: "interval-1" },
  );
}

function startStopwatch(now = Date.parse("2026-08-07T10:00:00.000Z")) {
  return createStartedSession(
    { mode: "stopwatch", title: "Free focus" },
    "user-1",
    {
      createId: idFactory("s"),
      now,
      sessionId: "session-sw",
      intervalId: "interval-sw",
    },
  );
}

function startCycles(
  overrides: Partial<Parameters<typeof createStartedSession>[0]> = {},
  now = Date.parse("2026-08-07T10:00:00.000Z"),
) {
  return createStartedSession(
    {
      mode: "cycles",
      focusDurationSec: 25 * 60,
      shortBreakSec: 5 * 60,
      longBreakSec: 15 * 60,
      cyclesBeforeLongBreak: 2,
      targetCycles: 4,
      autoStartBreaks: true,
      autoStartFocus: true,
      ...overrides,
    },
    "user-1",
    {
      createId: idFactory("cy"),
      now,
      sessionId: "session-cy",
      intervalId: "interval-cy",
    },
  );
}

describe("focus domain layer", () => {
  it("1. runs a normal countdown without drift", () => {
    const start = Date.parse("2026-08-07T10:00:00.000Z");
    const session = startCountdown({}, start);
    const at10 = start + 10 * 60 * 1000;
    const clock = deriveSessionClock(session, at10);
    expect(clock.focusElapsedSec).toBe(600);
    expect(clock.remainingSec).toBe(15 * 60);
    expect(clock.phase.progress).toBeCloseTo(0.4, 5);
    expect(isPhaseComplete(session, at10)).toBe(false);
    expect(isPhaseComplete(session, start + 25 * 60 * 1000)).toBe(true);
  });

  it("2. supports a stopwatch without required duration", () => {
    const start = Date.parse("2026-08-07T12:00:00.000Z");
    const session = startStopwatch(start);
    expect(session.mode).toBe("stopwatch");
    expect(session.plannedFocusSec).toBeNull();
    const later = start + 90 * 60 * 1000;
    const clock = deriveSessionClock(session, later);
    expect(clock.focusElapsedSec).toBe(90 * 60);
    expect(clock.remainingSec).toBeNull();
    expect(clock.phase.progress).toBe(0);
  });

  it("3. handles multiple pause and resume cycles", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    let session = startCountdown({}, t0);
    const createId = idFactory("p");

    // work 5 min
    let result = applyFocusAction(session, { type: "pause" }, {
      now: t0 + 5 * 60 * 1000,
      createId,
      expectedRevision: session.revision,
    });
    session = result.session;
    expect(session.status).toBe("paused");
    expect(elapsedFocusSec(session, t0 + 5 * 60 * 1000)).toBe(5 * 60);

    // pause 2 min
    result = applyFocusAction(session, { type: "resume" }, {
      now: t0 + 7 * 60 * 1000,
      createId,
      expectedRevision: session.revision,
    });
    session = result.session;
    expect(session.status).toBe("running");
    expect(elapsedPausedSec(session, t0 + 7 * 60 * 1000)).toBe(2 * 60);
    // Remaining planned focus after 5 min of 25 → 20 min
    expect(session.intervals.at(-1)?.plannedDurationSec).toBe(20 * 60);

    // work 3 min more, pause again
    result = applyFocusAction(session, { type: "pause" }, {
      now: t0 + 10 * 60 * 1000,
      createId,
      expectedRevision: session.revision,
    });
    session = result.session;
    result = applyFocusAction(session, { type: "resume" }, {
      now: t0 + 11 * 60 * 1000,
      createId,
      expectedRevision: session.revision,
    });
    session = result.session;
    const now = t0 + 11 * 60 * 1000;
    expect(elapsedFocusSec(session, now)).toBe(8 * 60);
    expect(elapsedPausedSec(session, now)).toBe(3 * 60);
    expect(session.intervals.filter((i) => i.kind === "pause")).toHaveLength(2);
  });

  it("4. recovers after several minutes in the background", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    const session = startCountdown({ focusDurationSec: 10 * 60 }, t0);
    // 30 minutes later: countdown should complete on recover
    const later = t0 + 30 * 60 * 1000;
    const recovered = recoverFocusSession(session, later, idFactory("r"));
    expect(recovered.recovered).toBe(true);
    expect(recovered.session.status).toBe("completed");
    expect(recovered.session.focusSec).toBe(10 * 60);
    expect(recovered.events).toContain("recovered");
  });

  it("5. advances short break then long break in cycles", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    let session = startCycles(
      {
        focusDurationSec: 60,
        shortBreakSec: 30,
        longBreakSec: 90,
        cyclesBeforeLongBreak: 2,
        targetCycles: 4,
        autoStartBreaks: true,
        autoStartFocus: true,
      },
      t0,
    );
    const createId = idFactory("cyc");

    // finish first focus → short break
    let result = applyFocusAction(session, { type: "finish_phase" }, {
      now: t0 + 60_000,
      createId,
      expectedRevision: session.revision,
    });
    session = result.session;
    expect(session.status).toBe("on_break");
    expect(session.currentPhaseKind).toBe("short_break");

    // finish short break → focus 2
    result = applyFocusAction(session, { type: "finish_phase" }, {
      now: t0 + 90_000,
      createId,
      expectedRevision: session.revision,
    });
    session = result.session;
    expect(session.status).toBe("running");
    expect(session.currentCycle).toBe(2);

    // finish focus 2 → long break (every 2)
    result = applyFocusAction(session, { type: "finish_phase" }, {
      now: t0 + 150_000,
      createId,
      expectedRevision: session.revision,
    });
    session = result.session;
    expect(session.status).toBe("on_break");
    expect(session.currentPhaseKind).toBe("long_break");
    expect(session.intervals.at(-1)?.plannedDurationSec).toBe(90);
  });

  it("6. skips a break and returns to focus", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    let session = startCycles(
      { focusDurationSec: 60, shortBreakSec: 300, targetCycles: null },
      t0,
    );
    const createId = idFactory("sk");
    session = applyFocusAction(session, { type: "finish_phase" }, {
      now: t0 + 60_000,
      createId,
      expectedRevision: session.revision,
    }).session;
    expect(session.status).toBe("on_break");

    session = applyFocusAction(session, { type: "skip_break" }, {
      now: t0 + 70_000,
      createId,
      expectedRevision: session.revision,
    }).session;
    expect(session.status).toBe("running");
    expect(session.currentPhaseKind).toBe("focus");
    expect(elapsedFocusSec(session, t0 + 70_000)).toBe(60);
  });

  it("7. extends an active break", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    let session = startCycles(
      { focusDurationSec: 60, shortBreakSec: 120, targetCycles: null },
      t0,
    );
    const createId = idFactory("ex");
    session = applyFocusAction(session, { type: "finish_phase" }, {
      now: t0 + 60_000,
      createId,
      expectedRevision: session.revision,
    }).session;
    expect(session.intervals.at(-1)?.plannedDurationSec).toBe(120);

    session = applyFocusAction(
      session,
      { type: "extend_break", extraSec: 60 },
      {
        now: t0 + 90_000,
        createId,
        expectedRevision: session.revision,
      },
    ).session;
    expect(session.status).toBe("on_break");
    expect(session.intervals.at(-1)?.plannedDurationSec).toBe(180);
    expect(remainingPhaseSec(session, t0 + 90_000)).toBe(150);
  });

  it("8. completes manually before the planned end", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    let session = startCountdown({ focusDurationSec: 50 * 60 }, t0);
    const createId = idFactory("cm");
    session = applyFocusAction(
      session,
      { type: "complete", notes: "Good enough" },
      {
        now: t0 + 12 * 60 * 1000,
        createId,
        expectedRevision: session.revision,
      },
    ).session;
    expect(session.status).toBe("completed");
    expect(session.focusSec).toBe(12 * 60);
    expect(session.notes).toBe("Good enough");
    expect(session.endedAt).toBe(new Date(t0 + 12 * 60 * 1000).toISOString());
    const summary = sessionSummary(session);
    expect(summary.focusSec).toBe(12 * 60);
  });

  it("9. keeps correct elapsed time across local midnight", () => {
    // 23:30 Madrid ≈ 21:30 UTC in August (CEST, UTC+2)
    const start = Date.parse("2026-08-06T21:30:00.000Z");
    const session = startCountdown({ focusDurationSec: 90 * 60 }, start);
    const afterMidnight = Date.parse("2026-08-07T00:15:00.000Z");
    // 2h 45m = 9900s
    expect(elapsedFocusSec(session, afterMidnight)).toBe(2 * 3600 + 45 * 60);
    const clock = deriveSessionClock(session, afterMidnight);
    expect(clock.focusElapsedSec).toBe(9900);
  });

  it("10. uses absolute timestamps so DST wall-clock shifts do not corrupt elapsed", () => {
    // Europe/Madrid springs forward 2026-03-29 02:00 → 03:00 local.
    // Domain elapsed is always based on UTC instants.
    const before = Date.parse("2026-03-29T00:30:00.000Z"); // 01:30 local
    const session = startCountdown({ focusDurationSec: 3 * 3600 }, before);
    const after = Date.parse("2026-03-29T02:30:00.000Z"); // 04:30 local after jump
    // Real elapsed = 2 hours, not 3 wall-clock hours.
    expect(elapsedFocusSec(session, after)).toBe(2 * 3600);
    expect(remainingPhaseSec(session, after)).toBe(1 * 3600);
  });

  it("11. attributes weekly goals using a non-UTC timezone", () => {
    const goal = {
      targetFocusSec: 3600,
      timezone: "America/New_York",
      weekStartsOn: 1 as const,
    };
    // Monday 2026-08-03 22:00 UTC = still Monday evening in NY (UTC-4)
    const sessionA = startCountdown(
      { focusDurationSec: 1800 },
      Date.parse("2026-08-03T22:00:00.000Z"),
    );
    const completedA: FocusSession = applyFocusAction(
      sessionA,
      { type: "complete" },
      {
        now: Date.parse("2026-08-03T22:30:00.000Z"),
        createId: idFactory("g"),
        expectedRevision: 1,
      },
    ).session;

    // Sunday 2026-08-02 late UTC might be previous week depending on TZ
    const sessionB = startCountdown(
      { focusDurationSec: 1800 },
      Date.parse("2026-08-02T03:00:00.000Z"),
    );
    const completedB: FocusSession = applyFocusAction(
      sessionB,
      { type: "complete" },
      {
        now: Date.parse("2026-08-02T03:20:00.000Z"),
        createId: idFactory("g2"),
        expectedRevision: 1,
      },
    ).session;

    const progress = calculateWeeklyGoalProgress(
      goal,
      [completedA, completedB],
      new Date("2026-08-05T15:00:00.000Z"),
    );
    expect(progress.timezone).toBe("America/New_York");
    expect(progress.weekStart <= progress.weekEnd).toBe(true);
    // At least the Monday NY session counts toward that week.
    expect(progress.completedFocusSec).toBeGreaterThanOrEqual(30 * 60);
  });

  it("12. rejects invalid transitions without mutating state", () => {
    const session = startCountdown();
    expect(() =>
      applyFocusAction(session, { type: "resume" }, {
        expectedRevision: session.revision,
      }),
    ).toThrow(FocusError);
    try {
      applyFocusAction(session, { type: "skip_break" }, {
        expectedRevision: session.revision,
      });
      expect.unreachable("should throw");
    } catch (error) {
      expect(isFocusError(error)).toBe(true);
      if (isFocusError(error)) expect(error.code).toBe("INVALID_TRANSITION");
    }
    // original untouched
    expect(session.status).toBe("running");
    expect(session.revision).toBe(1);
  });

  it("13. recovers an active multi-phase cycle session after suspension", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    const session = startCycles(
      {
        focusDurationSec: 60,
        shortBreakSec: 30,
        longBreakSec: 90,
        cyclesBeforeLongBreak: 4,
        targetCycles: 3,
        autoStartBreaks: true,
        autoStartFocus: true,
      },
      t0,
    );
    // Suspend for 3 minutes: focus 60s + break 30s + focus 60s + break 30s...
    const later = t0 + 3 * 60 * 1000;
    const recovered = recoverFocusSession(session, later, idFactory("rec"));
    expect(recovered.recovered).toBe(true);
    expect(["running", "on_break", "completed"]).toContain(
      recovered.session.status,
    );
    // Totals must come from closed intervals, not a ticking counter.
    expect(recovered.session.focusSec).toBeGreaterThan(0);
    const open = recovered.session.intervals.filter((i) => i.endedAt == null);
    expect(open.length).toBeLessThanOrEqual(1);
  });

  it("14. does not drift when render intervals are delayed", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    const session = startCountdown({ focusDurationSec: 600 }, t0);
    // UI "ticks" irregularly: 0s, 1.8s, 5s, 12s — truth follows wall clock.
    const samples = [0, 1800, 5000, 12_000].map((offset) =>
      deriveSessionClock(session, t0 + offset),
    );
    expect(samples[0].focusElapsedSec).toBe(0);
    expect(samples[1].focusElapsedSec).toBe(1);
    expect(samples[2].focusElapsedSec).toBe(5);
    expect(samples[3].focusElapsedSec).toBe(12);
    // Delayed frames never invent extra seconds.
    expect(samples[3].remainingSec).toBe(600 - 12);
  });

  it("15. rejects stale concurrency revisions", () => {
    const session = startCountdown();
    expect(() =>
      applyFocusAction(session, { type: "pause" }, {
        expectedRevision: session.revision + 5,
        now: Date.now(),
        createId: idFactory("rev"),
      }),
    ).toThrowError(/updated elsewhere/i);

    try {
      applyFocusAction(session, { type: "pause" }, {
        expectedRevision: 99,
        createId: idFactory("rev2"),
      });
    } catch (error) {
      expect(isFocusError(error)).toBe(true);
      if (isFocusError(error)) expect(error.code).toBe("REVISION_CONFLICT");
    }

    const paused = applyFocusAction(session, { type: "pause" }, {
      expectedRevision: 1,
      createId: idFactory("rev3"),
      now: Date.parse("2026-08-07T10:01:00.000Z"),
    }).session;
    expect(paused.revision).toBe(2);

    expect(() =>
      applyFocusAction(paused, { type: "resume" }, {
        expectedRevision: 1,
        createId: idFactory("rev4"),
      }),
    ).toThrow(FocusError);
  });

  it("validates start payloads with Zod", () => {
    const ok = startFocusSessionSchema.safeParse({
      mode: "countdown",
      focusDurationSec: 1500,
    });
    expect(ok.success).toBe(true);

    const bad = startFocusSessionSchema.safeParse({
      mode: "countdown",
    });
    expect(bad.success).toBe(false);

    const cycles = startFocusSessionSchema.safeParse({
      mode: "cycles",
      focusDurationSec: 1500,
      shortBreakSec: 300,
    });
    expect(cycles.success).toBe(true);
  });

  it("blocks starting when another session is already active", () => {
    const active = startCountdown();
    expect(() =>
      applyFocusAction(active, {
        type: "start",
        input: { mode: "stopwatch" },
        userId: "user-1",
      }),
    ).toThrow(FocusError);
  });
});
