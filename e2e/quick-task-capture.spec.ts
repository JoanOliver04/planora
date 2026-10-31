import { localDate, nextLocalDate } from "../src/lib/dates/timezone";
import { formatNaturalDate } from "../src/features/workspace/presentation";
import { hasLocalCredentials, withLocalWorkspace } from "./local-workspace";
import { expect, test } from "./fixtures";

// The device and account use different calendar zones. Date-only previews and
// headings must not shift a day when the device is east of UTC+12.
test.use({ timezoneId: "Pacific/Kiritimati" });
test("quick capture previews, preserves, and saves bilingual task plans", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(120_000);
  test.skip(
    !hasLocalCredentials,
    "Disposable local integration account required",
  );
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await page.goto("/en/today");
    await expect(page.locator(".today-date")).toHaveText(
      formatNaturalDate(localDate("Europe/Madrid"), "en", "Europe/Madrid"),
    );
    const capture = page.getByRole("region", {
      name: "Quick capture",
      exact: true,
    });
    const input = capture.getByRole("textbox", {
      name: "Quick capture",
      exact: true,
    });
    await input.fill("Read tomorrow at 6 pm");
    await expect(capture.getByRole("status")).toContainText("18:00");
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(capture.locator("form")).toHaveAttribute("aria-busy", "false");
    await expect(
      capture.getByRole("button", { name: "Create task", exact: true }),
    ).toBeDisabled();
    const saved = await db
      .from("tasks")
      .select("title,start_date,start_time,recurrence_type,schedule_id")
      .eq("title", "Read")
      .single();
    expect(saved.error).toBeNull();
    expect(saved.data).toMatchObject({
      title: "Read",
      start_date: nextLocalDate("Europe/Madrid"),
      start_time: "18:00:00",
      recurrence_type: "once",
    });

    await page.waitForLoadState("networkidle");

    await page.goto("/es/tasks");
    const spanish = page.getByRole("region", {
      name: "Captura rápida",
      exact: true,
    });
    const entry = spanish.getByRole("textbox", {
      name: "Captura rápida",
      exact: true,
    });
    await entry.fill("Piano lunes y miércoles a las 18:00");
    await spanish
      .getByRole("button", { name: "Más opciones", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("textbox", { name: "Título", exact: true }),
    ).toHaveValue("Piano");
    await expect(dialog.locator('input[name="startTime"]')).toHaveValue(
      "18:00",
    );
    await expect(dialog.locator('input[name="weekdays"]:checked')).toHaveCount(
      2,
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(entry).toHaveValue("Piano lunes y miércoles a las 18:00");
    await spanish
      .getByRole("button", { name: "Crear tarea", exact: true })
      .click();
    await expect(entry).toHaveValue("");
    const piano = await db
      .from("tasks")
      .select("recurrence_config,recurrence_type,start_time")
      .eq("title", "Piano")
      .single();
    expect(piano.error).toBeNull();
    expect(piano.data).toMatchObject({
      recurrence_type: "weekdays",
      recurrence_config: { type: "weekdays", weekdays: [1, 3] },
      start_time: "18:00:00",
    });

    await entry.fill("Informe 2026-02-30");
    await expect(spanish.getByRole("alert")).toContainText("Revisa la fecha");
    await expect(
      spanish.getByRole("button", { name: "Crear tarea", exact: true }),
    ).toBeDisabled();
    await spanish
      .getByRole("checkbox", {
        name: "Detectar fechas y repetición",
        exact: true,
      })
      .uncheck();
    await spanish
      .getByRole("button", { name: "Crear tarea", exact: true })
      .click();
    await expect(entry).toHaveValue("");
    expect(
      (await db.from("tasks").select("id").eq("title", "Informe 2026-02-30"))
        .data,
    ).toHaveLength(1);
    expect(
      (await db.from("tasks").select("id").eq("user_id", userId)).data,
    ).toHaveLength(3);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await entry.fill(
      `${"LongUnbrokenTaskName".repeat(8).slice(0, 140)} mañana a las 18:00`,
    );
    await spanish
      .getByRole("checkbox", {
        name: "Detectar fechas y repetición",
        exact: true,
      })
      .check();
    await spanish.screenshot({
      path: `test-results/responsive/quick-capture-${test.info().project.name}.png`,
    });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await spanish.screenshot({
      path: `test-results/responsive/quick-capture-text-200-${test.info().project.name}.png`,
    });
  });
});
