import { z } from "zod";

export const focusAccountPreferencesSchema = z.object({
  defaultPresetId: z.string().uuid().nullable(),
  defaultMode: z.enum(["countdown", "stopwatch", "cycles"]),
  askIntentionOnStart: z.boolean(),
  askReviewOnEnd: z.boolean(),
  completeTaskOnEndDefault: z.boolean(),
  timerDisplay: z.enum(["large", "compact"]),
  homeLanding: z.enum(["start", "presets", "history"]),
  showWeeklyGoal: z.boolean(),
  goalWeekdaysOnly: z.boolean(),
});

export const preferencesSchema = z.object({
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  density: z.enum(["compact", "comfortable", "spacious"]),
  fontScale: z.number().int().min(85).max(125),
  radius: z.enum(["square", "soft", "rounded"]),
  reduceMotion: z.boolean(),
  showCompleted: z.boolean(),
  focus: focusAccountPreferencesSchema.optional(),
});
