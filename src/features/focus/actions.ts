"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
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
  focusTransitionSchema,
  startFocusSessionSchema,
  updateFocusMetadataSchema,
  type FocusTransitionInput,
  type StartFocusSessionInput,
  type UpdateFocusMetadataInput,
} from "./validation";
import type { FocusSession } from "./types";
import { configToJson, linkSnapshotToJson } from "./mappers";

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
    const { db, user } = await auth();
    const active = await fetchActiveFocusSession(db, user.id);
    const result = applyFocusAction(active, {
      type: "start",
      input: value,
      userId: user.id,
    });
    await persistFocusSession(db, null, result.session);
    refresh();
    return { ok: true, data: result.session };
  } catch (error) {
    return fail(error);
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
    refresh();
    return { ok: true, data: result.session };
  } catch (error) {
    return fail(error);
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
