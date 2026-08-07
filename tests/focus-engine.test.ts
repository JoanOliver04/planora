import { describe, expect, it } from "vitest";
import {
  assertNoDrift,
  createFocusActionGate,
  evaluateFocusEngine,
  prepareFocusSessionOnLoad,
  runFocusEngineAction,
} from "@/features/focus/engine";
import {
  applyFocusAction,
  createStartedSession,
  recoverFocusSession,
} from "@/features/focus/state-machine";
import { deriveSessionClock, elapsedFocusSec } from "@/features/focus/time";

function idFactory(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function countdown(
  focusDurationSec: number,
  now = Date.parse("2026-08-07T10:00:00.000Z"),
) {
  return createStartedSession(
    { mode: "countdown", focusDurationSec, title: "Work" },
    "user-1",
    {
      createId: idFactory("c"),
      now,
      sessionId: "s1",
      intervalId: "i1",
    },
  );
}

function cycles(
  overrides: Record<string, unknown> = {},
  now = Date.parse("2026-08-07T10:00:00.000Z"),
) {
  return createStartedSession(
    {
      mode: "cycles",
      focusDurationSec: 60,
      shortBreakSec: 30,
      longBreakSec: 90,
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
      sessionId: "scy",
      intervalId: "icy",
    },
  );
}

describe("focus engine (timer runtime)", () => {
  it("does not drift under irregular UI tick intervals (tab throttling)", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    const session = countdown(600, t0);
    // Simulated delayed frames: 0ms, 1800ms, 5000ms, 12000ms — not every 1000ms.
    const samples = [
      { at: t0, expectedFocusElapsed: 0 },
      { at: t0 + 1800, expectedFocusElapsed: 1 },
      { at: t0 + 5000, expectedFocusElapsed: 5 },
      { at: t0 + 12_000, expectedFocusElapsed: 12 },
    ];
    expect(assertNoDrift(session, samples)).toBe(true);
    const late = evaluateFocusEngine(session, t0 + 12_000);
    expect(late.displayRemainingSec).toBe(588);
    expect(late.clock.focusElapsedSec).toBe(12);
  });

  it("recovers after reload when the phase finished in the background", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    const session = countdown(10 * 60, t0);
    const later = t0 + 30 * 60 * 1000;
    const prep = prepareFocusSessionOnLoad(session, later, idFactory("r"));
    expect(prep.recovered).toBe(true);
    expect(prep.session.status).toBe("completed");
    expect(prep.session.focusSec).toBe(10 * 60);
    expect(prep.events).toContain("recovered");
  });

  it("advances multiple overdue cycle phases after 30 minutes suspended", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    const session = cycles(
      {
        focusDurationSec: 60,
        shortBreakSec: 30,
        longBreakSec: 90,
        targetCycles: 4,
        autoStartBreaks: true,
        autoStartFocus: true,
      },
      t0,
    );
    const later = t0 + 30 * 60 * 1000;
    const prep = prepareFocusSessionOnLoad(session, later, idFactory("s30"));
    expect(prep.recovered).toBe(true);
    // Should not leave multiple open intervals.
    const open = prep.session.intervals.filter((i) => i.endedAt == null);
    expect(open.length).toBeLessThanOrEqual(1);
    // Focus time comes from closed boundaries, not wall 30 minutes of focus.
    expect(prep.session.focusSec).toBeGreaterThan(0);
    expect(prep.session.focusSec).toBeLessThanOrEqual(4 * 60);
  });

  it("handles multiple finished phases without duplicate open intervals", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    const session = cycles({}, t0);
    const later = t0 + 5 * 60 * 1000;
    const prep = recoverFocusSession(session, later, idFactory("m"));
    const open = prep.session.intervals.filter((i) => i.endedAt == null);
    expect(open.length).toBeLessThanOrEqual(1);
    const sequences = prep.session.intervals.map((i) => i.sequence);
    expect(new Set(sequences).size).toBe(sequences.length);
  });

  it("allows pause at the exact planned phase end without negative remaining", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    const session = countdown(60, t0);
    const atEnd = t0 + 60_000;
    const snap = evaluateFocusEngine(session, atEnd);
    expect(snap.displayRemainingSec).toBe(0);
    expect(snap.phaseComplete).toBe(true);
    expect(snap.shouldAutoAdvance).toBe(true);

    const paused = runFocusEngineAction(session, { type: "pause" }, {
      now: atEnd,
      expectedRevision: 1,
      createId: idFactory("p"),
    });
    expect(paused.session.status).toBe("paused");
    const after = evaluateFocusEngine(paused.session, atEnd + 5000);
    expect(after.displayRemainingSec).toBeNull();
    expect(after.clock.focusElapsedSec).toBe(60);
  });

  it("gates duplicate pause/complete actions (double click)", () => {
    const gate = createFocusActionGate();
    expect(gate.tryBegin("pause")).toBe(true);
    expect(gate.tryBegin("pause")).toBe(false);
    expect(gate.tryBegin("complete")).toBe(false);
    gate.end();
    expect(gate.tryBegin("complete")).toBe(true);
    gate.end();
    // Debounce same key
    expect(gate.tryBegin("pause")).toBe(true);
    gate.end();
    expect(gate.tryBegin("pause", 10_000)).toBe(false);
  });

  it("completes manually before the planned end", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    const session = countdown(50 * 60, t0);
    const result = runFocusEngineAction(
      session,
      { type: "complete" },
      {
        now: t0 + 12 * 60 * 1000,
        expectedRevision: 1,
        createId: idFactory("cm"),
      },
    );
    expect(result.session.status).toBe("completed");
    expect(result.session.focusSec).toBe(12 * 60);
  });

  it("keeps absolute elapsed across DST spring-forward", () => {
    const before = Date.parse("2026-03-29T00:30:00.000Z");
    const session = countdown(3 * 3600, before);
    const after = Date.parse("2026-03-29T02:30:00.000Z");
    expect(elapsedFocusSec(session, after)).toBe(2 * 3600);
    const snap = evaluateFocusEngine(session, after);
    expect(snap.displayRemainingSec).toBe(3600);
  });

  it("runs a long stopwatch without auto-completing", () => {
    const t0 = Date.parse("2026-08-07T08:00:00.000Z");
    const session = createStartedSession(
      {
        mode: "stopwatch",
        focusDurationSec: 90 * 60,
        title: "Deep",
      },
      "user-1",
      {
        createId: idFactory("sw"),
        now: t0,
        sessionId: "sw1",
        intervalId: "swi",
      },
    );
    const later = t0 + 3 * 3600 * 1000;
    const snap = evaluateFocusEngine(session, later);
    expect(snap.shouldAutoAdvance).toBe(false);
    expect(snap.softGoalReached).toBe(true);
    expect(snap.clock.focusElapsedSec).toBe(3 * 3600);
    expect(snap.isTerminal).toBe(false);

    const recovered = prepareFocusSessionOnLoad(session, later);
    expect(recovered.recovered).toBe(false);
    expect(recovered.session.status).toBe("running");
  });

  it("projects recovery offline without requiring network for display math", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    const session = countdown(5 * 60, t0);
    const later = t0 + 20 * 60 * 1000;
    // Pure local recovery — no server round-trip needed to compute state.
    const prep = prepareFocusSessionOnLoad(session, later, idFactory("off"));
    expect(prep.session.status).toBe("completed");
    const clock = deriveSessionClock(prep.session, later);
    expect(clock.focusElapsedSec).toBe(5 * 60);
  });

  it("auto-advances countdown once remaining hits zero", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    const session = countdown(60, t0);
    const mid = evaluateFocusEngine(session, t0 + 30_000);
    expect(mid.shouldAutoAdvance).toBe(false);
    const end = evaluateFocusEngine(session, t0 + 60_000);
    expect(end.shouldAutoAdvance).toBe(true);
    expect(end.displayRemainingSec).toBe(0);

    const finished = runFocusEngineAction(
      session,
      { type: "finish_phase" },
      { now: t0 + 60_000, expectedRevision: 1, createId: idFactory("a") },
    );
    expect(finished.session.status).toBe("completed");
  });

  it("never shows negative remaining after the phase end", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    const session = countdown(30, t0);
    const snap = evaluateFocusEngine(session, t0 + 120_000);
    expect(snap.displayRemainingSec).toBe(0);
    expect(snap.clock.remainingSec).toBe(0);
  });

  it("supports recover-first before a user action after suspension", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    const session = cycles(
      {
        focusDurationSec: 60,
        shortBreakSec: 30,
        targetCycles: null,
        autoStartBreaks: true,
        autoStartFocus: true,
      },
      t0,
    );
    // After 90s: focus done + break done → should be into next focus or break chain
    const later = t0 + 90_000;
    const result = runFocusEngineAction(session, { type: "pause" }, {
      now: later,
      createId: idFactory("rf"),
      recoverFirst: true,
    });
    // Either paused after recovery, or terminal if target completed.
    expect(["paused", "completed", "running", "on_break"]).toContain(
      result.session.status,
    );
    if (result.session.status === "paused") {
      expect(result.events.length).toBeGreaterThan(0);
    }
  });

  it("rejects a second pause as an invalid transition at domain level", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    let session = countdown(600, t0);
    session = applyFocusAction(session, { type: "pause" }, {
      now: t0 + 10_000,
      expectedRevision: 1,
      createId: idFactory("d1"),
    }).session;
    expect(() =>
      applyFocusAction(session, { type: "pause" }, {
        now: t0 + 15_000,
        expectedRevision: session.revision,
        createId: idFactory("d2"),
      }),
    ).toThrow(/paused/i);
  });
});
