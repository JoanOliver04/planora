import AxeBuilder from "@axe-core/playwright";
import { localDate } from "../src/lib/dates/timezone";
import { shiftCalendarDay } from "../src/lib/dates/calendar-day";
import { expect, test } from "./fixtures";
import { hasLocalCredentials, withLocalWorkspace } from "./local-workspace";

test("Month counts events beyond the first database page", async ({
  page,
  context,
  baseURL,
}, info) => {
  test.skip(
    !hasLocalCredentials || info.project.name !== "chromium",
    "Database paging is shared by all browsers",
  );
  test.setTimeout(80_000);
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const today = localDate("Europe/Madrid");
    const insert = await db.from("events").insert(
      Array.from({ length: 1001 }, (_, index) => ({
        user_id: userId,
        event_date: today,
        title: `Calendar entry ${index + 1}`,
      })),
    );
    expect(insert.error).toBeNull();
    await page.goto("/en/month");
    const day = page.locator(`a.month-day[href$="date=${today}"]`);
    await expect(day.locator(".month-mobile-count")).toHaveText("1001", {
      timeout: 25_000,
    });
    await expect(day.locator(".month-items small")).toHaveText("+996");
  });
});

test("plans a dated task from Month and keeps the selected week, times and focus", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(100_000);
  test.skip(!hasLocalCredentials, "Local integration credentials required");
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const day = shiftCalendarDay(localDate("Europe/Madrid"), 48);
    const month = day.slice(0, 7);
    const result = await db.from("events").insert(
      ["18:30", "11:00", "15:00", "12:30", "09:30", "14:00"].map((time) => ({
        user_id: userId,
        title: `Appointment ${time}`,
        event_date: day,
        all_day: false,
        start_time: time,
      })),
    );
    expect(result.error).toBeNull();

    await page.goto(`/en/month?month=${month}`);
    const cell = page.locator(`a.month-day[href$="date=${day}"]`);
    await expect(cell).toHaveAccessibleName(/6 events/, { timeout: 25_000 });
    await expect(cell.locator(".month-items small")).toHaveText("+1");
    await expect(cell.locator(".month-mobile-count")).toHaveText("6");
    await cell.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/en/week\\?date=${day}$`));
    const column = page.locator(".day[data-selected=true]:visible");
    await expect(column.getByRole("link", { name: /Appointment/ })).toHaveCount(
      6,
    );
    const add = column.getByRole("button", { name: /Add a task for/ });
    await add.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator('[name="startDate"]')).toHaveValue(day);
    await expect(dialog.locator('[name="title"]')).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(add).toBeFocused();
    await page.keyboard.press("Enter");
    await dialog
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("Prepare notes");
    await dialog.locator('[name="timing"]').selectOption("specific_time");
    await dialog.locator('[name="startTime"]').fill("09:00");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    const links = column.locator(".agenda-detail");
    await expect(links).toHaveCount(7);
    await expect(links.nth(0)).toHaveAccessibleName("09:00 Prepare notes");
    await expect(links.nth(1)).toHaveAccessibleName("09:30 Appointment 09:30");
    await expect(links.nth(6)).toHaveAccessibleName("18:30 Appointment 18:30");
    const accessibility = await new AxeBuilder({ page })
      .include("main")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath("agenda.png") });
    await page.getByRole("button", { name: "Next week" }).click();
    await expect(page.locator(".week-picker input")).toHaveValue(
      shiftCalendarDay(day, 7),
    );
    await page.reload();
    await page.getByRole("button", { name: "Previous week" }).click();
    await expect(links.nth(0)).toHaveAccessibleName("09:00 Prepare notes");
    await links.nth(0).click();
    await expect(page).toHaveURL(/\/tasks\?item=([\da-f-]+)#task-\1$/);
    await expect(
      page.locator(".task").filter({ hasText: "Prepare notes" }),
    ).toBeFocused();
    await page.goBack();
    await expect(page.locator(".week-picker input")).toHaveValue(day);
    await page.goBack();
    await expect(cell).toHaveAccessibleName(/1 task and 6 events/);
    await page.goto("/en/week?date=2026-02-31");
    await expect(page.locator(".week-picker input")).toHaveValue(
      localDate("Europe/Madrid"),
    );
  });
});

test("Today and Daily summary agree after the last weekly habit completion", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(80_000);
  test.skip(!hasLocalCredentials, "Local integration credentials required");
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const today = localDate("Europe/Madrid");
    const yesterday = shiftCalendarDay(today, -1);
    const weekStart = new Date(`${today}T12:00:00Z`).getUTCDay() === 1 ? 0 : 1;
    const updated = await db
      .from("profiles")
      .update({ week_starts_on: weekStart })
      .eq("id", userId);
    expect(updated.error).toBeNull();
    const task = await db
      .from("tasks")
      .insert({
        user_id: userId,
        scope: "global",
        schedule_id: null,
        title: "Weekly stretch",
        task_kind: "habit",
        recurrence_type: "times_per_week",
        recurrence_config: { type: "times_per_week", target: 1 },
        start_date: yesterday,
      })
      .select("id")
      .single();
    expect(task.error).toBeNull();
    const done = await db.from("task_completions").insert({
      user_id: userId,
      task_id: task.data!.id,
      occurrence_date: yesterday,
      task_snapshot: {},
    });
    expect(done.error).toBeNull();
    await page.goto("/en/today");
    await expect(page.locator(".today-header")).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText("Weekly stretch", { exact: true })).toHaveCount(
      0,
    );
    await page.goto("/en/summary");
    await expect(
      page.getByRole("heading", { name: "Pending (0)" }),
    ).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText("Weekly stretch", { exact: true })).toHaveCount(
      0,
    );
  });
});
