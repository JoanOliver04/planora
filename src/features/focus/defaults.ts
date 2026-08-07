import type { FocusMode } from "./types";

/** Built-in quick starts. User presets from the database are preferred when present. */
export type QuickFocusPreset = {
  key: string;
  mode: FocusMode;
  focusDurationSec: number | null;
  shortBreakSec?: number | null;
  longBreakSec?: number | null;
  cyclesBeforeLongBreak?: number | null;
};

export const QUICK_FOCUS_PRESETS: readonly QuickFocusPreset[] = [
  {
    key: "quick-25",
    mode: "countdown",
    focusDurationSec: 25 * 60,
  },
  {
    key: "quick-50",
    mode: "countdown",
    focusDurationSec: 50 * 60,
  },
  {
    key: "quick-90",
    mode: "countdown",
    focusDurationSec: 90 * 60,
  },
  {
    key: "quick-stopwatch",
    mode: "stopwatch",
    focusDurationSec: null,
  },
] as const;

export function formatFocusDuration(
  totalSec: number,
  style: "clock" | "compact" = "clock",
): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (style === "compact") {
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
