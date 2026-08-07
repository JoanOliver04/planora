"use server";

import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  FocusError,
  isFocusError,
  type FocusActionResult,
} from "./errors";
import {
  applyFocusAction,
  type FocusDomainAction,
} from "./state-machine";
import {
  fetchActiveFocusSession,
  fetchFocusSessionById,
  persistFocusSession,
} from "./repository";
import {
  completeLinkedTaskSchema,
  focusGoalInputSchema,
  focusPresetInputSchema,
  focusTransitionSchema,
  startFocusSessionSchema,
  updateFocusMetadataSchema,
  type FocusGoalInput,
  type FocusPresetInput,
  type FocusTransitionInput,
  type StartFocusSessionInput,
  type UpdateFocusMetadataInput,
} from "./validation";
import type { FocusGoal, FocusPreset, FocusSession } from "./types";
import {
  configToJson,
  goalToRowPayload,
  linkSnapshotToJson,
  mapGoalRow,
  mapPresetRow,
  presetToRowPayload,
} from "./mappers";
import {
  aggregateTaskFocusStats,
  isTaskOccurrenceAllowed,
} from "./task-link";
import { FOCUS_MAX_GOALS } from "./goals";
import { localDate } from "@/lib/dates/timezone";

async function auth() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new FocusError("UNAUTHORIZED", "Authentication required");
  return { db, user };
}

function fail(error: unknown): FocusActionResult<never> {
  if (isFocusError(error)) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors,
      },
    };
  }
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_root";
      fieldErrors[key] = fieldErrors[key] ?? [];
      fieldErrors[key].push(issue.message);
    }
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid focus input",
        fieldErrors,
      },
    };
  }
  return {
    ok: false,
    error: {
      code: "DATABASE_ERROR",
      message: "Unable to update focus session",
    },
  };
}

const refresh = () => revalidatePath("/", "layout");

export async function startFocusSessionAction(
  input: unknown,
): Promise<FocusActionResult<FocusSession>> {
  try {
    const value = startFocusSessionSchema.parse(input) as StartFocusSessionInput;
    if (value.taskId && !value.occurrenceDate) {
      throw new FocusError(
        "VALIDATION_ERROR",
        "An occurrence date is required when a task is linked.",
      );
    }
    if (value.completeTaskOnEnd && (!value.taskId || !value.occurrenceDate)) {
      throw new FocusError(
        "VALIDATION_ERROR",
        "Completing a task on end requires a linked task and occurrence date.",
      );
    }
    const { db, user } = await auth();
    await assertOwnedLinks(db, user.id, value);
    const active = await fetchActiveFocusSession(db, user.id);
    const result = applyFocusAction(active, {
      type: "start",
      input: value,
      userId: user.id,
    });
    // Never trust a client-supplied user id; re-stamp from auth.
    const ownedSession = { ...result.session, userId: user.id };
    await persistFocusSession(db, null, ownedSession);
    refresh();
    return { ok: true, data: ownedSession };
  } catch (error) {
    return fail(error);
  }
}

async function assertOwnedLinks(
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  value: StartFocusSessionInput,
) {
  if (value.taskId) {
    const { data, error } = await db
      .from("tasks")
      .select("id,archived_at")
      .eq("id", value.taskId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data || data.archived_at) {
      throw new FocusError("VALIDATION_ERROR", "Linked task is not available");
    }
  }
  if (value.categoryId) {
    const { data, error } = await db
      .from("categories")
      .select("id")
      .eq("id", value.categoryId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) {
      throw new FocusError(
        "VALIDATION_ERROR",
        "Linked category is not available",
      );
    }
  }
  if (value.scheduleId) {
    const { data, error } = await db
      .from("schedules")
      .select("id")
      .eq("id", value.scheduleId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) {
      throw new FocusError(
        "VALIDATION_ERROR",
        "Linked schedule is not available",
      );
    }
  }
  if (value.presetId) {
    const { data, error } = await db
      .from("focus_presets")
      .select("id")
      .eq("id", value.presetId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) {
      throw new FocusError("VALIDATION_ERROR", "Linked preset is not available");
    }
  }
}

export async function transitionFocusSessionAction(
  input: unknown,
): Promise<FocusActionResult<FocusSession>> {
  try {
    const value = focusTransitionSchema.parse(input) as FocusTransitionInput;
    const { db, user } = await auth();
    const current = await fetchFocusSessionById(db, user.id, value.sessionId);
    if (!current) {
      throw new FocusError("NOT_FOUND", "Focus session not found.");
    }

    const domainAction = toDomainAction(value);
    const result = applyFocusAction(current, domainAction, {
      expectedRevision: value.expectedRevision,
      now: resolveClientActionNow(current, value.clientAt),
    });
    await persistFocusSession(db, current, result.session);

    // Optional auto-complete of linked task when the user enabled it for this session.
    if (
      value.type === "complete" &&
      result.session.status === "completed" &&
      result.session.completeTaskOnEnd &&
      result.session.taskId &&
      result.session.occurrenceDate &&
      !result.session.taskCompletionApplied
    ) {
      try {
        await applyLinkedTaskCompletion(db, user.id, result.session, {
          force: false,
        });
        const refreshed = await fetchFocusSessionById(
          db,
          user.id,
          result.session.id,
        );
        refresh();
        return { ok: true, data: refreshed ?? result.session };
      } catch (autoError) {
        // Session is saved; surface that auto-complete did not apply so the UI can retry.
        const refreshed = await fetchFocusSessionById(
          db,
          user.id,
          result.session.id,
        );
        refresh();
        if (isFocusError(autoError) && autoError.code === "VALIDATION_ERROR") {
          return {
            ok: true,
            data: refreshed ?? result.session,
          };
        }
        return { ok: true, data: refreshed ?? result.session };
      }
    }

    refresh();
    return { ok: true, data: result.session };
  } catch (error) {
    return fail(error);
  }
}

export async function completeLinkedTaskFromFocusAction(
  input: unknown,
): Promise<FocusActionResult<FocusSession>> {
  try {
    const value = completeLinkedTaskSchema.parse(input);
    const { db, user } = await auth();
    const session = await fetchFocusSessionById(db, user.id, value.sessionId);
    if (!session) throw new FocusError("NOT_FOUND", "Focus session not found.");
    if (session.status !== "completed") {
      throw new FocusError(
        "VALIDATION_ERROR",
        "Only a completed focus session can complete a linked task.",
      );
    }
    if (session.revision !== value.expectedRevision) {
      throw new FocusError(
        "REVISION_CONFLICT",
        "This focus session was updated elsewhere. Reload and try again.",
      );
    }
    if (session.taskId !== value.taskId) {
      throw new FocusError(
        "VALIDATION_ERROR",
        "The session is not linked to that task.",
      );
    }
    // Never trust a client-supplied occurrence date different from the session.
    if (
      !session.occurrenceDate ||
      value.occurrenceDate !== session.occurrenceDate
    ) {
      throw new FocusError(
        "VALIDATION_ERROR",
        "Occurrence date must match the focus session.",
      );
    }
    if (session.taskCompletionApplied) {
      return { ok: true, data: session };
    }

    await applyLinkedTaskCompletion(db, user.id, session, {
      force: value.force,
    });

    const updated = await fetchFocusSessionById(db, user.id, session.id);
    refresh();
    return { ok: true, data: updated ?? session };
  } catch (error) {
    return fail(error);
  }
}

export async function getTaskFocusStatsAction(input: unknown) {
  try {
    const value = z
      .object({ taskId: z.string().uuid() })
      .parse(input);
    const { db, user } = await auth();
    const { data, error } = await db
      .from("focus_sessions")
      .select("task_id,focus_sec,started_at,status")
      .eq("user_id", user.id)
      .eq("task_id", value.taskId)
      .order("started_at", { ascending: false })
      .limit(200);
    if (error) {
      throw new FocusError("DATABASE_ERROR", "Unable to load focus stats");
    }
    return {
      ok: true as const,
      data: aggregateTaskFocusStats(
        (data ?? []).map((row) => ({
          taskId: row.task_id,
          focusSec: row.focus_sec,
          startedAt: row.started_at,
          status: row.status,
        })),
        value.taskId,
      ),
    };
  } catch (error) {
    return fail(error);
  }
}

async function applyLinkedTaskCompletion(
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  session: FocusSession,
  options: { force: boolean },
) {
  if (!session.taskId || !session.occurrenceDate) {
    throw new FocusError("VALIDATION_ERROR", "Session has no linked occurrence");
  }

  const { data: task, error: taskError } = await db
    .from("tasks")
    .select(
      "id,title,emoji,task_kind,category_id,schedule_id,start_date,end_date,archived_at,recurrence_type,recurrence_config",
    )
    .eq("id", session.taskId)
    .eq("user_id", userId)
    .maybeSingle();

  if (taskError || !task) {
    throw new FocusError("NOT_FOUND", "Linked task was not found");
  }
  if (task.archived_at) {
    throw new FocusError(
      "VALIDATION_ERROR",
      "Archived tasks cannot be completed from Focus",
    );
  }

  if (!options.force && !isTaskOccurrenceAllowed(task, session.occurrenceDate)) {
    throw new FocusError(
      "VALIDATION_ERROR",
      "This habit is not expected on that date",
    );
  }

  const { data: category } = task.category_id
    ? await db
        .from("categories")
        .select("name,colour")
        .eq("id", task.category_id)
        .eq("user_id", userId)
        .maybeSingle()
    : { data: null };

  const { data: existing } = await db
    .from("task_completions")
    .select("id")
    .eq("user_id", userId)
    .eq("task_id", task.id)
    .eq("occurrence_date", session.occurrenceDate)
    .maybeSingle();

  if (!existing) {
    const { error: insertError } = await db.from("task_completions").insert({
      user_id: userId,
      task_id: task.id,
      occurrence_date: session.occurrenceDate,
      task_snapshot: {
        title: task.title,
        emoji: task.emoji,
        category_name: category?.name ?? null,
        category_colour: category?.colour ?? null,
      },
    });
    if (insertError) {
      throw new FocusError("DATABASE_ERROR", "Unable to complete the task");
    }
  }

  const { data: updated, error: updateError } = await db
    .from("focus_sessions")
    .update({
      task_completion_applied: true,
      revision: session.revision + 1,
    })
    .eq("id", session.id)
    .eq("user_id", userId)
    .eq("revision", session.revision)
    .select("id")
    .maybeSingle();
  if (updateError) {
    throw new FocusError("DATABASE_ERROR", "Unable to update focus session");
  }
  if (!updated) {
    throw new FocusError(
      "REVISION_CONFLICT",
      "This focus session was updated elsewhere. Reload and try again.",
    );
  }
}

export async function updateFocusSessionMetadataAction(
  input: unknown,
): Promise<FocusActionResult<FocusSession>> {
  try {
    const value = updateFocusMetadataSchema.parse(
      input,
    ) as UpdateFocusMetadataInput;
    const { db, user } = await auth();
    const current = await fetchFocusSessionById(db, user.id, value.sessionId);
    if (!current) {
      throw new FocusError("NOT_FOUND", "Focus session not found.");
    }
    if (current.revision !== value.expectedRevision) {
      throw new FocusError(
        "REVISION_CONFLICT",
        "This focus session was updated elsewhere. Reload and try again.",
      );
    }

    const nextLink = { ...current.linkSnapshot };
    if (value.outcome !== undefined) {
      nextLink.outcome = value.outcome;
    }
    if (value.nextStep !== undefined) {
      nextLink.nextStep = value.nextStep ? value.nextStep.trim() || null : null;
    }

    const next: FocusSession = {
      ...current,
      title: value.title === undefined ? current.title : value.title,
      notes: value.notes === undefined ? current.notes : value.notes,
      distractions:
        value.distractions === undefined
          ? current.distractions
          : value.distractions,
      subjectiveFocus:
        value.subjectiveFocus === undefined
          ? current.subjectiveFocus
          : value.subjectiveFocus,
      subjectiveEnergy:
        value.subjectiveEnergy === undefined
          ? current.subjectiveEnergy
          : value.subjectiveEnergy,
      linkSnapshot: nextLink,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    };

    const { data, error } = await db
      .from("focus_sessions")
      .update({
        title: next.title,
        notes: next.notes,
        distractions: next.distractions,
        subjective_focus: next.subjectiveFocus,
        subjective_energy: next.subjectiveEnergy,
        revision: next.revision,
        config: configToJson(next.config),
        link_snapshot: linkSnapshotToJson(next.linkSnapshot),
      })
      .eq("id", next.id)
      .eq("user_id", user.id)
      .eq("revision", current.revision)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new FocusError("DATABASE_ERROR", "Unable to update focus session");
    }
    if (!data) {
      throw new FocusError(
        "REVISION_CONFLICT",
        "This focus session was updated elsewhere. Reload and try again.",
      );
    }

    refresh();
    return { ok: true, data: next };
  } catch (error) {
    return fail(error);
  }
}

/** Permanently discard a session (and cascaded intervals). Requires confirmation in UI. */
export async function discardFocusSessionAction(
  input: unknown,
): Promise<FocusActionResult<{ id: string }>> {
  try {
    const value = z
      .object({
        sessionId: z.string().uuid(),
        expectedRevision: z.number().int().min(1),
      })
      .parse(input);
    const { db, user } = await auth();
    const current = await fetchFocusSessionById(db, user.id, value.sessionId);
    if (!current) {
      throw new FocusError("NOT_FOUND", "Focus session not found.");
    }
    if (current.revision !== value.expectedRevision) {
      throw new FocusError(
        "REVISION_CONFLICT",
        "This focus session was updated elsewhere. Reload and try again.",
      );
    }

    const { data, error } = await db
      .from("focus_sessions")
      .delete()
      .eq("id", current.id)
      .eq("user_id", user.id)
      .eq("revision", current.revision)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new FocusError("DATABASE_ERROR", "Unable to discard focus session");
    }
    if (!data) {
      throw new FocusError(
        "REVISION_CONFLICT",
        "This focus session was updated elsewhere. Reload and try again.",
      );
    }

    refresh();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function saveFocusPresetAction(
  input: unknown,
): Promise<FocusActionResult<FocusPreset>> {
  try {
    const value = focusPresetInputSchema.parse(input) as FocusPresetInput;
    const { db, user } = await auth();

    if (value.defaultCategoryId) {
      const { data: category } = await db
        .from("categories")
        .select("id")
        .eq("id", value.defaultCategoryId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!category) {
        throw new FocusError(
          "VALIDATION_ERROR",
          "Default category is not available",
        );
      }
    }

    let sortOrder = value.sortOrder;
    if (sortOrder == null) {
      const { data: last } = await db
        .from("focus_presets")
        .select("sort_order")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      sortOrder = (last?.sort_order ?? -1) + 1;
    }

    const payload = presetToRowPayload(user.id, {
      id: value.id,
      name: value.name,
      emoji: value.emoji ?? null,
      intention: value.intention ?? null,
      mode: value.mode,
      focusDurationSec: value.focusDurationSec ?? null,
      shortBreakSec: value.shortBreakSec ?? null,
      longBreakSec: value.longBreakSec ?? null,
      cyclesBeforeLongBreak: value.cyclesBeforeLongBreak ?? null,
      targetCycles: value.targetCycles ?? null,
      autoStartBreaks: value.autoStartBreaks,
      autoStartFocus: value.autoStartFocus,
      soundEnabled: value.soundEnabled,
      vibrationEnabled: value.vibrationEnabled,
      notifyOnPhaseEnd: value.notifyOnPhaseEnd,
      completeTaskOnSessionEnd: value.completeTaskOnSessionEnd,
      keepScreenAwake: value.keepScreenAwake,
      preferFullscreen: value.preferFullscreen,
      segments: value.segments,
      isFavorite: value.isFavorite,
      sortOrder,
      defaultCategoryId: value.defaultCategoryId ?? null,
      archivedAt: null,
    });

    if (value.id) {
      const { data, error } = await db
        .from("focus_presets")
        .update(payload)
        .eq("id", value.id)
        .eq("user_id", user.id)
        .select("*")
        .maybeSingle();
      if (error) {
        throw new FocusError("DATABASE_ERROR", "Unable to update focus preset");
      }
      if (!data) {
        throw new FocusError("NOT_FOUND", "Focus preset not found.");
      }
      refresh();
      return { ok: true, data: mapPresetRow(data) };
    }

    const { data, error } = await db
      .from("focus_presets")
      .insert(payload)
      .select("*")
      .single();
    if (error || !data) {
      throw new FocusError("DATABASE_ERROR", "Unable to create focus preset");
    }
    refresh();
    return { ok: true, data: mapPresetRow(data) };
  } catch (error) {
    return fail(error);
  }
}

export async function duplicateFocusPresetAction(
  input: unknown,
): Promise<FocusActionResult<FocusPreset>> {
  try {
    const value = z.object({ presetId: z.string().uuid() }).parse(input);
    const { db, user } = await auth();
    const { data: source } = await db
      .from("focus_presets")
      .select("*")
      .eq("id", value.presetId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!source) {
      throw new FocusError("NOT_FOUND", "Focus preset not found.");
    }
    const mapped = mapPresetRow(source);
    const copyName =
      mapped.name.length > 70
        ? `${mapped.name.slice(0, 70)}…`
        : `${mapped.name} copy`;
    return saveFocusPresetAction({
      name: copyName,
      emoji: mapped.emoji,
      intention: mapped.intention,
      mode: mapped.mode,
      focusDurationSec: mapped.focusDurationSec,
      shortBreakSec: mapped.shortBreakSec,
      longBreakSec: mapped.longBreakSec,
      cyclesBeforeLongBreak: mapped.cyclesBeforeLongBreak,
      targetCycles: mapped.targetCycles,
      autoStartBreaks: mapped.autoStartBreaks,
      autoStartFocus: mapped.autoStartFocus,
      soundEnabled: mapped.soundEnabled,
      vibrationEnabled: mapped.vibrationEnabled,
      notifyOnPhaseEnd: mapped.notifyOnPhaseEnd,
      completeTaskOnSessionEnd: mapped.completeTaskOnSessionEnd,
      keepScreenAwake: mapped.keepScreenAwake,
      preferFullscreen: mapped.preferFullscreen,
      segments: mapped.segments,
      isFavorite: false,
      defaultCategoryId: mapped.defaultCategoryId,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function setFocusPresetArchivedAction(
  input: unknown,
): Promise<FocusActionResult<FocusPreset>> {
  try {
    const value = z
      .object({
        presetId: z.string().uuid(),
        archived: z.boolean(),
      })
      .parse(input);
    const { db, user } = await auth();
    const { data, error } = await db
      .from("focus_presets")
      .update({
        archived_at: value.archived ? new Date().toISOString() : null,
      })
      .eq("id", value.presetId)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();
    if (error) {
      throw new FocusError("DATABASE_ERROR", "Unable to archive focus preset");
    }
    if (!data) {
      throw new FocusError("NOT_FOUND", "Focus preset not found.");
    }
    refresh();
    return { ok: true, data: mapPresetRow(data) };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteFocusPresetAction(
  input: unknown,
): Promise<FocusActionResult<{ id: string }>> {
  try {
    const value = z.object({ presetId: z.string().uuid() }).parse(input);
    const { db, user } = await auth();
    const { data, error } = await db
      .from("focus_presets")
      .delete()
      .eq("id", value.presetId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) {
      throw new FocusError("DATABASE_ERROR", "Unable to delete focus preset");
    }
    if (!data) {
      throw new FocusError("NOT_FOUND", "Focus preset not found.");
    }
    refresh();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function reorderFocusPresetsAction(
  input: unknown,
): Promise<FocusActionResult<{ count: number }>> {
  try {
    const value = z
      .object({
        orderedIds: z
          .array(z.string().uuid())
          .min(1)
          .max(200)
          .refine((ids) => new Set(ids).size === ids.length),
      })
      .parse(input);
    const { db } = await auth();
    const { error } = await db.rpc("reorder_resources", {
      resource_type: "focus_presets",
      ordered_ids: value.orderedIds,
    });
    if (error) {
      throw new FocusError("DATABASE_ERROR", "Unable to reorder focus presets");
    }
    refresh();
    return { ok: true, data: { count: value.orderedIds.length } };
  } catch (error) {
    return fail(error);
  }
}

export async function toggleFocusPresetFavoriteAction(
  input: unknown,
): Promise<FocusActionResult<FocusPreset>> {
  try {
    const value = z
      .object({
        presetId: z.string().uuid(),
        isFavorite: z.boolean(),
      })
      .parse(input);
    const { db, user } = await auth();
    const { data, error } = await db
      .from("focus_presets")
      .update({ is_favorite: value.isFavorite })
      .eq("id", value.presetId)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();
    if (error) {
      throw new FocusError("DATABASE_ERROR", "Unable to update favorite");
    }
    if (!data) {
      throw new FocusError("NOT_FOUND", "Focus preset not found.");
    }
    refresh();
    return { ok: true, data: mapPresetRow(data) };
  } catch (error) {
    return fail(error);
  }
}

export async function saveFocusGoalAction(
  input: unknown,
): Promise<FocusActionResult<FocusGoal>> {
  try {
    const value = focusGoalInputSchema.parse(input) as FocusGoalInput;
    const { db, user } = await auth();

    if (value.scope === "category" && value.categoryId) {
      const { data: category } = await db
        .from("categories")
        .select("id")
        .eq("id", value.categoryId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!category) {
        throw new FocusError("VALIDATION_ERROR", "Category is not available");
      }
    }
    if (value.scope === "preset" && value.presetId) {
      const { data: preset } = await db
        .from("focus_presets")
        .select("id")
        .eq("id", value.presetId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!preset) {
        throw new FocusError("VALIDATION_ERROR", "Preset is not available");
      }
    }

    const { count } = await db
      .from("focus_goals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (!value.id && (count ?? 0) >= FOCUS_MAX_GOALS) {
      throw new FocusError(
        "VALIDATION_ERROR",
        `At most ${FOCUS_MAX_GOALS} Focus goals are supported`,
      );
    }

    const targetValue =
      value.metric === "focus_seconds"
        ? (value.targetValue ?? value.targetFocusSec ?? 1)
        : value.targetValue;
    const startDate =
      value.startDate ?? localDate(value.timezone, new Date());

    let sortOrder = value.sortOrder;
    if (sortOrder == null) {
      const { data: last } = await db
        .from("focus_goals")
        .select("sort_order")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      sortOrder = (last?.sort_order ?? -1) + 1;
    }

    // Ensure single primary: clear others when marking primary+active.
    if (value.isPrimary && value.active) {
      await db
        .from("focus_goals")
        .update({ is_primary: false })
        .eq("user_id", user.id)
        .eq("active", true)
        .neq("id", value.id ?? "00000000-0000-4000-8000-000000000000");
    }

    const payload = goalToRowPayload(user.id, {
      id: value.id,
      period: "weekly",
      metric: value.metric,
      targetValue,
      targetFocusSec:
        value.metric === "focus_seconds" ? targetValue : targetValue,
      scope: value.scope,
      categoryId: value.scope === "category" ? value.categoryId ?? null : null,
      presetId: value.scope === "preset" ? value.presetId ?? null : null,
      startDate,
      consideredDays: value.consideredDays,
      isPrimary: value.isPrimary && value.active,
      sortOrder,
      timezone: value.timezone,
      weekStartsOn: value.weekStartsOn,
      active: value.active,
    });

    if (value.id) {
      const { data, error } = await db
        .from("focus_goals")
        .update(payload)
        .eq("id", value.id)
        .eq("user_id", user.id)
        .select("*")
        .maybeSingle();
      if (error) {
        throw new FocusError("DATABASE_ERROR", "Unable to update focus goal");
      }
      if (!data) {
        throw new FocusError("NOT_FOUND", "Focus goal not found.");
      }
      refresh();
      return { ok: true, data: mapGoalRow(data) };
    }

    // First active goal becomes primary when none is set.
    if (value.active && !value.isPrimary) {
      const { data: primary } = await db
        .from("focus_goals")
        .select("id")
        .eq("user_id", user.id)
        .eq("active", true)
        .eq("is_primary", true)
        .maybeSingle();
      if (!primary) {
        payload.is_primary = true;
      }
    }

    const { data, error } = await db
      .from("focus_goals")
      .insert(payload)
      .select("*")
      .single();
    if (error || !data) {
      throw new FocusError("DATABASE_ERROR", "Unable to create focus goal");
    }
    refresh();
    return { ok: true, data: mapGoalRow(data) };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteFocusGoalAction(
  input: unknown,
): Promise<FocusActionResult<{ id: string }>> {
  try {
    const value = z.object({ goalId: z.string().uuid() }).parse(input);
    const { db, user } = await auth();
    const { data, error } = await db
      .from("focus_goals")
      .delete()
      .eq("id", value.goalId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) {
      throw new FocusError("DATABASE_ERROR", "Unable to delete focus goal");
    }
    if (!data) {
      throw new FocusError("NOT_FOUND", "Focus goal not found.");
    }
    refresh();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function setFocusGoalPrimaryAction(
  input: unknown,
): Promise<FocusActionResult<FocusGoal>> {
  try {
    const value = z.object({ goalId: z.string().uuid() }).parse(input);
    const { db, user } = await auth();
    const { data: existing } = await db
      .from("focus_goals")
      .select("*")
      .eq("id", value.goalId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!existing) {
      throw new FocusError("NOT_FOUND", "Focus goal not found.");
    }
    await db
      .from("focus_goals")
      .update({ is_primary: false })
      .eq("user_id", user.id)
      .eq("active", true);
    const { data, error } = await db
      .from("focus_goals")
      .update({ is_primary: true, active: true })
      .eq("id", value.goalId)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();
    if (error || !data) {
      throw new FocusError("DATABASE_ERROR", "Unable to set primary goal");
    }
    refresh();
    return { ok: true, data: mapGoalRow(data) };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Clamp optional offline client timestamps so we never invent impossible times.
 * Window: [session.startedAt, wall + 2 minutes].
 */
function resolveClientActionNow(
  session: FocusSession,
  clientAt: string | undefined,
): number {
  const wall = Date.now();
  if (!clientAt) return wall;
  const parsed = Date.parse(clientAt);
  if (!Number.isFinite(parsed)) return wall;
  const started = Date.parse(session.startedAt);
  const lower = Number.isFinite(started) ? started : wall - 24 * 60 * 60 * 1000;
  const upper = wall + 2 * 60 * 1000;
  return Math.min(Math.max(parsed, lower), upper);
}

function toDomainAction(value: FocusTransitionInput): FocusDomainAction {
  switch (value.type) {
    case "pause":
      return { type: "pause" };
    case "resume":
      return { type: "resume" };
    case "begin_break":
      return { type: "begin_break", breakKind: value.breakKind };
    case "skip_break":
      return { type: "skip_break" };
    case "extend_break":
      return { type: "extend_break", extraSec: value.extraSec };
    case "finish_phase":
      return { type: "finish_phase" };
    case "skip_segment":
      return { type: "skip_segment" };
    case "complete":
      return {
        type: "complete",
        notes: value.notes,
        subjectiveFocus: value.subjectiveFocus,
        subjectiveEnergy: value.subjectiveEnergy,
      };
    case "cancel":
      return { type: "cancel" };
    case "recover":
      return { type: "recover" };
    case "takeover":
      return { type: "takeover" };
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}
