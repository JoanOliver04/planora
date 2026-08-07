import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultFocusOnboardingState,
  dismissFocusOnboarding,
  FOCUS_ONBOARDING_KEY,
  loadFocusOnboardingState,
  reopenFocusOnboarding,
  shouldShowFocusIntro,
} from "@/features/focus/focus-onboarding";
import { draftFromFirstPath } from "@/features/focus/focus-onboarding-panel";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("shouldShowFocusIntro", () => {
  it("shows only without history and when not dismissed", () => {
    expect(
      shouldShowFocusIntro({ hasHistory: false, introDismissed: false }),
    ).toBe(true);
    expect(
      shouldShowFocusIntro({ hasHistory: false, introDismissed: true }),
    ).toBe(false);
    expect(
      shouldShowFocusIntro({ hasHistory: true, introDismissed: false }),
    ).toBe(false);
  });
});

describe("focus onboarding storage", () => {
  it("starts open and dismisses persistently", () => {
    expect(loadFocusOnboardingState()).toEqual(defaultFocusOnboardingState);
    dismissFocusOnboarding();
    expect(loadFocusOnboardingState().introDismissed).toBe(true);
    expect(window.localStorage.getItem(FOCUS_ONBOARDING_KEY)).toContain(
      "introDismissed",
    );
  });

  it("can reopen help after dismiss", () => {
    dismissFocusOnboarding();
    reopenFocusOnboarding();
    expect(loadFocusOnboardingState().introDismissed).toBe(false);
  });
});

describe("draftFromFirstPath", () => {
  it("builds quick, stopwatch and plan drafts without inventing categories", () => {
    expect(draftFromFirstPath("quick25")).toMatchObject({
      mode: "countdown",
      focusDurationSec: 25 * 60,
    });
    expect(draftFromFirstPath("focus50")?.focusDurationSec).toBe(50 * 60);
    expect(draftFromFirstPath("stopwatch")).toMatchObject({
      mode: "stopwatch",
      focusDurationSec: null,
    });
    expect(draftFromFirstPath("createPreset")).toBeNull();
    const programming = draftFromFirstPath("plan:programming");
    expect(programming?.segments?.length).toBeGreaterThan(1);
    expect(programming).not.toHaveProperty("categoryId");
    expect(draftFromFirstPath("plan:reading")).toMatchObject({
      mode: "countdown",
      focusDurationSec: 25 * 60,
    });
  });
});
