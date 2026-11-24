import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";
import { hasLocalCredentials, withLocalWorkspace } from "./local-workspace";

test.use({ timezoneId: "America/New_York" });

test("resumes a long-paused daily alarm at its original local time", async ({
  page,
  context,
  baseURL,
}) => {
  test.skip(!hasLocalCredentials, "Local integration credentials required");
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const result = await db
      .from("reminders")
      .insert({
        user_id: userId,
        title: "Long-paused alarm",
        kind: "alarm",
        timezone: "Europe/Madrid",
        recurrence: "daily",
        next_trigger_at: "2000-01-02T09:15:00Z",
        enabled: false,
      })
      .select("id")
      .single();
    expect(result.error).toBeNull();
    await page.goto("/en/reminders");
    const toggle = page.getByRole("switch", {
      name: "Enable Long-paused alarm",
      exact: true,
    });
    const resumedAt = Date.now();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    const { data, error } = await db
      .from("reminders")
      .select("next_trigger_at")
      .eq("id", result.data!.id)
      .single();
    expect(error).toBeNull();
    const next = new Date(data!.next_trigger_at);
    expect(next.getTime()).toBeGreaterThan(resumedAt);
    expect(next.getTime() - Date.now()).toBeLessThanOrEqual(
      25 * 60 * 60 * 1000,
    );
    expect(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Madrid",
        hour: "2-digit",
        minute: "2-digit",
      }).format(next),
    ).toBe("10:15");
  });
});

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

test("linked reminders follow a rescheduled event and a task's new start time", async ({
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
        title: "QA event to move",
        event_date: "2037-01-10",
        all_day: false,
        start_time: "10:00",
        end_time: "12:00",
      })
      .select("id")
      .single();
    expect(event.error).toBeNull();
    const eventId = event.data!.id;
    const reminders = await db.from("reminders").insert([
      {
        user_id: userId,
        event_id: eventId,
        kind: "relative",
        time_of_day: "17:45",
        next_trigger_at: "2037-01-10T16:45Z",
        snoozed_until: "2037-01-10T16:55Z",
        delivery_status: "snoozed",
        timezone: "Europe/Madrid",
        enabled: true,
      },
      {
        user_id: userId,
        event_id: eventId,
        kind: "relative",
        minutes_before: 120,
        next_trigger_at: "2037-01-10T07:00Z",
        last_delivered_at: "2026-01-01T07:00Z",
        delivery_status: "pending",
        timezone: "Europe/Madrid",
        enabled: false,
      },
      {
        user_id: userId,
        event_id: eventId,
        kind: "relative",
        minutes_before: 30,
        next_trigger_at: "2026-01-01T09:00Z",
        timezone: "Europe/Madrid",
        enabled: false,
        delivery_status: "delivered",
        last_delivered_at: "2026-01-01T09:00Z",
      },
    ]);
    expect(reminders.error).toBeNull();

    await page.goto("/en/events");
    await page.getByRole("button", { name: "Edit QA event to move" }).click();
    const editor = page.getByRole("dialog", {
      name: "Edit event",
      exact: true,
    });
    await editor.getByLabel("Start time", { exact: true }).fill("11:30");
    const allDay = editor.getByRole("checkbox", { name: "All day" });
    await allDay.check();
    await allDay.uncheck();
    await expect(editor.getByLabel("Start time", { exact: true })).toHaveValue(
      "11:30",
    );
    await editor.getByLabel("End time", { exact: true }).fill("11:00");
    await editor.getByLabel("Date", { exact: true }).fill("2037-01-11");
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor.getByRole("alert")).toHaveText(
      "The end time must be later than the start time.",
    );
    await expect(editor.getByLabel("Date", { exact: true })).toHaveValue(
      "2037-01-11",
    );
    await editor.getByLabel("End time", { exact: true }).fill("12:30");
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor).toBeHidden();

    const linked = await db
      .from("reminders")
      .select(
        "time_of_day,minutes_before,next_trigger_at,snoozed_until,delivery_status,enabled",
      )
      .eq("event_id", eventId);
    expect(linked.error).toBeNull();
    const exact = linked.data!.find((row) => row.time_of_day !== null)!;
    const paused = linked.data!.find((row) => row.minutes_before === 120)!;
    const delivered = linked.data!.find((row) => row.minutes_before === 30)!;
    expect(new Date(exact.next_trigger_at).toISOString()).toBe(
      "2037-01-11T16:45:00.000Z",
    );
    expect(exact).toMatchObject({
      enabled: true,
      snoozed_until: null,
      delivery_status: "pending",
    });
    expect(new Date(paused.next_trigger_at).toISOString()).toBe(
      "2037-01-11T08:30:00.000Z",
    );
    expect(paused.enabled).toBe(false);
    expect(new Date(delivered.next_trigger_at).toISOString()).toBe(
      "2026-01-01T09:00:00.000Z",
    );
    expect(delivered.delivery_status).toBe("delivered");

    const task = await db
      .from("tasks")
      .insert({
        user_id: userId,
        scope: "global",
        title: "QA task to move",
        start_date: "2037-01-10",
        start_time: "09:00",
        time_mode: "specific_time",
        task_kind: "one_time",
        recurrence_type: "once",
        recurrence_config: { type: "once" },
      })
      .select("id")
      .single();
    expect(task.error).toBeNull();
    const taskId = task.data!.id;
    const linkedTask = await db.rpc("save_linked_reminder", {
      p_id: null,
      p_task_id: taskId,
      p_event_id: null,
      p_minutes_before: 120,
      p_time_of_day: null,
      p_recurrence: "once",
      p_timezone: "Europe/Madrid",
      p_enabled: true,
    });
    expect(linkedTask.error).toBeNull();
    expect(
      (await db.from("tasks").update({ start_time: "11:00" }).eq("id", taskId))
        .error,
    ).toBeNull();
    const movedTask = await db
      .from("reminders")
      .select("next_trigger_at,enabled")
      .eq("id", linkedTask.data!)
      .single();
    expect(movedTask.error).toBeNull();
    expect(new Date(movedTask.data!.next_trigger_at).toISOString()).toBe(
      "2037-01-10T08:00:00.000Z",
    );
    expect(movedTask.data!.enabled).toBe(true);

    const [concurrentReminder, concurrentEvent] = await Promise.all([
      db.rpc("save_linked_reminder", {
        p_id: null,
        p_task_id: null,
        p_event_id: eventId,
        p_minutes_before: null,
        p_time_of_day: "21:00",
        p_recurrence: "once",
        p_timezone: "Europe/Madrid",
        p_enabled: true,
      }),
      db.from("events").update({ event_date: "2037-01-12" }).eq("id", eventId),
    ]);
    expect(concurrentReminder.error).toBeNull();
    expect(concurrentEvent.error).toBeNull();
    const concurrent = await db
      .from("reminders")
      .select("next_trigger_at")
      .eq("id", concurrentReminder.data!)
      .single();
    expect(concurrent.error).toBeNull();
    expect(new Date(concurrent.data!.next_trigger_at).toISOString()).toBe(
      "2037-01-12T20:00:00.000Z",
    );
  });
});
