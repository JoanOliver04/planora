import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scheduler = readFileSync(
  join(process.cwd(), "src/components/reminder-scheduler.tsx"),
  "utf8",
);
const serviceWorker = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

describe("daily summary notification", () => {
  it("opens a real summary instead of reminder settings", () => {
    expect(scheduler).toContain('reminder.kind === "daily_summary"');
    expect(scheduler).toContain('"/summary"');
    expect(scheduler).toContain('"Ver resumen"');
    expect(
      existsSync(
        join(process.cwd(), "src/app/[locale]/(app)/summary/page.tsx"),
      ),
    ).toBe(true);
  });

  it("allows the safe summary route from system notifications", () => {
    expect(serviceWorker).toContain("reminders|focus|summary");
  });
});
