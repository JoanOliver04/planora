import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { FocusError } from "./errors";
import {
  intervalToRowPayload,
  mapSessionRow,
  sessionToRowPayload,
} from "./mappers";
import type { FocusInterval, FocusSession } from "./types";
import { openInterval } from "./time";

type Db = SupabaseClient<Database>;

export async function fetchActiveFocusSession(
  db: Db,
  userId: string,
): Promise<FocusSession | null> {
  const { data: row, error } = await db
    .from("focus_sessions")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["running", "paused", "on_break"])
    .maybeSingle();
  if (error) {
    throw new FocusError("DATABASE_ERROR", "Unable to load focus session");
  }
  if (!row) return null;
  const { data: intervals, error: intervalError } = await db
    .from("focus_intervals")
    .select("*")
    .eq("session_id", row.id)
    .eq("user_id", userId)
    .order("sequence", { ascending: true });
  if (intervalError) {
    throw new FocusError("DATABASE_ERROR", "Unable to load focus intervals");
  }
  return mapSessionRow(row, intervals ?? []);
}

export async function fetchFocusSessionById(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<FocusSession | null> {
  const { data: row, error } = await db
    .from("focus_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new FocusError("DATABASE_ERROR", "Unable to load focus session");
  }
  if (!row) return null;
  const { data: intervals, error: intervalError } = await db
    .from("focus_intervals")
    .select("*")
    .eq("session_id", row.id)
    .eq("user_id", userId)
    .order("sequence", { ascending: true });
  if (intervalError) {
    throw new FocusError("DATABASE_ERROR", "Unable to load focus intervals");
  }
  return mapSessionRow(row, intervals ?? []);
}

/**
 * Persist a full session snapshot after a domain transition.
 * Replaces interval rows for sequences present in the domain model.
 * Callers must have already applied optimistic concurrency in domain layer.
 */
export async function persistFocusSession(
  db: Db,
  previous: FocusSession | null,
  next: FocusSession,
): Promise<void> {
  // Persist only the domain snapshot; user_id must already match auth.uid() (RLS).
  const payload = sessionToRowPayload(next);
  if (previous && previous.userId !== next.userId) {
    throw new FocusError("DATABASE_ERROR", "Unable to update focus session");
  }

  if (!previous) {
    const { error } = await db.from("focus_sessions").insert(payload);
    if (error) {
      if (error.code === "23505") {
        throw new FocusError(
          "ACTIVE_SESSION_EXISTS",
          "An active focus session already exists.",
        );
      }
      throw new FocusError("DATABASE_ERROR", "Unable to create focus session");
    }
  } else {
    const { data, error } = await db
      .from("focus_sessions")
      .update(payload)
      .eq("id", next.id)
      .eq("user_id", next.userId)
      .eq("revision", previous.revision)
      .select("id")
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
  }

  await syncIntervals(db, previous, next);
}

async function syncIntervals(
  db: Db,
  previous: FocusSession | null,
  next: FocusSession,
) {
  const previousById = new Map(
    (previous?.intervals ?? []).map((interval) => [interval.id, interval]),
  );

  for (const interval of next.intervals) {
    const prior = previousById.get(interval.id);
    const row = intervalToRowPayload(next, interval);
    if (!prior) {
      const { error } = await db.from("focus_intervals").insert(row);
      if (error) {
        throw new FocusError("DATABASE_ERROR", "Unable to save focus interval");
      }
      continue;
    }
    if (intervalChanged(prior, interval)) {
      const { error } = await db
        .from("focus_intervals")
        .update({
          kind: row.kind,
          sequence: row.sequence,
          cycle_index: row.cycle_index,
          started_at: row.started_at,
          ended_at: row.ended_at,
          planned_duration_sec: row.planned_duration_sec,
        })
        .eq("id", interval.id)
        .eq("user_id", next.userId);
      if (error) {
        throw new FocusError(
          "DATABASE_ERROR",
          "Unable to update focus interval",
        );
      }
    }
  }

  // Defensive: never leave multiple open intervals.
  const open = openInterval(next);
  if (open) {
    const staleOpen = next.intervals.filter(
      (interval) => interval.endedAt == null && interval.id !== open.id,
    );
    for (const interval of staleOpen) {
      const { error } = await db
        .from("focus_intervals")
        .update({ ended_at: interval.startedAt })
        .eq("id", interval.id)
        .eq("user_id", next.userId);
      if (error) {
        throw new FocusError(
          "DATABASE_ERROR",
          "Unable to repair focus intervals",
        );
      }
    }
  }
}

function intervalChanged(left: FocusInterval, right: FocusInterval) {
  return (
    left.kind !== right.kind ||
    left.sequence !== right.sequence ||
    left.cycleIndex !== right.cycleIndex ||
    left.startedAt !== right.startedAt ||
    left.endedAt !== right.endedAt ||
    left.plannedDurationSec !== right.plannedDurationSec
  );
}
