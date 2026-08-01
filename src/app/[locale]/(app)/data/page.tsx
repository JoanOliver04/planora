import { createClient } from "@/lib/supabase/server";
import { DataTools } from "@/features/backup/data-tools";
import type { BackupData } from "@/features/backup/format";
export default async function DataPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params, db = await createClient();
  const [{ data: profile }, { data: schedules }, { data: categories }, { data: tasks }, { data: events }, { data: completions }, { data: templates }, { data: reminders }] = await Promise.all([
    db.from("profiles").select("*").single(), db.from("schedules").select("*"), db.from("categories").select("*"), db.from("tasks").select("*"), db.from("events").select("*"), db.from("task_completions").select("*"), db.from("schedule_templates").select("*"), db.from("reminders").select("*"),
  ]);
  const data = { profile, schedules: schedules ?? [], categories: categories ?? [], tasks: tasks ?? [], events: events ?? [], completions: completions ?? [], templates: templates ?? [], reminders: reminders ?? [] } as BackupData;
  return <DataTools data={data} locale={locale as "es" | "en"} timezone={profile?.timezone ?? "Europe/Madrid"} />;
}
