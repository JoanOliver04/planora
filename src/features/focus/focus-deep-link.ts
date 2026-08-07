import { QUICK_FOCUS_PRESETS } from "./defaults";
import type { FocusPreset } from "./types";
import type { SessionStartDraft } from "./session-start-dialog";
import { buildFocusDraftFromTask, type FocusTaskSource } from "./task-link";

export type FocusDeepLinkParams = {
  taskId?: string;
  date?: string;
  presetId?: string;
  start?: string;
};

export type FocusShortcutHref = "/focus" | `/focus?${string}`;

/** Build a Focus route that continues or starts with context. */
export function buildFocusHref(input: {
  continueSession?: boolean;
  taskId?: string | null;
  date?: string | null;
  presetId?: string | null;
  quick?: boolean;
}): FocusShortcutHref {
  if (input.continueSession) return "/focus";
  const params = new URLSearchParams();
  if (input.quick) params.set("start", "quick");
  if (input.presetId) params.set("presetId", input.presetId);
  if (input.taskId) params.set("taskId", input.taskId);
  if (input.date) params.set("date", input.date);
  const query = params.toString();
  return query ? (`/focus?${query}` as FocusShortcutHref) : "/focus";
}

export function draftFromQuickStart(): SessionStartDraft {
  const quick = QUICK_FOCUS_PRESETS[0];
  return {
    mode: quick.mode,
    focusDurationSec: quick.focusDurationSec,
    quickKey: quick.key,
  };
}

export function draftFromPreset(preset: FocusPreset): SessionStartDraft {
  return {
    mode: preset.mode,
    focusDurationSec: preset.focusDurationSec,
    shortBreakSec: preset.shortBreakSec,
    longBreakSec: preset.longBreakSec,
    cyclesBeforeLongBreak: preset.cyclesBeforeLongBreak,
    targetCycles: preset.targetCycles,
    presetId: preset.id,
    title: preset.intention,
    autoStartBreaks: preset.autoStartBreaks,
    autoStartFocus: preset.autoStartFocus,
    soundEnabled: preset.soundEnabled,
    vibrationEnabled: preset.vibrationEnabled,
    notifyOnPhaseEnd: preset.notifyOnPhaseEnd,
    completeTaskOnEnd: preset.completeTaskOnSessionEnd,
    keepScreenAwake: preset.keepScreenAwake,
    preferFullscreen: preset.preferFullscreen,
    segments: preset.segments,
  };
}

export function resolveDeepLinkDraft(input: {
  params: FocusDeepLinkParams;
  today: string;
  presets: FocusPreset[];
  task?: FocusTaskSource | null;
  category?: { name: string; colour: string; emoji: string | null } | null;
  schedule?: { name: string } | null;
}): { draft: SessionStartDraft | null; autoOpen: boolean } {
  const { params, today, presets } = input;
  const date =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : today;

  if (params.taskId && input.task && !input.task.archived_at) {
    return {
      draft: buildFocusDraftFromTask({
        task: input.task,
        occurrenceDate: date,
        category: input.category,
        schedule: input.schedule,
      }),
      autoOpen: true,
    };
  }

  if (params.presetId) {
    const preset = presets.find((item) => item.id === params.presetId);
    if (preset) {
      return { draft: draftFromPreset(preset), autoOpen: true };
    }
    // Deleted preset: fall through to quiet Focus home (no opaque error).
    return { draft: null, autoOpen: false };
  }

  if (params.start === "quick") {
    return { draft: draftFromQuickStart(), autoOpen: true };
  }

  return { draft: null, autoOpen: false };
}

export type NextFocusTask = {
  id: string;
  title: string;
  emoji: string | null;
};

/**
 * First incomplete task for the day, preserving list order.
 * Tasks without category are allowed.
 */
export function pickNextFocusTask<
  T extends {
    id: string;
    title: string;
    emoji: string | null;
    archived_at: string | null;
  },
>(tasks: T[], completedIds: Set<string>): NextFocusTask | null {
  for (const task of tasks) {
    if (task.archived_at) continue;
    if (completedIds.has(task.id)) continue;
    return { id: task.id, title: task.title, emoji: task.emoji };
  }
  return null;
}

export type FocusShortcutKind =
  "continue" | "quick" | "nextTask" | "lastPreset" | "openFocus";

export type FocusShortcutItem = {
  kind: FocusShortcutKind;
  href: FocusShortcutHref;
  /** Optional label fragment (task/preset name) for the UI. */
  detail?: string | null;
};

/**
 * At most three relevant shortcuts. Active session → continue only.
 * Idle → quick, next task, last preset (or open Focus as fallback).
 */
export function buildFocusShortcuts(input: {
  hasActiveSession: boolean;
  day: string;
  nextTask: NextFocusTask | null;
  lastPresetId: string | null;
  lastPresetName: string | null;
  lastPresetStillExists?: boolean;
}): FocusShortcutItem[] {
  if (input.hasActiveSession) {
    return [
      { kind: "continue", href: buildFocusHref({ continueSession: true }) },
    ];
  }

  const items: FocusShortcutItem[] = [
    { kind: "quick", href: buildFocusHref({ quick: true }) },
  ];

  if (input.nextTask) {
    items.push({
      kind: "nextTask",
      href: buildFocusHref({
        taskId: input.nextTask.id,
        date: input.day,
      }),
      detail: input.nextTask.title,
    });
  }

  if (input.lastPresetId && input.lastPresetStillExists !== false) {
    items.push({
      kind: "lastPreset",
      href: buildFocusHref({ presetId: input.lastPresetId }),
      detail: input.lastPresetName,
    });
  }

  // Cap at three; if we only have quick, add open Focus as a third path.
  if (items.length === 1) {
    items.push({ kind: "openFocus", href: "/focus" });
  }

  return items.slice(0, 3);
}
