import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFocusHref,
  buildFocusShortcuts,
  draftFromQuickStart,
  pickNextFocusTask,
  resolveDeepLinkDraft,
} from "@/features/focus/focus-deep-link";
import {
  emptyFocusRecents,
  FOCUS_RECENTS_STORAGE_KEY,
  readFocusRecents,
  recordFocusStart,
} from "@/features/focus/focus-recents";
import type { FocusPreset } from "@/features/focus/types";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const preset = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userId: "user",
  name: "Deep work",
  emoji: "🎯",
  intention: null,
  mode: "countdown",
  focusDurationSec: 1500,
  shortBreakSec: null,
  longBreakSec: null,
  cyclesBeforeLongBreak: null,
  targetCycles: null,
  autoStartBreaks: true,
  autoStartFocus: false,
  soundEnabled: true,
  vibrationEnabled: true,
  notifyOnPhaseEnd: true,
  completeTaskOnSessionEnd: false,
  keepScreenAwake: false,
  preferFullscreen: false,
  segments: [],
  isFavorite: true,
  sortOrder: 0,
  defaultCategoryId: null,
  archivedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
} as FocusPreset;

describe("focus deep links", () => {
  it("builds continue, quick, task and preset hrefs", () => {
    expect(buildFocusHref({ continueSession: true })).toBe("/focus");
    expect(buildFocusHref({ quick: true })).toBe("/focus?start=quick");
    expect(
      buildFocusHref({
        taskId: "t1",
        date: "2026-08-07",
      }),
    ).toBe("/focus?taskId=t1&date=2026-08-07");
    expect(buildFocusHref({ presetId: preset.id })).toBe(
      `/focus?presetId=${preset.id}`,
    );
  });

  it("resolves quick and preset drafts and ignores deleted presets", () => {
    expect(
      resolveDeepLinkDraft({
        params: { start: "quick" },
        today: "2026-08-07",
        presets: [preset],
      }),
    ).toMatchObject({
      autoOpen: true,
      draft: { quickKey: "quick-25", focusDurationSec: 1500 },
    });

    expect(
      resolveDeepLinkDraft({
        params: { presetId: preset.id },
        today: "2026-08-07",
        presets: [preset],
      }).draft?.presetId,
    ).toBe(preset.id);

    expect(
      resolveDeepLinkDraft({
        params: { presetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        today: "2026-08-07",
        presets: [preset],
      }),
    ).toEqual({ draft: null, autoOpen: false });
  });

  it("resolves a task without category", () => {
    const resolved = resolveDeepLinkDraft({
      params: { taskId: "task-1", date: "2026-08-07" },
      today: "2026-08-07",
      presets: [],
      task: {
        id: "task-1",
        title: "No category",
        emoji: null,
        task_kind: "one_time",
        category_id: null,
        schedule_id: "sched-1",
        start_date: "2026-08-01",
        end_date: null,
        archived_at: null,
        recurrence_type: "once",
        recurrence_config: {},
      },
      category: null,
      schedule: { name: "Main" },
    });
    expect(resolved.autoOpen).toBe(true);
    expect(resolved.draft?.taskId).toBe("task-1");
    expect(resolved.draft?.linkSnapshot?.categoryName).toBeNull();
  });

  it("picks the next incomplete task including those without category", () => {
    const next = pickNextFocusTask(
      [
        {
          id: "done",
          title: "Done",
          emoji: null,
          archived_at: null,
        },
        {
          id: "open",
          title: "Open",
          emoji: "🎯",
          archived_at: null,
        },
      ],
      new Set(["done"]),
    );
    expect(next).toEqual({ id: "open", title: "Open", emoji: "🎯" });
  });

  it("limits idle shortcuts to three and continues when active", () => {
    expect(
      buildFocusShortcuts({
        hasActiveSession: true,
        day: "2026-08-07",
        nextTask: { id: "t", title: "T", emoji: null },
        lastPresetId: preset.id,
        lastPresetName: preset.name,
      }),
    ).toEqual([{ kind: "continue", href: "/focus" }]);

    const idle = buildFocusShortcuts({
      hasActiveSession: false,
      day: "2026-08-07",
      nextTask: { id: "t", title: "Next task", emoji: null },
      lastPresetId: preset.id,
      lastPresetName: preset.name,
      lastPresetStillExists: true,
    });
    expect(idle).toHaveLength(3);
    expect(idle.map((item) => item.kind)).toEqual([
      "quick",
      "nextTask",
      "lastPreset",
    ]);
  });

  it("omits a deleted last preset and falls back to open Focus", () => {
    const shortcuts = buildFocusShortcuts({
      hasActiveSession: false,
      day: "2026-08-07",
      nextTask: null,
      lastPresetId: preset.id,
      lastPresetName: "Gone",
      lastPresetStillExists: false,
    });
    expect(shortcuts.map((item) => item.kind)).toEqual(["quick", "openFocus"]);
  });

  it("exposes a quick-start draft", () => {
    expect(draftFromQuickStart().quickKey).toBe("quick-25");
  });
});

describe("focus recents storage", () => {
  it("starts empty and records the last start context", () => {
    expect(readFocusRecents()).toEqual(emptyFocusRecents());
    recordFocusStart({
      presetId: preset.id,
      presetName: "Deep work",
      taskId: "task-1",
      taskTitle: "Study",
      quickKey: "quick-25",
    });
    const stored = readFocusRecents();
    expect(stored.lastPresetId).toBe(preset.id);
    expect(stored.lastTaskTitle).toBe("Study");
    expect(stored.lastQuickKey).toBe("quick-25");
    expect(window.localStorage.getItem(FOCUS_RECENTS_STORAGE_KEY)).toContain(
      "Deep work",
    );
  });
});
