import { z } from "zod";

export const FOCUS_MIN_DURATION_SEC = 60;
export const FOCUS_MAX_DURATION_SEC = 8 * 60 * 60;
export const FOCUS_MAX_SHORT_BREAK_SEC = 60 * 60;
export const FOCUS_MAX_LONG_BREAK_SEC = 3 * 60 * 60;
export const FOCUS_MAX_CYCLES = 50;
export const FOCUS_MAX_CYCLES_BEFORE_LONG = 20;
export const FOCUS_MAX_NOTES_LENGTH = 4000;
export const FOCUS_MAX_DISTRACTIONS = 50;
export const FOCUS_MAX_DISTRACTION_LENGTH = 280;
export const FOCUS_MAX_SEGMENTS = 40;
export const FOCUS_MAX_EXTEND_BREAK_SEC = 60 * 60;

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const focusModeSchema = z.enum([
  "countdown",
  "stopwatch",
  "cycles",
  "structured_plan",
]);
export const focusStatusSchema = z.enum([
  "running",
  "paused",
  "on_break",
  "completed",
  "cancelled",
]);
export const focusPhaseKindSchema = z.enum([
  "focus",
  "short_break",
  "long_break",
  "pause",
]);

/** Accepts legacy segment shapes and normalizes to the structured-plan model. */
export const focusSegmentSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const item = raw as Record<string, unknown>;
    const legacyKind = item.kind;
    const kind =
      legacyKind === "focus"
        ? "focus"
        : legacyKind === "break" ||
            legacyKind === "short_break" ||
            legacyKind === "long_break"
          ? "break"
          : legacyKind;
    const durationRaw =
      typeof item.durationSec === "number"
        ? item.durationSec
        : typeof item.duration_sec === "number"
          ? item.duration_sec
          : null;
    const durationSec = durationRaw;
    const name =
      typeof item.name === "string" && item.name.trim()
        ? item.name
        : typeof item.label === "string" && item.label.trim()
          ? item.label
          : "Block";
    const autoAdvance =
      typeof item.autoAdvance === "boolean"
        ? item.autoAdvance
        : durationSec != null;
    return {
      name,
      emoji:
        typeof item.emoji === "string" || item.emoji === null
          ? item.emoji
          : null,
      kind,
      durationSec,
      description:
        typeof item.description === "string" || item.description === null
          ? item.description
          : null,
      autoAdvance,
    };
  },
  z.object({
    name: z.string().trim().min(1).max(80),
    emoji: z.string().trim().min(1).max(16).nullable().optional(),
    kind: z.enum(["focus", "break"]),
    durationSec: z
      .number()
      .int()
      .min(FOCUS_MIN_DURATION_SEC)
      .max(FOCUS_MAX_DURATION_SEC)
      .nullable(),
    description: z.string().trim().max(280).nullable().optional(),
    autoAdvance: z.boolean(),
  }),
);

const durationSec = z
  .number()
  .int()
  .min(FOCUS_MIN_DURATION_SEC)
  .max(FOCUS_MAX_DURATION_SEC);
const optionalDuration = durationSec.nullable().optional();
const shortBreakSec = z
  .number()
  .int()
  .min(0)
  .max(FOCUS_MAX_SHORT_BREAK_SEC)
  .nullable()
  .optional();
const longBreakSec = z
  .number()
  .int()
  .min(0)
  .max(FOCUS_MAX_LONG_BREAK_SEC)
  .nullable()
  .optional();

export const focusSessionConfigSchema = z.object({
  focusDurationSec: z
    .number()
    .int()
    .min(FOCUS_MIN_DURATION_SEC)
    .max(FOCUS_MAX_DURATION_SEC)
    .nullable(),
  shortBreakSec: z
    .number()
    .int()
    .min(0)
    .max(FOCUS_MAX_SHORT_BREAK_SEC)
    .nullable(),
  longBreakSec: z
    .number()
    .int()
    .min(0)
    .max(FOCUS_MAX_LONG_BREAK_SEC)
    .nullable(),
  cyclesBeforeLongBreak: z
    .number()
    .int()
    .min(1)
    .max(FOCUS_MAX_CYCLES_BEFORE_LONG)
    .nullable(),
  targetCycles: z.number().int().min(1).max(FOCUS_MAX_CYCLES).nullable(),
  autoStartBreaks: z.boolean(),
  autoStartFocus: z.boolean(),
  soundEnabled: z.boolean(),
  vibrationEnabled: z.boolean(),
  notifyOnPhaseEnd: z.boolean(),
  completeTaskOnSessionEnd: z.boolean(),
  keepScreenAwake: z.boolean(),
  preferFullscreen: z.boolean(),
  segments: z.array(focusSegmentSchema).max(FOCUS_MAX_SEGMENTS),
});

export const startFocusSessionSchema = z
  .object({
    mode: focusModeSchema,
    title: z.string().trim().min(1).max(140).optional().nullable(),
    presetId: uuid.optional().nullable(),
    taskId: uuid.optional().nullable(),
    categoryId: uuid.optional().nullable(),
    scheduleId: uuid.optional().nullable(),
    occurrenceDate: isoDate.optional().nullable(),
    focusDurationSec: optionalDuration,
    shortBreakSec,
    longBreakSec,
    cyclesBeforeLongBreak: z
      .number()
      .int()
      .min(1)
      .max(FOCUS_MAX_CYCLES_BEFORE_LONG)
      .optional()
      .nullable(),
    targetCycles: z
      .number()
      .int()
      .min(1)
      .max(FOCUS_MAX_CYCLES)
      .optional()
      .nullable(),
    autoStartBreaks: z.boolean().optional(),
    autoStartFocus: z.boolean().optional(),
    soundEnabled: z.boolean().optional(),
    vibrationEnabled: z.boolean().optional(),
    notifyOnPhaseEnd: z.boolean().optional(),
    completeTaskOnEnd: z.boolean().optional(),
    keepScreenAwake: z.boolean().optional(),
    preferFullscreen: z.boolean().optional(),
    segments: z.array(focusSegmentSchema).max(FOCUS_MAX_SEGMENTS).optional(),
    linkSnapshot: z
      .object({
        taskTitle: z.string().max(140).optional(),
        taskEmoji: z.string().max(16).nullable().optional(),
        taskKind: z.enum(["one_time", "habit"]).optional(),
        categoryName: z.string().max(60).nullable().optional(),
        categoryColour: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .nullable()
          .optional(),
        scheduleName: z.string().max(80).nullable().optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    const hasPlan = (value.segments?.length ?? 0) > 0;
    if (value.mode === "structured_plan") {
      if (!hasPlan) {
        ctx.addIssue({
          code: "custom",
          path: ["segments"],
          message: "A structured plan requires blocks",
        });
      }
      if (!value.segments?.some((segment) => segment.kind === "focus")) {
        ctx.addIssue({
          code: "custom",
          path: ["segments"],
          message: "A structured plan requires at least one focus block",
        });
      }
      value.segments?.forEach((segment, index) => {
        if (segment.kind === "break" && segment.durationSec == null) {
          ctx.addIssue({
            code: "custom",
            path: ["segments", index, "durationSec"],
            message: "Break blocks must be timed",
          });
        }
      });
    }
    if (!hasPlan && (value.mode === "countdown" || value.mode === "cycles")) {
      if (value.focusDurationSec == null) {
        ctx.addIssue({
          code: "custom",
          path: ["focusDurationSec"],
          message: "Focus duration is required for this mode",
        });
      }
    }
    if (value.mode === "cycles" && !hasPlan) {
      if (value.shortBreakSec == null) {
        ctx.addIssue({
          code: "custom",
          path: ["shortBreakSec"],
          message: "Short break duration is required for cycles",
        });
      }
    }
  });

/** Shared fields for every Focus transition (online + offline replay). */
const focusTransitionBase = {
  sessionId: uuid,
  expectedRevision: z.number().int().min(1),
  /**
   * Optional client wall-clock ISO time for offline replay.
   * Server clamps to a safe window — never trusts unbounded client clocks.
   */
  clientAt: z.string().min(10).max(40).optional(),
  /** Idempotent client action id (dedupe on flush / retries). */
  actionId: z.string().uuid().optional(),
};

export const focusTransitionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pause"),
    ...focusTransitionBase,
  }),
  z.object({
    type: z.literal("resume"),
    ...focusTransitionBase,
  }),
  z.object({
    type: z.literal("begin_break"),
    ...focusTransitionBase,
    breakKind: z.enum(["short_break", "long_break"]).optional(),
  }),
  z.object({
    type: z.literal("skip_break"),
    ...focusTransitionBase,
  }),
  z.object({
    type: z.literal("extend_break"),
    ...focusTransitionBase,
    extraSec: z.number().int().min(1).max(FOCUS_MAX_EXTEND_BREAK_SEC),
  }),
  z.object({
    type: z.literal("finish_phase"),
    ...focusTransitionBase,
  }),
  z.object({
    type: z.literal("skip_segment"),
    ...focusTransitionBase,
  }),
  z.object({
    type: z.literal("complete"),
    ...focusTransitionBase,
    notes: z.string().max(FOCUS_MAX_NOTES_LENGTH).optional().nullable(),
    subjectiveFocus: z.number().int().min(1).max(5).optional().nullable(),
    subjectiveEnergy: z.number().int().min(1).max(5).optional().nullable(),
  }),
  z.object({
    type: z.literal("cancel"),
    ...focusTransitionBase,
  }),
  z.object({
    type: z.literal("recover"),
    ...focusTransitionBase,
  }),
  z.object({
    type: z.literal("takeover"),
    ...focusTransitionBase,
  }),
]);

export const focusOutcomeSchema = z.enum([
  "done",
  "progress",
  "blocked",
  "other",
]);

export const updateFocusMetadataSchema = z.object({
  sessionId: uuid,
  expectedRevision: z.number().int().min(1),
  title: z.string().trim().min(1).max(140).optional().nullable(),
  notes: z.string().max(FOCUS_MAX_NOTES_LENGTH).optional().nullable(),
  distractions: z
    .array(z.string().trim().min(1).max(FOCUS_MAX_DISTRACTION_LENGTH))
    .max(FOCUS_MAX_DISTRACTIONS)
    .optional(),
  subjectiveFocus: z.number().int().min(1).max(5).optional().nullable(),
  subjectiveEnergy: z.number().int().min(1).max(5).optional().nullable(),
  /** Private optional result label for the session review. */
  outcome: focusOutcomeSchema.optional().nullable(),
  /** Private optional next step after the session. */
  nextStep: z.string().trim().max(280).optional().nullable(),
});

export const focusGoalMetricSchema = z.enum([
  "focus_seconds",
  "sessions",
  "active_days",
]);
export const focusGoalScopeSchema = z.enum(["global", "category", "preset"]);

export const focusGoalInputSchema = z
  .object({
    id: uuid.optional(),
    metric: focusGoalMetricSchema.default("focus_seconds"),
    /** Seconds for focus_seconds, or counts for sessions/active_days. */
    targetValue: z
      .number()
      .int()
      .min(1)
      .max(FOCUS_MAX_DURATION_SEC * 14),
    /** Legacy alias accepted for focus_seconds. */
    targetFocusSec: z
      .number()
      .int()
      .min(1)
      .max(FOCUS_MAX_DURATION_SEC * 14)
      .optional(),
    scope: focusGoalScopeSchema.default("global"),
    categoryId: uuid.optional().nullable(),
    presetId: uuid.optional().nullable(),
    startDate: isoDate.optional(),
    consideredDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .default([0, 1, 2, 3, 4, 5, 6]),
    isPrimary: z.boolean().default(false),
    sortOrder: z.number().int().optional(),
    timezone: z.string().min(1).max(100),
    weekStartsOn: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
    active: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "category" && !value.categoryId) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "Category is required for category-scoped goals",
      });
    }
    if (value.scope === "preset" && !value.presetId) {
      ctx.addIssue({
        code: "custom",
        path: ["presetId"],
        message: "Preset is required for preset-scoped goals",
      });
    }
    if (value.metric === "sessions" && value.targetValue > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["targetValue"],
        message: "Session targets must be at most 100 per week",
      });
    }
    if (value.metric === "active_days" && value.targetValue > 7) {
      ctx.addIssue({
        code: "custom",
        path: ["targetValue"],
        message: "Active-day targets must be at most 7",
      });
    }
    const uniqueDays = new Set(value.consideredDays);
    if (uniqueDays.size !== value.consideredDays.length) {
      ctx.addIssue({
        code: "custom",
        path: ["consideredDays"],
        message: "Considered days must be unique",
      });
    }
  });

export const focusPresetInputSchema = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(1).max(80),
    emoji: z.string().trim().min(1).max(16).optional().nullable(),
    intention: z.string().trim().min(1).max(140).optional().nullable(),
    mode: focusModeSchema,
    focusDurationSec: optionalDuration,
    shortBreakSec,
    longBreakSec,
    cyclesBeforeLongBreak: z
      .number()
      .int()
      .min(1)
      .max(FOCUS_MAX_CYCLES_BEFORE_LONG)
      .optional()
      .nullable(),
    targetCycles: z
      .number()
      .int()
      .min(1)
      .max(FOCUS_MAX_CYCLES)
      .optional()
      .nullable(),
    autoStartBreaks: z.boolean().default(true),
    autoStartFocus: z.boolean().default(false),
    soundEnabled: z.boolean().default(true),
    vibrationEnabled: z.boolean().default(true),
    notifyOnPhaseEnd: z.boolean().default(true),
    completeTaskOnSessionEnd: z.boolean().default(false),
    keepScreenAwake: z.boolean().default(false),
    preferFullscreen: z.boolean().default(false),
    segments: z.array(focusSegmentSchema).max(FOCUS_MAX_SEGMENTS).default([]),
    isFavorite: z.boolean().default(false),
    sortOrder: z.number().int().optional(),
    defaultCategoryId: uuid.optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "structured_plan") {
      if (value.segments.length === 0)
        ctx.addIssue({
          code: "custom",
          path: ["segments"],
          message: "A structured plan requires blocks",
        });
      if (!value.segments.some((segment) => segment.kind === "focus"))
        ctx.addIssue({
          code: "custom",
          path: ["segments"],
          message: "A structured plan requires at least one focus block",
        });
      value.segments.forEach((segment, index) => {
        if (segment.kind === "break" && segment.durationSec == null)
          ctx.addIssue({
            code: "custom",
            path: ["segments", index, "durationSec"],
            message: "Break blocks must be timed",
          });
      });
    }
    if (
      (value.mode === "countdown" || value.mode === "cycles") &&
      value.focusDurationSec == null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["focusDurationSec"],
        message: "Focus duration is required for this mode",
      });
    }
    if (value.mode === "cycles" && value.shortBreakSec == null) {
      ctx.addIssue({
        code: "custom",
        path: ["shortBreakSec"],
        message: "Short break duration is required for cycles",
      });
    }
  });

export const completeLinkedTaskSchema = z.object({
  sessionId: uuid,
  expectedRevision: z.number().int().min(1),
  taskId: uuid,
  occurrenceDate: isoDate,
  /** When true, complete even if the habit is not expected that day (explicit confirm). */
  force: z.boolean().default(false),
});

export type StartFocusSessionInput = z.infer<typeof startFocusSessionSchema>;
export type FocusTransitionInput = z.infer<typeof focusTransitionSchema>;
export type UpdateFocusMetadataInput = z.infer<
  typeof updateFocusMetadataSchema
>;
export type FocusGoalInput = z.infer<typeof focusGoalInputSchema>;
export type FocusPresetInput = z.infer<typeof focusPresetInputSchema>;
export type CompleteLinkedTaskInput = z.infer<typeof completeLinkedTaskSchema>;
// FocusGoalInput is defined above after focusGoalInputSchema.
