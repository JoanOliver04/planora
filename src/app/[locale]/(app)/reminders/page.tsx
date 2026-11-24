import { createClient } from "@/lib/supabase/server";
import { ReminderCenter } from "@/features/reminders/reminder-center";
import type { ReminderTarget } from "@/features/reminders/reminder-forms";
import { effectiveReminderTrigger } from "@/features/reminders/schedule";
import { localDate } from "@/lib/dates/timezone";
import { readWorkspaceRows } from "@/features/workspace/workspace-data";

export default async function RemindersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const db = await createClient();
  const { data: user } = await db.auth.getUser();
  if (!user.user) return null;
  const [
    { data: profile },
    { data: configuredReminders, error: reminderError },
  ] = await Promise.all([
    db
      .from("profiles")
      .select("timezone,active_schedule_id")
      .eq("id", user.user.id)
      .single(),
    readWorkspaceRows(
      db
        .from("reminders")
        .select(
          "*,task:tasks(id,title,emoji,start_date,start_time,scope),event:events(id,title,emoji,event_date,start_time)",
        )
        .eq("user_id", user.user.id)
        .order("next_trigger_at")
        .order("id"),
    ),
  ]);
  const linkedTargets = new Map<string, ReminderTarget>();
  const reminders = (configuredReminders ?? [])
    .map(({ task, event, ...reminder }) => {
      if (task) {
        linkedTargets.set("task:" + task.id, {
          id: task.id,
          title: task.title,
          emoji: task.emoji,
          date: task.start_date,
          time: task.start_time,
          type: "task",
          scope: task.scope,
        });
      }
      if (event) {
        linkedTargets.set("event:" + event.id, {
          id: event.id,
          title: event.title,
          emoji: event.emoji,
          date: event.event_date,
          time: event.start_time,
          type: "event",
        });
      }
      return reminder;
    })
    .sort(
      (a, b) =>
        Date.parse(
          effectiveReminderTrigger(a.next_trigger_at, a.snoozed_until),
        ) -
        Date.parse(
          effectiveReminderTrigger(b.next_trigger_at, b.snoozed_until),
        ),
    );
  const timezone = profile?.timezone ?? "Europe/Madrid";
  const activeScheduleId = profile?.active_schedule_id ?? null;
  const taskColumns = "id,title,emoji,start_date,start_time,schedule_id";
  const globalTasksQuery = db
    .from("tasks")
    .select(taskColumns)
    .eq("user_id", user.user.id)
    .is("schedule_id", null)
    .is("archived_at", null)
    .eq("is_active", true)
    .order("title")
    .order("id");
  const scheduleTasksQuery = activeScheduleId
    ? db
        .from("tasks")
        .select(taskColumns)
        .eq("user_id", user.user.id)
        .eq("schedule_id", activeScheduleId)
        .is("archived_at", null)
        .eq("is_active", true)
        .order("title")
        .order("id")
    : null;
  const [
    globalTasksResult,
    scheduleTasksResult,
    { data: events, error: eventError },
  ] = await Promise.all([
    readWorkspaceRows(globalTasksQuery),
    scheduleTasksQuery
      ? readWorkspaceRows(scheduleTasksQuery)
      : Promise.resolve({ data: [], error: null }),
    readWorkspaceRows(
      db
        .from("events")
        .select("id,title,emoji,event_date,start_time")
        .eq("user_id", user.user.id)
        .gte("event_date", localDate(timezone))
        .order("event_date")
        .order("id"),
    ),
  ]);
  const taskError = globalTasksResult.error ?? scheduleTasksResult.error;
  const tasks = [
    ...(globalTasksResult.data ?? []).map((task) => ({
      ...task,
      scope: "global" as const,
    })),
    ...(scheduleTasksResult.data ?? []).map((task) => ({
      ...task,
      scope: "schedule" as const,
    })),
  ];
  return (
    <ReminderCenter
      locale={locale as "es" | "en"}
      timezone={timezone}
      reminders={reminders}
      tasks={tasks}
      linkedTargets={[...linkedTargets.values()]}
      events={events ?? []}
      taskLoadError={Boolean(taskError)}
      eventLoadError={Boolean(eventError)}
      remindersLoadError={Boolean(reminderError)}
      profileLoadError={!profile}
    />
  );
}
