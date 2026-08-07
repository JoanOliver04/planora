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
  focusTransitionSchema,
  startFocusSessionSchema,
  updateFocusMetadataSchema,
  type FocusTransitionInput,
  type StartFocusSessionInput,
  type UpdateFocusMetadataInput,
} from "./validation";
import type { FocusSession } from "./types";
import { configToJson, linkSnapshotToJson } from "./mappers";
import {
  aggregateTaskFocusStats,
  isTaskOccurrenceAllowed,
} from "./task-link";

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
