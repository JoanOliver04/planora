import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import {
  createBackup,
  prepareRestorePayload,
  type BackupData,
} from "../src/features/backup/format";
import type { Database, Json } from "../src/types/database";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

test("restoring the same backup replaces data without duplicates", async () => {
  test.skip(
    !url || !anonKey || !serviceKey,
    "Supabase integration credentials required",
  );
  const admin = createClient<Database>(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const password = `Planora-${crypto.randomUUID()}!`;
  const email = `restore-e2e-${suffix}@example.com`;
  const otherEmail = `restore-other-${suffix}@example.com`;
  const createdUsers: string[] = [];

  try {
    for (const account of [email, otherEmail]) {
      const { data, error } = await admin.auth.admin.createUser({
        email: account,
        password,
        email_confirm: true,
      });
      expect(error).toBeNull();
      createdUsers.push(data.user!.id);
    }

    const db = createClient<Database>(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const otherDb = createClient<Database>(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signInAs = async (client: typeof db, account: string) => {
      const link = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: account,
      });
      expect(link.error).toBeNull();
      const verified = await client.auth.verifyOtp({
        token_hash: link.data.properties!.hashed_token,
        type: "email",
      });
      expect(verified.error).toBeNull();
    };
    await signInAs(db, email);
    await signInAs(otherDb, otherEmail);

    const { data: schedule, error: scheduleError } = await db
      .from("schedules")
      .insert({
        user_id: createdUsers[0],
        name: "Backup schedule",
        emoji: "🌿",
      })
      .select("*")
      .single();
    expect(scheduleError).toBeNull();
    const { error: taskError } = await db.from("tasks").insert({
      user_id: createdUsers[0],
      schedule_id: schedule!.id,
      title: "Single backup task",
      task_kind: "one_time",
      recurrence_type: "once",
      recurrence_config: {},
      time_mode: "anytime",
      start_date: "2026-08-02",
    });
    expect(taskError).toBeNull();
    const { error: eventError } = await db.from("events").insert({
      user_id: createdUsers[0],
      schedule_id: schedule!.id,
      title: "Single backup event",
      event_date: "2026-08-02",
      all_day: true,
    });
    expect(eventError).toBeNull();
    expect(
      (
        await otherDb.from("schedules").insert({
          user_id: createdUsers[1],
          name: "Other user's schedule",
        })
      ).error,
    ).toBeNull();

    const [
      profile,
      schedules,
      categories,
      tasks,
      events,
      completions,
      templates,
      reminders,
    ] = await Promise.all([
      db.from("profiles").select("*").single(),
      db.from("schedules").select("*"),
      db.from("categories").select("*"),
      db.from("tasks").select("*"),
      db.from("events").select("*"),
      db.from("task_completions").select("*"),
      db.from("schedule_templates").select("*"),
      db.from("reminders").select("*"),
    ]);
    const backup = createBackup({
      profile: profile.data,
      schedules: schedules.data ?? [],
      categories: categories.data ?? [],
      tasks: tasks.data ?? [],
      events: events.data ?? [],
      completions: completions.data ?? [],
      templates: templates.data ?? [],
      reminders: reminders.data ?? [],
    } as unknown as BackupData);

    await db.from("tasks").insert({
      user_id: createdUsers[0],
      schedule_id: schedule!.id,
      title: "Must disappear",
      task_kind: "one_time",
      recurrence_type: "once",
      recurrence_config: {},
      time_mode: "anytime",
      start_date: "2026-08-03",
    });
    await db.from("events").insert({
      user_id: createdUsers[0],
      schedule_id: schedule!.id,
      title: "Must disappear",
      event_date: "2026-08-03",
      all_day: true,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const payload = prepareRestorePayload(backup);
      const { error } = await db.rpc("restore_planora_backup", {
        backup_data: payload as unknown as Json,
      });
      expect(error).toBeNull();
      const restoredTasks = await db.from("tasks").select("title");
      const restoredEvents = await db.from("events").select("title");
      expect(restoredTasks.data?.map((item) => item.title)).toEqual([
        "Single backup task",
      ]);
      expect(restoredEvents.data?.map((item) => item.title)).toEqual([
        "Single backup event",
      ]);
    }

    const brokenPayload = prepareRestorePayload(backup);
    brokenPayload.tasks[0].schedule_id = crypto.randomUUID();
    const failedRestore = await db.rpc("restore_planora_backup", {
      backup_data: brokenPayload as unknown as Json,
    });
    expect(failedRestore.error).not.toBeNull();
    const stateAfterRollback = await db.from("tasks").select("title");
    expect(stateAfterRollback.data?.map((item) => item.title)).toEqual([
      "Single backup task",
    ]);
    const otherSchedules = await otherDb.from("schedules").select("name");
    expect(otherSchedules.data?.map((item) => item.name)).toEqual([
      "Other user's schedule",
    ]);
  } finally {
    for (const userId of createdUsers)
      await admin.auth.admin.deleteUser(userId);
  }
});
