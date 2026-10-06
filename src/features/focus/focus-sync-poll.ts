import { createClient } from "@/lib/supabase/client";
import { mapSessionRow } from "./mappers";
import type { FocusSession, FocusSessionStatus } from "./types";
import { shouldRefetchFromPoll } from "./focus-sync";

export type FocusPollSnapshot = {
  id: string;
  revision: number;
  status: FocusSessionStatus;
  updatedAt: string;
};

/** A failed read. Callers must keep the local session; this is not "no active row". */
export class FocusPollError extends Error {
  constructor() {
    super("focus_poll_failed");
    this.name = "FocusPollError";
  }
}

async function requirePollUser(db: ReturnType<typeof createClient>) {
  const { data, error } = await db.auth.getUser();
  if (error) throw new FocusPollError();
  return data.user;
}

/** Lightweight active-session probe (no intervals). */
export async function pollActiveFocusSessionHead(): Promise<FocusPollSnapshot | null> {
  const db = createClient();
  const user = await requirePollUser(db);
  if (!user) return null;

  const { data: row, error } = await db
    .from("focus_sessions")
    .select("id,revision,status,updated_at")
    .eq("user_id", user.id)
    .in("status", ["running", "paused", "on_break"])
    .maybeSingle();

  if (error) throw new FocusPollError();
  if (!row) return null;
  return {
    id: row.id,
    revision: row.revision,
    status: row.status as FocusSessionStatus,
    updatedAt: row.updated_at,
  };
}

export async function fetchActiveFocusSessionFull(): Promise<FocusSession | null> {
  const db = createClient();
  const user = await requirePollUser(db);
  if (!user) return null;

  const { data: row, error } = await db
    .from("focus_sessions")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["running", "paused", "on_break"])
    .maybeSingle();
  if (error) throw new FocusPollError();
  if (!row) return null;

  const { data: intervals, error: intervalError } = await db
    .from("focus_intervals")
    .select("*")
    .eq("user_id", user.id)
    .eq("session_id", row.id)
    .order("sequence", { ascending: true });
  if (intervalError) throw new FocusPollError();

  return mapSessionRow(row, intervals ?? []);
}

/**
 * Compare local UI state with a cheap poll. Re-fetch full session only when needed.
 */
export async function reconcileFocusSessionFromServer(
  local: FocusSession | null,
): Promise<{
  changed: boolean;
  session: FocusSession | null;
  reason: "unchanged" | "updated" | "ended" | "started";
}> {
  let head: FocusPollSnapshot | null;
  try {
    head = await pollActiveFocusSessionHead();
  } catch {
    return { changed: false, session: local, reason: "unchanged" };
  }
  const needsFetch = shouldRefetchFromPoll({
    local,
    remoteId: head?.id ?? null,
    remoteRevision: head?.revision ?? null,
    remoteStatus: head?.status ?? null,
  });

  if (!needsFetch) {
    return { changed: false, session: local, reason: "unchanged" };
  }

  if (!head) {
    return {
      changed: Boolean(local),
      session: null,
      reason: local ? "ended" : "unchanged",
    };
  }

  let full: FocusSession | null;
  try {
    full = await fetchActiveFocusSessionFull();
  } catch {
    return { changed: false, session: local, reason: "unchanged" };
  }
  if (!full) {
    return {
      changed: Boolean(local),
      session: null,
      reason: local ? "ended" : "unchanged",
    };
  }

  if (!local) {
    return { changed: true, session: full, reason: "started" };
  }
  if (local.id !== full.id || full.revision > local.revision) {
    return { changed: true, session: full, reason: "updated" };
  }
  if (full.status !== local.status) {
    return { changed: true, session: full, reason: "updated" };
  }
  return { changed: false, session: local, reason: "unchanged" };
}
