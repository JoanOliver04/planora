import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

function source(path: string) {
  return readFileSync(join(projectRoot, path), "utf8");
}

describe("Vercel Web Analytics", () => {
  it("mounts the official component once in the shared root layout", () => {
    const layout = source("src/app/layout.tsx");

    expect(layout).toContain('from "@vercel/analytics/next"');
    expect(layout.match(/<Analytics\b/g)).toHaveLength(1);
    expect(layout).toContain("process.env.VERCEL_ENV");
    expect(layout).toContain("debug={false}");
  });

  it("removes the former custom page-view collector", () => {
    const providers = source("src/components/providers.tsx");
    const telemetryRoute = source("src/app/api/telemetry/route.ts");

    expect(providers).not.toContain("PrivacyAnalytics");
    expect(telemetryRoute).toContain('type: z.literal("error")');
    expect(telemetryRoute).not.toContain('"pageview"');
  });

  it("documents the privacy behavior in both languages", () => {
    const privacy = source("src/app/[locale]/privacy/page.tsx");

    expect(privacy).toContain("Vercel Web Analytics");
    expect(privacy).toContain("sin cookies de seguimiento");
    expect(privacy).toContain("without tracking cookies");
    expect(privacy).toContain("tareas, eventos, notas ni sesiones de Enfoque");
    expect(privacy).toContain("tasks, events, notes or Focus sessions");
    expect(privacy).toContain("Enfoque (sesiones y notas)");
    expect(privacy).toContain("Focus (sessions and notes)");
  });
  it("does not add custom Vercel events", () => {
    const layout = source("src/app/layout.tsx");
    expect(layout).not.toMatch(/\btrack\s*\(/);
    expect(layout).not.toContain("@vercel/analytics/react");
  });
});
