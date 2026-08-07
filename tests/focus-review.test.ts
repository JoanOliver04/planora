import { describe, expect, it } from "vitest";
import {
  addDistraction,
  buildSessionReviewSummary,
  emptyReviewDraft,
  parseFocusOutcome,
  removeDistractionAt,
} from "@/features/focus/focus-review";
import {
  createStartedSession,
  applyFocusAction,
} from "@/features/focus/state-machine";
import {
  FOCUS_MAX_DISTRACTIONS,
  FOCUS_MAX_DISTRACTION_LENGTH,
} from "@/features/focus/validation";

function idFactory(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function startSession(now = Date.parse("2026-08-07T10:00:00.000Z")) {
  return createStartedSession(
    {
      mode: "countdown",
      focusDurationSec: 25 * 60,
      title: "Study English",
      taskId: "33333333-3333-4333-8333-333333333333",
      linkSnapshot: { taskTitle: "Study English" },
    },
    "user-1",
    {
      createId: idFactory("r"),
      now,
      sessionId: "session-review",
      intervalId: "interval-review",
    },
  );
}

describe("focus session review", () => {
  it("summarises planned vs real focus time", () => {
    const started = startSession();
    const ended = applyFocusAction(
      started,
      { type: "complete" },
      {
        expectedRevision: started.revision,
        now: Date.parse("2026-08-07T10:10:00.000Z"),
      },
    ).session;

    const summary = buildSessionReviewSummary(ended);
    expect(summary.focusSec).toBe(10 * 60);
    expect(summary.plannedFocusSec).toBe(25 * 60);
    expect(summary.plannedVsActualSec).toBe(10 * 60 - 25 * 60);
    expect(summary.taskTitle).toBe("Study English");
    expect(summary.intention).toBe("Study English");
    expect(summary.status).toBe("completed");
  });

  it("parks distractions without pausing the timer state", () => {
    const session = startSession();
    expect(session.status).toBe("running");
    const first = addDistraction(session.distractions, "  reply email  ");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.distractions).toEqual(["reply email"]);
    const second = addDistraction(first.distractions, "look up concept");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.distractions).toHaveLength(2);
    expect(removeDistractionAt(second.distractions, 0)).toEqual([
      "look up concept",
    ]);
  });

  it("enforces distraction limits and trims length", () => {
    const filled = Array.from(
      { length: FOCUS_MAX_DISTRACTIONS },
      (_, i) => `item ${i}`,
    );
    expect(addDistraction(filled, "one more")).toEqual({
      ok: false,
      reason: "limit",
    });
    expect(addDistraction([], "   ")).toEqual({ ok: false, reason: "empty" });
    const long = "x".repeat(FOCUS_MAX_DISTRACTION_LENGTH + 20);
    const added = addDistraction([], long);
    expect(added.ok).toBe(true);
    if (added.ok) {
      expect(added.distractions[0]).toHaveLength(FOCUS_MAX_DISTRACTION_LENGTH);
    }
  });

  it("reads empty review drafts and outcome labels", () => {
    const session = startSession();
    const draft = emptyReviewDraft({
      ...session,
      notes: "private",
      subjectiveFocus: 4,
      linkSnapshot: {
        ...session.linkSnapshot,
        outcome: "progress",
        nextStep: "Review notes",
      },
    });
    expect(draft.notes).toBe("private");
    expect(draft.subjectiveFocus).toBe(4);
    expect(draft.outcome).toBe("progress");
    expect(draft.nextStep).toBe("Review notes");
    expect(parseFocusOutcome("blocked")).toBe("blocked");
    expect(parseFocusOutcome("nope")).toBeNull();
  });

  it("keeps cancelled sessions as partial history", () => {
    const started = startSession();
    const cancelled = applyFocusAction(
      started,
      { type: "cancel" },
      {
        expectedRevision: started.revision,
        now: Date.parse("2026-08-07T10:05:00.000Z"),
      },
    ).session;
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.focusSec).toBe(5 * 60);
    expect(cancelled.endedAt).toBeTruthy();
  });
});
