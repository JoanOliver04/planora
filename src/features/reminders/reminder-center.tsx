"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Clock3, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteReminder,
  saveReminder,
  setRemindersEnabled,
  snoozeReminder,
  updateReminderTimezone,
} from "@/app/actions/domain";
import { advanceTrigger, nextDailyTrigger, relativeTrigger } from "./schedule";
import type { Database } from "@/types/database";
type Reminder = Database["public"]["Tables"]["reminders"]["Row"];
type Target = {
  id: string;
  title: string;
  emoji: string | null;
  date: string;
  time: string | null;
  type: "task" | "event";
};
export function ReminderCenter({
  locale,
  timezone,
  reminders,
  tasks,
  events,
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
  }>;
  events: Array<{
    id: string;
    title: string;
    emoji: string | null;
    event_date: string;
    start_time: string | null;
  }>;
}) {
  const es = locale === "es",
    router = useRouter();
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [optedOut, setOptedOut] = useState(
    reminders.length > 0 && reminders.every((item) => !item.enabled),
  );
  const [targetValue, setTargetValue] = useState(
    tasks[0] ? "task:" + tasks[0].id : events[0] ? "event:" + events[0].id : "",
  );
  const [minutes, setMinutes] = useState(15),
    [recurrence, setRecurrence] = useState<"once" | "daily" | "weekly">("once"),
    [summaryTime, setSummaryTime] = useState("20:00"),
    [pending, startTransition] = useTransition();
  const browserTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const targets: Target[] = [
    ...tasks.map((item) => ({
      id: item.id,
      title: item.title,
      emoji: item.emoji,
      date: item.start_date,
      time: item.start_time,
      type: "task" as const,
    })),
    ...events.map((item) => ({
      id: item.id,
      title: item.title,
      emoji: item.emoji,
      date: item.event_date,
      time: item.start_time,
      type: "event" as const,
    })),
  ];
  useEffect(() => {
    queueMicrotask(() =>
      setPermission(
        "Notification" in window ? Notification.permission : "unsupported",
      ),
    );
    const updated = () => router.refresh();
    window.addEventListener("planora-reminders-updated", updated);
    return () =>
      window.removeEventListener("planora-reminders-updated", updated);
  }, [router]);
  function requestPermission() {
    if (!("Notification" in window)) return;
    startTransition(async () => {
      const result = await Notification.requestPermission();
      setPermission(result);
      await setRemindersEnabled(result === "granted");
      setOptedOut(result !== "granted");
      router.refresh();
    });
  }
  function createRelative() {
    const [type, id] = targetValue.split(":") as ["task" | "event", string];
    const target = targets.find((item) => item.id === id && item.type === type);
    if (!target) return;
    let trigger = relativeTrigger(target.date, target.time, timezone, minutes);
    while (trigger <= new Date() && recurrence !== "once") {
      trigger = advanceTrigger(trigger, recurrence, timezone) ?? trigger;
    }
    if (trigger <= new Date()) {
      toast.error(
        es
          ? "La fecha ya ha pasado. Elige recurrencia o un elemento futuro."
          : "That date has passed. Choose recurrence or a future item.",
      );
      return;
    }
    startTransition(async () => {
      try {
        await saveReminder({
          targetType: type,
          targetId: id,
          minutesBefore: minutes,
          recurrence,
          timeOfDay: null,
          timezone,
          nextTriggerAt: trigger.toISOString(),
          enabled: permission === "granted" && !optedOut,
        });
        toast.success(es ? "Recordatorio guardado" : "Reminder saved");
        router.refresh();
      } catch {
        toast.error(es ? "No se pudo guardar" : "Could not save");
      }
    });
  }
  function saveSummary() {
    startTransition(async () => {
      try {
        await saveReminder({
          targetType: "summary",
          targetId: null,
          minutesBefore: null,
          recurrence: "daily",
          timeOfDay: summaryTime,
          timezone,
          nextTriggerAt: nextDailyTrigger(summaryTime, timezone).toISOString(),
          enabled: permission === "granted" && !optedOut,
        });
        toast.success(es ? "Resumen diario guardado" : "Daily summary saved");
        router.refresh();
      } catch {
        toast.error(es ? "No se pudo guardar" : "Could not save");
      }
    });
  }
  const status = (value: Reminder["delivery_status"]) =>
    ({
      pending: es ? "Pendiente" : "Pending",
      delivered: es ? "Entregado" : "Delivered",
      permission_denied: es ? "Sin permiso" : "No permission",
      failed: es ? "Falló" : "Failed",
      snoozed: es ? "Pospuesto" : "Snoozed",
    })[value];
  return (
    <div className="page reminders-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">{es ? "A tu ritmo" : "On your time"}</p>
          <h1 className="title">{es ? "Recordatorios" : "Reminders"}</h1>
          <p className="muted">
            {es
              ? "Planora solo avisará después de que des permiso."
              : "Planora only notifies you after explicit permission."}
          </p>
        </div>
      </header>
      <section className="surface permission-card" data-permission={permission}>
        <div>
          {permission === "granted" && !optedOut ? <Bell /> : <BellOff />}
          <div>
            <strong>
              {permission === "granted" && !optedOut
                ? es
                  ? "Notificaciones activadas"
                  : "Notifications enabled"
                : permission === "denied"
                  ? es
                    ? "Notificaciones bloqueadas en el navegador"
                    : "Notifications blocked in browser"
                  : es
                    ? "Notificaciones desactivadas"
                    : "Notifications off"}
            </strong>
            <p className="muted">
              {es
                ? "Puedes cambiarlo cuando quieras. No enviamos publicidad."
                : "Change this anytime. We never send advertising."}
            </p>
          </div>
        </div>
        {permission !== "unsupported" && permission !== "denied" && (
          <button
            className={
              permission === "granted" && !optedOut ? "secondary" : "primary"
            }
            disabled={pending}
            onClick={() =>
              permission === "granted" && !optedOut
                ? startTransition(async () => {
                    await setRemindersEnabled(false);
                    setOptedOut(true);
                    router.refresh();
                  })
                : requestPermission()
            }
          >
            {permission === "granted" && !optedOut
              ? es
                ? "Desactivar"
                : "Turn off"
              : es
                ? "Permitir notificaciones"
                : "Allow notifications"}
          </button>
        )}
      </section>
      {browserTimezone && browserTimezone !== timezone && (
        <aside className="surface timezone-warning">
          <Clock3 />
          <span>
            {es
              ? "Tu navegador usa " +
                browserTimezone +
                ", pero tu perfil usa " +
                timezone +
                "."
              : "Your browser uses " +
                browserTimezone +
                ", but your profile uses " +
                timezone +
                "."}
          </span>
          <button
            onClick={() =>
              startTransition(async () => {
                await updateReminderTimezone({ timezone: browserTimezone });
                router.refresh();
              })
            }
          >
            {es ? "Usar zona actual" : "Use current zone"}
          </button>
        </aside>
      )}
      <div className="reminder-forms">
        <section className="surface reminder-form">
          <h2>{es ? "Tarea o evento" : "Task or event"}</h2>
          <label>
            {es ? "Elemento" : "Item"}
            <select
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
            >
              {targets.map((item) => (
                <option
                  key={item.type + item.id}
                  value={item.type + ":" + item.id}
                >
                  {item.emoji} {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {es ? "Avisar antes" : "Notify before"}
            <select
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              <option value={0}>{es ? "A la hora" : "At time"}</option>
              <option value={15}>15 min</option>
              <option value={60}>1 h</option>
              <option value={1440}>{es ? "1 día" : "1 day"}</option>
            </select>
          </label>
          <label>
            {es ? "Repetición" : "Repeat"}
            <select
              value={recurrence}
              onChange={(e) =>
                setRecurrence(e.target.value as typeof recurrence)
              }
            >
              <option value="once">{es ? "Una vez" : "Once"}</option>
              <option value="daily">{es ? "Diario" : "Daily"}</option>
              <option value="weekly">{es ? "Semanal" : "Weekly"}</option>
            </select>
          </label>
          <button
            className="primary"
            disabled={pending || !targetValue}
            onClick={createRelative}
          >
            {es ? "Añadir recordatorio" : "Add reminder"}
          </button>
        </section>
        <section className="surface reminder-form">
          <h2>{es ? "Resumen diario" : "Daily summary"}</h2>
          <p className="muted">
            {es
              ? "Un aviso para revisar tu día y lo que queda pendiente."
              : "One notification to review your day and remaining work."}
          </p>
          <label>
            {es ? "Hora" : "Time"}
            <input
              type="time"
              value={summaryTime}
              onChange={(e) => setSummaryTime(e.target.value)}
            />
          </label>
          <button className="primary" disabled={pending} onClick={saveSummary}>
            {es ? "Guardar resumen" : "Save summary"}
          </button>
        </section>
      </div>
      <section aria-labelledby="configured-reminders">
        <h2 id="configured-reminders">{es ? "Configurados" : "Configured"}</h2>
        <div className="reminder-list">
          {reminders.map((reminder) => {
            const target = targets.find(
              (item) => item.id === (reminder.task_id ?? reminder.event_id),
            );
            return (
              <article className="surface reminder-row" key={reminder.id}>
                <span className="resource-emoji">
                  {reminder.kind === "daily_summary"
                    ? "☀️"
                    : (target?.emoji ?? "🔔")}
                </span>
                <div>
                  <strong>
                    {reminder.kind === "daily_summary"
                      ? es
                        ? "Resumen diario"
                        : "Daily summary"
                      : (target?.title ??
                        (es ? "Elemento eliminado" : "Deleted item"))}
                  </strong>
                  <p className="muted">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: reminder.timezone,
                    }).format(new Date(reminder.next_trigger_at))}{" "}
                    · {status(reminder.delivery_status)}
                  </p>
                </div>
                <div className="row-actions">
                  <button
                    className="pill"
                    onClick={() =>
                      startTransition(async () => {
                        await snoozeReminder({ id: reminder.id, minutes: 10 });
                        router.refresh();
                      })
                    }
                  >
                    {es ? "Posponer 10 min" : "Snooze 10 min"}
                  </button>
                  <button
                    className="icon-button"
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
    </div>
  );
}
