import { z } from "zod";
import { preferencesSchema } from "@/lib/validation/preferences";

export const id = z.string().uuid();
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const dayPartSettingsSchema = z.object({
  morning: z.object({ start: time, end: time }),
  afternoon: z.object({ start: time, end: time }),
  night: z.object({ start: time, end: time }),
});

export const scheduleSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  emoji: z.string().max(16).optional().nullable(),
});

export const categorySchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(60),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  emoji: z.string().max(16).optional().nullable(),
  scheduleId: id.optional().nullable(),
});

export const eventSchema = z
  .object({
    id: id.optional(),
    title: z.string().trim().min(1).max(140),
    description: z.string().max(2000).optional().nullable(),
    emoji: z.string().max(16).optional().nullable(),
    categoryId: id.optional().nullable(),
    scheduleId: id.optional().nullable(),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    allDay: z.boolean(),
    startTime: time.optional().nullable(),
    endTime: time.optional().nullable(),
  })
  .superRefine((value, context) => {
    if (!value.allDay && !value.startTime)
      context.addIssue({
        code: "custom",
        path: ["startTime"],
        message: "Start time is required",
      });
    if (value.startTime && value.endTime && value.startTime >= value.endTime)
      context.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "End time must be later",
      });
  });

const timezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Invalid timezone");

export const profileSchema = z.object({
  locale: z.enum(["es", "en"]).optional(),
  timezone: timezoneSchema.optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  week_starts_on: z.number().int().min(0).max(6).optional(),
  day_part_settings: dayPartSettingsSchema.optional(),
  onboarding_completed: z.boolean().optional(),
  active_schedule_id: id.optional(),
  preferences: preferencesSchema.optional(),
});

export const guidedOnboardingSchema = z.object({
  goal: z.enum(["studies", "work", "habits", "personal"]),
  scheduleName: z.string().trim().min(1).max(80),
  timezone: timezoneSchema,
  weekStart: z.union([z.literal(0), z.literal(1)]),
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  skip: z.boolean().default(false),
});
