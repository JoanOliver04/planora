/** Local, private recent-focus hints for shortcuts. Never sent to analytics. */

export type FocusRecents = {
  lastPresetId: string | null;
  lastPresetName: string | null;
  lastTaskId: string | null;
  lastTaskTitle: string | null;
  lastQuickKey: string | null;
  updatedAt: string | null;
};

export const FOCUS_RECENTS_STORAGE_KEY = "planora-focus-recents";

export const emptyFocusRecents = (): FocusRecents => ({
  lastPresetId: null,
  lastPresetName: null,
  lastTaskId: null,
  lastTaskTitle: null,
  lastQuickKey: null,
  updatedAt: null,
});

export function readFocusRecents(): FocusRecents {
  if (typeof window === "undefined") return emptyFocusRecents();
  try {
    const raw = window.localStorage.getItem(FOCUS_RECENTS_STORAGE_KEY);
    if (!raw) return emptyFocusRecents();
    const parsed = JSON.parse(raw) as Partial<FocusRecents>;
    return {
      lastPresetId:
        typeof parsed.lastPresetId === "string" ? parsed.lastPresetId : null,
      lastPresetName:
        typeof parsed.lastPresetName === "string"
          ? parsed.lastPresetName
          : null,
      lastTaskId:
        typeof parsed.lastTaskId === "string" ? parsed.lastTaskId : null,
      lastTaskTitle:
        typeof parsed.lastTaskTitle === "string" ? parsed.lastTaskTitle : null,
      lastQuickKey:
        typeof parsed.lastQuickKey === "string" ? parsed.lastQuickKey : null,
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    return emptyFocusRecents();
  }
}

export function writeFocusRecents(patch: Partial<FocusRecents>): FocusRecents {
  const next: FocusRecents = {
    ...readFocusRecents(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        FOCUS_RECENTS_STORAGE_KEY,
        JSON.stringify(next),
      );
    } catch {
      // Ignore quota / private-mode failures.
    }
  }
  return next;
}

export function recordFocusStart(input: {
  presetId?: string | null;
  presetName?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
  quickKey?: string | null;
}) {
  const patch: Partial<FocusRecents> = {};
  if (input.presetId) {
    patch.lastPresetId = input.presetId;
    patch.lastPresetName = input.presetName ?? null;
  }
  if (input.taskId) {
    patch.lastTaskId = input.taskId;
    patch.lastTaskTitle = input.taskTitle ?? null;
  }
  if (input.quickKey) {
    patch.lastQuickKey = input.quickKey;
  }
  if (Object.keys(patch).length === 0) return readFocusRecents();
  return writeFocusRecents(patch);
}
