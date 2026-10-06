import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  advanceTrigger,
  customTrigger,
  nextDailyTrigger,
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
    };
    return messages[key] ?? key;
  },
}));

const enable = vi.fn().mockResolvedValue(undefined);
const save = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/actions/domain", () => ({
  deleteReminder: vi.fn(),
  saveReminder: (...args: unknown[]) => save(...args),
  setReminderEnabled: vi.fn(),
  setRemindersEnabled: (...args: unknown[]) => enable(...args),
  snoozeReminder: vi.fn(),
  updateReminderTimezone: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("reminder scheduling", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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
    expect(enable).toHaveBeenCalledWith(true);
    expect(screen.getByText("Permiso pendiente")).toBeInTheDocument();
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
    expect(screen.getByRole("status").textContent ?? "").not.toMatch(
      /Regar|tarea|nota/i,
    );
    expect(
      screen.getByText("No se pudo mostrar la notificación del sistema."),
    ).toBeInTheDocument();
  });
});
