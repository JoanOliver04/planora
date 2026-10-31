import type { Page } from "@playwright/test";
import { hasLocalCredentials, withLocalWorkspace } from "./local-workspace";
import { expect, test } from "./fixtures";

const viewports = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 600, height: 960 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

async function expectLayoutFits(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const escapedControls = Array.from(
      document.querySelectorAll<HTMLElement>(
        "main a, main button, main input, main select, main textarea",
      ),
    ).flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return [];
      if (rect.left >= -1 && rect.right <= root.clientWidth + 1) return [];
      // Calendars and other explicitly scrollable regions may scroll locally.
      for (
        let parent = element.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        if (["auto", "scroll"].includes(getComputedStyle(parent).overflowX))
          return [];
      }
      return [element.outerHTML.slice(0, 180)];
    });
    return {
      overflow: root.scrollWidth - root.clientWidth,
      escapedControls,
      overflowSources:
        root.scrollWidth > root.clientWidth + 1
          ? Array.from(document.querySelectorAll("main *"))
              .filter((element) => {
                const rect = element.getBoundingClientRect();
                return rect.width > 0 && rect.right > root.clientWidth + 1;
              })
              .slice(0, 6)
              .map((element) => `${element.tagName}.${element.className}`)
          : [],
    };
  });
  expect
    .soft(
      result.overflow,
      `${label}: document width (${result.overflowSources.join(", ")})`,
    )
    .toBeLessThanOrEqual(1);
  expect.soft(result.escapedControls, `${label}: controls`).toEqual([]);
}

test("demo calendars hydrate across dates, locales and viewport sizes", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // The cached server HTML predates the device's calendar. Rendering must still
  // hydrate without a locale/date mismatch, then adopt the device's date.
  await page.clock.setFixedTime(new Date("2031-03-01T12:00:00Z"));
  for (const locale of ["es", "en"]) {
    for (const route of ["week", "month", "statistics"]) {
      await page.goto(`/${locale}/demo/${route}`);
      await expect(page.locator("main h1")).toBeVisible();
      for (const size of viewports) {
        await page.setViewportSize(size);
        await expectLayoutFits(
          page,
          `${locale}/demo/${route} at ${size.width}`,
        );
      }
    }
  }
});

test("private areas and task dialogs reflow with long content and enlarged text", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(180_000);
  test.skip(
    !hasLocalCredentials,
    "Disposable local integration account required",
  );
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const speculativeDays: string[] = [];
    const speculativeFocus: string[] = [];
    let watchingMonth = false;
    let watchingToday = false;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        watchingMonth &&
        url.pathname === "/en/week" &&
        url.searchParams.has("date") &&
        url.searchParams.has("_rsc")
      )
        speculativeDays.push(url.pathname);
      if (
        watchingToday &&
        url.pathname === "/en/focus" &&
        url.searchParams.has("_rsc")
      )
        speculativeFocus.push(url.pathname);
    });
    const schedule = await db.from("schedules").select("id").single();
    expect(schedule.error).toBeNull();
    const renamed = await db
      .from("schedules")
      .update({ name: "LongUnbrokenScheduleName".repeat(4).slice(0, 80) })
      .eq("id", schedule.data!.id);
    expect(renamed.error).toBeNull();
    const category = await db
      .from("categories")
      .insert({
        user_id: userId,
        schedule_id: schedule.data!.id,
        name: "LongUnbrokenCategoryName".repeat(3).slice(0, 60),
        colour: "#52734d",
      })
      .select("id")
      .single();
    expect(category.error).toBeNull();
    const inserted = await db.from("tasks").insert({
      user_id: userId,
      schedule_id: schedule.data!.id,
      category_id: category.data!.id,
      title: "LongUnbrokenTaskTitle".repeat(7).slice(0, 140),
      task_kind: "habit",
      recurrence_type: "daily",
      recurrence_config: { type: "daily" },
      start_date: "2026-01-01",
    });
    expect(inserted.error).toBeNull();

    for (const route of [
      "today",
      "week",
      "month",
      "tasks",
      "events",
      "history",
      "search",
      "statistics",
      "focus",
      "reminders",
      "schedules",
      "categories",
      "templates",
      "settings",
      "data",
      "more",
    ]) {
      watchingMonth = route === "month";
      watchingToday = route === "today";
      await page.goto(`/en/${route}`);
      await expect(page.locator("main h1").first()).toBeVisible();
      for (const size of viewports) {
        await page.setViewportSize(size);
        await expectLayoutFits(
          page,
          `${route} at ${size.width}x${size.height}`,
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await expectLayoutFits(page, `${route} with 200% root text`);
      if (
        test.info().project.name === "mobile" &&
        ["today", "week", "month", "settings", "focus"].includes(route)
      ) {
        await page.screenshot({
          path: `test-results/responsive/${route}-text-200.png`,
          animations: "disabled",
        });
      }
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
      if (route === "today") {
        expect(
          speculativeFocus,
          "Focus shortcuts should wait for a click",
        ).toEqual([]);
        watchingToday = false;
        await page
          .getByRole("link", { name: "Quick start", exact: true })
          .click();
        await expect(page).toHaveURL(/\/en\/focus\?start=quick/);
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toBeHidden();
      }
      if (route === "month") {
        expect(
          speculativeDays,
          "Calendar should not request each destination before a click",
        ).toEqual([]);
        watchingMonth = false;
        const day = page.locator(".month-day").first();
        const destination = await day.getAttribute("href");
        await day.click();
        await expect(page).toHaveURL(
          new RegExp(destination!.replace("?", "\\?")),
        );
        await expect(page.locator(".week-picker input")).toHaveValue(
          new URL(destination!, baseURL).searchParams.get("date")!,
        );
      }
    }

    await page.goto("/en/tasks");
    for (const size of [viewports[0], viewports[5]]) {
      await page.setViewportSize(size);
      await page.getByRole("button", { name: "Add", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const fits = await dialog.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.left >= 0 &&
          box.right <= innerWidth &&
          box.top >= 0 &&
          box.bottom <= innerHeight + 1 &&
          element.scrollWidth <= element.clientWidth + 1
        );
      });
      expect(fits, `Task dialog at ${size.width}x${size.height}`).toBe(true);
      if (test.info().project.name === "mobile")
        await page.screenshot({
          path: `test-results/responsive/task-dialog-${size.width}.png`,
          animations: "disabled",
        });
      await dialog
        .getByRole("textbox", { name: "Title", exact: true })
        .fill("Responsive task draft");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Add", exact: true }),
      ).toBeFocused();
    }
  });
});
