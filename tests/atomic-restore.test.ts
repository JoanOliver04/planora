import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260802190000_atomic_backup_restore.sql",
  ),
  "utf8",
);

describe("atomic backup restore migration", () => {
  it("binds ownership exclusively to the authenticated user", () => {
    expect(sql).toContain("current_user_id uuid := auth.uid()");
    expect(sql).not.toMatch(/restore_planora_backup\([^)]*user_id/i);
    expect(sql).toContain("revoke all on function");
    expect(sql).toContain("grant execute");
    expect(sql).not.toContain("security definer");
  });

  it("serializes concurrent restores and replaces dependants in FK order", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    const deletions = [
      "delete from public.reminders",
      "delete from public.task_completions",
      "delete from public.events",
      "delete from public.tasks",
      "delete from public.schedule_templates",
      "delete from public.categories",
      "delete from public.schedules",
    ].map((statement) => sql.indexOf(statement));
    expect(deletions.every((position) => position >= 0)).toBe(true);
    expect(deletions).toEqual(
      [...deletions].sort((left, right) => left - right),
    );
  });

  it("keeps reminders disabled and returns exact restored counts", () => {
    expect(sql).toContain("false, 'pending'::public.delivery_status");
    for (const entity of [
      "schedules",
      "categories",
      "tasks",
      "events",
      "completions",
      "templates",
      "reminders",
      "alarms",
    ])
      expect(sql).toContain(`'${entity}'`);
  });

  it("keeps replacement warnings complete in both languages", () => {
    for (const messages of [en, es]) {
      expect(messages.Data.restore.behaviour.length).toBeGreaterThan(40);
      expect(messages.Data.restore.confirmAction.length).toBeGreaterThan(10);
      expect(messages.Data.restore["safety-copy"].length).toBeGreaterThan(10);
      expect(messages.Data.summary.alarms.length).toBeGreaterThan(3);
    }
  });
  it("uses a single PostgreSQL function so any delete or insert error rolls back", () => {
    expect(sql).toMatch(
      /create or replace function public\.restore_planora_backup/,
    );
    expect(sql).not.toMatch(/\bcommit\b|\brollback\b/i);
    expect(sql.indexOf("delete from public.schedules")).toBeLessThan(
      sql.indexOf("insert into public.schedules"),
    );
  });
});
