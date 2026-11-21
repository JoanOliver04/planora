"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlarmClock,
  Bell,
  BellOff,
  Clock3,
  MonitorSmartphone,
  Trash2,
  Volume2,
} from "lucide-react";
import {
  deleteReminder,
  disableAllReminders,
  setReminderEnabled,
  snoozeReminder,
  updateProfile,
} from "@/app/actions/domain";
import {
  defaultNotificationPreferences,
  loadNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "./preferences";
import { readSystemNotificationProblem } from "./system-notification";
import type { Database } from "@/types/database";
import { PushSettings } from "./push-settings";
import { effectiveReminderTrigger } from "./schedule";
import {
  AlarmForm,
  LinkedReminderForm,
  ReminderEditor,
  SummaryForm,
  targetKey,
  type ReminderTarget,
} from "./reminder-forms";

type Reminder = Database["public"]["Tables"]["reminders"]["Row"];
const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;
function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="notification-switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function ReminderCenter({
  locale,
  timezone,
  reminders,
  tasks,
  events,
  taskLoadError = false,
  linkedTargets = [],
}: {
  locale: "es" | "en";
  timezone: string;
  reminders: Reminder[];
  tasks: Array<{
    id: string;
    title: string;
    emoji: string | null;
    start_date: string;
    start_time: string | null;
    scope: "schedule" | "global";
  }>;
  taskLoadError?: boolean;
  linkedTargets?: ReminderTarget[];
  events: Array<{
    id: string;
    title: string;
    emoji: string | null;
    event_date: string;
    start_time: string | null;
  }>;
}) {
  const es = locale === "es";
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientHydrated,
    serverHydrated,
  );
  const t = useTranslations("Workspace");
  const router = useRouter();
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [systemProblem, setSystemProblem] = useState(false);
  const [preferences, setPreferences] = useState(
    defaultNotificationPreferences,
  );
  const [editing, setEditing] = useState<Reminder | null>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const browserTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const targets = useMemo<ReminderTarget[]>(
    () => [
      ...tasks.map((item) => ({
        id: item.id,
        title: item.title,
        emoji: item.emoji,
        date: item.start_date,
        time: item.start_time,
        type: "task" as const,
        scope: item.scope,
      })),
      ...events.map((item) => ({
        id: item.id,
        title: item.title,
        emoji: item.emoji,
        date: item.event_date,
        time: item.start_time,
        type: "event" as const,
      })),
    ],
    [tasks, events],
  );
  const targetsByKey = new Map(
    [...linkedTargets, ...targets].map((target) => [targetKey(target), target]),
  );
  const getTarget = (reminder: Reminder) =>
    targetsByKey.get(
      reminder.task_id
        ? "task:" + reminder.task_id
        : "event:" + reminder.event_id,
    );
  const summary = reminders.find((item) => item.kind === "daily_summary");

  useEffect(() => {
    const syncLocalState = () => {
      setPermission(
        "Notification" in window ? Notification.permission : "unsupported",
      );
      const savedPreferences = loadNotificationPreferences();
      setPreferences((current) =>
        JSON.stringify(current) === JSON.stringify(savedPreferences)
          ? current
          : savedPreferences,
      );
    };
    queueMicrotask(syncLocalState);
    const updated = () => router.refresh();
    const syncProblem = () => setSystemProblem(readSystemNotificationProblem());
    syncProblem();
    window.addEventListener("planora-reminders-updated", updated);
    window.addEventListener("planora-system-notification-status", syncProblem);
    window.addEventListener("focus", syncLocalState);
    window.addEventListener("planora-notification-preferences", syncLocalState);
    return () => {
      window.removeEventListener("planora-reminders-updated", updated);
      window.removeEventListener("focus", syncLocalState);
      window.removeEventListener(
        "planora-notification-preferences",
        syncLocalState,
      );
      window.removeEventListener(
        "planora-system-notification-status",
        syncProblem,
      );
    };
  }, [router]);

  function persistPreference(
    key: keyof NotificationPreferences,
    value: boolean,
  ) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    saveNotificationPreferences(next);
  }

  async function requestPermission() {
    if (!("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      persistPreference("system", result === "granted");
    } catch {
      toast.error(t("error"));
    }
  }

  const status = (value: Reminder["delivery_status"]) =>
    ({
      pending: es ? "Pendiente" : "Pending",
      delivered: es ? "Enviado" : "Sent",
      permission_denied: es ? "Sin permiso" : "No permission",
      failed: es ? "Falló" : "Failed",
      snoozed: es ? "Pospuesto" : "Snoozed",
    })[value];

  const notificationTypes = [
    {
      key: "tasks" as const,
      title: es ? "Tareas" : "Tasks",
      hint: es
        ? "Avisos asociados a tus tareas."
        : "Alerts linked to your tasks.",
    },
    {
      key: "events" as const,
      title: es ? "Eventos" : "Events",
      hint: es
        ? "Partidos, reuniones y otros eventos."
        : "Matches, meetings and other events.",
    },
    {
      key: "summaries" as const,
      title: es ? "Resumen diario" : "Daily summary",
      hint: es
        ? "Una revisión diaria de tu planificación."
        : "A daily planning review.",
    },
    {
      key: "alarms" as const,
      title: es ? "Alarmas personalizadas" : "Custom alarms",
      hint: es
        ? "Alarmas creadas por ti para cualquier ocasión."
        : "Alarms you create for anything.",
    },
  ];

  const channels = [
    {
      key: "inApp" as const,
      title: es ? "Popup dentro de Planora" : "In-app popup",
      hint: es
        ? "Visible mientras estés usando la aplicación."
        : "Visible while you are using the app.",
    },
    {
      key: "system" as const,
      title: es ? "Notificación del sistema" : "System notification",
      hint: es
        ? "Usa el centro de notificaciones del dispositivo."
        : "Uses the device notification center.",
    },
    {
      key: "sound" as const,
      title: es ? "Sonido para alarmas" : "Alarm sound",
      hint: es
        ? "Suena cuando el navegador permite audio."
        : "Plays when the browser allows audio.",
    },
    {
      key: "vibration" as const,
      title: es ? "Vibración para alarmas" : "Alarm vibration",
      hint: es
        ? "Disponible en dispositivos compatibles."
        : "Available on compatible devices.",
    },
  ];

  return (
    <div className="page reminders-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">{es ? "A tu ritmo" : "On your time"}</p>
          <h1 className="title">
            {es ? "Notificaciones y alarmas" : "Notifications and alarms"}
          </h1>
          <p className="muted">
            {es
              ? "Tú eliges qué avisos recibes y cómo quieres recibirlos."
              : "Choose which alerts you receive and how they reach you."}
          </p>
        </div>
      </header>

      <PushSettings locale={locale} />
      <section className="surface permission-card" data-permission={permission}>
        <div>
          {permission === "granted" ? <Bell /> : <BellOff />}
          <div>
            <strong>
              {permission === "unsupported"
                ? es
                  ? "No compatible"
                  : "Not supported"
                : permission === "denied"
                  ? es
                    ? "Permiso bloqueado"
                    : "Permission blocked"
                  : permission === "granted"
                    ? es
                      ? "Notificaciones permitidas"
                      : "Notifications allowed"
                    : es
                      ? "Permiso pendiente"
                      : "Permission pending"}
            </strong>
            <p className="muted">
              {permission === "unsupported"
                ? es
                  ? "Este navegador no puede mostrar notificaciones del sistema."
                  : "This browser cannot show system notifications."
                : permission === "denied"
                  ? es
                    ? "El navegador ha bloqueado las notificaciones. Puedes activarlas en los ajustes del sitio. Planora no volverá a pedir el permiso sola."
                    : "The browser has blocked notifications. You can allow them in the site settings. Planora will not ask again on its own."
                  : permission === "granted"
                    ? es
                      ? "El permiso del sistema está concedido. Para recibir con Planora cerrada, registra este dispositivo en el apartado superior."
                      : "System permission is granted. For delivery while Planora is closed, register this device in the section above."
                    : es
                      ? "Solo pedimos permiso cuando pulsas el botón. Sin publicidad."
                      : "Permission is only requested after your click. No advertising."}
            </p>
            {systemProblem && (
              <p className="muted" role="status">
                {es
                  ? "No se pudo mostrar la notificación del sistema."
                  : "Could not show the system notification."}
              </p>
            )}
          </div>
        </div>
        {permission === "default" && (
          <button
            className="primary"
            disabled={!hydrated}
            onClick={() => void requestPermission()}
          >
            {es ? "Permitir notificaciones" : "Allow notifications"}
          </button>
        )}
      </section>

      <section className="surface notification-preferences">
        <div className="notification-preferences-heading">
          <MonitorSmartphone />
          <div>
            <h2>{es ? "Personaliza tus avisos" : "Customize your alerts"}</h2>
            <p className="muted">
              {es
                ? "Estas preferencias se guardan en este dispositivo."
                : "These preferences are saved on this device."}
            </p>
          </div>
        </div>
        <div className="notification-settings-grid">
          <div>
            <h3>{es ? "Tipos" : "Types"}</h3>
            {notificationTypes.map((item) => (
              <div className="notification-setting" key={item.key}>
                <div>
                  <strong>{item.title}</strong>
                  <p className="muted">{item.hint}</p>
                </div>
                <Switch
                  checked={preferences[item.key]}
                  label={item.title}
                  onChange={(value) => persistPreference(item.key, value)}
                />
              </div>
            ))}
          </div>
          <div>
            <h3>{es ? "Canales y comportamiento" : "Channels and behavior"}</h3>
            {channels.map((item) => (
              <div className="notification-setting" key={item.key}>
                <div>
                  <strong>{item.title}</strong>
                  <p className="muted">{item.hint}</p>
                </div>
                <Switch
                  checked={preferences[item.key]}
                  disabled={item.key === "system" && permission === "denied"}
                  label={item.title}
                  onChange={(value) => {
                    if (
                      item.key === "system" &&
                      value &&
                      permission === "default"
                    ) {
                      void requestPermission();
                      return;
                    }
                    persistPreference(item.key, value);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {hydrated && browserTimezone && browserTimezone !== timezone && (
        <aside className="surface timezone-warning">
          <Clock3 />
          <span>
            {es
              ? "Tu dispositivo usa " +
                browserTimezone +
                ", pero tu perfil usa " +
                timezone +
                "."
              : "Your device uses " +
                browserTimezone +
                ", but your profile uses " +
                timezone +
                "."}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await updateProfile({ timezone: browserTimezone });
                  router.refresh();
                } catch {
                  toast.error(t("error"));
                }
              })
            }
          >
            {t("reminderUseDeviceZone")}
          </button>
        </aside>
      )}

      <fieldset
        className="reminder-forms reminder-forms-expanded"
        disabled={!hydrated}
      >
        <legend className="visually-hidden">
          {es ? "Notificaciones y alarmas" : "Notifications and alarms"}
        </legend>
        <section className="surface reminder-form alarm-form">
          <AlarmClock />
          <h2>{es ? "Crear una alarma" : "Create an alarm"}</h2>
          <p className="muted">
            {es
              ? "Por ejemplo: El partido del Barça empieza en 30 minutos."
              : "For example: The Barça match starts in 30 minutes."}
          </p>
          <AlarmForm timezone={timezone} enabled locale={locale} />
        </section>

        <section className="surface reminder-form">
          <Bell />
          <h2>{es ? "Tarea o evento" : "Task or event"}</h2>
          <LinkedReminderForm
            timezone={timezone}
            enabled
            locale={locale}
            targets={targets}
            taskLoadError={taskLoadError}
          />
        </section>

        <section className="surface reminder-form">
          <Volume2 />
          <h2>{es ? "Resumen diario" : "Daily summary"}</h2>
          <p className="muted">
            {es
              ? "Un aviso para revisar tu día y lo que queda pendiente."
              : "One notification to review your day and remaining work."}
          </p>
          <SummaryForm
            key={summary?.time_of_day}
            timezone={summary?.timezone ?? timezone}
            enabled
            locale={locale}
            reminder={summary}
          />
        </section>
      </fieldset>

      <aside className="surface notification-limit-note">
        <strong>
          {es ? "Importante sobre las alarmas web" : "About web alarms"}
        </strong>
        <p className="muted">
          {es
            ? "Para recibir avisos con Planora cerrada, activa este dispositivo en el apartado superior y comprueba la recepción con la prueba. Sin esa activación, los avisos dependen de mantener la página abierta. Los permisos, la conexión, No molestar y el ahorro de batería del móvil pueden afectar al aviso y a su sonido."
            : "To receive alerts while Planora is closed, enable this device above and verify reception with the test. Without activation, alerts depend on keeping the page open. Permissions, connectivity, Do Not Disturb and battery saving can affect delivery and sound."}
        </p>
      </aside>

      <section aria-labelledby="configured-reminders">
        <h2 id="configured-reminders">{es ? "Configurados" : "Configured"}</h2>
        {reminders.length > 0 && (
          <button
            type="button"
            className="pill"
            disabled={!hydrated || pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await disableAllReminders();
                  router.refresh();
                } catch {
                  toast.error(t("error"));
                }
              })
            }
          >
            {t("disableConfiguredReminders")}
          </button>
        )}
        <div className="reminder-list">
          {reminders.map((reminder) => {
            const target = getTarget(reminder);
            const reminderName =
              reminder.kind === "alarm"
                ? reminder.title
                : reminder.kind === "daily_summary"
                  ? es
                    ? "Resumen diario"
                    : "Daily summary"
                  : (target?.title ??
                    (es ? "Elemento eliminado" : "Deleted item"));
            return (
              <article className="surface reminder-row" key={reminder.id}>
                <span className="resource-emoji">
                  {reminder.kind === "alarm"
                    ? "⏰"
                    : reminder.kind === "daily_summary"
                      ? "☀️"
                      : (target?.emoji ?? "🔔")}
                </span>
                <div>
                  <strong>{reminderName}</strong>
                  <p className="muted">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: reminder.timezone,
                    }).format(
                      new Date(
                        effectiveReminderTrigger(
                          reminder.next_trigger_at,
                          reminder.snoozed_until,
                        ),
                      ),
                    )}{" "}
                    · {status(reminder.delivery_status)}
                  </p>
                </div>
                <div className="row-actions">
                  <button
                    className="pill"
                    type="button"
                    aria-haspopup="dialog"
                    disabled={!hydrated || pending}
                    onClick={(event) => {
                      editTrigger.current = event.currentTarget;
                      setEditing(reminder);
                    }}
                  >
                    {t("edit")}
                  </button>
                  <Switch
                    checked={reminder.enabled}
                    disabled={!hydrated || pending}
                    label={
                      es ? "Activar " + reminderName : "Enable " + reminderName
                    }
                    onChange={(enabled) =>
                      startTransition(async () => {
                        try {
                          const result = await setReminderEnabled({
                            id: reminder.id,
                            enabled,
                          });
                          if (!result.ok) {
                            toast.error(t("reminderExpired"));
                            return;
                          }
                          router.refresh();
                        } catch {
                          toast.error(t("error"));
                        }
                      })
                    }
                  />
                  {reminder.enabled && (
                    <button
                      className="pill"
                      type="button"
                      disabled={!hydrated || pending}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            await snoozeReminder({
                              id: reminder.id,
                              minutes: 10,
                            });
                            router.refresh();
                          } catch {
                            toast.error(t("error"));
                          }
                        })
                      }
                    >
                      {es ? "Posponer 10 min" : "Snooze 10 min"}
                    </button>
                  )}
                  <button
                    className="icon-button"
                    type="button"
                    disabled={!hydrated || pending}
                    aria-label={
                      es ? "Eliminar recordatorio" : "Delete reminder"
                    }
                    onClick={() =>
                      startTransition(async () => {
                        await deleteReminder(reminder.id);
                        router.refresh();
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            );
          })}
          {!reminders.length && (
            <div className="empty empty-compact surface">
              <span className="empty-icon">🔕</span>
              <h3>
                {es ? "Todavía no hay recordatorios" : "No reminders yet"}
              </h3>
              <p>
                {es
                  ? "Activa solo los avisos que te resulten útiles."
                  : "Enable only the reminders that help you."}
              </p>
            </div>
          )}
        </div>
      </section>
      {editing && (
        <ReminderEditor
          key={editing.id}
          locale={locale}
          reminder={editing}
          target={getTarget(editing)}
          targets={targets}
          taskLoadError={taskLoadError}
          onClose={() => setEditing(null)}
          triggerRef={editTrigger}
        />
      )}
    </div>
  );
}
