import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  desktopNavigationItems,
  mobileNavigationItems,
  moreNavigationItems,
} from "@/config/navigation";

describe("responsive navigation architecture", () => {
  it("puts the required secondary sections in More, including Focus", () => {
    expect(new Set(moreNavigationItems.map((item) => item.id))).toEqual(
      new Set([
        "history",
        "month",
        "search",
        "focus",
        "statistics",
        "reminders",
        "schedules",
        "categories",
        "templates",
        "settings",
        "data",
      ]),
    );
    expect(
      moreNavigationItems.filter((item) => item.group === "activity"),
    ).toHaveLength(6);
    expect(
      moreNavigationItems.filter((item) => item.group === "organization"),
    ).toHaveLength(3);
    expect(
      moreNavigationItems.filter((item) => item.group === "account"),
    ).toHaveLength(2);
    expect(mobileNavigationItems).toHaveLength(5);
    expect(mobileNavigationItems.map((item) => item.id)).not.toContain("focus");
  });

  it("resolves every configured destination to a real App Router page", () => {
    const routes = new Set(
      [...desktopNavigationItems, ...mobileNavigationItems].map(
        (item) => item.href,
      ),
    );
    for (const route of routes)
      expect(
        existsSync(
          join(
            process.cwd(),
            "src/app/[locale]/(app)",
            route.slice(1),
            "page.tsx",
          ),
        ),
        `Missing page for ${route}`,
      ).toBe(true);
  });

  it("keeps one locale-independent route for Spanish and English links", () => {
    const more = mobileNavigationItems.find((item) => item.id === "more")!;
    expect(`/es${more.href}`).toBe("/es/more");
    expect(`/en${more.href}`).toBe("/en/more");
  });

  it("keeps Settings dedicated to configuration", () => {
    const settings = readFileSync(
      join(process.cwd(), "src/features/workspace/resource-views.tsx"),
      "utf8",
    );
    expect(settings).not.toContain("settings-shortcuts");
    expect(settings).not.toMatch(/href={`\/$\{item\}`}/);
  });

  it("keeps safe-area padding and a continuous mobile-to-desktop breakpoint", () => {
    const css = readFileSync(
      join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toMatch(
      /@media \(min-width: 860px\)[\s\S]*?\.mobile-nav \{[\s\S]*?display: none/,
    );
    expect(css).toMatch(/\.main \{[\s\S]*?padding:[^;]*safe-area-inset-bottom/);
  });
});
