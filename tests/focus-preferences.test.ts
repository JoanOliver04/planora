import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultFocusAccountPreferences,
  defaultFocusDevicePreferences,
  FOCUS_DEVICE_PREFS_KEY,
  loadFocusDevicePreferences,
  normalizeFocusAccountPreferences,
  normalizeFocusDevicePreferences,
  readFocusAccountFromProfilePreferences,
  saveFocusDevicePreferences,
} from "@/features/focus/focus-preferences";
import { defaultPreferences, normalizePreferences } from "@/lib/preferences";
import { preferencesSchema } from "@/lib/validation/preferences";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("focus account preferences", () => {
  it("normalizes invalid account payloads to safe defaults", () => {
    expect(
      normalizeFocusAccountPreferences({
        defaultMode: "turbo",
        completeTaskOnEndDefault: true,
        timerDisplay: "huge",
        defaultPresetId: "not-a-uuid",
      }),
    ).toMatchObject({
      defaultMode: "countdown",
      completeTaskOnEndDefault: true,
      timerDisplay: "large",
      defaultPresetId: null,
    });
  });

  it("keeps completeTaskOnEndDefault false unless explicitly true", () => {
    expect(
      normalizeFocusAccountPreferences({ completeTaskOnEndDefault: "yes" })
        .completeTaskOnEndDefault,
    ).toBe(false);
  });

  it("embeds focus prefs inside user preferences without dropping visuals", () => {
    const prefs = normalizePreferences({
      accent: "#2563eb",
      focus: {
        defaultMode: "cycles",
        showWeeklyGoal: false,
      },
    });
    expect(prefs.accent).toBe("#2563eb");
    expect(prefs.focus.defaultMode).toBe("cycles");
    expect(prefs.focus.showWeeklyGoal).toBe(false);
    expect(prefs.focus.completeTaskOnEndDefault).toBe(false);
  });

  it("accepts focus account prefs at the server boundary", () => {
    expect(() =>
      preferencesSchema.parse({
        ...defaultPreferences,
        focus: defaultFocusAccountPreferences,
      }),
    ).not.toThrow();
  });

  it("reads focus prefs from a profile preferences blob", () => {
    expect(
      readFocusAccountFromProfilePreferences({
        accent: "#4f6b45",
        focus: { askReviewOnEnd: false, defaultMode: "stopwatch" },
      }).askReviewOnEnd,
    ).toBe(false);
  });
});

describe("focus device preferences", () => {
  it("stays local and does not require a profile payload", () => {
    expect(loadFocusDevicePreferences()).toEqual(defaultFocusDevicePreferences);
    saveFocusDevicePreferences({
      ...defaultFocusDevicePreferences,
      soundEnabled: false,
      soundVolume: 0.2,
      lockScreenBehavior: "pause",
      showCompactBar: false,
    });
    const loaded = loadFocusDevicePreferences();
    expect(loaded.soundEnabled).toBe(false);
    expect(loaded.soundVolume).toBe(0.2);
    expect(loaded.lockScreenBehavior).toBe("pause");
    expect(loaded.showCompactBar).toBe(false);
    expect(window.localStorage.getItem(FOCUS_DEVICE_PREFS_KEY)).toContain(
      "pause",
    );
  });

  it("clamps volume and rejects unknown lock behaviours", () => {
    expect(
      normalizeFocusDevicePreferences({
        soundVolume: 4,
        lockScreenBehavior: "hibernate",
      }),
    ).toMatchObject({
      soundVolume: 1,
      lockScreenBehavior: "continue",
    });
  });
});
