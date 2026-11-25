import { localDate } from "../src/lib/dates/timezone";
import { shiftCalendarDay } from "../src/lib/dates/calendar-day";
import { expect, test } from "./fixtures";
import { hasLocalCredentials, withLocalWorkspace } from "./local-workspace";

test.use({ timezoneId: "America/Los_Angeles" });

test("finds an older leap month, paginates days and shows when late completions were recorded", async ({
  page,
  context,
  baseURL,
}) => {
  test.skip(!hasLocalCredentials, "Local integration credentials required");
  test.setTimeout(90_000);
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const tasks = await db
      .from("tasks")
      .insert(
        ["Walk", "Read"].map((title) => ({
          title,
          user_id: userId,
          scope: "global",
          task_kind: "habit",
          recurrence_type: "daily",
          recurrence_config: {},
          start_date: "2020-01-01",
        })),
      )
      .select("id");
    expect(tasks.error).toBeNull();
    const completions = tasks.data!.flatMap((task) =>
      Array.from({ length: 26 }, (_, i) => {
        const day = shiftCalendarDay("2020-02-01", i);
        return {
          user_id: userId,
          task_id: task.id,
          occurrence_date: day,
          completed_at: day + "T09:30:00Z",
          task_snapshot: {},
        };
      }),
    );
    completions.push({
      user_id: userId,
      task_id: tasks.data![0].id,
      occurrence_date: "2020-02-29",
      completed_at: "2020-03-01T23:05:00Z",
      task_snapshot: {},
    });
    completions[0].completed_at = "2021-01-01T12:00:00Z";
    expect(
      (await db.from("task_completions").insert(completions)).error,
    ).toBeNull();
    if (test.info().project.name !== "chromium")
      await page.setViewportSize({ width: 320, height: 750 });
    await page.goto("/en/history");
    await expect(
      page.getByRole("heading", { name: "No tasks completed in this period" }),
    ).toBeVisible({ timeout: 25_000 });
    await page.getByLabel("History month").fill("2020-02");
    await page.getByRole("button", { name: "View month" }).click();
    await expect(page).toHaveURL(/month=2020-02$/);
    const items = page.locator(".history-item");
    await expect(items).toHaveCount(50, { timeout: 25_000 });
    await expect(page.locator(".history-date h2").first()).toContainText(
      "29 February",
    );
    await expect(items.first().locator("time")).toHaveAttribute(
      "datetime",
      "2020-03-01T23:05:00+00:00",
    );
    await expect(items.first().locator("time")).toContainText("00:05");
    await expect(items.first().locator("time")).toContainText("2 Mar 2020");
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Show more activity" }).click();
    await expect(items).toHaveCount(53);
    await expect(page.locator(".history-date h2").last()).toContainText(
      "1 February",
    );
    await page.getByRole("button", { name: "Last 90 days" }).click();
    await expect(items).toHaveCount(0);
    await page.goBack();
    await expect(items).toHaveCount(50);
  });
});

test("shows timed tasks after an older restore and shares custom day parts with statistics", async ({
  page,
  context,
  baseURL,
}) => {
  test.skip(!hasLocalCredentials, "Local integration credentials required");
  test.setTimeout(90_000);
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    expect(
      (
        await db
          .from("profiles")
          .update({ day_part_settings: {} })
          .eq("id", userId)
      ).error,
    ).toBeNull();
    const yesterday = shiftCalendarDay(localDate("Europe/Madrid"), -1);
    const task = await db
      .from("tasks")
      .insert({
        user_id: userId,
        title: "Night shift",
        scope: "global",
        task_kind: "habit",
        recurrence_type: "daily",
        recurrence_config: {},
        time_mode: "specific_time",
        start_time: "01:15",
        start_date: yesterday,
      })
      .select("id")
      .single();
    expect(task.error).toBeNull();
    await page.goto("/en/today");
    const group = (heading: string) =>
      page.locator("section.task-group").filter({
        has: page.getByRole("heading", { name: heading, exact: true }),
      });
    await expect(
      group("Night").getByText("Night shift", { exact: true }),
    ).toBeVisible({ timeout: 25_000 });
    expect(
      (
        await db
          .from("profiles")
          .update({
            day_part_settings: {
              morning: { start: "23:00", end: "02:15" },
              afternoon: { start: "02:15", end: "12:00" },
              night: { start: "12:00", end: "23:00" },
            },
          })
          .eq("id", userId)
      ).error,
    ).toBeNull();
    expect(
      (
        await db.from("task_completions").insert({
          user_id: userId,
          task_id: task.data!.id,
          occurrence_date: yesterday,
          completed_at: yesterday + "T23:15:00Z",
          task_snapshot: {},
        })
      ).error,
    ).toBeNull();
    await page.reload();
    await expect(
      group("Morning").getByText("Night shift", { exact: true }),
    ).toBeVisible({ timeout: 25_000 });
    await page.goto("/en/statistics");
    await expect(
      page.getByRole("progressbar", { name: "Morning 100%" }),
    ).toHaveAttribute("value", "100");
  });
});
