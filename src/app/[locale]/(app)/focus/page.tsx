import { createClient } from "@/lib/supabase/server";
import { FocusHome } from "@/features/focus/focus-home";
import { mapGoalRow, mapPresetRow, mapSessionRow } from "@/features/focus/mappers";
import { localWeek, localDate } from "@/lib/dates/timezone";
import type { FocusSession } from "@/features/focus/types";
import { buildFocusDraftFromTask } from "@/features/focus/task-link";
import type { SessionStartDraft } from "@/features/focus/session-start-dialog";

export default async function FocusPage({
  searchParams,
}: {
  searchParams: Promise<{ taskId?: string; date?: string }>;
}) {
  const params = await searchParams;
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
  const today = localDate(timezone);

  const [
    { data: activeRow },
    { data: recentRows },
    { data: weekRows },
    { data: presetRows },
    { data: goalRow },
    { data: taskRows },
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
    db
      .from("tasks")
      .select("id,title,emoji,task_kind,category_id,schedule_id")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(80),
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

  let initialDraft: SessionStartDraft | null = null;
  const linkTaskId = params.taskId;
  const linkDate =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : today;

  if (linkTaskId) {
    const { data: task } = await db
      .from("tasks")
      .select(
        "id,title,emoji,task_kind,category_id,schedule_id,start_date,end_date,archived_at,recurrence_type,recurrence_config",
      )
      .eq("id", linkTaskId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (task && !task.archived_at) {
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
      initialDraft = buildFocusDraftFromTask({
        task,
        occurrenceDate: linkDate,
        category,
        schedule,
      });
      // Ensure linked task appears in the configurator select.
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

  return (
    <FocusHome
      activeSession={activeSession}
      recentSessions={recentSessions}
      presets={(presetRows ?? []).map(mapPresetRow)}
      goal={goalRow ? mapGoalRow(goalRow) : null}
      weekSessions={weekSessions}
      timezone={timezone}
      weekStartsOn={weekStartsOn}
      tasks={tasks}
      initialDraft={initialDraft}
      autoOpenConfigurator={Boolean(initialDraft)}
    />
  );
}
