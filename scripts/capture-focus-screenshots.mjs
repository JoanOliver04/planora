/**
 * Capture Focus portfolio screenshots in light theme.
 * Requires local app on BASE_URL and Supabase service role in env.
 *
 * Usage: node scripts/capture-focus-screenshots.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";
import nextEnv from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringToBase64URL } from "../node_modules/@supabase/ssr/dist/module/utils/base64url.js";
import { createChunks } from "../node_modules/@supabase/ssr/dist/module/utils/chunker.js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const BASE_URL = process.env.FOCUS_SHOT_BASE_URL ?? "http://127.0.0.1:3000";
const OUT_DIR = join(process.cwd(), "docs", "images");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Missing Supabase env (URL, publishable key, service role).");
  process.exit(1);
}

const projectRef = new URL(url).hostname.split(".")[0];
const storageKey = `sb-${projectRef}-auth-token`;

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

async function forceLightTheme(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("planora-theme", "light");
    } catch {
      // ignore about:blank / opaque origins
    }
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  });
}

async function waitFocusReady(page) {
  await page.waitForURL(/\/es\/focus/, { timeout: 30_000 });
  await page
    .getByRole("heading", { name: /Enfoque|¿Qué es Enfoque/i })
    .first()
    .waitFor({ timeout: 30_000 });
  // Let fonts/layout settle.
  await page.waitForTimeout(600);
}

async function seedPortfolioData(db, userId) {
  const now = Date.now();
  const { data: schedule, error: scheduleError } = await db
    .from("schedules")
    .insert({ user_id: userId, name: "Semana de estudio", emoji: "📚" })
    .select("*")
    .single();
  if (scheduleError) throw new Error(`schedule: ${scheduleError.message}`);

  const { error: taskError } = await db.from("tasks").insert({
    user_id: userId,
    schedule_id: schedule.id,
    title: "Repasar algoritmos",
    emoji: "🧠",
    task_kind: "habit",
    recurrence_type: "weekdays",
    recurrence_config: { weekdays: [1, 2, 3, 4, 5] },
    time_mode: "anytime",
    start_date: "2026-08-01",
  });
  if (taskError) throw new Error(`task: ${taskError.message}`);

  const presets = [
    {
      user_id: userId,
      name: "Deep work",
      emoji: "🎯",
      intention: "Bloque largo sin distracciones",
      mode: "countdown",
      focus_duration_sec: 50 * 60,
      short_break_sec: null,
      long_break_sec: null,
      cycles_before_long_break: null,
      target_cycles: null,
      auto_start_breaks: false,
      auto_start_focus: false,
      sound_enabled: true,
      vibration_enabled: true,
      notify_on_phase_end: true,
      complete_task_on_session_end: false,
      keep_screen_awake: true,
      prefer_fullscreen: false,
      segments: [],
      is_favorite: true,
      sort_order: 0,
    },
    {
      user_id: userId,
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
      auto_start_focus: false,
      sound_enabled: true,
      vibration_enabled: true,
      notify_on_phase_end: true,
      complete_task_on_session_end: false,
      keep_screen_awake: false,
      prefer_fullscreen: false,
      segments: [],
      is_favorite: false,
      sort_order: 1,
    },
    {
      user_id: userId,
      name: "Lectura",
      emoji: "📖",
      intention: "Leer con calma",
      mode: "stopwatch",
      focus_duration_sec: null,
      short_break_sec: null,
      long_break_sec: null,
      cycles_before_long_break: null,
      target_cycles: null,
      auto_start_breaks: false,
      auto_start_focus: false,
      sound_enabled: false,
      vibration_enabled: false,
      notify_on_phase_end: false,
      complete_task_on_session_end: false,
      keep_screen_awake: false,
      prefer_fullscreen: false,
      segments: [],
      is_favorite: false,
      sort_order: 2,
    },
  ];

  const { data: presetRows, error: presetError } = await db
    .from("focus_presets")
    .insert(presets)
    .select("*");
  if (presetError) throw new Error(`presets: ${presetError.message}`);

  const { error: goalError } = await db.from("focus_goals").insert({
    user_id: userId,
    period: "weekly",
    target_focus_sec: 300 * 60,
    timezone: "Europe/Madrid",
    week_starts_on: 1,
    active: true,
    metric: "focus_seconds",
    target_value: 300 * 60,
    scope: "global",
    considered_days: [1, 2, 3, 4, 5],
    is_primary: true,
    sort_order: 0,
  });
  if (goalError) throw new Error(`goal: ${goalError.message}`);

  // Completed session for recent history / stats.
  const completedId = crypto.randomUUID();
  const started = new Date(now - 40 * 60_000).toISOString();
  const ended = new Date(now - 15 * 60_000).toISOString();
  const { error: sessionError } = await db.from("focus_sessions").insert({
    id: completedId,
    user_id: userId,
    status: "completed",
    mode: "countdown",
    title: "Deep work",
    preset_id: presetRows?.[0]?.id ?? null,
    task_id: null,
    focus_sec: 25 * 60,
    break_sec: 0,
    paused_sec: 0,
    planned_focus_sec: 25 * 60,
    config: {
      mode: "countdown",
      focus_duration_sec: 25 * 60,
    },
    notes: null,
    distractions: [],
    started_at: started,
    ended_at: ended,
    revision: 3,
  });
  if (sessionError) throw new Error(`session: ${sessionError.message}`);

  const { error: intervalError } = await db.from("focus_intervals").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    session_id: completedId,
    kind: "focus",
    sequence: 0,
    cycle_index: null,
    started_at: started,
    ended_at: ended,
    planned_duration_sec: 25 * 60,
  });
  if (intervalError) throw new Error(`interval: ${intervalError.message}`);

  return { deepWorkPresetId: presetRows?.[0]?.id };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
  const email = `focus-shots-${suffix}@example.com`;
  const password = `Planora-Shot-${crypto.randomUUID()}!Aa1`;
  let userId = "";

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(created.error?.message ?? "createUser failed");
  }
  userId = created.data.user.id;

  try {
    // Ensure profile exists and skip product guided onboarding overlay.
    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId,
      display_name: "Portfolio Focus",
      timezone: "Europe/Madrid",
      week_starts_on: 1,
      onboarding_completed: true,
    });
    if (profileError) throw new Error(`profile: ${profileError.message}`);

    const db = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (link.error) throw new Error(link.error.message);
    const verified = await db.auth.verifyOtp({
      token_hash: link.data.properties.hashed_token,
      type: "email",
    });
    if (verified.error || !verified.data.session) {
      throw new Error(verified.error?.message ?? "verifyOtp failed");
    }

    const browser = await chromium.launch({ headless: true });
    const baseHost = new URL(BASE_URL).hostname;
    const secure = BASE_URL.startsWith("https");

    // --- Desktop: first-visit intro (no Focus history yet) ---
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 1,
      colorScheme: "light",
      locale: "es-ES",
    });
    await desktop.addCookies(
      sessionCookies(verified.data.session, baseHost, secure),
    );
    const page = await desktop.newPage();
    await page.addInitScript(() => {
      localStorage.setItem("planora-theme", "light");
      localStorage.removeItem("planora-focus-onboarding-v1");
    });
    await page.goto(`${BASE_URL}/es/focus`, { waitUntil: "networkidle" });
    await forceLightTheme(page);
    await waitFocusReady(page);
    await page
      .getByRole("heading", { name: /¿Qué es Enfoque/i })
      .waitFor({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: join(OUT_DIR, "13-focus-intro.png"),
      fullPage: false,
    });
    console.log("wrote 13-focus-intro.png");

    // Seed portfolio data, dismiss intro → home with presets
    await seedPortfolioData(db, userId);
    await page.evaluate(() => {
      localStorage.setItem(
        "planora-focus-onboarding-v1",
        JSON.stringify({
          introDismissed: true,
          dismissedAt: new Date().toISOString(),
        }),
      );
    });
    await page.reload({ waitUntil: "networkidle" });
    await forceLightTheme(page);
    await waitFocusReady(page);
    await page
      .getByText(/Presets y accesos|Deep work|Iniciar sesión/i)
      .first()
      .waitFor({
        timeout: 15_000,
      });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: join(OUT_DIR, "14-focus-home.png"),
      fullPage: false,
    });
    console.log("wrote 14-focus-home.png");

    // Open start dialog
    const startBtn = page
      .getByRole("button", { name: /Iniciar sesión|Sesión rápida/i })
      .first();
    await startBtn.click();
    await page
      .getByRole("dialog")
      .or(page.locator('[role="dialog"]'))
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => undefined);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: join(OUT_DIR, "15-focus-start.png"),
      fullPage: false,
    });
    console.log("wrote 15-focus-start.png");

    // Close dialog and seed a live running session for the active view
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    const liveId = crypto.randomUUID();
    const liveStart = new Date().toISOString();
    const { error: liveError } = await db.from("focus_sessions").insert({
      id: liveId,
      user_id: userId,
      status: "running",
      mode: "countdown",
      title: "Deep work",
      preset_id: null,
      planned_focus_sec: 50 * 60,
      focus_sec: 0,
      paused_sec: 0,
      break_sec: 0,
      current_phase_kind: "focus",
      current_cycle: 1,
      config: { mode: "countdown", focus_duration_sec: 50 * 60 },
      started_at: liveStart,
      ended_at: null,
      revision: 1,
    });
    if (liveError) throw new Error(`live session: ${liveError.message}`);
    const { error: liveIntervalError } = await db
      .from("focus_intervals")
      .insert({
        id: crypto.randomUUID(),
        user_id: userId,
        session_id: liveId,
        kind: "focus",
        sequence: 0,
        cycle_index: null,
        started_at: liveStart,
        ended_at: null,
        planned_duration_sec: 50 * 60,
      });
    if (liveIntervalError) {
      throw new Error(`live interval: ${liveIntervalError.message}`);
    }

    await page.reload({ waitUntil: "networkidle" });
    await forceLightTheme(page);
    await page
      .getByText(/Sesión activa|restante|Pausar/i)
      .first()
      .waitFor({ timeout: 20_000 });
    await page.waitForTimeout(700);
    await page.screenshot({
      path: join(OUT_DIR, "16-focus-active.png"),
      fullPage: false,
    });
    console.log("wrote 16-focus-active.png");
    await desktop.close();

    // --- Mobile ---
    const mobileDevice = devices["iPhone 13"];
    const mobile = await browser.newContext({
      ...mobileDevice,
      colorScheme: "light",
      locale: "es-ES",
    });
    await mobile.addCookies(
      sessionCookies(verified.data.session, baseHost, secure),
    );
    const mpage = await mobile.newPage();
    await mpage.addInitScript(() => {
      localStorage.setItem(
        "planora-focus-onboarding-v1",
        JSON.stringify({
          introDismissed: true,
          dismissedAt: new Date().toISOString(),
        }),
      );
      localStorage.setItem("planora-theme", "light");
    });
    await mpage.goto(`${BASE_URL}/es/focus`, { waitUntil: "networkidle" });
    await forceLightTheme(mpage);
    await waitFocusReady(mpage);
    await mpage.screenshot({
      path: join(OUT_DIR, "17-mobile-focus.png"),
      fullPage: false,
    });
    console.log("wrote 17-mobile-focus.png");
    await mobile.close();
    await browser.close();

    await writeFile(
      join(OUT_DIR, "focus-shots-manifest.json"),
      JSON.stringify(
        {
          theme: "light",
          locale: "es",
          capturedAt: new Date().toISOString(),
          files: [
            "13-focus-intro.png",
            "14-focus-home.png",
            "15-focus-start.png",
            "16-focus-active.png",
            "17-mobile-focus.png",
          ],
        },
        null,
        2,
      ),
    );
    console.log("done");
  } finally {
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
