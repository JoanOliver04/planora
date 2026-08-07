import type { Database, Json } from "@/types/database";
import type {
  FocusGoal,
  FocusInterval,
  FocusLinkSnapshot,
  FocusPhaseKind,
  FocusPreset,
  FocusSegment,
  FocusSession,
  FocusSessionConfig,
  FocusMode,
  FocusSessionStatus,
} from "./types";
import { focusSessionConfigSchema, focusSegmentSchema } from "./validation";

type FocusPresetRow = Database["public"]["Tables"]["focus_presets"]["Row"];
type FocusSessionRow = Database["public"]["Tables"]["focus_sessions"]["Row"];
type FocusIntervalRow = Database["public"]["Tables"]["focus_intervals"]["Row"];
type FocusGoalRow = Database["public"]["Tables"]["focus_goals"]["Row"];

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asStringArray(value: Json | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function parseFocusSegments(
  value: Json | null | undefined,
): FocusSegment[] {
  if (!Array.isArray(value)) return [];
  const segments: FocusSegment[] = [];
  for (const item of value) {
    const parsed = focusSegmentSchema.safeParse(item);
    if (parsed.success) segments.push(parsed.data);
  }
  return segments;
}

export function parseSessionConfig(
  value: Json | null | undefined,
  fallback: Partial<FocusSessionConfig> = {},
): FocusSessionConfig {
  const raw = asRecord(value);
  const candidate = {
    focusDurationSec:
      typeof raw.focusDurationSec === "number"
        ? raw.focusDurationSec
        : typeof raw.focus_duration_sec === "number"
          ? raw.focus_duration_sec
          : (fallback.focusDurationSec ?? null),
    shortBreakSec:
      typeof raw.shortBreakSec === "number"
        ? raw.shortBreakSec
        : typeof raw.short_break_sec === "number"
          ? raw.short_break_sec
          : (fallback.shortBreakSec ?? null),
    longBreakSec:
      typeof raw.longBreakSec === "number"
        ? raw.longBreakSec
        : typeof raw.long_break_sec === "number"
          ? raw.long_break_sec
          : (fallback.longBreakSec ?? null),
    cyclesBeforeLongBreak:
      typeof raw.cyclesBeforeLongBreak === "number"
        ? raw.cyclesBeforeLongBreak
        : typeof raw.cycles_before_long_break === "number"
          ? raw.cycles_before_long_break
          : (fallback.cyclesBeforeLongBreak ?? 4),
    targetCycles:
      typeof raw.targetCycles === "number"
        ? raw.targetCycles
        : typeof raw.target_cycles === "number"
          ? raw.target_cycles
          : (fallback.targetCycles ?? null),
    autoStartBreaks:
      typeof raw.autoStartBreaks === "boolean"
        ? raw.autoStartBreaks
        : typeof raw.auto_start_breaks === "boolean"
          ? raw.auto_start_breaks
          : (fallback.autoStartBreaks ?? true),
    autoStartFocus:
      typeof raw.autoStartFocus === "boolean"
        ? raw.autoStartFocus
        : typeof raw.auto_start_focus === "boolean"
          ? raw.auto_start_focus
          : (fallback.autoStartFocus ?? false),
    soundEnabled:
      typeof raw.soundEnabled === "boolean"
        ? raw.soundEnabled
        : typeof raw.sound_enabled === "boolean"
          ? raw.sound_enabled
          : (fallback.soundEnabled ?? true),
    vibrationEnabled:
      typeof raw.vibrationEnabled === "boolean"
        ? raw.vibrationEnabled
        : typeof raw.vibration_enabled === "boolean"
          ? raw.vibration_enabled
          : (fallback.vibrationEnabled ?? true),
    notifyOnPhaseEnd:
      typeof raw.notifyOnPhaseEnd === "boolean"
        ? raw.notifyOnPhaseEnd
        : typeof raw.notify_on_phase_end === "boolean"
          ? raw.notify_on_phase_end
          : (fallback.notifyOnPhaseEnd ?? true),
    completeTaskOnSessionEnd:
      typeof raw.completeTaskOnSessionEnd === "boolean"
        ? raw.completeTaskOnSessionEnd
        : typeof raw.complete_task_on_session_end === "boolean"
          ? raw.complete_task_on_session_end
          : (fallback.completeTaskOnSessionEnd ?? false),
    keepScreenAwake:
      typeof raw.keepScreenAwake === "boolean"
        ? raw.keepScreenAwake
        : typeof raw.keep_screen_awake === "boolean"
          ? raw.keep_screen_awake
          : (fallback.keepScreenAwake ?? false),
    preferFullscreen:
      typeof raw.preferFullscreen === "boolean"
        ? raw.preferFullscreen
        : typeof raw.prefer_fullscreen === "boolean"
          ? raw.prefer_fullscreen
          : (fallback.preferFullscreen ?? false),
    segments: parseFocusSegments(
      (raw.segments as Json | undefined) ?? fallback.segments ?? [],
    ),
  };
  const parsed = focusSessionConfigSchema.safeParse(candidate);
  return parsed.success
    ? parsed.data
    : {
        focusDurationSec: candidate.focusDurationSec,
        shortBreakSec: candidate.shortBreakSec,
        longBreakSec: candidate.longBreakSec,
        cyclesBeforeLongBreak: candidate.cyclesBeforeLongBreak,
        targetCycles: candidate.targetCycles,
        autoStartBreaks: Boolean(candidate.autoStartBreaks),
        autoStartFocus: Boolean(candidate.autoStartFocus),
        soundEnabled: Boolean(candidate.soundEnabled),
        vibrationEnabled: Boolean(candidate.vibrationEnabled),
        notifyOnPhaseEnd: Boolean(candidate.notifyOnPhaseEnd),
        completeTaskOnSessionEnd: Boolean(candidate.completeTaskOnSessionEnd),
        keepScreenAwake: Boolean(candidate.keepScreenAwake),
        preferFullscreen: Boolean(candidate.preferFullscreen),
        segments: candidate.segments,
      };
}

export function parseLinkSnapshot(
  value: Json | null | undefined,
): FocusLinkSnapshot {
  const raw = asRecord(value);
  const outcome =
    raw.outcome === "done" ||
    raw.outcome === "progress" ||
    raw.outcome === "blocked" ||
    raw.outcome === "other" ||
    raw.outcome === null
      ? (raw.outcome as FocusLinkSnapshot["outcome"])
      : undefined;
  return {
    taskTitle: typeof raw.taskTitle === "string" ? raw.taskTitle : undefined,
    taskEmoji:
      typeof raw.taskEmoji === "string" || raw.taskEmoji === null
        ? (raw.taskEmoji as string | null)
        : undefined,
    taskKind:
      raw.taskKind === "one_time" || raw.taskKind === "habit"
        ? raw.taskKind
        : undefined,
    categoryName:
      typeof raw.categoryName === "string" || raw.categoryName === null
        ? (raw.categoryName as string | null)
        : undefined,
    categoryColour:
      typeof raw.categoryColour === "string" || raw.categoryColour === null
        ? (raw.categoryColour as string | null)
        : undefined,
    scheduleName:
      typeof raw.scheduleName === "string" || raw.scheduleName === null
        ? (raw.scheduleName as string | null)
        : undefined,
    outcome,
    nextStep:
      typeof raw.nextStep === "string" || raw.nextStep === null
        ? (raw.nextStep as string | null)
        : undefined,
  };
}

export function configToJson(config: FocusSessionConfig): Json {
  return {
    focusDurationSec: config.focusDurationSec,
    shortBreakSec: config.shortBreakSec,
    longBreakSec: config.longBreakSec,
    cyclesBeforeLongBreak: config.cyclesBeforeLongBreak,
    targetCycles: config.targetCycles,
    autoStartBreaks: config.autoStartBreaks,
    autoStartFocus: config.autoStartFocus,
    soundEnabled: config.soundEnabled,
    vibrationEnabled: config.vibrationEnabled,
    notifyOnPhaseEnd: config.notifyOnPhaseEnd,
    completeTaskOnSessionEnd: config.completeTaskOnSessionEnd,
    keepScreenAwake: config.keepScreenAwake,
    preferFullscreen: config.preferFullscreen,
    segments: config.segments,
  };
}

export function linkSnapshotToJson(snapshot: FocusLinkSnapshot): Json {
  return { ...snapshot };
}

export function mapIntervalRow(row: FocusIntervalRow): FocusInterval {
  return {
    id: row.id,
    kind: row.kind as FocusPhaseKind,
    sequence: row.sequence,
    cycleIndex: row.cycle_index,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    plannedDurationSec: row.planned_duration_sec,
  };
}

export function mapSessionRow(
  row: FocusSessionRow,
  intervals: FocusIntervalRow[] = [],
): FocusSession {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status as FocusSessionStatus,
    mode: row.mode as FocusMode,
    title: row.title,
    presetId: row.preset_id,
    taskId: row.task_id,
    categoryId: row.category_id,
    scheduleId: row.schedule_id,
    occurrenceDate: row.occurrence_date,
    plannedFocusSec: row.planned_focus_sec,
    focusSec: row.focus_sec,
    pausedSec: row.paused_sec,
    breakSec: row.break_sec,
    currentPhaseKind: row.current_phase_kind as FocusPhaseKind | null,
    currentCycle: row.current_cycle,
    config: parseSessionConfig(row.config, {
      focusDurationSec: row.planned_focus_sec,
      completeTaskOnSessionEnd: row.complete_task_on_end,
    }),
    linkSnapshot: parseLinkSnapshot(row.link_snapshot),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    notes: row.notes,
    distractions: asStringArray(row.distractions),
    subjectiveFocus: row.subjective_focus,
    subjectiveEnergy: row.subjective_energy,
    completeTaskOnEnd: row.complete_task_on_end,
    taskCompletionApplied: row.task_completion_applied,
    revision: row.revision,
    intervals: intervals
      .map(mapIntervalRow)
      .sort((left, right) => left.sequence - right.sequence),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPresetRow(row: FocusPresetRow): FocusPreset {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    emoji: row.emoji ?? null,
    intention: row.intention ?? null,
    mode: row.mode as FocusMode,
    focusDurationSec: row.focus_duration_sec,
    shortBreakSec: row.short_break_sec,
    longBreakSec: row.long_break_sec,
    cyclesBeforeLongBreak: row.cycles_before_long_break,
    targetCycles: row.target_cycles,
    autoStartBreaks: row.auto_start_breaks,
    autoStartFocus: row.auto_start_focus,
    soundEnabled: row.sound_enabled,
    vibrationEnabled: row.vibration_enabled,
    notifyOnPhaseEnd: row.notify_on_phase_end,
    completeTaskOnSessionEnd: row.complete_task_on_session_end,
    keepScreenAwake: row.keep_screen_awake,
    preferFullscreen: row.prefer_fullscreen,
    segments: parseFocusSegments(row.segments),
    isFavorite: row.is_favorite,
    sortOrder: row.sort_order,
    defaultCategoryId: row.default_category_id ?? null,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function presetToRowPayload(
  userId: string,
  preset: Omit<FocusPreset, "id" | "userId" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
) {
  return {
    ...(preset.id ? { id: preset.id } : {}),
    user_id: userId,
    name: preset.name,
    emoji: preset.emoji,
    intention: preset.intention,
    mode: preset.mode,
    focus_duration_sec: preset.focusDurationSec,
    short_break_sec: preset.shortBreakSec,
    long_break_sec: preset.longBreakSec,
    cycles_before_long_break: preset.cyclesBeforeLongBreak,
    target_cycles: preset.targetCycles,
    auto_start_breaks: preset.autoStartBreaks,
    auto_start_focus: preset.autoStartFocus,
    sound_enabled: preset.soundEnabled,
    vibration_enabled: preset.vibrationEnabled,
    notify_on_phase_end: preset.notifyOnPhaseEnd,
    complete_task_on_session_end: preset.completeTaskOnSessionEnd,
    keep_screen_awake: preset.keepScreenAwake,
    prefer_fullscreen: preset.preferFullscreen,
    segments: preset.segments,
    is_favorite: preset.isFavorite,
    sort_order: preset.sortOrder,
    default_category_id: preset.defaultCategoryId,
    archived_at: preset.archivedAt,
  };
}

export function mapGoalRow(row: FocusGoalRow): FocusGoal {
  const metric = row.metric ?? "focus_seconds";
  const targetValue = row.target_value ?? row.target_focus_sec;
  const considered =
    Array.isArray(row.considered_days) && row.considered_days.length > 0
      ? row.considered_days.filter(
          (day): day is number =>
            typeof day === "number" && day >= 0 && day <= 6,
        )
      : [0, 1, 2, 3, 4, 5, 6];
  return {
    id: row.id,
    userId: row.user_id,
    period: "weekly",
    targetFocusSec:
      metric === "focus_seconds" ? targetValue : row.target_focus_sec,
    metric,
    targetValue,
    scope: row.scope ?? "global",
    categoryId: row.category_id ?? null,
    presetId: row.preset_id ?? null,
    startDate: row.start_date ?? row.created_at.slice(0, 10),
    consideredDays: considered.length > 0 ? considered : [0, 1, 2, 3, 4, 5, 6],
    isPrimary: Boolean(row.is_primary),
    sortOrder: row.sort_order ?? 0,
    timezone: row.timezone,
    weekStartsOn: row.week_starts_on,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function goalToRowPayload(
  userId: string,
  goal: Omit<FocusGoal, "id" | "userId" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
) {
  const targetFocusSec =
    goal.metric === "focus_seconds"
      ? goal.targetValue
      : goal.targetFocusSec || goal.targetValue;
  return {
    ...(goal.id ? { id: goal.id } : {}),
    user_id: userId,
    period: "weekly" as const,
    target_focus_sec: Math.max(1, targetFocusSec),
    metric: goal.metric,
    target_value: goal.targetValue,
    scope: goal.scope,
    category_id: goal.categoryId,
    preset_id: goal.presetId,
    start_date: goal.startDate,
    considered_days: goal.consideredDays,
    is_primary: goal.isPrimary,
    sort_order: goal.sortOrder,
    timezone: goal.timezone,
    week_starts_on: goal.weekStartsOn,
    active: goal.active,
  };
}

export function sessionToRowPayload(session: FocusSession) {
  return {
    id: session.id,
    user_id: session.userId,
    status: session.status,
    mode: session.mode,
    title: session.title,
    preset_id: session.presetId,
    task_id: session.taskId,
    category_id: session.categoryId,
    schedule_id: session.scheduleId,
    occurrence_date: session.occurrenceDate,
    planned_focus_sec: session.plannedFocusSec,
    focus_sec: session.focusSec,
    paused_sec: session.pausedSec,
    break_sec: session.breakSec,
    current_phase_kind: session.currentPhaseKind,
    current_cycle: session.currentCycle,
    config: configToJson(session.config),
    link_snapshot: linkSnapshotToJson(session.linkSnapshot),
    started_at: session.startedAt,
    ended_at: session.endedAt,
    notes: session.notes,
    distractions: session.distractions,
    subjective_focus: session.subjectiveFocus,
    subjective_energy: session.subjectiveEnergy,
    complete_task_on_end: session.completeTaskOnEnd,
    task_completion_applied: session.taskCompletionApplied,
    revision: session.revision,
  };
}

export function intervalToRowPayload(
  session: FocusSession,
  interval: FocusInterval,
) {
  return {
    id: interval.id,
    user_id: session.userId,
    session_id: session.id,
    kind: interval.kind,
    sequence: interval.sequence,
    cycle_index: interval.cycleIndex,
    started_at: interval.startedAt,
    ended_at: interval.endedAt,
    planned_duration_sec: interval.plannedDurationSec,
  };
}
