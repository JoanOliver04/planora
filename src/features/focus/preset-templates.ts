import type { FocusMode, FocusSegment } from "./types";
import type { FocusPresetInput } from "./validation";

/** Localized template keys. Labels live in next-intl (`Focus.templates.*`). */
export type FocusPresetTemplateKey =
  "pomodoro" | "focus50" | "deep90" | "stopwatch";

export type FocusPresetTemplate = {
  key: FocusPresetTemplateKey;
  emoji: string;
  mode: FocusMode;
  focusDurationSec: number | null;
  shortBreakSec: number | null;
  longBreakSec: number | null;
  cyclesBeforeLongBreak: number | null;
  targetCycles: number | null;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  segments: FocusSegment[];
};

/** Suggested starter templates — never auto-inserted into the database. */
export const FOCUS_PRESET_TEMPLATES: readonly FocusPresetTemplate[] = [
  {
    key: "pomodoro",
    emoji: "🍅",
    mode: "cycles",
    focusDurationSec: 25 * 60,
    shortBreakSec: 5 * 60,
    longBreakSec: 15 * 60,
    cyclesBeforeLongBreak: 4,
    targetCycles: 4,
    autoStartBreaks: true,
    autoStartFocus: false,
    segments: [],
  },
  {
    key: "focus50",
    emoji: "🎯",
    mode: "cycles",
    focusDurationSec: 50 * 60,
    shortBreakSec: 10 * 60,
    longBreakSec: 20 * 60,
    cyclesBeforeLongBreak: 2,
    targetCycles: 2,
    autoStartBreaks: true,
    autoStartFocus: false,
    segments: [],
  },
  {
    key: "deep90",
    emoji: "🌊",
    mode: "countdown",
    focusDurationSec: 90 * 60,
    shortBreakSec: 15 * 60,
    longBreakSec: null,
    cyclesBeforeLongBreak: null,
    targetCycles: null,
    autoStartBreaks: false,
    autoStartFocus: false,
    segments: [],
  },
  {
    key: "stopwatch",
    emoji: "⏱️",
    mode: "stopwatch",
    focusDurationSec: null,
    shortBreakSec: null,
    longBreakSec: null,
    cyclesBeforeLongBreak: null,
    targetCycles: null,
    autoStartBreaks: false,
    autoStartFocus: false,
    segments: [],
  },
] as const;

export function templateToPresetInput(
  template: FocusPresetTemplate,
  name: string,
): FocusPresetInput {
  return {
    name,
    emoji: template.emoji,
    intention: null,
    mode: template.mode,
    focusDurationSec: template.focusDurationSec,
    shortBreakSec: template.shortBreakSec,
    longBreakSec: template.longBreakSec,
    cyclesBeforeLongBreak: template.cyclesBeforeLongBreak,
    targetCycles: template.targetCycles,
    autoStartBreaks: template.autoStartBreaks,
    autoStartFocus: template.autoStartFocus,
    soundEnabled: true,
    vibrationEnabled: true,
    notifyOnPhaseEnd: true,
    completeTaskOnSessionEnd: false,
    keepScreenAwake: false,
    preferFullscreen: false,
    segments: template.segments,
    isFavorite: false,
    defaultCategoryId: null,
  };
}

/** Favorites first, then personal sort order. Recent usage is display-only. */
export function orderPresetsForHome<
  T extends {
    isFavorite: boolean;
    sortOrder: number;
    archivedAt: string | null;
  },
>(presets: T[]): T[] {
  return [...presets]
    .filter((preset) => !preset.archivedAt)
    .sort((left, right) => {
      if (left.isFavorite !== right.isFavorite) {
        return left.isFavorite ? -1 : 1;
      }
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return 0;
    });
}

export function recentPresetIdsFromSessions(
  sessions: Array<{ presetId: string | null }>,
  limit = 3,
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const session of sessions) {
    if (!session.presetId || seen.has(session.presetId)) continue;
    seen.add(session.presetId);
    ordered.push(session.presetId);
    if (ordered.length >= limit) break;
  }
  return ordered;
}
