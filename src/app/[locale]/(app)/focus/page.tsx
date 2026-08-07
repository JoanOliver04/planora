import { createClient } from "@/lib/supabase/server";
import { FocusHome } from "@/features/focus/focus-home";
import { mapGoalRow, mapPresetRow, mapSessionRow } from "@/features/focus/mappers";
import { localWeek } from "@/lib/dates/timezone";
import type { FocusSession } from "@/features/focus/types";

export default async function FocusPage() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("timezone,week_starts_on")
    .eq("id", user.id)
    .single();

  const timezone = profile?.timezone ?? "Europe/Madrid";
  const weekStartsOn = profile?.week_starts_on === 0 ? 0 : 1;
  const week = localWeek(timezone, new Date(), weekStartsOn);

  const [
    { data: activeRow },
    { data: recentRows },
    { data: weekRows },
    { data: presetRows },
    { data: goalRow },
  ] = await Promise.all([
    db
      .from("focus_sessions")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["running", "paused", "on_break"])
      .maybeSingle(),
    db
      .from("focus_sessions")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["completed", "cancelled"])
      .order("started_at", { ascending: false })
      .limit(8),
    db
      .from("focus_sessions")
      .select("*")
      .eq("user_id", user.id)
      .gte("started_at", `${week.start}T00:00:00.000Z`)
      .lte("started_at", `${week.end}T23:59:59.999Z`)
      .order("started_at", { ascending: false }),
    db
      .from("focus_presets")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .limit(12),
    db
      .from("focus_goals")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true)
      .eq("period", "weekly")
      .maybeSingle(),
  ]);

  const sessionIds = [
    ...new Set(
      [activeRow?.id, ...(recentRows ?? []).map((row) => row.id)].filter(
        Boolean,
      ) as string[],
    ),
  ];

  type IntervalRow = {
    id: string;
    user_id: string;
    session_id: string;
    kind: "focus" | "short_break" | "long_break" | "pause";
    sequence: number;
    cycle_index: number | null;
    started_at: string;
    ended_at: string | null;
    planned_duration_sec: number | null;
    created_at: string;
  };

  let intervalRows: IntervalRow[] = [];
  if (sessionIds.length > 0) {
    const { data } = await db
      .from("focus_intervals")
      .select("*")
      .eq("user_id", user.id)
      .in("session_id", sessionIds)
      .order("sequence", { ascending: true });
    intervalRows = data ?? [];
  }

  const intervalsBySession = new Map<string, IntervalRow[]>();
  for (const interval of intervalRows) {
    const list = intervalsBySession.get(interval.session_id) ?? [];
    list.push(interval);
    intervalsBySession.set(interval.session_id, list);
  }

  const activeSession = activeRow
    ? mapSessionRow(activeRow, intervalsBySession.get(activeRow.id) ?? [])
    : null;

  const recentSessions: FocusSession[] = (recentRows ?? []).map((row) =>
    mapSessionRow(row, intervalsBySession.get(row.id) ?? []),
  );

  // Week sessions may include the active one; map without full intervals for totals.
  const weekSessions: FocusSession[] = (weekRows ?? []).map((row) =>
    mapSessionRow(
      row,
      row.id === activeRow?.id ? (intervalsBySession.get(row.id) ?? []) : [],
    ),
  );

  return (
    <FocusHome
      activeSession={activeSession}
      recentSessions={recentSessions}
      presets={(presetRows ?? []).map(mapPresetRow)}
      goal={goalRow ? mapGoalRow(goalRow) : null}
      weekSessions={weekSessions}
      timezone={timezone}
      weekStartsOn={weekStartsOn}
    />
  );
}
