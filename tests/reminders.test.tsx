import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  advanceTrigger,
  customTrigger,
  exactTrigger,
  nextDailyTrigger,
  nextLinkedTrigger,
  relativeTrigger,
} from "@/features/reminders/schedule";
import { ReminderCenter } from "@/features/reminders/reminder-center";
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const messages: Record<string, string> = {
      close: "Cerrar",
      searchTask: "Buscar una tarea…",
      searchEvent: "Buscar un evento…",
      noTasksFound: "No se han encontrado tareas.",
      noEventsFound: "No se han encontrado eventos.",
      clearSelection: "Limpiar selección",
      customDuration: "Personalizada",
      days: "Días",
      hours: "Horas",
      minutes: "Minutos",
      customDurationSummary: `Te avisaremos ${values?.duration ?? ""} antes.`,
      customDurationInvalid: "Duración no válida",
      save: "Guardar",
      createAlarm: "Crear alarma",
      reminderTime: "Time",
      reminderRepeat: "Repeat",
    };
    return messages[key] ?? key;
  },
}));

const enable = vi.fn().mockResolvedValue(undefined);
const save = vi.fn().mockResolvedValue(undefined);
const refresh = vi.fn();
const remove = vi.fn().mockResolvedValue(undefined);
const alarm: Parameters<typeof ReminderCenter>[0]["reminders"][number] = {
  id: "10000000-0000-4000-8000-000000000001",
  user_id: "10000000-0000-4000-8000-000000000002",
  task_id: null,
  event_id: null,
  kind: "alarm",
  title: "Test alarm",
  minutes_before: null,
  recurrence: "once",
  time_of_day: null,
  timezone: "Europe/Madrid",
  next_trigger_at: "2031-01-01T12:00:00Z",
  snoozed_until: null,
  enabled: true,
  delivery_status: "pending",
  last_delivered_at: null,
  created_at: "2026-01-01T12:00:00Z",
  updated_at: "2026-01-01T12:00:00Z",
};
const allDayEvent = {
  id: "10000000-0000-4000-8000-000000000003",
  title: "All-day event",
  emoji: "📅",
  event_date: "2031-01-01",
  start_time: null,
};
vi.mock("@/app/actions/domain", () => ({
  deleteReminder: (...args: unknown[]) => remove(...args),
  saveReminder: (...args: unknown[]) => save(...args),
  setReminderEnabled: vi.fn(),
  disableAllReminders: (...args: unknown[]) => enable(...args),
  snoozeReminder: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("reminder scheduling", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens an editor for a legacy all-day reminder and saves an exact time", async () => {
    const reminder = {
      ...alarm,
      kind: "relative" as const,
      title: null,
      event_id: allDayEvent.id,
      minutes_before: 120,
    };
    render(
      <ReminderCenter
        locale="en"
        timezone="Europe/Madrid"
        reminders={[reminder]}
        tasks={[]}
        events={[allDayEvent]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(allDayEvent.title);
    const form = within(dialog);
    expect(form.getByLabelText("reminderTiming")).toHaveValue("120");
    fireEvent.change(form.getByLabelText("reminderTiming"), {
      target: { value: "exact" },
    });
    fireEvent.change(form.getByLabelText("Time"), {
      target: { value: "17:45" },
    });
    await act(async () => {
      fireEvent.click(form.getByRole("button", { name: "Guardar" }));
    });
    expect(save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: reminder.id,
        targetType: "event",
        targetId: allDayEvent.id,
        timeOfDay: "17:45",
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("opens an editor with the existing alarm date and time", () => {
    render(
      <ReminderCenter
        locale="en"
        timezone="Europe/Madrid"
        reminders={[alarm]}
        tasks={[]}
        events={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector('input[type="date"]')).toHaveValue(
      "2031-01-01",
    );
    expect(dialog.querySelector('input[type="time"]')).toHaveValue("13:00");
  });

  it("restores the custom offset and recurrence and retains the draft after a failed save", async () => {
    const reminder = {
      ...alarm,
      kind: "relative" as const,
      event_id: allDayEvent.id,
      minutes_before: 1567,
      recurrence: "weekly" as const,
      enabled: false,
    };
    save.mockRejectedValueOnce(new Error("Network unavailable"));
    render(
      <ReminderCenter
        locale="en"
        timezone="America/Los_Angeles"
        reminders={[reminder]}
        tasks={[]}
        events={[allDayEvent]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    const form = within(screen.getByRole("dialog"));
    expect(form.getByLabelText("reminderTiming")).toHaveValue("custom");
    expect(form.getByLabelText("Días")).toHaveValue(1);
    expect(form.getByLabelText("Horas")).toHaveValue(2);
    expect(form.getByLabelText("Minutos")).toHaveValue(7);
    expect(form.getByLabelText("Repeat")).toHaveValue("weekly");
    fireEvent.change(form.getByLabelText("Minutos"), {
      target: { value: "9" },
    });
    await act(async () => {
      fireEvent.click(form.getByRole("button", { name: "Guardar" }));
    });
    expect(form.getByRole("alert")).toHaveTextContent("reminderSaveError");
    expect(form.getByLabelText("Minutos")).toHaveValue(9);
    expect(save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: reminder.id,
        minutesBefore: 1569,
        recurrence: "weekly",
        enabled: false,
        timezone: "Europe/Madrid",
      }),
    );
  });

  it("rejects a nonexistent exact time during the spring clock change", () => {
    expect(exactTrigger("2027-03-28", "02:30", "Europe/Madrid")).toBeNull();
    expect(
      exactTrigger("2027-03-28", "03:30", "Europe/Madrid")?.toISOString(),
    ).toBe("2027-03-28T01:30:00.000Z");
  });

  it("finds the next weekly occurrence without walking through years of dates", () => {
    const now = new Date("2026-10-25T20:00:00Z");
    const initial = exactTrigger("2010-10-24", "20:30", "Europe/Madrid");
    expect(initial).not.toBeNull();
    expect(
      nextLinkedTrigger(
        initial!,
        "weekly",
        "Europe/Madrid",
        now,
      )?.toISOString(),
    ).toBe("2026-11-01T19:30:00.000Z");
  });

  it("calculates timezone-safe relative and recurring triggers", () => {
    expect(
      relativeTrigger("2026-08-03", "10:00", "Europe/Madrid", 15).toISOString(),
    ).toBe("2026-08-03T07:45:00.000Z");
    expect(
      customTrigger("2026-08-03", "20:30", "Europe/Madrid").toISOString(),
    ).toBe("2026-08-03T18:30:00.000Z");
    expect(
      nextDailyTrigger(
        "20:00",
        "Europe/Madrid",
        new Date("2026-08-01T21:00:00Z"),
      ).toISOString(),
    ).toBe("2026-08-02T18:00:00.000Z");
    expect(
      advanceTrigger(
        new Date("2026-08-01T10:00:00Z"),
        "weekly",
        "UTC",
      )?.toISOString(),
    ).toBe("2026-08-08T10:00:00.000Z");
    expect(
      advanceTrigger(
        new Date("2026-10-24T18:00:00Z"),
        "daily",
        "Europe/Madrid",
      )?.toISOString(),
    ).toBe("2026-10-25T19:00:00.000Z");
  });

  it.each([
    ["Europe/Madrid", "2026-10-30T23:30:00Z", "2026-11-01"],
    ["America/Los_Angeles", "2026-10-31T00:30:00Z", "2026-10-31"],
    ["Pacific/Kiritimati", "2026-10-30T19:00:00Z", "2026-11-01"],
    ["UTC", "2026-10-30T12:00:00Z", "2026-10-31"],
    ["Europe/Madrid", "2026-03-28T23:30:00Z", "2026-03-30"],
    ["Europe/Madrid", "2026-10-24T22:30:00Z", "2026-10-26"],
    ["Pacific/Kiritimati", "2026-12-31T19:00:00Z", "2027-01-02"],
  ])(
    "defaults alarms to tomorrow in %s",
    async (timezone, instant, expected) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(instant));
      vi.stubGlobal("Notification", { permission: "granted" });
      const { container } = render(
        <ReminderCenter
          locale="en"
          timezone={timezone}
          reminders={[]}
          tasks={[]}
          events={[]}
        />,
      );
      await act(async () => {});
      const dateInput = container.querySelector('input[type="date"]');
      expect(dateInput).not.toBeNull();
      expect(dateInput).toHaveValue(expected);
    },
  );

  it("disables server-rendered reminder forms and actions until their handlers are hydrated", async () => {
    const reminders = [alarm];
    const html = renderToStaticMarkup(
      <ReminderCenter
        locale="en"
        timezone="Europe/Madrid"
        reminders={reminders}
        tasks={[]}
        events={[]}
      />,
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(
      document.querySelector(".reminder-forms")?.hasAttribute("disabled"),
    ).toBe(true);
    expect(
      document
        .querySelector('[aria-label="Delete reminder"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
    render(
      <ReminderCenter
        locale="en"
        timezone="Europe/Madrid"
        reminders={reminders}
        tasks={[]}
        events={[]}
      />,
    );
    await act(async () => {});
    const deleteButton = screen.getByRole("button", {
      name: "Delete reminder",
    });
    expect(deleteButton).toBeEnabled();
    await act(async () => {
      fireEvent.click(deleteButton);
    });
    expect(remove).toHaveBeenCalledExactlyOnceWith(reminders[0].id);
  });

  it("creates a standalone personalized alarm", async () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: vi.fn(),
    });
    render(
      <ReminderCenter
        locale="es"
        timezone="Europe/Madrid"
        reminders={[]}
        tasks={[]}
        events={[]}
      />,
    );
    await act(async () => {});
    fireEvent.change(screen.getByPlaceholderText(/Partido del/), {
      target: { value: "Partido del BarÃ§a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear alarma" }));
    await act(async () => {});
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "alarm",
        title: "Partido del BarÃ§a",
        recurrence: "once",
      }),
    );
  });
  it("requests permission only after an explicit click", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission,
    });
    render(
      <ReminderCenter
        locale="es"
        timezone="Europe/Madrid"
        reminders={[]}
        tasks={[]}
        events={[]}
      />,
    );
    await act(async () => {});
    expect(requestPermission).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Permitir notificaciones" }),
    );
    await act(async () => {});
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(enable).not.toHaveBeenCalled();
    expect(screen.getByText("Permiso pendiente")).toBeInTheDocument();
  });

  it("creates an active alert even when all existing reminders are individually off", async () => {
    render(
      <ReminderCenter
        locale="es"
        timezone="Europe/Madrid"
        reminders={[{ ...alarm, enabled: false }]}
        tasks={[]}
        events={[]}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Partido del/), {
      target: { value: "New active alarm" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Crear alarma" }));
    });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New active alarm", enabled: true }),
    );
  });

  it("explains a blocked permission without asking again", async () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", {
      permission: "denied",
      requestPermission,
    });
    render(
      <ReminderCenter
        locale="es"
        timezone="Europe/Madrid"
        reminders={[]}
        tasks={[]}
        events={[]}
      />,
    );
    await act(async () => {});
    expect(screen.getByText("Permiso bloqueado")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Permitir notificaciones" }),
    ).not.toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("explains an unsupported browser and a failed system notification", async () => {
    Reflect.deleteProperty(window, "Notification");
    sessionStorage.setItem("planora-system-notification-status", "failed");
    render(
      <ReminderCenter
        locale="es"
        timezone="Europe/Madrid"
        reminders={[]}
        tasks={[]}
        events={[]}
      />,
    );
    await act(async () => {});
    expect(screen.getByText("No compatible")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("status")
        .map((item) => item.textContent ?? "")
        .join(" "),
    ).not.toMatch(/Regar|tarea|nota/i);
    expect(
      screen.getByText("No se pudo mostrar la notificación del sistema."),
    ).toBeInTheDocument();
  });
});
