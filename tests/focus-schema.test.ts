import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260807160000_focus_schema.sql"),
  "utf8",
);
const executableSql = sql.replace(/^--.*$/gm, "");

type FocusPreset = Database["public"]["Tables"]["focus_presets"]["Row"];
type FocusSession = Database["public"]["Tables"]["focus_sessions"]["Row"];
type FocusInterval = Database["public"]["Tables"]["focus_intervals"]["Row"];
type FocusGoal = Database["public"]["Tables"]["focus_goals"]["Row"];

describe("focus schema migration contracts", () => {
  it("creates the four ownership-safe focus tables", () => {
    expect(sql).toContain("create table public.focus_presets");
    expect(sql).toContain("create table public.focus_sessions");
    expect(sql).toContain("create table public.focus_intervals");
    expect(sql).toContain("create table public.focus_goals");
    for (const table of [
      "focus_presets",
      "focus_sessions",
      "focus_intervals",
      "focus_goals",
    ]) {
      expect(sql).toContain(`unique (id, user_id)`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("scopes every RLS policy to authenticated users via cached auth.uid()", () => {
    const tables = [
      "focus_presets",
      "focus_sessions",
      "focus_intervals",
      "focus_goals",
    ] as const;
    for (const table of tables) {
      for (const op of ["select", "insert", "update", "delete"] as const) {
        expect(sql).toContain(`create policy ${table}_${op} on public.${table}`);
      }
    }
    expect(executableSql.match(/to authenticated/g)).toHaveLength(16);
    expect(executableSql.match(/auth\.uid\(\)/g)).toHaveLength(
      executableSql.match(/select auth\.uid\(\)/g)?.length ?? 0,
    );
    expect(executableSql).not.toMatch(
      /create policy[\s\S]*?using \(user_id = auth\.uid\(\)\)/,
    );
  });

  it("prevents cross-account links with composite foreign keys", () => {
    expect(sql).toContain(
      "foreign key (preset_id, user_id)\n    references public.focus_presets (id, user_id) on delete set null",
    );
    expect(sql).toContain(
      "foreign key (task_id, user_id)\n    references public.tasks (id, user_id) on delete set null",
    );
    expect(sql).toContain(
      "foreign key (category_id, user_id)\n    references public.categories (id, user_id) on delete set null",
    );
    expect(sql).toContain(
      "foreign key (schedule_id, user_id)\n    references public.schedules (id, user_id) on delete set null",
    );
    expect(sql).toContain(
      "foreign key (session_id, user_id)\n    references public.focus_sessions (id, user_id) on delete cascade",
    );
  });

  it("enforces a single active session per user at the database level", () => {
    expect(sql).toContain("create unique index focus_sessions_one_active_per_user");
    expect(sql).toContain("on public.focus_sessions (user_id)");
    expect(sql).toContain(
      "where status in ('running', 'paused', 'on_break')",
    );
  });

  it("allows multiple completed sessions while rejecting invalid statuses", () => {
    expect(sql).toContain(
      "status in ('running', 'paused', 'on_break', 'completed', 'cancelled')",
    );
    // Completed rows are outside the partial unique predicate, so many are allowed.
    expect(sql).not.toMatch(
      /unique index focus_sessions_one_active_per_user[\s\S]*completed/,
    );
    expect(sql).toContain("focus_sessions_terminal_has_ended_at");
  });

  it("preserves focus history when linked tasks are deleted", () => {
    expect(sql).toContain(
      "references public.tasks (id, user_id) on delete set null",
    );
    expect(sql).not.toContain(
      "references public.tasks (id, user_id) on delete cascade",
    );
    expect(sql).toContain("link_snapshot jsonb not null default '{}'::jsonb");
    expect(sql).toContain("history stays readable after deletes");
  });

  it("rejects invalid states, negative durations and non-positive goals", () => {
    expect(sql).toContain("focus_sec integer not null default 0 check (focus_sec >= 0)");
    expect(sql).toContain("paused_sec integer not null default 0 check (paused_sec >= 0)");
    expect(sql).toContain("break_sec integer not null default 0 check (break_sec >= 0)");
    expect(sql).toContain("target_focus_sec integer not null check (target_focus_sec > 0)");
    expect(sql).toContain(
      "kind in ('focus', 'short_break', 'long_break', 'pause')",
    );
    expect(sql).toContain("ended_at is null or ended_at >= started_at");
    expect(sql).toContain("mode in ('countdown', 'stopwatch', 'cycles')");
  });

  it("models concurrency revision and open-interval uniqueness", () => {
    expect(sql).toContain(
      "revision integer not null default 1 check (revision >= 1)",
    );
    expect(sql).toContain("Optimistic concurrency token");
    expect(sql).toContain("create unique index focus_intervals_one_open_per_session");
    expect(sql).toContain("where ended_at is null");
    expect(sql).toContain("unique (session_id, sequence)");
  });

  it("does not introduce per-second tick storage", () => {
    expect(sql.toLowerCase()).not.toContain("every second");
    expect(sql.toLowerCase()).toContain("never tick-per-second rows");
    expect(sql).toContain("open interval elapsed is derived at read time");
    expect(sql).not.toMatch(/create table public\.focus_ticks/i);
  });
});

describe("focus database TypeScript types", () => {
  it("exposes strict row shapes for all focus tables", () => {
    const preset = {
      id: "00000000-0000-4000-8000-000000000001",
      user_id: "00000000-0000-4000-8000-000000000002",
      name: "Deep work",
      emoji: "🎯",
      intention: "Deep work block",
      mode: "countdown",
      focus_duration_sec: 1500,
      short_break_sec: 300,
      long_break_sec: 900,
      cycles_before_long_break: 4,
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
      default_category_id: null,
      archived_at: null,
      created_at: "2026-08-07T00:00:00.000Z",
      updated_at: "2026-08-07T00:00:00.000Z",
    } satisfies FocusPreset;

    const session = {
      id: "00000000-0000-4000-8000-000000000003",
      user_id: preset.user_id,
      status: "running",
      mode: "cycles",
      title: "Study",
      preset_id: preset.id,
      task_id: null,
      category_id: null,
      schedule_id: null,
      occurrence_date: "2026-08-07",
      planned_focus_sec: 1500,
      focus_sec: 0,
      paused_sec: 0,
      break_sec: 0,
      current_phase_kind: "focus",
      current_cycle: 1,
      config: { focus_duration_sec: 1500 },
      link_snapshot: {},
      started_at: "2026-08-07T10:00:00.000Z",
      ended_at: null,
      notes: null,
      distractions: [],
      subjective_focus: null,
      subjective_energy: null,
      complete_task_on_end: false,
      task_completion_applied: false,
      revision: 1,
      created_at: "2026-08-07T10:00:00.000Z",
      updated_at: "2026-08-07T10:00:00.000Z",
    } satisfies FocusSession;

    const interval = {
      id: "00000000-0000-4000-8000-000000000004",
      user_id: session.user_id,
      session_id: session.id,
      kind: "focus",
      sequence: 0,
      cycle_index: 1,
      started_at: session.started_at,
      ended_at: null,
      planned_duration_sec: 1500,
      created_at: session.created_at,
    } satisfies FocusInterval;

    const goal = {
      id: "00000000-0000-4000-8000-000000000005",
      user_id: session.user_id,
      period: "weekly",
      target_focus_sec: 5 * 60 * 60,
      timezone: "Europe/Madrid",
      week_starts_on: 1,
      active: true,
      created_at: session.created_at,
      updated_at: session.updated_at,
    } satisfies FocusGoal;

    expect(preset.mode).toBe("countdown");
    expect(session.status).toBe("running");
    expect(interval.kind).toBe("focus");
    expect(goal.target_focus_sec).toBeGreaterThan(0);
    expect(session.revision).toBe(1);
  });

  it("keeps complete_task_on_end default-safe in the type model", () => {
    type Flags = Pick<
      FocusSession,
      "complete_task_on_end" | "task_completion_applied"
    >;
    const flags: Flags = {
      complete_task_on_end: false,
      task_completion_applied: false,
    };
    expect(flags.complete_task_on_end).toBe(false);
  });
});
