import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Focus release readiness contracts", () => {
  it("keeps Focus tables under authenticated RLS with ownership FKs", () => {
    const schema = read("supabase/migrations/20260807160000_focus_schema.sql");
    for (const table of [
      "focus_presets",
      "focus_sessions",
      "focus_intervals",
      "focus_goals",
    ]) {
      expect(schema).toContain(`create table public.${table}`);
      expect(schema).toMatch(
        new RegExp(
          `enable row level security[\\s\\S]*${table}|${table}[\\s\\S]*enable row level security`,
        ),
      );
    }
    expect(schema).toContain("focus_sessions_one_active_per_user");
    expect(schema).not.toMatch(/create table public\.focus_ticks/i);
  });

  it("does not ship service-role secrets in client Focus modules", () => {
    const files = [
      "src/features/focus/actions.ts",
      "src/features/focus/focus-statistics.tsx",
      "src/features/focus/focus-session-context.tsx",
      "src/lib/supabase/client.ts",
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toMatch(/SERVICE_ROLE/i);
      expect(source).not.toMatch(/service_role/i);
    }
  });

  it("sanitizes telemetry and keeps Focus notes off product analytics paths", () => {
    const sanitize = read("src/lib/telemetry/sanitize.ts");
    const analytics = read("src/features/focus/focus-analytics.ts");
    const phaseCues = read("src/features/focus/phase-cues.ts");
    expect(sanitize.length).toBeGreaterThan(20);
    expect(analytics).toMatch(/Never logs titles\/notes|never.*notes/i);
    expect(phaseCues).toMatch(/Avoid private content|Never put task titles/i);
  });

  it("timer engine is timestamp-based without per-second writes", () => {
    const engine = read("src/features/focus/use-focus-session.ts");
    expect(engine).toContain("setInterval");
    expect(engine).toMatch(/UI ticker only|never writes to Supabase/i);
  });

  it("ships required Focus documentation and release report", () => {
    expect(existsSync(join(root, "docs/focus-implementation-plan.md"))).toBe(
      true,
    );
    expect(existsSync(join(root, "docs/backup-and-restore.md"))).toBe(true);
    expect(
      existsSync(join(root, "docs/focus-release-readiness-2026-08-07.md")),
    ).toBe(true);
    expect(existsSync(join(root, "e2e/focus-session.spec.ts"))).toBe(true);
  });

  it("prompt series is complete through 22", () => {
    const prompts = read("prompts.md");
    expect(prompts).toContain("## Prompt 00");
    expect(prompts).toContain("## Prompt 21");
    expect(prompts).toContain("## Prompt 22");
    const hecho = prompts.match(/> \*\*HECHO\*\*/g) ?? [];
    expect(hecho.length).toBeGreaterThanOrEqual(23);
  });
});
