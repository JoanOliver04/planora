import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import {
  createBackup,
  prepareRestorePayload,
  type BackupData,
} from "../src/features/backup/format";
import {
  applyFocusAction,
  createStartedSession,
} from "../src/features/focus/state-machine";
import {
  fetchActiveFocusSession,
  persistFocusSession,
} from "../src/features/focus/repository";
import type { Database, Json } from "../src/types/database";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Authenticated Focus journey (preset → task session → pause/reload/resume →
 * distraction → complete → task from distraction → stats → export/restore).
 * Skips when Supabase service credentials are not available (public CI).
 */
test("Focus session lifecycle, stats and restore without duplicates", async ({
  browserName,
}) => {
  test.skip(
    !url || !anonKey || !serviceKey,
    "Supabase integration credentials required",
  );
  // One browser project is enough for the API-backed flow.
  test.skip(browserName !== "chromium", "Run once on chromium");

  const admin = createClient<Database>(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const password = `Planora-${crypto.randomUUID()}!`;
  const email = `focus-e2e-${suffix}@example.com`;
  let userId = "";

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;

    const db = createClient<Database>(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    expect(link.error).toBeNull();
    const verified = await db.auth.verifyOtp({
      token_hash: link.data.properties!.hashed_token,
      type: "email",
    });
    expect(verified.error).toBeNull();

    // 1) Create preset
    const { data: preset, error: presetError } = await db
      .from("focus_presets")
      .insert({
        user_id: userId,
        name: "E2E Deep work",
        emoji: "🎯",
        intention: "Ship Focus",
        mode: "countdown",
        focus_duration_sec: 25 * 60,
        short_break_sec: null,
        long_break_sec: null,
        cycles_before_long_break: null,
        target_cycles: null,
        auto_start_breaks: true,
        auto_start_focus: false,
        sound_enabled: true,
        vibration_enabled: true,
        notify_on_phase_end: true,
        complete_task_on_session_end: false,
        keep_screen_awake: false,
        prefer_fullscreen: false,
        segments: [],
        is_favorite: true,
        sort_order: 0,
      })
      .select("*")
      .single();
    expect(presetError).toBeNull();

    // 2) Task + start session from task
    const { data: schedule } = await db
      .from("schedules")
      .insert({ user_id: userId, name: "Focus schedule", emoji: "🌿" })
      .select("*")
      .single();
    const { data: task } = await db
      .from("tasks")
      .insert({
        user_id: userId,
        schedule_id: schedule!.id,
        title: "Linked Focus task",
        task_kind: "one_time",
        recurrence_type: "once",
        recurrence_config: {},
        time_mode: "anytime",
        start_date: "2026-08-07",
      })
      .select("*")
      .single();

    const started = createStartedSession(
      {
        mode: "countdown",
        focusDurationSec: 25 * 60,
        presetId: preset!.id,
        taskId: task!.id,
        title: "Linked Focus task",
        linkSnapshot: {
          taskTitle: "Linked Focus task",
          taskKind: "one_time",
        },
        completeTaskOnEnd: false,
      },
      userId,
      {
        now: Date.now(),
        sessionId: crypto.randomUUID(),
        intervalId: crypto.randomUUID(),
        createId: () => crypto.randomUUID(),
      },
    );
    await persistFocusSession(db, null, started);

    // 3) Pause
    let current = started;
    let next = applyFocusAction(
      current,
      { type: "pause" },
      {
        expectedRevision: current.revision,
        now: Date.now() + 60_000,
        createId: () => crypto.randomUUID(),
      },
    ).session;
    await persistFocusSession(db, current, next);
    current = next;
    expect(current.status).toBe("paused");

    // 4) Reload (re-fetch active)
    const reloaded = await fetchActiveFocusSession(db, userId);
    expect(reloaded?.id).toBe(current.id);
    expect(reloaded?.status).toBe("paused");
    current = reloaded!;

    // 5) Resume
    next = applyFocusAction(
      current,
      { type: "resume" },
      {
        expectedRevision: current.revision,
        now: Date.now() + 90_000,
        createId: () => crypto.randomUUID(),
      },
    ).session;
    await persistFocusSession(db, current, next);
    current = next;
    expect(current.status).toBe("running");

    // 6) Add distraction (private note path via session fields)
    next = {
      ...current,
      distractions: [...current.distractions, "Reply to email"],
      notes: "Mid-session private note",
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    await persistFocusSession(db, current, next);
    current = next;
    expect(current.distractions).toContain("Reply to email");

    // 7) Complete
    next = applyFocusAction(
      current,
      { type: "complete", notes: current.notes },
      {
        expectedRevision: current.revision,
        now: Date.now() + 20 * 60_000,
        createId: () => crypto.randomUUID(),
      },
    ).session;
    await persistFocusSession(db, current, next);
    current = next;
    expect(current.status).toBe("completed");
    expect(await fetchActiveFocusSession(db, userId)).toBeNull();

    // 8) Convert distraction into a Planora task
    const { error: distractionTaskError } = await db.from("tasks").insert({
      user_id: userId,
      schedule_id: schedule!.id,
      title: "Reply to email",
      task_kind: "one_time",
      recurrence_type: "once",
      recurrence_config: {},
      time_mode: "anytime",
      start_date: "2026-08-07",
    });
    expect(distractionTaskError).toBeNull();

    // 9) Stats material (completed session exists)
    const { data: completedSessions } = await db
      .from("focus_sessions")
      .select("id,status,focus_sec,notes,distractions")
      .eq("user_id", userId)
      .eq("status", "completed");
    expect(completedSessions?.length).toBe(1);
    expect(completedSessions?.[0]?.notes).toBe("Mid-session private note");

    // 10–12) Export JSON + restore twice without duplicates
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
      db.from("profiles").select("*").single(),
      db.from("schedules").select("*"),
      db.from("categories").select("*"),
      db.from("tasks").select("*"),
      db.from("events").select("*"),
      db.from("task_completions").select("*"),
      db.from("schedule_templates").select("*"),
      db.from("reminders").select("*"),
      db.from("focus_presets").select("*"),
      db.from("focus_sessions").select("*"),
      db.from("focus_intervals").select("*"),
      db.from("focus_goals").select("*"),
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
      focus_presets: focus_presets.data ?? [],
      focus_sessions: focus_sessions.data ?? [],
      focus_intervals: focus_intervals.data ?? [],
      focus_goals: focus_goals.data ?? [],
    } as unknown as BackupData);

    expect(backup.data.focus_presets.length).toBe(1);
    expect(backup.data.focus_sessions.length).toBe(1);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const payload = prepareRestorePayload(backup);
      const { error } = await db.rpc("restore_planora_backup", {
        backup_data: payload as unknown as Json,
      });
      expect(error).toBeNull();
      const restoredPresets = await db.from("focus_presets").select("name");
      const restoredSessions = await db
        .from("focus_sessions")
        .select("status,notes");
      const restoredTasks = await db.from("tasks").select("title");
      expect(restoredPresets.data).toHaveLength(1);
      expect(restoredSessions.data).toHaveLength(1);
      expect(restoredSessions.data?.[0]?.status).toBe("completed");
      expect(restoredTasks.data?.map((item) => item.title).sort()).toEqual(
        ["Linked Focus task", "Reply to email"].sort(),
      );
    }

    // One-active guarantee still holds after restore of completed history
    const active = await db
      .from("focus_sessions")
      .select("id")
      .in("status", ["running", "paused", "on_break"]);
    expect(active.data).toHaveLength(0);
  } finally {
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});

test("Focus route requires authentication on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/es/focus");
  await expect(page).toHaveURL(/\/es\/login/);
  await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
});
