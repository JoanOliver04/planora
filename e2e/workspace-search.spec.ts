import { expect, test } from "./fixtures";
import { hasLocalCredentials, withLocalWorkspace } from "./local-workspace";

test("finds every match and returns to the same result page across schedules", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(90_000);
  test.skip(!hasLocalCredentials, "Local integration credentials required");
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const profile = await db
      .from("profiles")
      .select("active_schedule_id")
      .eq("id", userId)
      .single();
    expect(profile.error).toBeNull();
    const other = await db
      .from("schedules")
      .insert({ user_id: userId, name: "Weekend study" })
      .select("id")
      .single();
    expect(other.error).toBeNull();
    const target = "Revisión de apuntes";
    const tasks = Array.from({ length: 53 }, (_, i) => ({
      user_id: userId,
      scope: "schedule",
      schedule_id: other.data!.id,
      title: i === 52 ? target : `Revisión ${i}`,
      sort_order: i,
      task_kind: "one_time",
      recurrence_type: "once",
      recurrence_config: {},
      time_mode: "anytime",
      start_date: "2031-03-15",
      archived_at: i === 52 ? "2031-03-15T12:00:00Z" : null,
    }));
    expect((await db.from("tasks").insert(tasks)).error).toBeNull();
    expect(
      (
        await db.from("events").insert({
          user_id: userId,
          title: "Revisión",
          event_date: "2031-03-15",
          all_day: true,
        })
      ).error,
    ).toBeNull();
    const events = Array.from({ length: 1001 }, (_, i) => ({
      user_id: userId,
      title: i === 1000 ? "Música para estudiar" : `Concert ${i}`,
      event_date: i === 1000 ? "2010-03-15" : "2009-03-15",
      all_day: true,
    }));
    expect((await db.from("events").insert(events)).error).toBeNull();
    await page.goto("/en/search");
    const query = page.getByRole("textbox", { name: "Search", exact: true });
    await query.fill("revision");
    const links = page.locator(".search-results a");
    await expect(links).toHaveCount(50);
    await expect(links.first()).toContainText("Event");
    await expect(links.first()).toContainText("Revisión");
    await page.getByRole("button", { name: "Next results" }).click();
    await expect(links).toHaveCount(4);
    const renamed = target + " actualizada";
    expect(
      (
        await db
          .from("tasks")
          .update({ title: renamed })
          .eq("user_id", userId)
          .eq("title", target)
      ).error,
    ).toBeNull();
    await page.getByRole("link", { name: new RegExp(target) }).click();
    await expect(page).toHaveURL(/\/tasks\?item=([\da-f-]+)#task-\1$/);
    const selected = page.locator("article.task").filter({ hasText: renamed });
    await expect(selected).toBeFocused();
    await expect(selected).toContainText("Weekend study");
    await expect(
      page.getByRole("combobox", { name: "Task status" }),
    ).toHaveValue("all");
    expect(
      (
        await db
          .from("profiles")
          .select("active_schedule_id")
          .eq("id", userId)
          .single()
      ).data,
    ).toEqual(profile.data);
    await page.goBack();
    await expect(query).toHaveValue("revision");
    await expect(links).toHaveCount(4);
    await query.fill("zzzz");
    await expect(
      page.getByRole("heading", { name: "No results" }),
    ).toBeVisible();
    await query.fill("estudiar    musica");
    await expect(links).toHaveCount(1);
    await expect(links.first()).toContainText("Música para estudiar");
    await expect(
      page.getByRole("button", { name: "Next results" }),
    ).toHaveCount(0);
    await links.first().click();
    await expect(
      page.locator("article.task").filter({ hasText: "Música para estudiar" }),
    ).toBeFocused();
  });
});
