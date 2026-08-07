/**
 * Desktop Focus keyboard shortcuts — pure helpers for tests and the active view.
 * Never intercept typing in inputs/textareas/selects/contenteditable.
 */

export type FocusShortcutAction =
  | "pauseResume"
  | "toggleImmersive"
  | "openNote"
  | "openDistraction"
  | "openShortcutsHelp"
  | "closeOverlay"
  | "confirmComplete"
  | "announceTime";

export type FocusShortcutContext = {
  /** User preference (device-local). */
  enabled: boolean;
  /** Desktop-only: hover + fine pointer. */
  desktop: boolean;
  /** True when focus is inside an editable field. */
  typingTarget: boolean;
  /** Modifier keys that should block most shortcuts. */
  hasChordModifier: boolean;
  /** Any open overlay that Escape should close first. */
  hasOverlay: boolean;
  /** Immersive / concentration view. */
  immersive: boolean;
  readOnly: boolean;
};

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  const editable = target.getAttribute("contenteditable");
  if (editable != null && editable !== "false") return true;
  return Boolean(
    target.closest(
      "[contenteditable=''], [contenteditable='true'], [role='textbox']",
    ),
  );
}

export function isDesktopPointer(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch {
    return false;
  }
}

/**
 * Map a keydown to at most one Focus action.
 * Returns null when the event should pass through.
 */
export function resolveFocusShortcut(
  event: Pick<KeyboardEvent, "key" | "code" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey">,
  ctx: FocusShortcutContext,
): FocusShortcutAction | null {
  if (!ctx.enabled || !ctx.desktop) return null;
  if (ctx.typingTarget) return null;

  const key = event.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;

  // Escape always allowed to close UI chrome (not cancel session).
  if (key === "Escape") {
    if (ctx.hasOverlay || ctx.immersive) return "closeOverlay";
    return null;
  }

  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  if (key === " " || key === "Spacebar" || event.code === "Space") {
    if (ctx.readOnly) return null;
    return "pauseResume";
  }

  if (lower === "f") return "toggleImmersive";
  if (lower === "n") {
    if (ctx.readOnly) return null;
    return "openNote";
  }
  if (lower === "d") {
    if (ctx.readOnly) return null;
    return "openDistraction";
  }
  if (lower === "?" || (event.shiftKey && lower === "/")) {
    return "openShortcutsHelp";
  }
  if (lower === "t") return "announceTime";

  // Finish only opens a confirmation — never completes immediately.
  if (lower === "x" && event.shiftKey) {
    if (ctx.readOnly) return null;
    return "confirmComplete";
  }

  return null;
}

export const FOCUS_SHORTCUT_LIST: Array<{
  action: FocusShortcutAction;
  keys: string;
}> = [
  { action: "pauseResume", keys: "Space" },
  { action: "toggleImmersive", keys: "F" },
  { action: "openNote", keys: "N" },
  { action: "openDistraction", keys: "D" },
  { action: "announceTime", keys: "T" },
  { action: "confirmComplete", keys: "Shift+X" },
  { action: "openShortcutsHelp", keys: "?" },
  { action: "closeOverlay", keys: "Esc" },
];
