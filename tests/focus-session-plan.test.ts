import { describe, expect, it } from "vitest";
import {
  applyFocusAction,
  createStartedSession,
} from "@/features/focus/state-machine";
import {
  currentSegment,
  hasStructuredPlan,
  moveSegment,
  SESSION_PLAN_TEMPLATES,
  summarizePlanRuntime,
  totalPlannedSec,
  calculatePlanTotals,
  validateStructuredPlan,
} from "@/features/focus/session-plan";
import { shouldAutoStartNextPhase } from "@/features/focus/engine";
import { focusSegmentSchema } from "@/features/focus/validation";
import type { FocusSegment } from "@/features/focus/types";

function idFactory(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

const samplePlan: FocusSegment[] = [
  {
    name: "Warm-up",
    emoji: "🔥",
    kind: "focus",
    durationSec: 10 * 60,
    description: null,
    autoAdvance: true,
  },
  {
    name: "Open practice",
    emoji: "🎹",
    kind: "focus",
    durationSec: null,
    description: "No fixed duration",
    autoAdvance: false,
  },
  {
    name: "Break",
    emoji: "☕",
    kind: "break",
    durationSec: 5 * 60,
    description: null,
    autoAdvance: true,
  },
];

describe("structured session plans", () => {
  it("validates plan invariants and separates focus from break totals", () => {
    expect(calculatePlanTotals(samplePlan)).toEqual({
      focusSec: 600,
      breakSec: 300,
      totalSec: 900,
      hasOpenFocus: true,
    });
    expect(validateStructuredPlan(samplePlan)).toBeNull();
    expect(validateStructuredPlan([])).toBe("plan_required");
    expect(
      validateStructuredPlan([
        { name: "Break", kind: "break", durationSec: 300, autoAdvance: true },
      ]),
    ).toBe("focus_block_required");
    expect(
      validateStructuredPlan([
        { name: "Break", kind: "break", durationSec: null, autoAdvance: false },
      ]),
    ).toBe("break_duration_required");
  });

  it("normalizes legacy segment shapes", () => {
    const parsed = focusSegmentSchema.parse({
      kind: "short_break",
      durationSec: 300,
      label: "Pause",
    });
    expect(parsed).toMatchObject({
      kind: "break",
      name: "Pause",
      durationSec: 300,
      autoAdvance: true,
    });
  });

  it("starts on the first plan segment and advances in order", () => {
    const createId = idFactory("p");
    const started = createStartedSession(
      {
        mode: "structured_plan",
        focusDurationSec: 25 * 60,
        segments: samplePlan,
        title: "Practice",
      },
      "user-1",
      {
        createId,
        now: Date.parse("2026-08-07T10:00:00.000Z"),
        sessionId: "session-plan",
        intervalId: "interval-0",
      },
    );
    expect(hasStructuredPlan(started)).toBe(true);
    expect(currentSegment(started)?.name).toBe("Warm-up");
    expect(started.currentPhaseKind).toBe("focus");
    expect(started.intervals[0]?.plannedDurationSec).toBe(10 * 60);
    expect(shouldAutoStartNextPhase(started)).toBe(false);

    const advanced = applyFocusAction(
      started,
      { type: "finish_phase" },
      {
        expectedRevision: started.revision,
        now: Date.parse("2026-08-07T10:10:00.000Z"),
        createId,
      },
    ).session;
    expect(currentSegment(advanced)?.name).toBe("Open practice");
    expect(advanced.intervals[1]?.plannedDurationSec).toBeNull();
    expect(shouldAutoStartNextPhase(advanced)).toBe(false);

    const skipped = applyFocusAction(
      advanced,
      { type: "skip_segment" },
      {
        expectedRevision: advanced.revision,
        now: Date.parse("2026-08-07T10:12:00.000Z"),
        createId,
      },
    );
    expect(skipped.events).toContain("segment_skipped");
    expect(currentSegment(skipped.session)?.name).toBe("Break");
    expect(skipped.session.status).toBe("on_break");
  });

  it("completes when the last plan segment finishes", () => {
    const createId = idFactory("z");
    let session = createStartedSession(
      {
        mode: "countdown",
        segments: [
          {
            name: "Only",
            kind: "focus",
            durationSec: 60,
            autoAdvance: true,
          },
        ],
      },
      "user-1",
      {
        createId,
        now: Date.parse("2026-08-07T10:00:00.000Z"),
        sessionId: "session-one",
        intervalId: "iv-one",
      },
    );
    session = applyFocusAction(
      session,
      { type: "finish_phase" },
      {
        expectedRevision: session.revision,
        now: Date.parse("2026-08-07T10:01:00.000Z"),
        createId,
      },
    ).session;
    expect(session.status).toBe("completed");
  });

  it("summarizes planned vs actual and reorders segments", () => {
    const createId = idFactory("s");
    const started = createStartedSession(
      {
        mode: "countdown",
        segments: samplePlan.slice(0, 1),
        focusDurationSec: 600,
      },
      "user-1",
      {
        createId,
        now: Date.parse("2026-08-07T10:00:00.000Z"),
        sessionId: "session-sum",
        intervalId: "iv-sum",
      },
    );
    const ended = applyFocusAction(
      started,
      { type: "complete" },
      {
        expectedRevision: started.revision,
        now: Date.parse("2026-08-07T10:04:00.000Z"),
        createId,
      },
    ).session;
    const rows = summarizePlanRuntime(ended);
    expect(rows[0]?.plannedSec).toBe(600);
    expect(rows[0]?.actualSec).toBe(240);
    expect(rows[0]?.skippedEarly).toBe(true);

    expect(moveSegment(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(totalPlannedSec(SESSION_PLAN_TEMPLATES[0].segments)).toBeGreaterThan(
      0,
    );
  });
});
