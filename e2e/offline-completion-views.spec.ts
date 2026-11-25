import { expect, offlineNetworkError, test } from "./fixtures";
import { beginBrowserCleanup } from "./browser-diagnostics";
import { hasLocalCredentials, withLocalWorkspace } from "./local-workspace";
import { localDate } from "../src/lib/dates/timezone";

test("offline checks and undos reach the open summary and history with the original time", async ({
  page,
  context,
  baseURL,
  browserDiagnostics,
}) => {
  test.skip(
    !hasLocalCredentials,
    "Disposable local integration account required",
  );
  test.setTimeout(120_000);
  const ready = expect.configure({ timeout: 25_000 });
  browserDiagnostics.allowConsoleError(offlineNetworkError);
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const title = "Offline reading";
    const task = await db
      .from("tasks")
      .insert({
        user_id: userId,
        title,
        scope: "global",
        task_kind: "one_time",
        recurrence_type: "once",
        recurrence_config: { type: "once" },
        start_date: localDate("Europe/Madrid"),
      })
      .select("id")
      .single();
    expect(task.error).toBeNull();
    const saved = () =>
      db
        .from("task_completions")
        .select("completed_at")
        .eq("task_id", task.data!.id);
    const summary = await context.newPage();
    const history = await context.newPage();
    await summary.goto("/en/summary");
    await ready(
      summary.getByRole("heading", { name: "Pending (1)" }),
    ).toBeVisible();
    await history.goto("/en/history");
    const entry = history.locator(".history-item").filter({ hasText: title });
    await ready(
      history.getByRole("heading", {
        name: "No tasks completed in this period",
      }),
    ).toBeVisible();
    await page.goto("/en/today");
    const mark = page.getByRole("button", {
      name: "Mark as complete: " + title,
      exact: true,
    });
    const undo = page.getByRole("button", {
      name: "Completed: " + title,
      exact: true,
    });
    await ready(mark).toBeVisible();
    await context.setOffline(true);
    try {
      await mark.click();
      await ready(entry).toBeVisible();
      await ready(
        summary.getByRole("heading", { name: "Completed (1)" }),
      ).toBeVisible();
      await undo.click();
      await ready(entry).toHaveCount(0);
      await ready(
        summary.getByRole("heading", { name: "Pending (1)" }),
      ).toBeVisible();
      await mark.click();
      await ready(entry).toBeVisible();
      const timestamp = Date.parse(
        (await entry.locator("time").getAttribute("datetime"))!,
      );
      expect(Number.isFinite(timestamp)).toBe(true);
      expect((await saved()).data).toEqual([]);
      await context.setOffline(false);
      await ready
        .poll(async () =>
          (await saved()).data?.map((row) => Date.parse(row.completed_at)),
        )
        .toEqual([timestamp]);
      await ready(page.locator(".offline-status")).toHaveCount(0);
      await history.reload();
      await ready(entry).toBeVisible();
      expect(
        Date.parse((await entry.locator("time").getAttribute("datetime"))!),
      ).toBe(timestamp);
      await undo.click();
      await ready.poll(async () => (await saved()).data).toEqual([]);
      await ready(entry).toHaveCount(0);
      await ready(
        summary.getByRole("heading", { name: "Pending (1)" }),
      ).toBeVisible();
      // Pending work must survive closing every tab before reconnecting.
      await context.setOffline(true);
      await mark.click();
      await ready(entry).toBeVisible();
      const lastTap = Date.parse(
        (await entry.locator("time").getAttribute("datetime"))!,
      );
      expect((await saved()).data).toEqual([]);
      for (const tab of [history, summary, page]) {
        beginBrowserCleanup(tab);
        await tab.close();
      }
      await context.setOffline(false);
      const reopened = await context.newPage();
      await reopened.goto("/en/history");
      await ready(
        reopened.locator(".history-item").filter({ hasText: title }),
      ).toBeVisible();
      await ready
        .poll(async () =>
          (await saved()).data?.map((row) => Date.parse(row.completed_at)),
        )
        .toEqual([lastTap]);
    } finally {
      await context.setOffline(false);
    }
  });
});

test("recovers a committed check whose response was lost while the browser stayed online", async ({
  page,
  context,
  baseURL,
  browserDiagnostics,
}) => {
  test.skip(
    !hasLocalCredentials,
    "Disposable local integration account required",
  );
  test.setTimeout(100_000);
  const ready = expect.configure({ timeout: 25_000 });
  browserDiagnostics.allowConsoleError(offlineNetworkError);
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const title = "Reading with a weak connection";
    const task = await db
      .from("tasks")
      .insert({
        user_id: userId,
        scope: "global",
        title,
        task_kind: "one_time",
        recurrence_type: "once",
        recurrence_config: { type: "once" },
        start_date: localDate("Europe/Madrid"),
      })
      .select("id")
      .single();
    expect(task.error).toBeNull();
    await page.goto("/en/today");
    const mark = page.getByRole("button", {
      name: "Mark as complete: " + title,
      exact: true,
    });
    await ready(mark).toBeVisible();
    let release!: () => void;
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    await page.route("**/rest/v1/task_completions*", async (route) => {
      if (route.request().method() === "POST") {
        writes++;
        if (writes === 1) {
          const response = await route.fetch();
          expect(response.ok()).toBe(true);
          await route.abort("failed");
          return;
        }
      } else if (writes && route.request().method() === "GET") {
        await resume;
      }
      await route.continue();
    });
    try {
      await mark.click();
      await ready(page.locator(".offline-status")).toBeVisible();
      expect(await page.evaluate(() => navigator.onLine)).toBe(true);
      await ready(
        page.getByRole("button", { name: "Completed: " + title, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    } finally {
      release();
    }
    await ready(page.locator(".offline-status")).toHaveCount(0);
    expect(writes).toBe(1);
    await page.reload();
    await ready(
      page.getByRole("button", { name: "Completed: " + title, exact: true }),
    ).toBeVisible();
    const rows = await db
      .from("task_completions")
      .select("id")
      .eq("task_id", task.data!.id);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(1);
  });
});
