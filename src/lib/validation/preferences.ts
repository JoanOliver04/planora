import { z } from "zod";

export const preferencesSchema = z.object({
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  density: z.enum(["compact", "comfortable", "spacious"]),
  fontScale: z.number().int().min(85).max(125),
  radius: z.enum(["square", "soft", "rounded"]),
  reduceMotion: z.boolean(),
  showCompleted: z.boolean(),
});
