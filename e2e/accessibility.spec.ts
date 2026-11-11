import { expect, test } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { hasLocalCredentials, withLocalWorkspace } from "./local-workspace";
import { contrastRatio } from "../src/lib/colors";
test("public landing has no critical accessibility violations", async ({
  page,
}) => {
  await page.goto("/es");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    results.violations.filter((item) => item.impact === "critical"),
  ).toEqual([]);
});

test("interactive demo has no serious accessibility violations", async ({
  page,
}) => {
  for (const path of ["today", "focus", "statistics", "more"]) {
    await page.goto(`/es/demo/${path}`);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      results.violations.filter(
        (item) => item.impact === "critical" || item.impact === "serious",
      ),
      `Accessibility violations in demo/${path}`,
    ).toEqual([]);
  }
});

const productRoutes = [
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
];

test("public product screens remain accessible in both languages and themes", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const locale of ["es", "en"]) {
      for (const route of [
        "",
        "/login",
        "/privacy",
        "/terms",
        ...productRoutes.map((route) => `/demo/${route}`),
      ]) {
        const path = `/${locale}${route}`;
        await page.goto(path);
        await expect(page.locator("main")).toBeVisible();
        await page.waitForFunction(
          ({ locale, dark }) =>
            document.documentElement.lang === locale &&
            document.documentElement.classList.contains("dark") === dark,
          { locale, dark: theme === "dark" },
        );
        const audit = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect
          .soft(
            audit.violations.map((violation) => ({
              id: violation.id,
              impact: violation.impact,
              nodes: violation.nodes.map((node) => ({
                target: node.target,
                message: node.failureSummary,
              })),
            })),
            `${theme} ${path}`,
          )
          .toEqual([]);
        for (const [width, scale] of [
          [320, 1.25],
          [390, 2],
          [1440, 1],
        ]) {
          await page.setViewportSize({ width, height: 844 });
          const fits = await page.evaluate((scale) => {
            document.documentElement.style.setProperty(
              "--font-scale",
              String(scale),
            );
            return (
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth + 1
            );
          }, scale);
          expect
            .soft(fits, `${path} ${theme} ${width}px text ${scale * 100}%`)
            .toBe(true);
        }
        await page.setViewportSize({ width: 390, height: 844 });
      }
    }
  }
});

test("private product screens expose named controls and valid calendar semantics", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(240_000);
  test.skip(!hasLocalCredentials, "Disposable local account required");
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const schedule = await db.from("schedules").select("id").single();
    expect(schedule.error).toBeNull();
    expect(
      (
        await db.from("tasks").insert({
          user_id: userId,
          schedule_id: schedule.data!.id,
          title: "Review the day",
          task_kind: "habit",
          recurrence_type: "daily",
          recurrence_config: { type: "daily" },
          start_date: "2020-01-01",
        })
      ).error,
    ).toBeNull();
    for (const theme of ["light", "dark"] as const) {
      expect(
        (await db.from("profiles").update({ theme }).eq("id", userId)).error,
      ).toBeNull();
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (theme) => localStorage.setItem("planora-theme", theme),
        theme,
      );
      for (const route of productRoutes) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`/en/${route}`);
        await expect(page.locator("main h1").first()).toBeVisible();
        await page.waitForFunction(
          (dark) =>
            document.documentElement.classList.contains("dark") === dark,
          theme === "dark",
        );
        const audit = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect
          .soft(
            audit.violations.map((violation) => ({
              id: violation.id,
              impact: violation.impact,
              nodes: violation.nodes.map((node) => ({
                target: node.target,
                message: node.failureSummary,
              })),
            })),
            `${theme} private ${route}`,
          )
          .toEqual([]);
        if (theme === "light" && route === "today") {
          const completion = page.locator(".task-check").first();
          await completion.click();
          await expect(completion).toHaveAttribute("aria-pressed", "true");
        }
      }
    }
    await page.goto("/es/settings");
    await expect(page.getByLabel("Tema", { exact: true })).toBeVisible();
    for (const label of ["Sistema", "Claro", "Oscuro"])
      await expect(
        page
          .getByLabel("Tema", { exact: true })
          .getByRole("option", { name: label }),
      ).toHaveCount(1);
    await expect(page.getByLabel("Idioma", { exact: true })).toBeVisible();
    await expect(
      page.getByLabel("Zona horaria", { exact: true }),
    ).toBeVisible();
    await page.goto("/en/login");
    await expect(page).toHaveURL(/\/en\/today/);
  });
});

test("custom accents keep navigation, buttons and category badges readable", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(180_000);
  test.skip(!hasLocalCredentials, "Disposable local account required");
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const schedule = await db.from("schedules").select("id").single();
    expect(schedule.error).toBeNull();
    const category = await db
      .from("categories")
      .insert({
        user_id: userId,
        schedule_id: schedule.data!.id,
        name: "Yellow category",
        colour: "#ffff00",
      })
      .select("id")
      .single();
    expect(category.error).toBeNull();
    expect(
      (
        await db.from("tasks").insert({
          user_id: userId,
          schedule_id: schedule.data!.id,
          category_id: category.data!.id,
          title: "Read a chapter",
          task_kind: "habit",
          recurrence_type: "daily",
          recurrence_config: { type: "daily" },
          start_date: "2020-01-01",
        })
      ).error,
    ).toBeNull();
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (theme) => localStorage.setItem("planora-theme", theme),
        theme,
      );
      for (const accent of [
        "#4f6b45",
        "#ff0000",
        "#ffff00",
        "#000000",
        "#ffffff",
        "#777777",
      ]) {
        expect(
          (
            await db
              .from("profiles")
              .update({ theme, preferences: { accent, showCompleted: true } })
              .eq("id", userId)
          ).error,
        ).toBeNull();
        await page.goto("/en/today");
        await expect(page.locator("main h1").first()).toBeVisible();
        await page.waitForFunction(
          ({ accent, dark }) =>
            document.documentElement.style.getPropertyValue("--primary") ===
              accent &&
            document.documentElement.classList.contains("dark") === dark,
          { accent, dark: theme === "dark" },
        );
        const audit = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect
          .soft(
            audit.violations.map((violation) => ({
              id: violation.id,
              impact: violation.impact,
              nodes: violation.nodes.map((node) => ({
                target: node.target,
                message: node.failureSummary,
              })),
            })),
            `${theme} ${accent}`,
          )
          .toEqual([]);
        const boundary = await page
          .locator(".task-check")
          .first()
          .evaluate((element) => {
            const rgb = getComputedStyle(element)
              .borderColor.match(/\d+/g)!
              .map(Number);
            const surface = getComputedStyle(document.documentElement)
              .getPropertyValue("--surface")
              .trim();
            return {
              border:
                "#" +
                rgb
                  .slice(0, 3)
                  .map((value) => value.toString(16).padStart(2, "0"))
                  .join(""),
              background:
                surface.length === 4
                  ? "#" +
                    [...surface.slice(1)].map((part) => part + part).join("")
                  : surface,
            };
          });
        expect(
          contrastRatio(boundary.border, boundary.background),
          `${theme} ${accent} checkbox outline`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

test("OAuth cancellation explains recovery in the selected language", async ({
  page,
}) => {
  for (const locale of ["es", "en"]) {
    await page.goto(`/${locale}/login?error=oauth`);
    await expect(page.locator("main").getByRole("alert")).toContainText(
      locale === "es" ? "Vuelve a intentarlo" : "Try again",
    );
    await expect(page.getByRole("button", { name: /Google/ })).toBeEnabled();
    await expect(page.getByRole("link", { name: /demo/i })).toBeVisible();
  }
});

test("resource order can be saved with clicks and the position menu restores focus", async ({
  page,
  context,
  baseURL,
  browserName,
  browserDiagnostics,
}) => {
  test.setTimeout(90_000);
  test.skip(!hasLocalCredentials, "Disposable local account required");
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const created = await db
      .from("schedules")
      .insert({ user_id: userId, name: "Second schedule", sort_order: 1 })
      .select("id")
      .single();
    expect(created.error).toBeNull();
    await page.goto("/en/schedules");
    const trigger = page.getByLabel("Change position of Second schedule");
    await trigger.click();
    const menu = trigger.locator("..");
    const scheduleSave = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/en/schedules" &&
        Boolean(response.request().headers()["next-action"]),
    );
    await menu.getByRole("button", { name: "Move up" }).click();
    const scheduleSaved = await scheduleSave;
    expect(scheduleSaved.ok()).toBe(true);
    await expect(trigger).toHaveAttribute("aria-disabled", "false");
    await expect
      .poll(async () => {
        const rows = await db
          .from("schedules")
          .select("id")
          .order("sort_order")
          .order("created_at");
        return rows.data?.[0]?.id;
      })
      .toBe(created.data!.id);
    await trigger.click();
    await trigger.press("Escape");
    await expect(menu).not.toHaveAttribute("open", "");
    await expect(trigger).toBeFocused();

    const profile = await db
      .from("profiles")
      .select("active_schedule_id")
      .single();
    expect(profile.error).toBeNull();
    expect(
      (
        await db.from("tasks").insert([
          {
            user_id: userId,
            schedule_id: profile.data!.active_schedule_id!,
            scope: "schedule",
            title: "Schedule task",
            task_kind: "habit",
            recurrence_type: "daily",
            recurrence_config: { type: "daily" },
            start_date: "2020-01-01",
            sort_order: 0,
          },
          {
            user_id: userId,
            schedule_id: null,
            scope: "global",
            title: "Global task",
            task_kind: "habit",
            recurrence_type: "daily",
            recurrence_config: { type: "daily" },
            start_date: "2020-01-01",
            sort_order: 1,
          },
        ])
      ).error,
    ).toBeNull();
    await page.goto("/en/today");
    const globalPosition = page.getByLabel("Change position of Global task");
    await globalPosition.click();
    const taskSave = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/en/today" &&
        Boolean(response.request().headers()["next-action"]),
    );
    await globalPosition
      .locator("..")
      .getByRole("button", { name: "Move up" })
      .click();
    const taskSaved = await taskSave;
    expect(taskSaved.ok()).toBe(true);
    await expect(globalPosition).toHaveAttribute("aria-disabled", "false");
    await expect
      .poll(async () => {
        const tasks = await db
          .from("tasks")
          .select("title,sort_order")
          .order("sort_order");
        return tasks.data?.map((task) => task.title);
      })
      .toEqual(["Global task", "Schedule task"]);
    // WebKit can report cancellation of a completed action's remaining Flight
    // stream during a hard reload. Allow one such console entry only while
    // this navigation runs; earlier/later errors and unhandled errors still fail.
    const endExpectedCancellation =
      browserName === "webkit"
        ? browserDiagnostics.allowNextConsoleError(/^TypeError: Load failed$/)
        : () => {};
    try {
      await page.reload();
    } finally {
      endExpectedCancellation();
    }
    await expect(
      page.getByLabel(/^Change position of .* task$/).first(),
    ).toHaveAccessibleName("Change position of Global task", {
      timeout: 15_000,
    });
  });
});
