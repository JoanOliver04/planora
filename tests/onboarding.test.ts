import { describe, expect, it } from "vitest";
import {
  getOnboardingPreset,
  onboardingPresets,
} from "@/features/onboarding/presets";

describe("guided onboarding presets", () => {
  it("covers every supported planning goal in both locales", () => {
    expect(Object.keys(onboardingPresets)).toEqual([
      "studies",
      "work",
      "habits",
      "personal",
    ]);
    for (const preset of Object.values(onboardingPresets)) {
      expect(preset.schedule.es).toBeTruthy();
      expect(preset.schedule.en).toBeTruthy();
      expect(preset.categories).toHaveLength(2);
      expect(preset.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("returns the recommended template for a goal", () => {
    expect(getOnboardingPreset("studies").schedule.es).toBe("Mi curso");
    expect(getOnboardingPreset("work").emoji).toBe("💼");
  });
});
