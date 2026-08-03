import { createClient } from "@/lib/supabase/server";
import { ReminderCenter } from "@/features/reminders/reminder-center";
export default async function RemindersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const db = await createClient();
  const [
    { data: profile },
    { data: reminders },
    { data: tasks },
    { data: events },
  ] = await Promise.all([
    db.from("profiles").select("timezone").single(),
    db.from("reminders").select("*").order("next_trigger_at"),
    db
      .from("tasks")
      .select("id,title,emoji,start_date,start_time,scope")
      .is("archived_at", null)
      .eq("is_active", true)
      .order("sort_order"),
    db
      .from("events")
      .select("id,title,emoji,event_date,start_time")
      .gte("event_date", new Date().toISOString().slice(0, 10))
      .order("event_date"),
  ]);
  return (
    <ReminderCenter
      locale={locale as "es" | "en"}
      timezone={profile?.timezone ?? "Europe/Madrid"}
      reminders={reminders ?? []}
      tasks={tasks ?? []}
      events={events ?? []}
    />
  );
}
