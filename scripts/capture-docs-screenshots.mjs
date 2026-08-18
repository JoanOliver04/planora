/**
 * Refresh docs/images for the README and portfolio.
 * Seeds the secondary account if needed, then captures desktop + mobile.
 * About 80% of shots are light theme.
 *
 * Usage (local app running, Supabase env in .env.local):
 *   node scripts/capture-docs-screenshots.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";
import nextEnv from "@next/env";
import { mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { stringToBase64URL } from "../node_modules/@supabase/ssr/dist/module/utils/base64url.js";
import { createChunks } from "../node_modules/@supabase/ssr/dist/module/utils/chunker.js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const BASE_URL = process.env.SHOT_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SHOT_EMAIL ?? "joanoliverrosell@gmail.com";
const OUT_DIR = join(process.cwd(), "docs", "images");
const PORTFOLIO_DIR = join(
  process.cwd(),
  "..",
  "1-Portofolio",
  "portfolio",
  "public",
  "projects",
  "planora",
);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Missing Supabase env (URL, publishable key, service role).");
  process.exit(1);
}

const projectRef = new URL(url).hostname.split(".")[0];
const storageKey = `sb-${projectRef}-auth-token`;
const TZ = "Europe/Madrid";

function todayInMadrid() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekday(iso) {
  return new Date(`${iso}T12:00:00`).getDay();
}

function isoAt(iso, hours, minutes = 0) {
  const date = new Date(`${iso}T00:00:00+02:00`);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function sessionCookies(session, domain, secure) {
  const encoded = `base64-${stringToBase64URL(JSON.stringify(session))}`;
  return createChunks(storageKey, encoded).map((chunk) => ({
    name: chunk.name,
    value: chunk.value,
    domain,
    path: "/",
    httpOnly: false,
    secure,
    sameSite: "Lax",
  }));
}

async function forceTheme(page, theme) {
  await page.evaluate((next) => {
    try {
      localStorage.setItem("planora-theme", next);
    } catch {
      // ignore
    }
    const dark = next === "dark";
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, theme);
}

async function dismissFocusIntro(page) {
  await page.evaluate(() => {
    localStorage.setItem(
      "planora-focus-onboarding-v1",
      JSON.stringify({
        introDismissed: true,
        dismissedAt: new Date().toISOString(),
      }),
    );
  });
}

async function settle(page, ms = 700) {
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
  await page.waitForTimeout(ms);
}

async function hideChrome(page) {
  await page.addStyleTag({
    content: `
      nextjs-portal,
      [data-next-badge-root],
      [data-nextjs-toast],
      #__next-build-watcher { display: none !important; }
      * { caret-color: transparent !important; }
    `,
  });
}

async function shot(page, file, theme, { dismiss = true } = {}) {
  await forceTheme(page, theme);
  await hideChrome(page);
  if (dismiss) {
    await page.keyboard.press("Escape").catch(() => undefined);
    await page
      .locator('[role="alertdialog"], [data-sonner-toast]')
      .first()
      .waitFor({ state: "hidden", timeout: 800 })
      .catch(() => undefined);
  }
  await settle(page);
  await page.screenshot({
    path: join(OUT_DIR, file),
    fullPage: false,
    animations: "disabled",
  });
  console.log("wrote", file, `(${theme})`);
}

async function gotoReady(page, path, ready, theme) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "load", timeout: 60_000 });
  await forceTheme(page, theme);
  await ready(page);
  await settle(page, 500);
}

function heading(name) {
  return (page) =>
    page.getByRole("heading", { name }).first().waitFor({ timeout: 30_000 });
}

async function findUser(admin) {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw new Error(error.message);
  const user = data.users.find(
    (item) => item.email?.toLowerCase() === EMAIL.toLowerCase(),
  );
  if (!user) throw new Error(`User not found: ${EMAIL}`);
  return user;
}

async function signIn(admin) {
  const db = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
  });
  if (link.error) throw new Error(link.error.message);
  const verified = await db.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "email",
  });
  if (verified.error || !verified.data.session) {
    throw new Error(verified.error?.message ?? "verifyOtp failed");
  }
  return { db, session: verified.data.session };
}

async function ensureOne(admin, table, match, row) {
  let query = admin.from(table).select("*").match(match);
  const existing = await query.maybeSingle();
  if (existing.error && existing.error.code !== "PGRST116") {
    throw new Error(`${table} lookup: ${existing.error.message}`);
  }
  if (existing.data) return existing.data;
  const inserted = await admin.from(table).insert(row).select("*").single();
  if (inserted.error) throw new Error(`${table} insert: ${inserted.error.message}`);
  return inserted.data;
}

async function seedWorkspace(admin, userId) {
  const today = todayInMadrid();
  const mondayOffset = (weekday(today) + 6) % 7;
  const monday = addDays(today, -mondayOffset);
  const habitStart = "2026-08-03";

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      locale: "es",
      timezone: TZ,
      theme: "light",
      week_starts_on: 1,
      onboarding_completed: true,
    })
    .eq("id", userId);
  if (profileError) throw new Error(`profile: ${profileError.message}`);

  const work = await ensureOne(
    admin,
    "schedules",
    { user_id: userId, name: "Semana productiva" },
    {
      user_id: userId,
      name: "Semana productiva",
      emoji: "💼",
      description: "Trabajo, sprints y clientes",
      sort_order: 0,
    },
  );
  const personal = await ensureOne(
    admin,
    "schedules",
    { user_id: userId, name: "Tiempo personal" },
    {
      user_id: userId,
      name: "Tiempo personal",
      emoji: "🌿",
      description: "Casa, salud y descanso",
      sort_order: 1,
    },
  );
  const uni = await ensureOne(
    admin,
    "schedules",
    { user_id: userId, name: "Universidad" },
    {
      user_id: userId,
      name: "Universidad",
      emoji: "📚",
      description: "Clases, prácticas y estudio",
      sort_order: 2,
    },
  );

  await admin
    .from("profiles")
    .update({ active_schedule_id: work.id })
    .eq("id", userId);

  const priorities = await ensureOne(
    admin,
    "categories",
    { user_id: userId, name: "Prioridades" },
    {
      user_id: userId,
      name: "Prioridades",
      emoji: "🎯",
      colour: "#315F78",
      sort_order: 0,
    },
  );
  const meetings = await ensureOne(
    admin,
    "categories",
    { user_id: userId, name: "Reuniones" },
    {
      user_id: userId,
      name: "Reuniones",
      emoji: "🤝",
      colour: "#8A5A44",
      sort_order: 1,
    },
  );
  const study = await ensureOne(
    admin,
    "categories",
    { user_id: userId, name: "Estudio" },
    {
      user_id: userId,
      name: "Estudio",
      emoji: "📝",
      colour: "#4F6B45",
      sort_order: 2,
    },
  );
  const wellbeing = await ensureOne(
    admin,
    "categories",
    { user_id: userId, name: "Bienestar" },
    {
      user_id: userId,
      name: "Bienestar",
      emoji: "🌱",
      colour: "#3F7D58",
      sort_order: 3,
    },
  );
  const home = await ensureOne(
    admin,
    "categories",
    { user_id: userId, name: "Casa" },
    {
      user_id: userId,
      name: "Casa",
      emoji: "🏠",
      colour: "#A06448",
      sort_order: 4,
    },
  );

  const tasks = [
    {
      title: "Revisar inbox y prioridades",
      emoji: "🧭",
      schedule_id: work.id,
      category_id: priorities.id,
      task_kind: "habit",
      recurrence_type: "weekdays",
      recurrence_config: { type: "weekdays", weekdays: [1, 2, 3, 4, 5] },
      time_mode: "day_part",
      day_part: "morning",
      start_date: habitStart,
      focus_enabled: false,
      sort_order: 0,
    },
    {
      title: "Standup con el equipo",
      emoji: "💬",
      schedule_id: work.id,
      category_id: meetings.id,
      task_kind: "habit",
      recurrence_type: "weekdays",
      recurrence_config: { type: "weekdays", weekdays: [1, 2, 3, 4, 5] },
      time_mode: "specific_time",
      start_time: "09:15",
      start_date: habitStart,
      focus_enabled: false,
      sort_order: 1,
    },
    {
      title: "Bloque de trabajo profundo",
      emoji: "🎯",
      schedule_id: work.id,
      category_id: priorities.id,
      task_kind: "habit",
      recurrence_type: "weekdays",
      recurrence_config: { type: "weekdays", weekdays: [1, 2, 3, 4, 5] },
      time_mode: "time_range",
      start_time: "10:00",
      end_time: "11:30",
      start_date: habitStart,
      focus_enabled: true,
      sort_order: 2,
    },
    {
      title: "Escribir el informe semanal",
      emoji: "📝",
      schedule_id: work.id,
      category_id: priorities.id,
      task_kind: "one_time",
      recurrence_type: "once",
      recurrence_config: { type: "once" },
      time_mode: "day_part",
      day_part: "afternoon",
      start_date: today,
      focus_enabled: true,
      sort_order: 3,
    },
    {
      title: "Revisar métricas del sprint",
      emoji: "📊",
      schedule_id: work.id,
      category_id: priorities.id,
      task_kind: "one_time",
      recurrence_type: "once",
      recurrence_config: { type: "once" },
      time_mode: "anytime",
      start_date: today,
      focus_enabled: false,
      sort_order: 4,
    },
    {
      title: "Beber agua al despertar",
      emoji: "💧",
      schedule_id: personal.id,
      category_id: wellbeing.id,
      scope: "global",
      task_kind: "habit",
      recurrence_type: "daily",
      recurrence_config: { type: "daily" },
      time_mode: "day_part",
      day_part: "morning",
      start_date: habitStart,
      focus_enabled: false,
      sort_order: 5,
    },
    {
      title: "Entrenar 30 minutos",
      emoji: "🏃",
      schedule_id: personal.id,
      category_id: wellbeing.id,
      task_kind: "habit",
      recurrence_type: "times_per_week",
      recurrence_config: { type: "times_per_week", target: 3 },
      time_mode: "day_part",
      day_part: "afternoon",
      start_date: habitStart,
      focus_enabled: false,
      sort_order: 6,
    },
    {
      title: "Leer 20 minutos",
      emoji: "📖",
      schedule_id: personal.id,
      category_id: wellbeing.id,
      scope: "global",
      task_kind: "habit",
      recurrence_type: "daily",
      recurrence_config: { type: "daily" },
      time_mode: "day_part",
      day_part: "night",
      start_date: habitStart,
      focus_enabled: false,
      sort_order: 7,
    },
    {
      title: "Compra semanal",
      emoji: "🛒",
      schedule_id: personal.id,
      category_id: home.id,
      task_kind: "habit",
      recurrence_type: "interval",
      recurrence_config: { type: "interval", every: 1, unit: "week" },
      time_mode: "anytime",
      start_date: addDays(monday, 5),
      focus_enabled: false,
      sort_order: 8,
    },
    {
      title: "Estudiar algoritmos",
      emoji: "🧠",
      schedule_id: uni.id,
      category_id: study.id,
      task_kind: "habit",
      recurrence_type: "weekdays",
      recurrence_config: { type: "weekdays", weekdays: [1, 2, 3, 4] },
      time_mode: "day_part",
      day_part: "afternoon",
      start_date: habitStart,
      focus_enabled: true,
      sort_order: 9,
    },
    {
      title: "Entregar práctica de bases de datos",
      emoji: "📦",
      schedule_id: uni.id,
      category_id: study.id,
      task_kind: "one_time",
      recurrence_type: "once",
      recurrence_config: { type: "once" },
      time_mode: "specific_time",
      start_time: "18:00",
      start_date: addDays(monday, 3),
      focus_enabled: false,
      sort_order: 10,
    },
  ];

  const taskByTitle = {};
  for (const task of tasks) {
    const row = await ensureOne(
      admin,
      "tasks",
      { user_id: userId, title: task.title },
      {
        user_id: userId,
        scope: task.scope ?? "schedule",
        schedule_id: task.scope === "global" ? null : task.schedule_id,
        is_active: true,
        ...task,
        schedule_id: task.scope === "global" ? null : task.schedule_id,
      },
    );
    taskByTitle[task.title] = row;
  }

  const existingTasks = await admin
    .from("tasks")
    .select("id,title,start_date")
    .eq("user_id", userId);
  for (const task of existingTasks.data ?? []) {
    taskByTitle[task.title] ??= task;
  }

  // Keep one recent overdue item; close the other leftover from 2 Aug.
  const presentation = taskByTitle["Preparar presentación del producto"];
  if (presentation) {
    await admin
      .from("tasks")
      .update({
        start_date: addDays(today, -4),
        time_mode: "day_part",
        day_part: "afternoon",
        focus_enabled: true,
      })
      .eq("id", presentation.id);
  }
  const leftover = taskByTitle["Enviar resumen de la reunión"];
  if (leftover) {
    await admin
      .from("task_completions")
      .upsert(
        {
          user_id: userId,
          task_id: leftover.id,
          occurrence_date: leftover.start_date ?? "2026-08-02",
          completed_at: "2026-08-03T16:40:00.000Z",
          task_snapshot: { title: leftover.title },
        },
        { onConflict: "task_id,occurrence_date" },
      );
  }

  const completionPlan = [
    ["Beber agua al despertar", addDays(today, -4)],
    ["Beber agua al despertar", addDays(today, -3)],
    ["Beber agua al despertar", addDays(today, -2)],
    ["Beber agua al despertar", addDays(today, -1)],
    ["Beber agua al despertar", today],
    ["Revisar inbox y prioridades", addDays(monday, -3)],
    ["Revisar inbox y prioridades", monday],
    ["Bloque de trabajo profundo", monday],
    ["Standup con el equipo", monday],
    ["Leer 20 minutos", addDays(today, -3)],
    ["Leer 20 minutos", addDays(today, -2)],
    ["Leer 20 minutos", addDays(today, -1)],
    ["Entrenar 30 minutos", monday],
    ["Estudiar algoritmos", monday],
  ];

  for (const [title, day] of completionPlan) {
    const task = taskByTitle[title];
    if (!task) continue;
    const { error } = await admin.from("task_completions").upsert(
      {
        user_id: userId,
        task_id: task.id,
        occurrence_date: day,
        completed_at: isoAt(day, 10, 20),
        task_snapshot: { title },
      },
      { onConflict: "task_id,occurrence_date" },
    );
    if (error) console.warn(`completion ${title} ${day}: ${error.message}`);
  }

  const events = [
    {
      title: "Revisión semanal",
      emoji: "📊",
      event_date: today,
      all_day: false,
      start_time: "17:30",
      end_time: "18:15",
      schedule_id: work.id,
      category_id: meetings.id,
    },
    {
      title: "Presentación del proyecto",
      emoji: "🚀",
      event_date: addDays(monday, 2),
      all_day: false,
      start_time: "10:00",
      end_time: "11:00",
      schedule_id: work.id,
      category_id: priorities.id,
    },
    {
      title: "Clase de bases de datos",
      emoji: "🎓",
      event_date: addDays(monday, 2),
      all_day: false,
      start_time: "11:00",
      end_time: "12:30",
      schedule_id: uni.id,
      category_id: study.id,
    },
    {
      title: "Dentista",
      emoji: "🦷",
      event_date: addDays(monday, 4),
      all_day: false,
      start_time: "16:15",
      end_time: "16:45",
      schedule_id: personal.id,
      category_id: home.id,
    },
    {
      title: "Cena con amigos",
      emoji: "🍝",
      event_date: addDays(monday, 5),
      all_day: false,
      start_time: "21:00",
      end_time: "23:00",
      schedule_id: personal.id,
      category_id: home.id,
    },
  ];

  const eventByTitle = {};
  for (const event of events) {
    eventByTitle[event.title] = await ensureOne(
      admin,
      "events",
      { user_id: userId, title: event.title },
      { user_id: userId, ...event },
    );
  }

  await ensureOne(
    admin,
    "reminders",
    { user_id: userId, kind: "daily_summary" },
    {
      user_id: userId,
      kind: "daily_summary",
      recurrence: "daily",
      time_of_day: "08:30",
      timezone: TZ,
      next_trigger_at: isoAt(addDays(today, 1), 8, 30),
      enabled: true,
    },
  );
  if (eventByTitle["Revisión semanal"]) {
    await ensureOne(
      admin,
      "reminders",
      {
        user_id: userId,
        event_id: eventByTitle["Revisión semanal"].id,
        kind: "relative",
      },
      {
        user_id: userId,
        event_id: eventByTitle["Revisión semanal"].id,
        kind: "relative",
        minutes_before: 30,
        recurrence: "once",
        timezone: TZ,
        next_trigger_at: isoAt(today, 17, 0),
        enabled: true,
      },
    );
  }
  await ensureOne(
    admin,
    "reminders",
    { user_id: userId, kind: "alarm", title: "Pausa para estirar" },
    {
      user_id: userId,
      kind: "alarm",
      title: "Pausa para estirar",
      recurrence: "once",
      timezone: TZ,
      next_trigger_at: isoAt(addDays(today, 2), 19, 30),
      enabled: true,
    },
  );
  await admin
    .from("reminders")
    .update({
      next_trigger_at: isoAt(addDays(today, 2), 19, 30),
      delivery_status: "pending",
      snoozed_until: null,
    })
    .eq("user_id", userId)
    .eq("kind", "alarm");

  const presets = [
    {
      name: "Deep work",
      emoji: "🎯",
      intention: "Bloque largo sin distracciones",
      mode: "countdown",
      focus_duration_sec: 50 * 60,
      is_favorite: true,
      sort_order: 0,
    },
    {
      name: "Pomodoro suave",
      emoji: "🍅",
      intention: "Ciclos cortos con descanso",
      mode: "cycles",
      focus_duration_sec: 25 * 60,
      short_break_sec: 5 * 60,
      long_break_sec: 15 * 60,
      cycles_before_long_break: 4,
      target_cycles: 4,
      auto_start_breaks: true,
      is_favorite: false,
      sort_order: 1,
    },
    {
      name: "Lectura",
      emoji: "📖",
      intention: "Leer con calma",
      mode: "stopwatch",
      is_favorite: false,
      sort_order: 2,
    },
  ];

  const presetByName = {};
  for (const preset of presets) {
    presetByName[preset.name] = await ensureOne(
      admin,
      "focus_presets",
      { user_id: userId, name: preset.name },
      {
        user_id: userId,
        auto_start_breaks: false,
        auto_start_focus: false,
        sound_enabled: true,
        vibration_enabled: true,
        notify_on_phase_end: true,
        complete_task_on_session_end: false,
        keep_screen_awake: preset.name === "Deep work",
        prefer_fullscreen: false,
        segments: [],
        ...preset,
      },
    );
  }

  await ensureOne(
    admin,
    "focus_goals",
    { user_id: userId, is_primary: true },
    {
      user_id: userId,
      period: "weekly",
      target_focus_sec: 300 * 60,
      metric: "focus_seconds",
      target_value: 300 * 60,
      scope: "global",
      start_date: monday,
      considered_days: [1, 2, 3, 4, 5],
      is_primary: true,
      sort_order: 0,
      timezone: TZ,
      week_starts_on: 1,
      active: true,
    },
  );

  const existingSessions = await admin
    .from("focus_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "completed");
  if ((existingSessions.data?.length ?? 0) < 3) {
    const deep = presetByName["Deep work"];
    const pomodoro = presetByName["Pomodoro suave"];
    const samples = [
      {
        title: "Deep work",
        preset_id: deep?.id,
        dayOffset: -1,
        minutes: 50,
        mode: "countdown",
      },
      {
        title: "Pomodoro suave",
        preset_id: pomodoro?.id,
        dayOffset: -2,
        minutes: 25,
        mode: "cycles",
      },
      {
        title: "Deep work",
        preset_id: deep?.id,
        dayOffset: -4,
        minutes: 45,
        mode: "countdown",
      },
    ];
    for (const sample of samples) {
      const started = isoAt(addDays(today, sample.dayOffset), 10, 0);
      const ended = isoAt(addDays(today, sample.dayOffset), 10, sample.minutes);
      const sessionId = crypto.randomUUID();
      const { error: sessionError } = await admin.from("focus_sessions").insert({
        id: sessionId,
        user_id: userId,
        status: "completed",
        mode: sample.mode,
        title: sample.title,
        preset_id: sample.preset_id ?? null,
        planned_focus_sec: sample.minutes * 60,
        focus_sec: sample.minutes * 60,
        paused_sec: 0,
        break_sec: 0,
        config: {
          mode: sample.mode,
          focus_duration_sec: sample.minutes * 60,
        },
        started_at: started,
        ended_at: ended,
        revision: 2,
      });
      if (sessionError) {
        console.warn(`focus session: ${sessionError.message}`);
        continue;
      }
      await admin.from("focus_intervals").insert({
        user_id: userId,
        session_id: sessionId,
        kind: "focus",
        sequence: 0,
        started_at: started,
        ended_at: ended,
        planned_duration_sec: sample.minutes * 60,
      });
    }
  }

  return {
    today,
    deepWorkPresetId: presetByName["Deep work"]?.id ?? null,
    deepWorkTaskId: taskByTitle["Bloque de trabajo profundo"]?.id ?? null,
  };
}

async function startLiveSession(admin, userId, presetId, taskId) {
  await admin
    .from("focus_sessions")
    .update({
      status: "cancelled",
      ended_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .in("status", ["running", "paused", "on_break"]);

  const liveId = crypto.randomUUID();
  const liveStart = new Date(Date.now() - 8 * 60_000).toISOString();
  const { error } = await admin.from("focus_sessions").insert({
    id: liveId,
    user_id: userId,
    status: "running",
    mode: "countdown",
    title: "Deep work",
    preset_id: presetId,
    task_id: taskId,
    planned_focus_sec: 50 * 60,
    focus_sec: 8 * 60,
    paused_sec: 0,
    break_sec: 0,
    current_phase_kind: "focus",
    current_cycle: 1,
    config: { mode: "countdown", focus_duration_sec: 50 * 60 },
    started_at: liveStart,
    ended_at: null,
    revision: 1,
  });
  if (error) throw new Error(`live session: ${error.message}`);
  const { error: intervalError } = await admin.from("focus_intervals").insert({
    user_id: userId,
    session_id: liveId,
    kind: "focus",
    sequence: 0,
    started_at: liveStart,
    ended_at: null,
    planned_duration_sec: 50 * 60,
  });
  if (intervalError) throw new Error(`live interval: ${intervalError.message}`);
  return liveId;
}

async function stopLiveSession(admin, userId, liveId) {
  if (!liveId) return;
  await admin
    .from("focus_sessions")
    .update({ status: "cancelled", ended_at: new Date().toISOString() })
    .eq("id", liveId)
    .eq("user_id", userId);
}

async function newContext(browser, { theme, mobile }) {
  const baseHost = new URL(BASE_URL).hostname;
  const secure = BASE_URL.startsWith("https");
  const options = mobile
    ? {
        ...devices["iPhone 13"],
        colorScheme: theme,
        locale: "es-ES",
        timezoneId: TZ,
      }
    : {
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: theme,
        locale: "es-ES",
        timezoneId: TZ,
      };
  const context = await browser.newContext(options);
  // Local/prod CSP nonce is not stamped onto Next inline scripts, so
  // hydration never runs in a strict Playwright profile. Drop CSP here only.
  await context.route("**/*", async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers["content-security-policy"];
    delete headers["content-security-policy-report-only"];
    await route.fulfill({ response, headers });
  });
  return { context, baseHost, secure };
}

async function attachSession(context, session, baseHost, secure, theme, intro) {
  await context.addCookies(sessionCookies(session, baseHost, secure));
  await context.addInitScript(
    ({ theme: next, intro: showIntro }) => {
      localStorage.setItem("planora-theme", next);
      if (showIntro) {
        localStorage.removeItem("planora-focus-onboarding-v1");
      } else {
        localStorage.setItem(
          "planora-focus-onboarding-v1",
          JSON.stringify({
            introDismissed: true,
            dismissedAt: "2026-08-10T10:00:00.000Z",
          }),
        );
      }
    },
    { theme, intro },
  );
}

async function copyToPortfolio() {
  try {
    await mkdir(PORTFOLIO_DIR, { recursive: true });
    const files = [
      "01-landing.png",
      "02-today.png",
      "03-week.png",
      "04-tasks.png",
      "05-events.png",
      "06-history.png",
      "07-schedules.png",
      "08-categories.png",
      "09-settings.png",
      "10-mobile-landing.png",
      "11-mobile-today.png",
      "12-mobile-week.png",
      "13-focus-intro.png",
      "14-focus-home.png",
      "15-focus-start.png",
      "16-focus-active.png",
      "17-mobile-focus.png",
    ];
    for (const file of files) {
      await copyFile(join(OUT_DIR, file), join(PORTFOLIO_DIR, file));
    }
    console.log("copied to portfolio", PORTFOLIO_DIR);
  } catch (error) {
    console.warn("portfolio copy skipped:", error.message);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const user = await findUser(admin);
  console.log("account", user.email, user.id);
  const seeded = await seedWorkspace(admin, user.id);
  console.log("workspace seeded");
  const { session } = await signIn(admin);

  const browser = await chromium.launch({ headless: true });
  let liveId = "";

  try {
    const lightDesk = await newContext(browser, {
      theme: "light",
      mobile: false,
    });
    await attachSession(
      lightDesk.context,
      session,
      lightDesk.baseHost,
      lightDesk.secure,
      "light",
      false,
    );
    const page = await lightDesk.context.newPage();

    await page.setViewportSize({ width: 1440, height: 740 });
    await gotoReady(page, "/es", heading(/Tu vida cambia/i), "light");
    await shot(page, "01-landing.png", "light");
    await page.setViewportSize({ width: 1440, height: 900 });

    await gotoReady(
      page,
      "/es/today",
      async (p) => {
        await p.getByRole("button", { name: /Añadir/i }).first().waitFor({
          timeout: 30_000,
        });
        await p.getByText(/Progreso semanal|Pendientes|En cualquier momento/i).first().waitFor({
          timeout: 15_000,
        });
      },
      "light",
    );
    await shot(page, "02-today.png", "light");

    await gotoReady(page, "/es/week", heading(/Semana/i), "light");
    await shot(page, "03-week.png", "light");

    await gotoReady(page, "/es/tasks", heading(/Tareas/i), "light");
    await shot(page, "04-tasks.png", "light");

    await gotoReady(page, "/es/events", heading(/Eventos/i), "light");
    await shot(page, "05-events.png", "light");

    await gotoReady(page, "/es/history", heading(/Historial/i), "light");
    await shot(page, "06-history.png", "light");

    await gotoReady(page, "/es/schedules", heading(/Horarios/i), "light");
    await shot(page, "07-schedules.png", "light");

    await gotoReady(page, "/es/categories", heading(/Categorías/i), "light");
    await shot(page, "08-categories.png", "light");
    await lightDesk.context.close();

    const darkDesk = await newContext(browser, {
      theme: "dark",
      mobile: false,
    });
    await attachSession(
      darkDesk.context,
      session,
      darkDesk.baseHost,
      darkDesk.secure,
      "dark",
      false,
    );
    const darkPage = await darkDesk.context.newPage();
    await gotoReady(darkPage, "/es/settings", heading(/Ajustes/i), "dark");
    await darkPage.getByText(/Personalización|Tema/i).first().waitFor();
    await shot(darkPage, "09-settings.png", "dark");
    await darkDesk.context.close();

    const focusIntro = await newContext(browser, {
      theme: "light",
      mobile: false,
    });
    focusIntro.context.setDefaultTimeout(30_000);
    await attachSession(
      focusIntro.context,
      session,
      focusIntro.baseHost,
      focusIntro.secure,
      "light",
      true,
    );
    const introPage = await focusIntro.context.newPage();
    await introPage.setViewportSize({ width: 1440, height: 960 });
    await gotoReady(
      introPage,
      "/es/focus",
      heading(/¿Qué es Enfoque|Enfoque/i),
      "light",
    );
    const introHeading = introPage.getByRole("heading", {
      name: /¿Qué es Enfoque/i,
    });
    if (await introHeading.isVisible().catch(() => false)) {
      await shot(introPage, "13-focus-intro.png", "light");
    } else {
      await introPage.evaluate(() =>
        localStorage.removeItem("planora-focus-onboarding-v1"),
      );
      await introPage.reload({ waitUntil: "load" });
      await forceTheme(introPage, "light");
      await introHeading.waitFor({ timeout: 15_000 }).catch(() => undefined);
      await shot(introPage, "13-focus-intro.png", "light");
    }

    await dismissFocusIntro(introPage);
    await introPage.reload({ waitUntil: "load" });
    await forceTheme(introPage, "light");
    await introPage
      .getByText(/Presets y accesos|Deep work|Iniciar sesión/i)
      .first()
      .waitFor({ timeout: 20_000 });
    await shot(introPage, "14-focus-home.png", "light");

    await introPage
      .getByRole("button", { name: /Iniciar sesión|Sesión rápida/i })
      .first()
      .click();
    await introPage
      .getByRole("heading", { name: /Nueva sesión de Enfoque|Iniciar/i })
      .or(introPage.getByRole("dialog"))
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => undefined);
    await settle(introPage);
    await shot(introPage, "15-focus-start.png", "light", { dismiss: false });
    await introPage.keyboard.press("Escape");
    await focusIntro.context.close();

    liveId = await startLiveSession(
      admin,
      user.id,
      seeded.deepWorkPresetId,
      seeded.deepWorkTaskId,
    );

    const focusLive = await newContext(browser, {
      theme: "light",
      mobile: false,
    });
    await attachSession(
      focusLive.context,
      session,
      focusLive.baseHost,
      focusLive.secure,
      "light",
      false,
    );
    const livePage = await focusLive.context.newPage();
    await livePage.setViewportSize({ width: 1440, height: 960 });
    await gotoReady(livePage, "/es/focus", async (p) => {
      await p.getByText(/Sesión activa|restante|Pausar/i).first().waitFor({
        timeout: 20_000,
      });
    }, "light");
    await shot(livePage, "16-focus-active.png", "light");
    await focusLive.context.close();

    const mobileLight = await newContext(browser, {
      theme: "light",
      mobile: true,
    });
    await attachSession(
      mobileLight.context,
      session,
      mobileLight.baseHost,
      mobileLight.secure,
      "light",
      false,
    );
    const mobile = await mobileLight.context.newPage();
    await gotoReady(mobile, "/es", heading(/Tu vida cambia/i), "light");
    await shot(mobile, "10-mobile-landing.png", "light");
    await gotoReady(
      mobile,
      "/es/today",
      (p) =>
        p.getByRole("button", { name: /Añadir/i }).first().waitFor({
          timeout: 30_000,
        }),
      "light",
    );
    await shot(mobile, "11-mobile-today.png", "light");
    await mobileLight.context.close();

    const mobileDark = await newContext(browser, {
      theme: "dark",
      mobile: true,
    });
    await attachSession(
      mobileDark.context,
      session,
      mobileDark.baseHost,
      mobileDark.secure,
      "dark",
      false,
    );
    const darkMobile = await mobileDark.context.newPage();
    await gotoReady(darkMobile, "/es/week", heading(/Semana/i), "dark");
    await shot(darkMobile, "12-mobile-week.png", "dark");
    await mobileDark.context.close();

    liveId = await startLiveSession(
      admin,
      user.id,
      seeded.deepWorkPresetId,
      seeded.deepWorkTaskId,
    );

    const focusLiveMobile = await newContext(browser, {
      theme: "light",
      mobile: true,
    });
    await attachSession(
      focusLiveMobile.context,
      session,
      focusLiveMobile.baseHost,
      focusLiveMobile.secure,
      "light",
      false,
    );
    const mobileFocus = await focusLiveMobile.context.newPage();
    await gotoReady(mobileFocus, "/es/focus", async (p) => {
      await p.getByText(/Sesión activa|restante|Pausar/i).first().waitFor({
        timeout: 20_000,
      });
    }, "light");
    await shot(mobileFocus, "17-mobile-focus.png", "light");
    await focusLiveMobile.context.close();
  } finally {
    await stopLiveSession(admin, user.id, liveId);
    await browser.close();
  }

  await copyToPortfolio();
  console.log("done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
