import { fetchAllRows } from "@/lib/backup/fetch-all";
import { createClient } from "@/lib/supabase/client";
import type { BackupData } from "./format";

export async function loadAccountData(userId: string) {
  const db = createClient();
  type Table =
    | Exclude<keyof BackupData, "profile" | "completions" | "templates">
    | "task_completions"
    | "schedule_templates";
  const read = (table: Table) =>
    fetchAllRows((from, to) =>
      db
        .from(table)
        .select("*")
        .eq("user_id", userId)
        .order("id")
        .range(from, to),
    );
  const [
    profile,
    schedules,
    categories,
    tasks,
    events,
    completions,
    templates,
    reminders,
    focus_presets,
    focus_sessions,
    focus_intervals,
    focus_goals,
  ] = await Promise.all([
    db.from("profiles").select("*").eq("id", userId).single(),
    read("schedules"),
    read("categories"),
    read("tasks"),
    read("events"),
    read("task_completions"),
    read("schedule_templates"),
    read("reminders"),
    read("focus_presets"),
    read("focus_sessions"),
    read("focus_intervals"),
    read("focus_goals"),
  ]);
  if (profile.error || !profile.data)
    throw new Error("Unable to read backup profile");
  return {
    profile: profile.data,
    schedules,
    categories,
    tasks,
    events,
    completions,
    templates,
    reminders,
    focus_presets,
    focus_sessions,
    focus_intervals,
    focus_goals,
  } as BackupData & { profile: NonNullable<BackupData["profile"]> };
}
