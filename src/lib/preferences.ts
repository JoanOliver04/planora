import type { Json } from "@/types/database";

export type Density = "compact" | "comfortable" | "spacious";
export type Radius = "square" | "soft" | "rounded";
export type UserPreferences = {
  accent: string;
  density: Density;
  fontScale: number;
  radius: Radius;
  reduceMotion: boolean;
  showCompleted: boolean;
};

export const defaultPreferences: UserPreferences = {
  accent: "#4f6b45",
  density: "comfortable",
  fontScale: 100,
  radius: "rounded",
  reduceMotion: false,
  showCompleted: true,
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
  };
}

export function applyPreferences(preferences: UserPreferences) {
  const root = document.documentElement;
  const red = Number.parseInt(preferences.accent.slice(1, 3), 16);
  const green = Number.parseInt(preferences.accent.slice(3, 5), 16);
  const blue = Number.parseInt(preferences.accent.slice(5, 7), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  root.dataset.density = preferences.density;
  root.dataset.radius = preferences.radius;
  root.dataset.reduceMotion = String(preferences.reduceMotion);
  root.style.setProperty("--font-scale", String(preferences.fontScale / 100));
  root.style.setProperty("--primary", preferences.accent);
  root.style.setProperty(
    "--primary-strong",
    `color-mix(in srgb, ${preferences.accent} 72%, var(--foreground))`,
  );
  root.style.setProperty(
    "--primary-2",
    `color-mix(in srgb, ${preferences.accent} 16%, var(--surface))`,
  );
  root.style.setProperty("--ring", preferences.accent);
  root.style.setProperty(
    "--accent-contrast",
    luminance > 150 ? "#111827" : "#ffffff",
  );
}
