import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";
import { hasLocalCredentials, withLocalWorkspace } from "./local-workspace";

test.use({ timezoneId: "America/New_York" });

test("creates and edits linked reminders and alarms with exact times", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(90_000);
  test.skip(!hasLocalCredentials, "Local integration credentials required");
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const event = await db
      .from("events")
      .insert({
        user_id: userId,
        title: "QA all-day event",
        event_date: "2037-02-10",
        all_day: true,
      })
      .select("id")
      .single();
    expect(event.error).toBeNull();
    const eventId = event.data!.id;
    const legacy = await db
      .from("reminders")
      .insert({
        user_id: userId,
        event_id: eventId,
        kind: "relative",
        minutes_before: 120,
        recurrence: "weekly",
        timezone: "Europe/Madrid",
        next_trigger_at: "2037-02-10T06:00:00Z",
        enabled: false,
      })
      .select("id")
      .single();
    expect(legacy.error).toBeNull();

    await page.goto("/en/reminders");
    const configured = page.getByRole("region", { name: "Configured" });
    const editReminder = configured.getByRole("button", {
      name: "Edit",
      exact: true,
    });
    await editReminder.click();
    const editor = page.getByRole("dialog", { name: "Edit reminder" });
    const item = editor.getByRole("combobox", { name: "Search for an event…" });
    await expect(item).toHaveValue("QA all-day event");
    await expect(editor.getByLabel("When to notify")).toHaveValue("120");
    await expect(editor.getByLabel("Repeat")).toHaveValue("weekly");
    await editor.getByLabel("When to notify").selectOption("exact");
    expect(
      await editor.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
    const accessibility = await new AxeBuilder({ page })
      .include(".reminder-editor-dialog")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await editor.getByLabel("Time", { exact: true }).fill("17:45");
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(editReminder).toBeFocused();
    const stored = await db
      .from("reminders")
      .select(
        "id,event_id,next_trigger_at,time_of_day,minutes_before,recurrence,enabled",
      )
      .eq("event_id", eventId)
      .single();
    expect(stored.error).toBeNull();
    expect(stored.data).toMatchObject({
      id: legacy.data!.id,
      event_id: eventId,
      time_of_day: "17:45:00",
      minutes_before: null,
      recurrence: "weekly",
      enabled: false,
    });
    expect(new Date(stored.data!.next_trigger_at).toISOString()).toBe(
      "2037-02-10T16:45:00.000Z",
    );

    await page.reload();
    await editReminder.click();
    await expect(editor.getByLabel("When to notify")).toHaveValue("exact");
    await expect(editor.getByLabel("Time", { exact: true })).toHaveValue(
      "17:45",
    );
    await editor.getByLabel("Time", { exact: true }).fill("18:45");
    await editor.getByRole("button", { name: "Close", exact: true }).click();
    await expect(editor).toBeHidden();
    await editReminder.click();
    await expect(editor.getByLabel("Time", { exact: true })).toHaveValue(
      "17:45",
    );
    await editor.getByRole("button", { name: "Close", exact: true }).click();

    const linkedForm = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Task or event", exact: true }),
    });
    await expect(linkedForm.getByLabel("When to notify")).toHaveValue("exact");
    await linkedForm.getByLabel("Time", { exact: true }).fill("19:30");
    await linkedForm.getByRole("button", { name: "Add reminder" }).click();
    await expect
      .poll(async () =>
        (
          await db
            .from("reminders")
            .select("time_of_day")
            .eq("event_id", eventId)
        ).data?.map((row) => row.time_of_day),
      )
      .toEqual(expect.arrayContaining(["17:45:00", "19:30:00"]));

    const createAlarm = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Create an alarm", exact: true }),
    });
    await createAlarm.getByLabel("Name", { exact: true }).fill("QA alarm");
    await createAlarm.getByLabel("Date", { exact: true }).fill("2037-02-11");
    await createAlarm.getByLabel("Time", { exact: true }).fill("12:15");
    await createAlarm
      .getByRole("button", { name: "Create alarm", exact: true })
      .click();
    const alarmRow = configured.getByRole("article").filter({
      hasText: "QA alarm",
    });
    await alarmRow.getByRole("button", { name: "Edit", exact: true }).click();
    const alarmEditor = page.getByRole("dialog", { name: "Edit alarm" });
    await expect(alarmEditor.getByLabel("Date", { exact: true })).toHaveValue(
      "2037-02-11",
    );
    await expect(alarmEditor.getByLabel("Time", { exact: true })).toHaveValue(
      "12:15",
    );
    await alarmEditor.getByLabel("Time", { exact: true }).fill("21:10");
    await alarmEditor.getByLabel("Repeat").selectOption("daily");
    await alarmEditor
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(alarmEditor).toBeHidden();
    const alarm = await db
      .from("reminders")
      .select("next_trigger_at,recurrence")
      .eq("kind", "alarm")
      .single();
    expect(alarm.error).toBeNull();
    expect(alarm.data!.recurrence).toBe("daily");
    expect(new Date(alarm.data!.next_trigger_at).toISOString()).toBe(
      "2037-02-11T20:10:00.000Z",
    );
    await expect(
      alarmRow.getByRole("switch", { name: "Enable QA alarm" }),
    ).toHaveAttribute("aria-checked", "true");
    await alarmRow.getByRole("button", { name: "Snooze 10 min" }).click();
    await expect(alarmRow).toContainText("Snoozed");
    const snoozed = await db
      .from("reminders")
      .select("next_trigger_at,snoozed_until")
      .eq("kind", "alarm")
      .single();
    expect(snoozed.error).toBeNull();
    expect(snoozed.data!.next_trigger_at).toBe(alarm.data!.next_trigger_at);
    expect(new Date(snoozed.data!.snoozed_until!).toISOString()).toBe(
      "2037-02-11T20:20:00.000Z",
    );

    const pastEvent = await db
      .from("events")
      .insert({
        user_id: userId,
        title: "QA past event",
        event_date: "2020-01-01",
        all_day: true,
      })
      .select("id")
      .single();
    expect(pastEvent.error).toBeNull();
    expect(
      (
        await db.from("reminders").insert({
          user_id: userId,
          event_id: pastEvent.data!.id,
          kind: "relative",
          recurrence: "weekly",
          minutes_before: 30,
          timezone: "Europe/Madrid",
          next_trigger_at: "2037-02-04T07:30:00Z",
          enabled: false,
        })
      ).error,
    ).toBeNull();
    await page.goto("/es/reminders");
    const pastReminder = page
      .getByRole("region", { name: "Configurados" })
      .getByRole("article")
      .filter({ hasText: "QA past event" });
    await pastReminder
      .getByRole("button", { name: "Editar", exact: true })
      .click();
    const spanishEditor = page.getByRole("dialog", {
      name: "Editar recordatorio",
    });
    await expect(
      spanishEditor.getByRole("combobox", { name: "Buscar un evento…" }),
    ).toHaveValue("QA past event");
    await spanishEditor
      .getByLabel("Cuándo avisar")
      .selectOption({ label: "A una hora exacta" });
    await expect(
      spanishEditor.getByLabel("Hora", { exact: true }),
    ).toBeVisible();
  });
});

test("expires missed alerts safely and keeps existing schedules when the device zone changes", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(90_000);
  test.skip(!hasLocalCredentials, "Local integration credentials required");
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const oldTime = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
    const expired = await db.from("reminders").insert([
      {
        user_id: userId,
        kind: "alarm",
        title: "QA expired once",
        recurrence: "once",
        timezone: "Europe/Madrid",
        next_trigger_at: oldTime,
        enabled: true,
      },
      {
        user_id: userId,
        kind: "alarm",
        title: "QA paused recurring",
        recurrence: "daily",
        timezone: "Europe/Madrid",
        next_trigger_at: oldTime,
        enabled: false,
      },
    ]);
    expect(expired.error).toBeNull();

    await page.goto("/en/reminders");
    const configured = page.getByRole("region", { name: "Configured" });
    const expiredToggle = configured.getByRole("switch", {
      name: "Enable QA expired once",
    });
    await expect(expiredToggle).toHaveAttribute("aria-checked", "false", {
      timeout: 20_000,
    });
    const settled = await db
      .from("reminders")
      .select("enabled,last_delivered_at,delivery_status")
      .eq("title", "QA expired once")
      .single();
    expect(settled.error).toBeNull();
    expect(settled.data).toMatchObject({
      enabled: false,
      last_delivered_at: null,
      delivery_status: "pending",
    });
    await expiredToggle.click();
    await expect(
      page.getByText(
        "This alert has expired. Edit its date or time to reactivate it.",
      ),
    ).toBeVisible();
    await expect(expiredToggle).toHaveAttribute("aria-checked", "false");

    const recurringToggle = configured.getByRole("switch", {
      name: "Enable QA paused recurring",
    });
    await recurringToggle.click();
    await expect(recurringToggle).toHaveAttribute("aria-checked", "true");
    const recurring = await db
      .from("reminders")
      .select("timezone,next_trigger_at,enabled")
      .eq("title", "QA paused recurring")
      .single();
    expect(recurring.error).toBeNull();
    expect(Date.parse(recurring.data!.next_trigger_at)).toBeGreaterThan(
      Date.now(),
    );

    const setZone = page.getByRole("button", {
      name: "Use device zone for new alerts",
    });
    await setZone.click();
    await expect(setZone).toBeHidden();
    const profile = await db
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .single();
    expect(profile.data?.timezone).toBe("America/New_York");
    const unchanged = await db
      .from("reminders")
      .select("timezone,next_trigger_at,enabled")
      .eq("title", "QA paused recurring")
      .single();
    expect(unchanged.data).toEqual(recurring.data);

    await configured
      .getByRole("button", { name: "Disable all configured alerts" })
      .click();
    await expect(recurringToggle).toHaveAttribute("aria-checked", "false");
  });
});
