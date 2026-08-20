import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const worker = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const scheduler = readFileSync(
  join(process.cwd(), "src/components/reminder-scheduler.tsx"),
  "utf8",
);
const headers = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
const csp = readFileSync(
  join(process.cwd(), "src/lib/security/csp.ts"),
  "utf8",
);
const rlsMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260802203000_rls_performance_hardening.sql",
  ),
  "utf8",
);
const onboardingMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260802204000_onboarding_function_lint.sql",
  ),
  "utf8",
);
const rateLimitMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260814223000_distributed_rate_limits.sql",
  ),
  "utf8",
);
const restoreWeekMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260818190000_restore_week_start_and_focus.sql",
  ),
  "utf8",
);
const duplicateScheduleMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260820110000_atomic_schedule_duplicate.sql",
  ),
  "utf8",
);
const authenticatedPrivilegesMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260820120000_authenticated_table_privileges.sql",
  ),
  "utf8",
);

describe("security and performance architecture", () => {
  it("never stores authenticated navigations in the service-worker cache", () => {
    expect(worker).toContain('const VERSION = "planora-shell-v2"');
    expect(worker).toContain("PUBLIC_NAVIGATION.has(url.pathname)");
    expect(worker).toContain("private|no-store");
    expect(worker).not.toMatch(/cache\.put\(request[\s\S]*\/today/);
  });

  it("restricts notification navigation to known localized routes", () => {
    expect(worker).toContain(
      "/^\\/(?:es|en)\\/(?:reminders|focus|summary)(?:\\?[^#]*)?$/",
    );
    expect(worker).not.toContain("openWindow(requested)");
  });

  it("batches reminder copy lookups instead of issuing N+1 queries", () => {
    expect(scheduler).toContain('.in("id", taskIds)');
    expect(scheduler).toContain('.in("id", eventIds)');
    expect(scheduler).not.toContain('.select("*")');
    expect(scheduler).not.toContain("maybeSingle()");
  });

  it("limits RLS policies to authenticated users with init-plan user checks", () => {
    expect(rlsMigration.match(/alter policy/g)).toHaveLength(32);
    expect(rlsMigration.match(/to authenticated/g)).toHaveLength(32);
    const executableSql = rlsMigration.replace(/^--.*$/gm, "");
    expect(executableSql.match(/auth\.uid\(\)/g)).toHaveLength(
      executableSql.match(/select auth\.uid\(\)/g)?.length ?? 0,
    );
  });

  it("keeps onboarding functions invoker-safe and lint-clean", () => {
    expect(onboardingMigration.match(/security invoker/g)).toHaveLength(2);
    expect(onboardingMigration.match(/set search_path = ''/g)).toHaveLength(2);
    expect(onboardingMigration).not.toContain("i integer");
  });
  it("enables defense-in-depth browser headers", () => {
    expect(csp).toContain("\"script-src-attr 'none'\"");
    expect(csp).toContain("`script-src 'self'");
    expect(csp).toContain("nonce");
    expect(headers).toContain('key: "Cross-Origin-Resource-Policy"');
    expect(headers).toContain('key: "X-DNS-Prefetch-Control"');
    expect(headers).not.toContain('key: "Content-Security-Policy"');
  });

  it("stores rate limits outside serverless process memory", () => {
    expect(rateLimitMigration).toContain(
      "create table public.request_rate_limits",
    );
    expect(rateLimitMigration).toContain("security definer");
    expect(rateLimitMigration).toContain("to service_role");
    expect(rateLimitMigration).toContain("on conflict (key_hash) do update");
  });

  it("duplicates schedules atomically under authenticated ownership", () => {
    expect(duplicateScheduleMigration).toContain(
      "create or replace function public.duplicate_schedule",
    );
    expect(duplicateScheduleMigration).toContain(
      "current_user_id uuid := auth.uid()",
    );
    expect(duplicateScheduleMigration).toContain("security invoker");
    expect(duplicateScheduleMigration).toContain("set search_path = ''");
    expect(duplicateScheduleMigration).toContain("else task.category_id");
    expect(duplicateScheduleMigration).toContain(
      "revoke all on function public.duplicate_schedule(uuid, boolean) from anon",
    );
    expect(duplicateScheduleMigration).not.toMatch(/\bcommit\b|\brollback\b/i);
  });

  it("reproduces authenticated table privileges without exposing internals", () => {
    expect(authenticatedPrivilegesMigration).toContain("public.focus_sessions");
    expect(authenticatedPrivilegesMigration).toContain(
      "public.task_occurrence_state",
    );
    expect(authenticatedPrivilegesMigration).toContain(
      "create policy occurrence_state_delete",
    );
    expect(authenticatedPrivilegesMigration).toContain(
      "create policy template_imports_insert",
    );
    expect(authenticatedPrivilegesMigration).toContain(
      "create policy template_imports_delete",
    );
    expect(authenticatedPrivilegesMigration).not.toContain(
      "public.request_rate_limits",
    );
    expect(authenticatedPrivilegesMigration).not.toMatch(/\bto anon\b/);
  });

  it("terminalizes live Focus sessions and respects week start on restore", () => {
    expect(restoreWeekMigration).toContain("planora.restoring");
    expect(restoreWeekMigration).toContain("week_starts_on");
    expect(restoreWeekMigration).toContain("status = 'cancelled'");
    expect(restoreWeekMigration).toContain("ended_at is null");
  });

  it("records completion authority so offline replay cannot resurrect work", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260818210000_completion_occurrence_state.sql",
      ),
      "utf8",
    );
    expect(migration).toContain("create table public.task_occurrence_state");
    expect(migration).toContain("last_action");
    expect(migration).toContain("record_completion_occurrence_state");
  });
});
