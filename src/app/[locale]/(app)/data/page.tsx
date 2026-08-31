import { createClient } from "@/lib/supabase/server";
import { DataTools } from "@/features/backup/data-tools";
import type { BackupData } from "@/features/backup/format";
import { fetchAllRows } from "@/lib/backup/fetch-all";

export default async function DataPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const db = await createClient();
  const [
    { data: profile },
    schedules,
    categories,
    tasks,
    events,
    completions,
    templates,
    reminders,
    focusPresets,
    focusSessions,
    focusIntervals,
    focusGoals,
  ] = await Promise.all([
    db.from("profiles").select("*").single(),
    fetchAllRows((from, to) =>
      db.from("schedules").select("*").range(from, to),
    ),
    fetchAllRows((from, to) =>
      db.from("categories").select("*").range(from, to),
    ),
    fetchAllRows((from, to) => db.from("tasks").select("*").range(from, to)),
    fetchAllRows((from, to) => db.from("events").select("*").range(from, to)),
    fetchAllRows((from, to) =>
      db.from("task_completions").select("*").range(from, to),
    ),
    fetchAllRows((from, to) =>
      db.from("schedule_templates").select("*").range(from, to),
    ),
    fetchAllRows((from, to) =>
      db.from("reminders").select("*").range(from, to),
    ),
    fetchAllRows((from, to) =>
      db.from("focus_presets").select("*").range(from, to),
    ),
    fetchAllRows((from, to) =>
      db.from("focus_sessions").select("*").range(from, to),
    ),
    fetchAllRows((from, to) =>
      db.from("focus_intervals").select("*").range(from, to),
    ),
    fetchAllRows((from, to) =>
      db.from("focus_goals").select("*").range(from, to),
    ),
  ]);

  const data = {
    profile,
    schedules,
    categories,
    tasks,
    events,
    completions,
    templates,
    reminders,
    focus_presets: focusPresets,
    focus_sessions: focusSessions,
    focus_intervals: focusIntervals,
    focus_goals: focusGoals,
  } as BackupData;

  return (
    <DataTools
      data={data}
      locale={locale as "es" | "en"}
      timezone={profile?.timezone ?? "Europe/Madrid"}
    />
  );
}
