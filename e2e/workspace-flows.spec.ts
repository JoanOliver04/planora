import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { localDate } from "../src/lib/dates/timezone";
import { hasLocalCredentials, withLocalWorkspace } from "./local-workspace";
import { expect, test } from "./fixtures";

async function openAdd(page: Page, route: string) {
  await page.goto(`/en/${route}`);
  await page
    .locator("main")
    .getByRole("button", { name: "Add", exact: true })
    .click();
  return page.getByRole("dialog");
}

test("workspace CRUD, schedule copies, history, search and portable export", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(180_000);
  test.skip(!hasLocalCredentials, "Local integration credentials required");
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    let dialog = await openAdd(page, "schedules");
    await dialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("QA routine");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    const schedule = await db
      .from("schedules")
      .select("id")
      .eq("name", "QA routine")
      .single();
    expect(schedule.error).toBeNull();
    const scheduleId = schedule.data!.id;
    await page
      .getByRole("button", { name: "Active QA routine", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db
              .from("profiles")
              .select("active_schedule_id")
              .eq("id", userId)
              .single()
          ).data?.active_schedule_id,
      )
      .toBe(scheduleId);

    dialog = await openAdd(page, "categories");
    await dialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("QA category");
    await dialog.locator('select[name="scheduleId"]').selectOption(scheduleId);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    const category = await db
      .from("categories")
      .select("id")
      .eq("name", "QA category")
      .single();
    expect(category.error).toBeNull();

    await page.setViewportSize({ width: 390, height: 844 });
    dialog = await openAdd(page, "tasks");
    await dialog
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("QA scoped task");
    await dialog.locator('select[name="scheduleId"]').selectOption(scheduleId);
    await dialog.locator('select[name="recurrence"]').selectOption("daily");
    await dialog
      .locator('select[name="categoryId"]')
      .selectOption(category.data!.id);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    const task = await db
      .from("tasks")
      .select("id")
      .eq("title", "QA scoped task")
      .single();
    expect(task.error).toBeNull();
    const taskId = task.data!.id;

    await page.goto("/en/today");
    await page
      .getByRole("button", {
        name: "Mark as complete: QA scoped task",
        exact: true,
      })
      .click();
    const completionCount = async () =>
      (
        await db
          .from("task_completions")
          .select("id", { count: "exact", head: true })
          .eq("task_id", taskId)
      ).count;
    await expect.poll(completionCount).toBe(1);
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: "Completed: QA scoped task",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.goto("/en/history");
    await expect(
      page.locator("main").getByText("QA scoped task", { exact: true }),
    ).toHaveCount(1);
    await page.goto("/en/today");
    await page
      .getByRole("button", { name: "Completed: QA scoped task", exact: true })
      .click();
    await expect.poll(completionCount).toBe(0);

    dialog = await openAdd(page, "tasks");
    await dialog
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("QA global task");
    await dialog.locator('input[name="scope"][value="global"]').check();
    await dialog.locator('select[name="recurrence"]').selectOption("daily");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page
      .getByRole("button", { name: "Edit QA scoped task", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("QA scoped task updated");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    const edited = await db
      .from("tasks")
      .select("title,scope,schedule_id,category_id")
      .eq("id", taskId)
      .single();
    expect(edited.data).toMatchObject({
      title: "QA scoped task updated",
      scope: "schedule",
      schedule_id: scheduleId,
      category_id: category.data!.id,
    });

    await page.goto("/en/schedules");
    await page
      .getByRole("button", { name: "Duplicate QA routine", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db
              .from("schedules")
              .select("id", { count: "exact", head: true })
          ).count,
      )
      .toBe(3);
    const schedules = await db.from("schedules").select("id,name");
    const copy = schedules.data!.find(
      (item) => item.id !== scheduleId && item.name.includes("QA routine"),
    )!;
    expect(copy).toBeDefined();
    const copiedTasks = await db
      .from("tasks")
      .select("title,category_id")
      .eq("schedule_id", copy.id);
    expect(copiedTasks.data).toHaveLength(1);
    expect(copiedTasks.data![0].category_id).not.toBe(category.data!.id);
    await page
      .getByRole("button", { name: `Active ${copy.name}`, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db
              .from("profiles")
              .select("active_schedule_id")
              .eq("id", userId)
              .single()
          ).data?.active_schedule_id,
      )
      .toBe(copy.id);
    await page.goto("/en/today");
    await expect(
      page.getByText("QA scoped task updated", { exact: true }),
    ).toHaveCount(1);
    await expect(page.getByText("QA global task", { exact: true })).toHaveCount(
      1,
    );

    await page.goto("/en/schedules");
    await page
      .getByRole("button", { name: "Archive QA routine", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Archive", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db
              .from("schedules")
              .select("is_archived")
              .eq("id", scheduleId)
              .single()
          ).data?.is_archived,
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Restore QA routine", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db
              .from("schedules")
              .select("is_archived")
              .eq("id", scheduleId)
              .single()
          ).data?.is_archived,
      )
      .toBe(false);
    await page
      .getByRole("button", { name: "Delete QA routine", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db
              .from("schedules")
              .select("id", { count: "exact", head: true })
              .eq("id", scheduleId)
          ).count,
      )
      .toBe(0);
    expect(
      (await db.from("tasks").select("id", { count: "exact", head: true }))
        .count,
    ).toBe(2);

    dialog = await openAdd(page, "events");
    await dialog
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("QA event");
    await dialog
      .locator('input[name="eventDate"]')
      .fill(localDate("Europe/Madrid"));
    await dialog.getByRole("checkbox").uncheck();
    await dialog.locator('input[name="startTime"]').fill("09:00");
    await dialog.locator('input[name="endTime"]').fill("10:00");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(
      (await db.from("events").select("title,all_day").single()).data,
    ).toMatchObject({ title: "QA event", all_day: false });
    await page.goto("/en/search");
    await page
      .locator("main")
      .getByRole("textbox")
      .first()
      .fill("QA scoped task updated");
    await expect(
      page.locator("main").getByText("QA scoped task updated", { exact: true }),
    ).toHaveCount(1);

    await page.goto("/en/data");
    const downloading = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download JSON", exact: true })
      .click();
    const download = await downloading;
    const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
    expect(backup).toMatchObject({
      format: "planora-backup",
      schemaVersion: 5,
    });
    expect(backup.data.schedules).toHaveLength(2);
    expect(backup.data.tasks).toHaveLength(2);
    expect(backup.data.events).toHaveLength(1);
    expect(JSON.stringify(backup)).not.toContain(userId);
  });
});

test("offline completions synchronize once and sign-out closes the private UI", async ({
  page,
  context,
  baseURL,
  browserName,
}) => {
  test.setTimeout(90_000);
  test.skip(
    !hasLocalCredentials || browserName !== "chromium",
    "Run on Chromium with a disposable local backend",
  );
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const inserted = await db
      .from("tasks")
      .insert({
        user_id: userId,
        scope: "global",
        title: "QA offline task",
        task_kind: "habit",
        recurrence_type: "daily",
        recurrence_config: { type: "daily" },
        start_date: localDate("Europe/Madrid"),
      })
      .select("id")
      .single();
    expect(inserted.error).toBeNull();
    const count = async () =>
      (
        await db
          .from("task_completions")
          .select("id", { count: "exact", head: true })
          .eq("task_id", inserted.data!.id)
      ).count;
    await page.goto("/en/today");
    await expect(
      page.getByRole("button", {
        name: "Mark as complete: QA offline task",
        exact: true,
      }),
    ).toBeVisible();
    await context.setOffline(true);
    await page
      .getByRole("button", {
        name: "Mark as complete: QA offline task",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Completed: QA offline task",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(await count()).toBe(0);
    await context.setOffline(false);
    await expect.poll(count, { timeout: 20_000 }).toBe(1);
    await page.reload();
    await page
      .getByRole("button", { name: "Completed: QA offline task", exact: true })
      .click();
    await expect.poll(count).toBe(0);
    await page.goto("/en/settings");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    await expect(page).toHaveURL(/\/en\/login/);
    await page.goto("/en/today");
    await expect(page).toHaveURL(/\/en\/login/);
    expect(
      (await context.cookies(baseURL)).filter((cookie) =>
        cookie.name.startsWith("sb-"),
      ),
    ).toHaveLength(0);
  });
});

test("Focus UI pauses, resumes after reload and finishes a persisted session", async ({
  page,
  context,
  baseURL,
  browserName,
}) => {
  test.setTimeout(90_000);
  test.skip(
    !hasLocalCredentials || browserName !== "chromium",
    "Run on Chromium with a disposable local backend",
  );
  await withLocalWorkspace(context, baseURL, async (db) => {
    await page.goto("/en/focus");
    await page
      .getByRole("button", { name: "Start session", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: "Stopwatch", exact: true }).check();
    await dialog
      .getByRole("textbox", { name: "Intention", exact: true })
      .fill("QA focus flow");
    await dialog.getByRole("button", { name: "Start", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(
        async () =>
          (await db.from("focus_sessions").select("status").single()).data
            ?.status,
      )
      .toBe("running");
    const started = (
      await db.from("focus_sessions").select("id,started_at").single()
    ).data!;
    await expect
      .poll(() => Date.now() - Date.parse(started.started_at))
      .toBeGreaterThan(1500);
    await page
      .getByRole("button", { name: "Pause", exact: true })
      .first()
      .click();
    await expect
      .poll(
        async () =>
          (
            await db
              .from("focus_sessions")
              .select("status")
              .eq("id", started.id)
              .single()
          ).data?.status,
      )
      .toBe("paused");
    await page.reload();
    await page
      .getByRole("button", { name: "Resume", exact: true })
      .first()
      .click();
    await expect
      .poll(
        async () =>
          (
            await db
              .from("focus_sessions")
              .select("status")
              .eq("id", started.id)
              .single()
          ).data?.status,
      )
      .toBe("running");
    await page
      .getByRole("button", { name: "Finish", exact: true })
      .first()
      .click();
    await expect
      .poll(
        async () =>
          (
            await db
              .from("focus_sessions")
              .select("status")
              .eq("id", started.id)
              .single()
          ).data?.status,
      )
      .toBe("completed");
    const sessions = await db.from("focus_sessions").select("focus_sec");
    expect(sessions.data).toHaveLength(1);
    expect(sessions.data![0].focus_sec).toBeGreaterThan(0);
    expect(
      (
        await db
          .from("focus_intervals")
          .select("id", { count: "exact", head: true })
          .is("ended_at", null)
      ).count,
    ).toBe(0);
  });
});
