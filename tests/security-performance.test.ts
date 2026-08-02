import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const worker = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const scheduler = readFileSync(
  join(process.cwd(), "src/components/reminder-scheduler.tsx"),
  "utf8",
);
const headers = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
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

describe("security and performance architecture", () => {
  it("never stores authenticated navigations in the service-worker cache", () => {
    expect(worker).toContain('const VERSION = "planora-shell-v2"');
    expect(worker).toContain("PUBLIC_NAVIGATION.has(url.pathname)");
    expect(worker).toContain("private|no-store");
    expect(worker).not.toMatch(/cache\.put\(request[\s\S]*\/today/);
  });

  it("restricts notification navigation to localized reminder routes", () => {
    expect(worker).toContain("/^\\/(?:es|en)\\/reminders$/");
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
    expect(headers).toContain("\"script-src-attr 'none'\"");
    expect(headers).toContain('key: "Cross-Origin-Resource-Policy"');
    expect(headers).toContain('key: "X-DNS-Prefetch-Control"');
  });
});
