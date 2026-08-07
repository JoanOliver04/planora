import { describe, expect, it } from "vitest";
import {
  buildExtraBlockStartInput,
  countCompletedFocusBlocks,
  getCycleProgress,
  planNextPhase,
  summarizeEndedSession,
} from "@/features/focus/cycles";
import {
  evaluateFocusEngine,
  shouldAutoStartNextPhase,
} from "@/features/focus/engine";
import {
  applyFocusAction,
  createStartedSession,
  recoverFocusSession,
} from "@/features/focus/state-machine";
import { isMidSessionConfigLocked } from "@/features/focus/engine";

function idFactory(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function startCycles(
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
      sessionId: "s-cy",
      intervalId: "i-cy",
    },
  );
}

describe("focus cycles and breaks", () => {
  it("supports a single-cycle session that completes after one focus", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    let session = startCycles({ targetCycles: 1, shortBreakSec: 30 }, t0);
    session = applyFocusAction(
      session,
      { type: "finish_phase" },
      {
        now: t0 + 60_000,
        expectedRevision: session.revision,
        createId: idFactory("one"),
      },
    ).session;
    expect(session.status).toBe("completed");
    expect(countCompletedFocusBlocks(session)).toBe(1);
    const summary = summarizeEndedSession(session);
    expect(summary.reachedTarget).toBe(true);
  });

  it("runs four cycles with a long break every two focus blocks", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    let session = startCycles(
      {
        targetCycles: 4,
        cyclesBeforeLongBreak: 2,
        shortBreakSec: 30,
        longBreakSec: 90,
        focusDurationSec: 60,
      },
      t0,
    );
    const createId = idFactory("four");
    let now = t0;

    // focus 1 → short break
    now += 60_000;
    session = applyFocusAction(
      session,
      { type: "finish_phase" },
      {
        now,
        expectedRevision: session.revision,
        createId,
      },
    ).session;
    expect(session.currentPhaseKind).toBe("short_break");

    // break → focus 2
    now += 30_000;
    session = applyFocusAction(
      session,
      { type: "finish_phase" },
      {
        now,
        expectedRevision: session.revision,
        createId,
      },
    ).session;
    expect(session.status).toBe("running");

    // focus 2 → long break
    now += 60_000;
    session = applyFocusAction(
      session,
      { type: "finish_phase" },
      {
        now,
        expectedRevision: session.revision,
        createId,
      },
    ).session;
    expect(session.currentPhaseKind).toBe("long_break");
    expect(session.intervals.at(-1)?.plannedDurationSec).toBe(90);
  });

  it("skips a break and extends a break", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    let session = startCycles({ targetCycles: null }, t0);
    const createId = idFactory("sk");
    session = applyFocusAction(
      session,
      { type: "finish_phase" },
      {
        now: t0 + 60_000,
        expectedRevision: session.revision,
        createId,
      },
    ).session;
    expect(session.status).toBe("on_break");

    session = applyFocusAction(
      session,
      { type: "extend_break", extraSec: 120 },
      {
        now: t0 + 70_000,
        expectedRevision: session.revision,
        createId,
      },
    ).session;
    expect(session.intervals.at(-1)?.plannedDurationSec).toBe(150);

    session = applyFocusAction(
      session,
      { type: "skip_break" },
      {
        now: t0 + 80_000,
        expectedRevision: session.revision,
        createId,
      },
    ).session;
    expect(session.status).toBe("running");
    expect(session.currentPhaseKind).toBe("focus");
  });

  it("skips zero-length breaks automatically", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    let session = startCycles(
      { shortBreakSec: 0, longBreakSec: 0, targetCycles: 3 },
      t0,
    );
    session = applyFocusAction(
      session,
      { type: "finish_phase" },
      {
        now: t0 + 60_000,
        expectedRevision: session.revision,
        createId: idFactory("z"),
      },
    ).session;
    expect(session.status).toBe("running");
    expect(session.currentPhaseKind).toBe("focus");
    expect(countCompletedFocusBlocks(session)).toBe(1);
  });

  it("respects autoStartBreaks=false (manual handoff after focus)", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    const session = startCycles(
      { autoStartBreaks: false, autoStartFocus: true, focusDurationSec: 60 },
      t0,
    );
    expect(shouldAutoStartNextPhase(session)).toBe(false);
    const atEnd = evaluateFocusEngine(session, t0 + 60_000);
    expect(atEnd.phaseComplete).toBe(true);
    expect(atEnd.shouldAutoAdvance).toBe(false);
  });

  it("respects autoStartFocus=false during breaks", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    let session = startCycles(
      { autoStartBreaks: true, autoStartFocus: false, shortBreakSec: 30 },
      t0,
    );
    const createId = idFactory("af");
    session = applyFocusAction(
      session,
      { type: "finish_phase" },
      {
        now: t0 + 60_000,
        expectedRevision: session.revision,
        createId,
      },
    ).session;
    expect(session.status).toBe("on_break");
    expect(shouldAutoStartNextPhase(session)).toBe(false);
    const atEnd = evaluateFocusEngine(session, t0 + 90_000);
    expect(atEnd.shouldAutoAdvance).toBe(false);
  });

  it("recovers multiple finished phases after suspension", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    const session = startCycles(
      {
        focusDurationSec: 60,
        shortBreakSec: 30,
        targetCycles: 4,
        autoStartBreaks: true,
        autoStartFocus: true,
      },
      t0,
    );
    const recovered = recoverFocusSession(
      session,
      t0 + 10 * 60 * 1000,
      idFactory("rec"),
    );
    expect(recovered.recovered).toBe(true);
    const open = recovered.session.intervals.filter((i) => i.endedAt == null);
    expect(open.length).toBeLessThanOrEqual(1);
  });

  it("supports indefinite cycles and extra-block start payload", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    let session = startCycles({ targetCycles: null }, t0);
    const progress = getCycleProgress(session);
    expect(progress.indefinite).toBe(true);
    expect(progress.remainingFocusBlocks).toBeNull();

    session = applyFocusAction(
      session,
      { type: "complete" },
      {
        now: t0 + 45_000,
        expectedRevision: session.revision,
        createId: idFactory("ind"),
      },
    ).session;
    const extra = buildExtraBlockStartInput(session);
    expect(extra.mode).toBe("cycles");
    expect(extra.targetCycles).toBe(1);
    expect(extra.completeTaskOnEnd).toBe(false);
  });

  it("locks structural config mid-session and allows cue flags", () => {
    expect(isMidSessionConfigLocked("focusDurationSec")).toBe(true);
    expect(isMidSessionConfigLocked("mode")).toBe(true);
    expect(isMidSessionConfigLocked("autoStartBreaks")).toBe(false);
    expect(isMidSessionConfigLocked("soundEnabled")).toBe(false);
  });

  it("plans long break after N focus blocks for custom N", () => {
    const session = startCycles({ cyclesBeforeLongBreak: 3, targetCycles: 6 });
    const afterThree = planNextPhase(session, 3);
    expect(afterThree.kind).toBe("long_break");
    const afterOne = planNextPhase(session, 1);
    expect(afterOne.kind).toBe("short_break");
  });

  it("allows completing during a break without auto-completing tasks", () => {
    const t0 = Date.parse("2026-08-07T10:00:00.000Z");
    let session = startCycles({ completeTaskOnEnd: false }, t0);
    const createId = idFactory("cb");
    session = applyFocusAction(
      session,
      { type: "finish_phase" },
      {
        now: t0 + 60_000,
        expectedRevision: session.revision,
        createId,
      },
    ).session;
    expect(session.status).toBe("on_break");
    session = applyFocusAction(
      session,
      { type: "complete" },
      {
        now: t0 + 70_000,
        expectedRevision: session.revision,
        createId,
      },
    ).session;
    expect(session.status).toBe("completed");
    expect(session.completeTaskOnEnd).toBe(false);
    expect(session.taskCompletionApplied).toBe(false);
  });
});
