import { afterEach, describe, expect, it } from "vitest";
import {
  applyPreferences,
  defaultPreferences,
  normalizePreferences,
} from "@/lib/preferences";
import { preferencesSchema } from "@/lib/validation/preferences";

afterEach(() => {
  document.documentElement.removeAttribute("data-density");
  document.documentElement.removeAttribute("data-radius");
  document.documentElement.removeAttribute("data-reduce-motion");
  document.documentElement.removeAttribute("style");
});

describe("user preferences", () => {
  it("falls back safely when stored data is malformed", () => {
    expect(
      normalizePreferences({
        accent: "javascript:red",
        density: "tiny",
        fontScale: 500,
      }),
    ).toEqual(defaultPreferences);
  });

  it("applies visual preferences to the document", () => {
    const preferences = {
      ...defaultPreferences,
      accent: "#2563eb",
      density: "compact" as const,
      fontScale: 115,
      radius: "soft" as const,
      reduceMotion: true,
    };

    applyPreferences(preferences);

    const root = document.documentElement;
    expect(root).toHaveAttribute("data-density", "compact");
    expect(root).toHaveAttribute("data-radius", "soft");
    expect(root).toHaveAttribute("data-reduce-motion", "true");
    expect(root.style.getPropertyValue("--font-scale")).toBe("1.15");
    expect(root.style.getPropertyValue("--primary")).toBe("#2563eb");
  });

  it("rejects invalid values at the server boundary", () => {
    expect(() =>
      preferencesSchema.parse({
        ...defaultPreferences,
        fontScale: 200,
      }),
    ).toThrow();
  });
});
