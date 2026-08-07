import { describe, expect, it } from "vitest";
import {
  FOCUS_PRESET_TEMPLATES,
  orderPresetsForHome,
  recentPresetIdsFromSessions,
  templateToPresetInput,
} from "@/features/focus/preset-templates";
import { focusPresetInputSchema } from "@/features/focus/validation";
import { draftFromPreset } from "@/features/focus/focus-deep-link";
import type { FocusPreset } from "@/features/focus/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260807180000_focus_preset_management.sql",
  ),
  "utf8",
);

function preset(
  overrides: Partial<FocusPreset> & Pick<FocusPreset, "id" | "name" | "sortOrder">,
): FocusPreset {
  return {
    userId: "user",
    emoji: "🎯",
    intention: null,
    mode: "countdown",
    focusDurationSec: 1500,
    shortBreakSec: null,
    longBreakSec: null,
    cyclesBeforeLongBreak: null,
    targetCycles: null,
    autoStartBreaks: true,
    autoStartFocus: false,
    soundEnabled: true,
    vibrationEnabled: true,
    notifyOnPhaseEnd: true,
    completeTaskOnSessionEnd: false,
    keepScreenAwake: false,
    preferFullscreen: false,
    segments: [],
    isFavorite: false,
    defaultCategoryId: null,
    archivedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("focus preset management", () => {
  it("adds archive, emoji, intention and reorder support in SQL", () => {
    expect(migration).toContain("add column if not exists emoji");
    expect(migration).toContain("add column if not exists intention");
    expect(migration).toContain("add column if not exists archived_at");
    expect(migration).toContain("default_category_id");
    expect(migration).toContain("resource_type = 'focus_presets'");
  });

  it("validates template inputs for every starter suggestion", () => {
    for (const template of FOCUS_PRESET_TEMPLATES) {
      const parsed = focusPresetInputSchema.safeParse(
        templateToPresetInput(template, template.key),
      );
      expect(parsed.success).toBe(true);
    }
  });

  it("orders favourites first without using recent usage for sort", () => {
    const ordered = orderPresetsForHome([
      preset({ id: "a", name: "A", sortOrder: 0, isFavorite: false }),
      preset({ id: "b", name: "B", sortOrder: 1, isFavorite: true }),
      preset({
        id: "c",
        name: "C",
        sortOrder: 2,
        isFavorite: false,
        archivedAt: "2026-08-01T00:00:00.000Z",
      }),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("derives recent preset ids without duplicates", () => {
    expect(
      recentPresetIdsFromSessions([
        { presetId: "p1" },
        { presetId: "p1" },
        { presetId: "p2" },
        { presetId: null },
        { presetId: "p3" },
      ]),
    ).toEqual(["p1", "p2", "p3"]);
  });

  it("starts a session draft from a preset including intention", () => {
    const draft = draftFromPreset(
      preset({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Deep",
        sortOrder: 0,
        intention: "Study English",
        mode: "cycles",
        focusDurationSec: 1500,
        shortBreakSec: 300,
      }),
    );
    expect(draft.presetId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(draft.title).toBe("Study English");
    expect(draft.mode).toBe("cycles");
    expect(draft.focusDurationSec).toBe(1500);
  });

  it("rejects invalid mode/duration combinations", () => {
    expect(
      focusPresetInputSchema.safeParse({
        name: "Broken",
        mode: "countdown",
        focusDurationSec: null,
      }).success,
    ).toBe(false);
  });
});
