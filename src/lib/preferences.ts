import type { Json } from "@/types/database";
import { accessibleAccent } from "./colors";
import {
  defaultFocusAccountPreferences,
  normalizeFocusAccountPreferences,
  type FocusAccountPreferences,
} from "@/features/focus/focus-preferences";

export type Density = "compact" | "comfortable" | "spacious";
export type Radius = "square" | "soft" | "rounded";
export type UserPreferences = {
  accent: string;
  density: Density;
  fontScale: number;
  radius: Radius;
  reduceMotion: boolean;
  showCompleted: boolean;
  /** Synced Focus preferences (not device-local). */
  focus: FocusAccountPreferences;
};

export const defaultPreferences: UserPreferences = {
  accent: "#4f6b45",
  density: "comfortable",
  fontScale: 100,
  radius: "rounded",
  reduceMotion: false,
  showCompleted: true,
  focus: defaultFocusAccountPreferences,
};

export function normalizePreferences(value: Json | undefined): UserPreferences {
  const input =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const accent =
    typeof input.accent === "string" && /^#[0-9a-f]{6}$/i.test(input.accent)
      ? input.accent
      : defaultPreferences.accent;
  const density =
    input.density === "compact" || input.density === "spacious"
      ? input.density
      : "comfortable";
  const radius =
    input.radius === "square" || input.radius === "soft"
      ? input.radius
      : "rounded";
  const fontScale =
    typeof input.fontScale === "number" &&
    input.fontScale >= 85 &&
    input.fontScale <= 125
      ? input.fontScale
      : 100;
  return {
    accent,
    density,
    radius,
    fontScale,
    reduceMotion:
      typeof input.reduceMotion === "boolean" ? input.reduceMotion : false,
    showCompleted:
      typeof input.showCompleted === "boolean" ? input.showCompleted : true,
    focus: normalizeFocusAccountPreferences(input.focus),
  };
}

export function applyPreferences(preferences: UserPreferences) {
  const root = document.documentElement;
  const accent = accessibleAccent(preferences.accent);
  root.dataset.density = preferences.density;
  root.dataset.radius = preferences.radius;
  root.dataset.reduceMotion = String(preferences.reduceMotion);
  root.style.setProperty("--font-scale", String(preferences.fontScale / 100));
  root.style.setProperty("--primary", preferences.accent);
  root.style.setProperty("--primary-text-light", accent.lightText);
  root.style.setProperty("--primary-text-dark", accent.darkText);
  root.style.setProperty("--primary-strong", "var(--primary-text)");
  root.style.setProperty("--primary-hover", accent.hover);
  root.style.setProperty(
    "--primary-2",
    `color-mix(in srgb, ${preferences.accent} 16%, var(--surface))`,
  );
  root.style.setProperty("--ring", "var(--primary-text)");
  root.style.setProperty("--accent-contrast", accent.foreground);
}
