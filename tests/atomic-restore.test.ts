import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

const originalSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260802190000_atomic_backup_restore.sql",
  ),
  "utf8",
);
const focusSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260807170000_focus_backup_restore.sql",
  ),
  "utf8",
);
const focusGoalsSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260807200000_focus_backup_restore_goals.sql",
  ),
  "utf8",
);

describe("atomic backup restore migration", () => {
  it("binds ownership exclusively to the authenticated user", () => {
    expect(originalSql).toContain("current_user_id uuid := auth.uid()");
    expect(originalSql).not.toMatch(/restore_planora_backup\([^)]*user_id/i);
    expect(originalSql).toContain("revoke all on function");
    expect(originalSql).toContain("grant execute");
    expect(originalSql).not.toContain("security definer");
    expect(focusSql).toContain("current_user_id uuid := auth.uid()");
    expect(focusSql).not.toContain("security definer");
  });

  it("serializes concurrent restores and replaces dependants in FK order", () => {
    expect(focusSql).toContain("pg_advisory_xact_lock");
    const deletions = [
      "delete from public.focus_intervals",
      "delete from public.focus_sessions",
      "delete from public.focus_goals",
      "delete from public.focus_presets",
      "delete from public.reminders",
      "delete from public.task_completions",
      "delete from public.events",
      "delete from public.tasks",
      "delete from public.schedule_templates",
      "delete from public.categories",
      "delete from public.schedules",
    ].map((statement) => focusSql.indexOf(statement));
    expect(deletions.every((position) => position >= 0)).toBe(true);
    expect(deletions).toEqual(
      [...deletions].sort((left, right) => left - right),
    );
  });

  it("keeps reminders disabled and returns exact restored counts", () => {
    expect(focusSql).toContain("false, 'pending'::public.delivery_status");
    for (const entity of [
      "schedules",
      "categories",
      "tasks",
      "events",
      "completions",
      "templates",
      "reminders",
      "alarms",
      "focus_presets",
      "focus_sessions",
      "focus_intervals",
      "focus_goals",
    ])
      expect(focusSql).toContain(`'${entity}'`);
  });

  it("inserts focus entities after workspace dependencies", () => {
    expect(focusSql.indexOf("insert into public.tasks")).toBeLessThan(
      focusSql.indexOf("insert into public.focus_presets"),
    );
    expect(focusSql.indexOf("insert into public.focus_presets")).toBeLessThan(
      focusSql.indexOf("insert into public.focus_sessions"),
    );
    expect(focusSql.indexOf("insert into public.focus_sessions")).toBeLessThan(
      focusSql.indexOf("insert into public.focus_intervals"),
    );
    expect(focusSql).toContain("scope");
  });

  it("keeps replacement warnings complete in both languages", () => {
    for (const messages of [en, es]) {
      expect(messages.Data.restore.behaviour.length).toBeGreaterThan(40);
      expect(messages.Data.restore.confirmAction.length).toBeGreaterThan(10);
      expect(messages.Data.restore["safety-copy"].length).toBeGreaterThan(10);
      expect(messages.Data.summary.alarms.length).toBeGreaterThan(3);
      expect(messages.Data.summary.focus_sessions.length).toBeGreaterThan(3);
      expect(messages.Data.restore.fileType).toMatch(/v4/i);
    }
  });

  it("restores flexible focus goals and preset management columns", () => {
    expect(focusGoalsSql).toContain("metric");
    expect(focusGoalsSql).toContain("target_value");
    expect(focusGoalsSql).toContain("considered_days");
    expect(focusGoalsSql).toContain("default_category_id");
    expect(focusGoalsSql).toContain("archived_at");
    expect(focusGoalsSql).toContain("emoji");
    expect(focusGoalsSql).toContain("intention");
  });

  it("uses a single PostgreSQL function so any delete or insert error rolls back", () => {
    expect(focusSql).toMatch(
      /create or replace function public\.restore_planora_backup_core/,
    );
    expect(focusSql).not.toMatch(/\bcommit\b|\brollback\b/i);
    expect(focusSql.indexOf("delete from public.schedules")).toBeLessThan(
      focusSql.indexOf("insert into public.schedules"),
    );
  });
});
