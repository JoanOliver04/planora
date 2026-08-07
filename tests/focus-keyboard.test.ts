import { describe, expect, it } from "vitest";
import {
  isTypingTarget,
  resolveFocusShortcut,
  type FocusShortcutContext,
} from "@/features/focus/focus-keyboard";

const base: FocusShortcutContext = {
  enabled: true,
  desktop: true,
  typingTarget: false,
  hasChordModifier: false,
  hasOverlay: false,
  immersive: false,
  readOnly: false,
};

function key(
  partial: Partial<KeyboardEvent> & { key: string },
): Pick<
  KeyboardEvent,
  "key" | "code" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey"
> {
  return {
    key: partial.key,
    code: partial.code ?? partial.key,
    shiftKey: partial.shiftKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    metaKey: partial.metaKey ?? false,
    altKey: partial.altKey ?? false,
  };
}

describe("resolveFocusShortcut", () => {
  it("maps space to pause/resume on desktop", () => {
    expect(resolveFocusShortcut(key({ key: " " }), base)).toBe("pauseResume");
  });

  it("maps F, N, D, T and help", () => {
    expect(resolveFocusShortcut(key({ key: "f" }), base)).toBe(
      "toggleImmersive",
    );
    expect(resolveFocusShortcut(key({ key: "N" }), base)).toBe("openNote");
    expect(resolveFocusShortcut(key({ key: "d" }), base)).toBe(
      "openDistraction",
    );
    expect(resolveFocusShortcut(key({ key: "t" }), base)).toBe("announceTime");
    expect(resolveFocusShortcut(key({ key: "?" }), base)).toBe(
      "openShortcutsHelp",
    );
  });

  it("only finishes via Shift+X confirmation path", () => {
    expect(resolveFocusShortcut(key({ key: "x" }), base)).toBeNull();
    expect(resolveFocusShortcut(key({ key: "x", shiftKey: true }), base)).toBe(
      "confirmComplete",
    );
  });

  it("uses Escape to close overlays or immersive, never as cancel", () => {
    expect(
      resolveFocusShortcut(key({ key: "Escape" }), {
        ...base,
        hasOverlay: true,
      }),
    ).toBe("closeOverlay");
    expect(
      resolveFocusShortcut(key({ key: "Escape" }), {
        ...base,
        immersive: true,
      }),
    ).toBe("closeOverlay");
    expect(resolveFocusShortcut(key({ key: "Escape" }), base)).toBeNull();
  });

  it("ignores shortcuts while typing or when disabled / non-desktop", () => {
    expect(
      resolveFocusShortcut(key({ key: " " }), { ...base, typingTarget: true }),
    ).toBeNull();
    expect(
      resolveFocusShortcut(key({ key: " " }), { ...base, enabled: false }),
    ).toBeNull();
    expect(
      resolveFocusShortcut(key({ key: " " }), { ...base, desktop: false }),
    ).toBeNull();
  });

  it("blocks write shortcuts in follower/read-only mode", () => {
    expect(
      resolveFocusShortcut(key({ key: " " }), { ...base, readOnly: true }),
    ).toBeNull();
    expect(
      resolveFocusShortcut(key({ key: "n" }), { ...base, readOnly: true }),
    ).toBeNull();
    expect(
      resolveFocusShortcut(key({ key: "f" }), { ...base, readOnly: true }),
    ).toBe("toggleImmersive");
  });

  it("ignores ctrl/meta chords", () => {
    expect(
      resolveFocusShortcut(key({ key: "n", ctrlKey: true }), base),
    ).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("detects inputs and contenteditable", () => {
    const input = document.createElement("input");
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(div)).toBe(true);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
  });
});
