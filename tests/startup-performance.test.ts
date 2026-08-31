import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(
  "src/features/workspace/use-workspace.ts",
  "utf8",
);
const session = readFileSync("src/components/private-session.tsx", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const proxy = readFileSync("src/lib/supabase/proxy.ts", "utf8");
const worker = readFileSync("public/sw.js", "utf8");
const scheduler = readFileSync("src/components/reminder-scheduler.tsx", "utf8");
const page = readFileSync("src/components/workspace-page.tsx", "utf8");

describe("mobile startup performance", () => {
  it("paints cached workspace without waiting for getUser", () => {
    expect(workspace).toContain("presentedRef");
    expect(workspace.indexOf("finish({")).toBeLessThan(
      workspace.indexOf("db.auth.getUser()"),
    );
    expect(workspace).toContain("session?.user ?? null");
    expect(page).toContain('(loading || phase === "loading") && !data');
  });

  it("does not block the private shell on the active Focus session", () => {
    expect(session).not.toContain("focus_sessions");
    expect(session).not.toContain("initialFocusSession");
  });

  it("skips Supabase session refresh on public pages", () => {
    expect(proxy).toContain("isPrivateAppPath(path)");
    expect(proxy).toContain('path.includes("/login")');
  });

  it("preconnects to Supabase and swaps fonts immediately", () => {
    expect(layout).toContain('rel="preconnect"');
    expect(layout).toContain('display: "swap"');
    expect(layout).toContain("preload: false");
  });

  it("serves hashed app assets cache-first after the first visit", () => {
    expect(worker).toContain("cacheFirstImmutable");
    expect(worker).toContain('url.pathname.startsWith("/_next/static/")');
  });

  it("defers reminder polling so it does not contend with first paint", () => {
    expect(scheduler).toContain("setTimeout(run, 2_500)");
    expect(scheduler).not.toContain("queueMicrotask(run)");
  });
});
