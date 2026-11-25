import { expect, test } from "./fixtures";
import { hasLocalCredentials, withLocalWorkspace } from "./local-workspace";

test("finds every match and returns to the same result page across schedules", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const openedWorkspace = expect.configure({ timeout: 25_000 });
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
    const taskFilter = page.getByRole("radio", { name: "Tasks", exact: true });
    await taskFilter.check();
    await page.getByRole("button", { name: "Next results" }).click();
    await expect(links).toHaveCount(3);
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
    await openedWorkspace(page).toHaveURL(/\/tasks\?item=([\da-f-]+)#task-\1$/);
    const selected = page.locator("article.task").filter({ hasText: renamed });
    await openedWorkspace(selected).toBeFocused();
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
    await openedWorkspace(query).toHaveValue("revision");
    await expect(taskFilter).toBeChecked();
    await expect(links).toHaveCount(3);
    await page.getByRole("radio", { name: "All", exact: true }).check();
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
    await openedWorkspace(
      page.locator("article.task").filter({ hasText: "Música para estudiar" }),
    ).toBeFocused();
  });
});

test("browses by type and finds an event by its category, schedule and Spanish date", async ({
  page,
  context,
  baseURL,
}) => {
  test.skip(!hasLocalCredentials, "Local integration credentials required");
  test.setTimeout(100_000);
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const schedule = await db
      .from("schedules")
      .insert({ user_id: userId, name: "Trimestre final" })
      .select("id")
      .single();
    expect(schedule.error).toBeNull();
    const category = await db
      .from("categories")
      .insert({
        user_id: userId,
        name: "Música",
        colour: "#2255AA",
        schedule_id: schedule.data!.id,
      })
      .select("id")
      .single();
    expect(category.error).toBeNull();
    expect(
      (
        await db.from("events").insert({
          user_id: userId,
          title: "Ensayo",
          event_date: "2032-02-29",
          all_day: true,
          schedule_id: schedule.data!.id,
          category_id: category.data!.id,
        })
      ).error,
    ).toBeNull();
    await page.goto("/es/tasks");
    const field = page.getByRole("textbox").first();
    await expect(field).toBeVisible({ timeout: 25_000 });
    expect(
      await field.evaluate((input) =>
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "k",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        ),
      ),
    ).toBe(true);
    await page.locator("main").focus();
    await page.keyboard.press("Control+k");
    const query = page.getByRole("textbox", { name: "Buscar", exact: true });
    await expect(query).toBeFocused({ timeout: 25_000 });
    const events = page.getByRole("radio", { name: "Eventos", exact: true });
    await events.check();
    const links = page.locator(".search-results a");
    await expect(links).toHaveCount(1);
    await expect(links.first()).toContainText("Ensayo");
    await query.fill("musica trimestre 29/2/2032");
    await expect(links.first()).toContainText("29 de febrero de 2032");
    await query.fill("ensayo febrero final");
    await expect(links).toHaveCount(1);
    await events.focus();
    await page.keyboard.press("Meta+k");
    await expect(query).toBeFocused();
    expect(
      await query.evaluate((input: HTMLInputElement) =>
        input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0),
      ),
    ).toBe("ensayo febrero final");
    await query.fill("ensayo 9/2/2032");
    await expect(
      page.getByRole("heading", { name: "No hay resultados" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Borrar búsqueda" }).click();
    await expect(query).toBeFocused();
    await expect(query).toHaveValue("");
    await expect(events).toBeChecked();
    await expect(links).toHaveCount(1);
    await expect(page).toHaveURL(/\/es\/search$/);
  });
});
