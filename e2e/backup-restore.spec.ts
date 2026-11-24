import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import type { Download } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "./fixtures";
import { hasLocalCredentials, withLocalWorkspace } from "./local-workspace";
import {
  createBackup,
  prepareRestorePayload,
  type BackupData,
} from "../src/features/backup/format";
import type { Database, Json } from "../src/types/database";
import { assertLocalTestEnvironment } from "../scripts/assert-local-test-env.mjs";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function downloadContents(download: Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("exports current changes and saves newer work in the safety copy before replacing it", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(90_000);
  test.skip(!hasLocalCredentials, "Local integration credentials required");
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    await page.goto("/en/data");
    const exportBackup = page.getByRole("button", { name: "Download JSON" });
    await expect(exportBackup).toBeVisible();
    const addEvent = async (title: string) => {
      const { error } = await db.from("events").insert({
        user_id: userId,
        title,
        event_date: "2036-05-03",
        all_day: true,
      });
      expect(error).toBeNull();
    };
    await addEvent("After opening Your data");
    const fullDownload = page.waitForEvent("download");
    await exportBackup.click();
    const buffer = await downloadContents(await fullDownload);
    expect(JSON.parse(buffer.toString("utf8")).data.events).toEqual([
      expect.objectContaining({ title: "After opening Your data" }),
    ]);
    const csvDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download CSV" }).click();
    const archive = await csvDownload;
    expect(archive.suggestedFilename()).toBe("planora-csv.zip");
    const csv = unzipSync(await downloadContents(archive));
    expect(Object.keys(csv)).toHaveLength(11);
    expect(strFromU8(csv["planora-events.csv"])).toContain(
      "After opening Your data",
    );
    await page.getByLabel("Select a Planora backup").setInputFiles({
      name: "original.json",
      mimeType: "application/json",
      buffer,
    });
    await page.getByRole("button", { name: "Restore backup" }).click();
    await addEvent("While the confirmation was open");
    const safetyDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Restore and replace data" })
      .click();
    const safety = await safetyDownload;
    expect(safety.suggestedFilename()).toMatch(/^planora-before-restore-/);
    const safetyBackup = JSON.parse(
      (await downloadContents(safety)).toString("utf8"),
    );
    expect(safetyBackup.data.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "After opening Your data" }),
        expect.objectContaining({ title: "While the confirmation was open" }),
      ]),
    );
    await expect(page.getByText(/previous data was replaced/i)).toBeVisible({
      timeout: 15_000,
    });
    const restored = await db
      .from("events")
      .select("title")
      .eq("user_id", userId);
    expect(restored.error).toBeNull();
    expect(restored.data).toEqual([{ title: "After opening Your data" }]);
  });
});

test("restoring the same backup replaces data without duplicates", async () => {
  test.skip(
    !url || !anonKey || !serviceKey,
    "Supabase integration credentials required",
  );
  assertLocalTestEnvironment({ url, serviceRole: serviceKey });
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
    const { data: category, error: categoryError } = await db
      .from("categories")
      .insert({
        user_id: createdUsers[0],
        schedule_id: schedule!.id,
        name: "Scoped category",
        colour: "#4f6b45",
      })
      .select("id")
      .single();
    expect(categoryError).toBeNull();
    const { error: taskError } = await db.from("tasks").insert({
      user_id: createdUsers[0],
      schedule_id: schedule!.id,
      category_id: category!.id,
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
      focus_presets: [],
      focus_sessions: [],
      focus_intervals: [],
      focus_goals: [],
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
      const { data, error } = await db.rpc("restore_planora_backup", {
        backup_data: payload as unknown as Json,
      });
      expect(error).toBeNull();
      expect(data).toMatchObject({ ok: true });
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
    expect(failedRestore.error).toBeNull();
    expect(failedRestore.data).toEqual({
      ok: false,
      error: "INVALID_BACKUP",
    });
    // The two successful restores and this failure consumed three attempts.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const rejected = await db.rpc("restore_planora_backup", {
        backup_data: null as unknown as Json,
      });
      expect(rejected.error).toBeNull();
      expect(rejected.data).toEqual({ ok: false, error: "INVALID_BACKUP" });
    }
    const exhausted = await db.rpc("restore_planora_backup", {
      backup_data: null as unknown as Json,
    });
    expect(exhausted.error).toBeNull();
    expect(exhausted.data).toEqual({ ok: false, error: "RATE_LIMITED" });
    const stateAfterRollback = await db.from("tasks").select("title");
    expect(stateAfterRollback.data?.map((item) => item.title)).toEqual([
      "Single backup task",
    ]);
    const otherSchedules = await otherDb.from("schedules").select("name");
    expect(otherSchedules.data?.map((item) => item.name)).toEqual([
      "Other user's schedule",
    ]);

    const restoredSchedule = await db
      .from("schedules")
      .select("id")
      .eq("name", "Backup schedule")
      .single();
    expect(restoredSchedule.error).toBeNull();
    const duplicated = await db.rpc("duplicate_schedule", {
      source_schedule_id: restoredSchedule.data!.id,
      include_tasks: true,
    });
    expect(duplicated.error).toBeNull();
    const [duplicatedCategories, duplicatedTasks] = await Promise.all([
      db
        .from("categories")
        .select("id,schedule_id")
        .eq("schedule_id", duplicated.data!),
      db
        .from("tasks")
        .select("title,schedule_id,category_id")
        .eq("schedule_id", duplicated.data!),
    ]);
    expect(duplicatedCategories.data).toHaveLength(1);
    expect(duplicatedTasks.data).toHaveLength(1);
    expect(duplicatedTasks.data?.[0]).toMatchObject({
      title: "Single backup task",
      schedule_id: duplicated.data,
      category_id: duplicatedCategories.data?.[0]?.id,
    });
  } finally {
    for (const userId of createdUsers)
      await admin.auth.admin.deleteUser(userId);
  }
});
