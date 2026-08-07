import { createClient } from "@/lib/supabase/server";
import { FocusHome } from "@/features/focus/focus-home";
import {
  mapGoalRow,
  mapPresetRow,
  mapSessionRow,
} from "@/features/focus/mappers";
import { localWeek, localDate } from "@/lib/dates/timezone";
import type { FocusSession } from "@/features/focus/types";
import { resolveDeepLinkDraft } from "@/features/focus/focus-deep-link";
import type { FocusTaskSource } from "@/features/focus/task-link";
import type { SessionStartDraft } from "@/features/focus/session-start-dialog";
import { readFocusAccountFromProfilePreferences } from "@/features/focus/focus-preferences";

export default async function FocusPage({
  searchParams,
}: {
  searchParams: Promise<{
    taskId?: string;
    date?: string;
    presetId?: string;
    start?: string;
  }>;
}) {
  const params = await searchParams;
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("timezone,week_starts_on,preferences")
    .eq("id", user.id)
    .single();

  const timezone = profile?.timezone ?? "Europe/Madrid";
  const weekStartsOn = profile?.week_starts_on === 0 ? 0 : 1;
  const week = localWeek(timezone, new Date(), weekStartsOn);
  const today = localDate(timezone);
  // Local week strings are not UTC midnights — pad the query window by one day.
  const weekQueryStart = new Date(`${week.start}T00:00:00.000Z`);
  weekQueryStart.setUTCDate(weekQueryStart.getUTCDate() - 1);
  const weekQueryEnd = new Date(`${week.end}T23:59:59.999Z`);
  weekQueryEnd.setUTCDate(weekQueryEnd.getUTCDate() + 1);

  const [
    { data: activeRow },
    { data: recentRows },
    { data: weekRows },
    { data: presetRows },
    { data: goalRows },
    { data: taskRows },
    { data: categoryRows },
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
      .gte("started_at", weekQueryStart.toISOString())
      .lte("started_at", weekQueryEnd.toISOString())
      .order("started_at", { ascending: false }),
    db
      .from("focus_presets")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .limit(100),
    db
      .from("focus_goals")
      .select("*")
      .eq("user_id", user.id)
      .eq("period", "weekly")
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(10),
    db
      .from("tasks")
      .select("id,title,emoji,task_kind,category_id,schedule_id")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(80),
    db
      .from("categories")
      .select("id,name,emoji")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .limit(100),
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

  const weekSessions: FocusSession[] = (weekRows ?? []).map((row) =>
    mapSessionRow(
      row,
      row.id === activeRow?.id ? (intervalsBySession.get(row.id) ?? []) : [],
    ),
  );

  const tasks = (taskRows ?? []).map((task) => ({
    id: task.id,
    title: task.title,
    emoji: task.emoji,
    taskKind: task.task_kind,
    categoryId: task.category_id,
    scheduleId: task.schedule_id,
  }));

  const presets = (presetRows ?? []).map(mapPresetRow);
  let linkedTask: FocusTaskSource | null = null;
  let linkedCategory: {
    name: string;
    colour: string;
    emoji: string | null;
  } | null = null;
  let linkedSchedule: { name: string } | null = null;

  if (params.taskId) {
    const { data: task } = await db
      .from("tasks")
      .select(
        "id,title,emoji,task_kind,category_id,schedule_id,start_date,end_date,archived_at,recurrence_type,recurrence_config",
      )
      .eq("id", params.taskId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (task && !task.archived_at) {
      linkedTask = task;
      const [{ data: category }, { data: schedule }] = await Promise.all([
        task.category_id
          ? db
              .from("categories")
              .select("name,colour,emoji")
              .eq("id", task.category_id)
              .eq("user_id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        task.schedule_id
          ? db
              .from("schedules")
              .select("name")
              .eq("id", task.schedule_id)
              .eq("user_id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      linkedCategory = category;
      linkedSchedule = schedule;
      if (!tasks.some((item) => item.id === task.id)) {
        tasks.unshift({
          id: task.id,
          title: task.title,
          emoji: task.emoji,
          taskKind: task.task_kind,
          categoryId: task.category_id,
          scheduleId: task.schedule_id,
        });
      }
    }
  }

  const resolved = resolveDeepLinkDraft({
    params,
    today,
    presets,
    task: linkedTask,
    category: linkedCategory,
    schedule: linkedSchedule,
  });
  const initialDraft: SessionStartDraft | null = resolved.draft;
  const autoOpenConfigurator = resolved.autoOpen && !activeSession;

  return (
    <FocusHome
      activeSession={activeSession}
      recentSessions={recentSessions}
      presets={presets}
      goals={(goalRows ?? []).map(mapGoalRow)}
      weekSessions={weekSessions}
      timezone={timezone}
      weekStartsOn={weekStartsOn}
      tasks={tasks}
      categories={(categoryRows ?? []).map((category) => ({
        id: category.id,
        name: category.name,
        emoji: category.emoji,
      }))}
      accountPreferences={readFocusAccountFromProfilePreferences(
        profile?.preferences,
      )}
      initialDraft={initialDraft}
      autoOpenConfigurator={autoOpenConfigurator}
    />
  );
}
