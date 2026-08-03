"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  AlarmClock,
  Bell,
  BellOff,
  Clock3,
  MonitorSmartphone,
  Search,
  X,
  Trash2,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteReminder,
  saveReminder,
  setReminderEnabled,
  setRemindersEnabled,
  snoozeReminder,
  updateReminderTimezone,
} from "@/app/actions/domain";
import {
  advanceTrigger,
  customTrigger,
  nextDailyTrigger,
  relativeTrigger,
} from "./schedule";
import {
  defaultNotificationPreferences,
  loadNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "./preferences";
import type { Database } from "@/types/database";
import { normalizeTaskSearch } from "@/lib/workspace/task-search";

type Reminder = Database["public"]["Tables"]["reminders"]["Row"];
type Target = {
  id: string;
  title: string;
  emoji: string | null;
  date: string;
  time: string | null;
  type: "task" | "event";
  scope?: "schedule" | "global";
};

function formatDuration(
  days: number,
  hours: number,
  minutes: number,
  es: boolean,
) {
  const parts = [
    days
      ? `${days} ${days === 1 ? (es ? "día" : "day") : es ? "días" : "days"}`
      : "",
    hours
      ? `${hours} ${hours === 1 ? (es ? "hora" : "hour") : es ? "horas" : "hours"}`
      : "",
    minutes
      ? `${minutes} ${minutes === 1 ? (es ? "minuto" : "minute") : es ? "minutos" : "minutes"}`
      : "",
  ].filter(Boolean);
  return parts.join(es ? " y " : " and ") || (es ? "0 minutos" : "0 minutes");
}

function TargetCombobox({
  targets,
  value,
  onChange,
  emptyLabel,
  placeholder,
  clearLabel,
  noMatchLabel,
  errorLabel,
  hasError = false,
  onRetry,
  unavailableLabel,
}: {
  targets: Target[];
  value: string;
  onChange: (value: string) => void;
  emptyLabel: string;
  placeholder: string;
  clearLabel: string;
  noMatchLabel: string;
  errorLabel: string;
  hasError?: boolean;
  onRetry?: () => void;
  unavailableLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = targets.find((item) => item.type + ":" + item.id === value);
  const results = useMemo(() => {
    const needle = normalizeTaskSearch(query);
    return targets
      .filter((item) => !needle || normalizeTaskSearch(item.title).includes(needle))
      .slice(0, 50);
  }, [query, targets]);
  function choose(item: Target) {
    onChange(item.type + ":" + item.id);
    setQuery("");
    setOpen(false);
  }
  return (
    <div className="target-combobox">
      <div className="target-combobox-control">
        <Search size={17} aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls="reminder-target-options"
          aria-activedescendant={
            open && results[active]
              ? `target-${results[active].type}-${results[active].id}`
              : undefined
          }
          placeholder={placeholder}
          value={open ? query : (selected?.title ?? "")}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((current) => Math.min(current + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter" && open && results[active]) {
              event.preventDefault();
              choose(results[active]);
            } else if (event.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
        />
        {value && (
          <button
            type="button"
            className="target-clear"
            aria-label={clearLabel}
            onClick={() => {
              onChange("");
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            <X size={17} />
          </button>
        )}
      </div>
      {open && (
        <div
          className="target-combobox-options"
          id="reminder-target-options"
          role="listbox"
        >
          {hasError ? (
            <div className="target-combobox-empty"><p>{errorLabel}</p>{onRetry && <button type="button" className="pill" onClick={onRetry}>Retry</button>}</div>
          ) : results.length ? (
            results.map((item, index) => (
              <button
                type="button"
                role="option"
                id={`target-${item.type}-${item.id}`}
                aria-selected={item.type + ":" + item.id === value}
                data-active={index === active}
                key={item.type + item.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
              >
                <span>{item.emoji || "•"}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.scope === "global" ? "Global · " : ""}{item.date}
                    {item.time ? ` · ${item.time.slice(0, 5)}` : ""}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p className="target-combobox-empty">{query.trim() ? noMatchLabel : emptyLabel}</p>
          )}
        </div>
      )}
      {!selected && value && <p className="target-unavailable">{unavailableLabel}</p>}
    </div>
  );
}

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
  events: Array<{
    id: string;
    title: string;
    emoji: string | null;
    event_date: string;
    start_time: string | null;
  }>;
}) {
  const es = locale === "es";
  const t = useTranslations("Workspace");
  const router = useRouter();
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [optedOut, setOptedOut] = useState(
    reminders.length > 0 && reminders.every((item) => !item.enabled),
  );
  const [preferences, setPreferences] = useState(
    defaultNotificationPreferences,
  );
  const [targetValue, setTargetValue] = useState(
    tasks[0] ? "task:" + tasks[0].id : events[0] ? "event:" + events[0].id : "",
  );
  const [targetKind, setTargetKind] = useState<"task" | "event">(
    tasks[0] ? "task" : "event",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(30);
  const [timingMode, setTimingMode] = useState<"preset" | "custom">("preset");
  const [customDays, setCustomDays] = useState(0);
  const [customHours, setCustomHours] = useState(0);
  const [customMinutes, setCustomMinutes] = useState(30);
  const [recurrence, setRecurrence] = useState<"once" | "daily" | "weekly">(
    "once",
  );
  const [summaryTime, setSummaryTime] = useState("20:00");

  const [alarmTitle, setAlarmTitle] = useState("");
  const [alarmDate, setAlarmDate] = useState(() =>
    new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  );
  const [alarmTime, setAlarmTime] = useState("20:00");
  const [alarmRecurrence, setAlarmRecurrence] = useState<
    "once" | "daily" | "weekly"
  >("once");
  const [pending, startTransition] = useTransition();
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
  ];
  const targetOptions = targets.filter((item) => item.type === targetKind);
  const effectiveMinutes =
    timingMode === "custom"
      ? customDays * 1440 + customHours * 60 + customMinutes
      : minutes;

  useEffect(() => {
    queueMicrotask(() => {
      setPermission(
        "Notification" in window ? Notification.permission : "unsupported",
      );
      const savedPreferences = loadNotificationPreferences();
      setPreferences((current) =>
        JSON.stringify(current) === JSON.stringify(savedPreferences)
          ? current
          : savedPreferences,
      );
    });
    const updated = () => router.refresh();
    window.addEventListener("planora-reminders-updated", updated);
    return () =>
      window.removeEventListener("planora-reminders-updated", updated);
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
    const result = await Notification.requestPermission();
    setPermission(result);
    persistPreference("system", result === "granted");
    await setRemindersEnabled(result === "granted");
    setOptedOut(result !== "granted");
    router.refresh();
  }

  function createRelative() {
    const [type, id] = targetValue.split(":") as ["task" | "event", string];
    const target = targets.find((item) => item.id === id && item.type === type);
    if (!target) return;
    if (
      timingMode === "custom" &&
      (customDays < 0 ||
        customDays > 7 ||
        customHours < 0 ||
        customHours > 23 ||
        customMinutes < 0 ||
        customMinutes > 59 ||
        effectiveMinutes < 1 ||
        effectiveMinutes > 10080)
    ) {
      toast.error(t("customDurationInvalid"));
      return;
    }
    let trigger = relativeTrigger(
      target.date,
      target.time,
      timezone,
      effectiveMinutes,
    );
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
          title: null,
          id: editingId ?? undefined,
          minutesBefore: effectiveMinutes,
          recurrence,
          timeOfDay: null,
          timezone,
          nextTriggerAt: trigger.toISOString(),
          enabled: !optedOut,
        });
        toast.success(es ? "Recordatorio guardado" : "Reminder saved");
        setEditingId(null);
        router.refresh();
      } catch {
        toast.error(es ? "No se pudo guardar" : "Could not save");
      }
    });
  }

  function editRelative(reminder: Reminder) {
    const targetId = reminder.task_id ?? reminder.event_id;
    const type = reminder.task_id ? "task" : "event";
    setEditingId(reminder.id);
    setTargetKind(type);
    setTargetValue(targetId ? type + ":" + targetId : "");
    setMinutes(reminder.minutes_before ?? 30);
    setTimingMode("preset");
    const total = reminder.minutes_before ?? 30;
    setCustomDays(Math.floor(total / 1440));
    setCustomHours(Math.floor((total % 1440) / 60));
    setCustomMinutes(total % 60);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function createAlarm() {
    const trigger = customTrigger(alarmDate, alarmTime, timezone);
    if (trigger <= new Date()) {
      toast.error(
        es
          ? "Elige una fecha y hora futuras."
          : "Choose a future date and time.",
      );
      return;
    }
    startTransition(async () => {
      try {
        await saveReminder({
          targetType: "alarm",
          targetId: null,
          title: alarmTitle,
          minutesBefore: null,
          recurrence: alarmRecurrence,
          timeOfDay: null,
          timezone,
          nextTriggerAt: trigger.toISOString(),
          enabled: !optedOut,
        });
        setAlarmTitle("");
        toast.success(es ? "Alarma creada" : "Alarm created");
        router.refresh();
      } catch {
        toast.error(
          es ? "No se pudo crear la alarma" : "Could not create alarm",
        );
      }
    });
  }

  function saveSummary() {
    startTransition(async () => {
      try {
        await saveReminder({
          targetType: "summary",
          targetId: null,
          title: null,
          minutesBefore: null,
          recurrence: "daily",
          timeOfDay: summaryTime,
          timezone,
          nextTriggerAt: nextDailyTrigger(summaryTime, timezone).toISOString(),
          enabled: !optedOut,
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
                    ? "Bloqueadas en el navegador"
                    : "Blocked in browser"
                  : es
                    ? "Notificaciones desactivadas"
                    : "Notifications off"}
            </strong>
            <p className="muted">
              {es
                ? "Solo pedimos permiso cuando pulsas el botón. Sin publicidad."
                : "Permission is only requested after your click. No advertising."}
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
                : void requestPermission()
            }
          >
            {permission === "granted" && !optedOut
              ? es
                ? "Desactivar todo"
                : "Turn all off"
              : es
                ? "Permitir notificaciones"
                : "Allow notifications"}
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

      {browserTimezone && browserTimezone !== timezone && (
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

      <div className="reminder-forms reminder-forms-expanded">
        <section className="surface reminder-form alarm-form">
          <AlarmClock />
          <h2>{es ? "Crear una alarma" : "Create an alarm"}</h2>
          <p className="muted">
            {es
              ? "Por ejemplo: El partido del Barça empieza en 30 minutos."
              : "For example: The Barça match starts in 30 minutes."}
          </p>
          <label>
            {es ? "Nombre" : "Name"}
            <input
              maxLength={140}
              placeholder={es ? "Partido del Barça" : "Barça match"}
              value={alarmTitle}
              onChange={(event) => setAlarmTitle(event.target.value)}
            />
          </label>
          <div className="alarm-date-row">
            <label>
              {es ? "Fecha" : "Date"}
              <input
                type="date"
                value={alarmDate}
                onChange={(event) => setAlarmDate(event.target.value)}
              />
            </label>
            <label>
              {es ? "Hora" : "Time"}
              <input
                type="time"
                value={alarmTime}
                onChange={(event) => setAlarmTime(event.target.value)}
              />
            </label>
          </div>
          <label>
            {es ? "Repetición" : "Repeat"}
            <select
              value={alarmRecurrence}
              onChange={(event) =>
                setAlarmRecurrence(event.target.value as typeof alarmRecurrence)
              }
            >
              <option value="once">{es ? "Una vez" : "Once"}</option>
              <option value="daily">{es ? "Cada día" : "Daily"}</option>
              <option value="weekly">{es ? "Cada semana" : "Weekly"}</option>
            </select>
          </label>
          <button
            className="primary"
            disabled={pending || !alarmTitle.trim() || !alarmDate || !alarmTime}
            onClick={createAlarm}
          >
            {es ? "Crear alarma" : "Create alarm"}
          </button>
        </section>

        <section className="surface reminder-form">
          <Bell />
          <h2>{es ? "Tarea o evento" : "Task or event"}</h2>
          <label>
            {es ? "Elemento" : "Item"}
            <select
              value={targetKind}
              onChange={(event) => {
                const next = event.target.value as "task" | "event";
                setTargetKind(next);
                const first = targets.find((item) => item.type === next);
                setTargetValue(first ? next + ":" + first.id : "");
              }}
            >
              <option value="task">{es ? "Tarea" : "Task"}</option>
              <option value="event">{es ? "Evento" : "Event"}</option>
            </select>
            <TargetCombobox
              targets={targetOptions}
              value={targetValue}
              onChange={setTargetValue}
              placeholder={
                targetKind === "task" ? t("searchTask") : t("searchEvent")
              }
              emptyLabel={
                targetKind === "task" ? t("noTasksFound") : t("noEventsFound")
              }
              clearLabel={t("clearSelection")}
              noMatchLabel={targetKind === "task" ? t("noTasksMatch") : t("noEventsFound")}
              errorLabel={t("tasksLoadError")}
              hasError={targetKind === "task" && taskLoadError}
              onRetry={() => router.refresh()}
                          unavailableLabel={t("taskUnavailable")}
            />
          </label>
          <label>
            {es ? "Avisar antes" : "Notify before"}
            <select
              value={timingMode === "custom" ? "custom" : minutes}
              onChange={(event) => {
                if (event.target.value === "custom") setTimingMode("custom");
                else {
                  setTimingMode("preset");
                  setMinutes(Number(event.target.value));
                }
              }}
            >
              <option value={0}>{es ? "A la hora" : "At time"}</option>
              <option value={5}>5 min</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>1 h</option>
              <option value={120}>2 h</option>
              <option value="custom">{t("customDuration")}</option>
              <option value={1440}>{es ? "1 día" : "1 day"}</option>
            </select>
          </label>
          {timingMode === "custom" && (
            <div className="custom-duration" aria-live="polite">
              <label>
                {t("days")}
                <input
                  type="number"
                  min="0"
                  max="7"
                  inputMode="numeric"
                  value={customDays}
                  onChange={(event) =>
                    setCustomDays(Number(event.target.value))
                  }
                />
              </label>
              <label>
                {t("hours")}
                <input
                  type="number"
                  min="0"
                  max="23"
                  inputMode="numeric"
                  value={customHours}
                  onChange={(event) =>
                    setCustomHours(Number(event.target.value))
                  }
                />
              </label>
              <label>
                {t("minutes")}
                <input
                  type="number"
                  min="0"
                  max="59"
                  inputMode="numeric"
                  value={customMinutes}
                  onChange={(event) =>
                    setCustomMinutes(Number(event.target.value))
                  }
                />
              </label>
              <p>
                {t("customDurationSummary", {
                  duration: formatDuration(
                    customDays,
                    customHours,
                    customMinutes,
                    es,
                  ),
                })}
              </p>
            </div>
          )}
          <label>
            {es ? "Repetición" : "Repeat"}
            <select
              value={recurrence}
              onChange={(event) =>
                setRecurrence(event.target.value as typeof recurrence)
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
          <Volume2 />
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
              onChange={(event) => setSummaryTime(event.target.value)}
            />
          </label>
          <button className="primary" disabled={pending} onClick={saveSummary}>
            {es ? "Guardar resumen" : "Save summary"}
          </button>
        </section>
      </div>

      <aside className="surface notification-limit-note">
        <strong>
          {es ? "Importante sobre las alarmas web" : "About web alarms"}
        </strong>
        <p className="muted">
          {es
            ? "Los popups, el sonido y la vibración funcionan mientras Planora está abierta o activa como PWA. El sistema operativo puede suspender una web completamente cerrada; las notificaciones del sistema dependen de los permisos y límites del navegador."
            : "Popups, sound and vibration work while Planora is open or active as a PWA. The operating system may suspend a fully closed website; system notifications depend on browser permissions and limits."}
        </p>
      </aside>

      <section aria-labelledby="configured-reminders">
        <h2 id="configured-reminders">{es ? "Configurados" : "Configured"}</h2>
        <div className="reminder-list">
          {reminders.map((reminder) => {
            const target = targets.find(
              (item) => item.id === (reminder.task_id ?? reminder.event_id),
            );
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
                    }).format(new Date(reminder.next_trigger_at))}{" "}
                    · {status(reminder.delivery_status)}
                  </p>
                </div>
                <div className="row-actions">
                  {reminder.kind === "relative" && (
                    <button
                      className="pill"
                      type="button"
                      onClick={() => editRelative(reminder)}
                    >
                      {t("edit")}
                    </button>
                  )}
                  <Switch
                    checked={reminder.enabled}
                    label={
                      es ? "Activar " + reminderName : "Enable " + reminderName
                    }
                    onChange={(enabled) =>
                      startTransition(async () => {
                        await setReminderEnabled({ id: reminder.id, enabled });
                        router.refresh();
                      })
                    }
                  />
                  {reminder.enabled && (
                    <button
                      className="pill"
                      onClick={() =>
                        startTransition(async () => {
                          await snoozeReminder({
                            id: reminder.id,
                            minutes: 10,
                          });
                          router.refresh();
                        })
                      }
                    >
                      {es ? "Posponer 10 min" : "Snooze 10 min"}
                    </button>
                  )}
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
