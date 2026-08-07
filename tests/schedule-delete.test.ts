import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260803000000_schedule_delete_cascade.sql",
  ),
  "utf8",
);

describe("atomic schedule deletion", () => {
  it("locks ownership, cascades dependants and selects replacement atomically", () => {
    expect(sql).toContain("current_user_id uuid := auth.uid()");
    expect(sql).toContain("for update");
    expect(sql).toContain("delete from public.task_completions");
    expect(sql).toContain("delete from public.tasks");
    expect(sql).toContain("delete from public.events");
    expect(sql).toContain("set active_schedule_id");
    expect(sql).toContain("order by sort_order, created_at, id");
    expect(sql).toContain("delete from public.schedules");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("current_user_id uuid := auth.uid()");
  });
});
