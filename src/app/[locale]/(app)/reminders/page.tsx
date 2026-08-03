import { createClient } from "@/lib/supabase/server";
import { ReminderCenter } from "@/features/reminders/reminder-center";

export default async function RemindersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const db = await createClient();
  const { data: user } = await db.auth.getUser();
  if (!user.user) return null;
  const [{ data: profile }, { data: reminders }, { data: events }] =
    await Promise.all([
      db.from("profiles").select("timezone,active_schedule_id").eq("id", user.user.id).single(),
      db.from("reminders").select("*").eq("user_id", user.user.id).order("next_trigger_at"),
      db.from("events").select("id,title,emoji,event_date,start_time").eq("user_id", user.user.id).gte("event_date", new Date().toISOString().slice(0, 10)).order("event_date"),
    ]);
  const activeScheduleId = profile?.active_schedule_id ?? null;
  const taskColumns = "id,title,emoji,start_date,start_time,schedule_id";
  const globalTasksQuery = db
    .from("tasks")
    .select(taskColumns)
    .eq("user_id", user.user.id)
    .is("schedule_id", null)
    .is("archived_at", null)
    .eq("is_active", true);
  const scheduleTasksQuery = activeScheduleId
    ? db
        .from("tasks")
        .select(taskColumns)
        .eq("user_id", user.user.id)
        .eq("schedule_id", activeScheduleId)
        .is("archived_at", null)
        .eq("is_active", true)
    : null;
  const [globalTasksResult, scheduleTasksResult] = await Promise.all([
    globalTasksQuery,
    scheduleTasksQuery ?? Promise.resolve({ data: [], error: null }),
  ]);
  const taskError = globalTasksResult.error ?? scheduleTasksResult.error;
  const tasks = [
    ...(globalTasksResult.data ?? []).map((task) => ({ ...task, scope: "global" as const })),
    ...(scheduleTasksResult.data ?? []).map((task) => ({ ...task, scope: "schedule" as const })),
  ].filter((task, index, all) => all.findIndex((item) => item.id === task.id) === index);
  if (taskError) console.error("[reminders] task target query failed", { code: taskError.code });
  return (
    <ReminderCenter
      locale={locale as "es" | "en"}
      timezone={profile?.timezone ?? "Europe/Madrid"}
      reminders={reminders ?? []}
      tasks={tasks ?? []}
      events={events ?? []}
      taskLoadError={Boolean(taskError)}
    />
  );
}
