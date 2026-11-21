"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { formatInTimeZone } from "date-fns-tz";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { toast } from "sonner";
import { saveReminder } from "@/app/actions/domain";
import { nextLocalDate, zonedDate } from "@/lib/dates/timezone";
import { normalizeTaskSearch } from "@/lib/workspace/task-search";
import type { Database } from "@/types/database";
import {
  exactTrigger,
  MAX_REMINDER_OFFSET,
  nextLinkedTrigger,
  relativeTrigger,
  type ReminderRecurrence,
} from "./schedule";

type Reminder = Database["public"]["Tables"]["reminders"]["Row"];
type Locale = "es" | "en";
export type ReminderTarget = {
  id: string;
  title: string;
  emoji: string | null;
  date: string;
  time: string | null;
  type: "task" | "event";
  scope?: "global" | "schedule";
};

export const targetKey = (target: ReminderTarget) =>
  target.type + ":" + target.id;

const offsets = [0, 5, 15, 30, 60, 120, 1440];
const defaultTime = "20:00";

type EditorCallbacks = {
  onSaved?: () => void;
  onPendingChange?: (pending: boolean) => void;
};
type FormProps = EditorCallbacks & {
  locale: Locale;
  timezone: string;
  enabled: boolean;
  reminder?: Reminder;
};

function ScheduleForm({
  editing,
  submitLabel,
  children,
  disabled,
  onSave,
  onSaved,
  onPendingChange,
}: EditorCallbacks & {
  editing: boolean;
  submitLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onSave: (data: FormData) => Promise<string | void>;
}) {
  const t = useTranslations("Workspace");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <form
      className="reminder-schedule-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || disabled) return;
        const data = new FormData(event.currentTarget);
        setError("");
        onPendingChange?.(true);
        startTransition(async () => {
          try {
            const validationError = await onSave(data);
            if (validationError) {
              setError(validationError);
              return;
            }
            toast.success(t("reminderSaved"));
            onSaved?.();
          } catch {
            setError(t("reminderSaveError"));
          } finally {
            onPendingChange?.(false);
          }
        });
      }}
    >
      <fieldset className="reminder-editor-fields" disabled={pending}>
        {children}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <div className={editing ? "row-actions" : "reminder-submit"}>
        {editing && (
          <Dialog.Close type="button" className="pill" disabled={pending}>
            {t("close")}
          </Dialog.Close>
        )}
        <button
          type="submit"
          className="primary"
          disabled={pending || disabled}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function RepeatField({ value = "once" }: { value?: ReminderRecurrence }) {
  const t = useTranslations("Workspace");
  return (
    <label>
      {t("reminderRepeat")}
      <select name="recurrence" defaultValue={value}>
        <option value="once">{t("reminderOnce")}</option>
        <option value="daily">{t("reminderDaily")}</option>
        <option value="weekly">{t("reminderWeekly")}</option>
      </select>
    </label>
  );
}

export function AlarmForm({
  locale,
  timezone,
  enabled,
  reminder,
  ...callbacks
}: FormProps) {
  const t = useTranslations("Workspace");
  const nameRef = useRef<HTMLInputElement>(null);
  const [initialDate] = useState(() =>
    reminder
      ? formatInTimeZone(reminder.next_trigger_at, timezone, "yyyy-MM-dd")
      : nextLocalDate(timezone),
  );
  const initialTime = reminder
    ? formatInTimeZone(reminder.next_trigger_at, timezone, "HH:mm")
    : defaultTime;
  return (
    <ScheduleForm
      {...callbacks}
      editing={Boolean(reminder)}
      submitLabel={reminder ? t("save") : t("createAlarm")}
      onSave={async (data) => {
        const date = String(data.get("date"));
        const timeOfDay = String(data.get("time"));
        const title = String(data.get("title")).trim();
        const trigger = exactTrigger(date, timeOfDay, timezone);
        if (!title) return t("alarmNameRequired");
        if (!trigger) return t("reminderInvalidTime");
        if (trigger <= new Date()) return t("reminderFutureTime");
        await saveReminder({
          id: reminder?.id,
          targetType: "alarm",
          title,
          date,
          timeOfDay,
          timezone,
          recurrence: data.get("recurrence"),
          enabled,
        });
        if (!reminder && nameRef.current) nameRef.current.value = "";
      }}
    >
      <label>
        {t("alarmName")}
        <input
          ref={nameRef}
          name="title"
          maxLength={140}
          placeholder={locale === "es" ? "Partido del Barça" : "Barça match"}
          defaultValue={reminder?.title ?? ""}
          required
        />
      </label>
      <div className="alarm-date-row">
        <label>
          {t("reminderDate")}
          <input type="date" name="date" defaultValue={initialDate} required />
        </label>
        <label>
          {t("reminderTime")}
          <input type="time" name="time" defaultValue={initialTime} required />
        </label>
      </div>
      <RepeatField value={reminder?.recurrence} />
    </ScheduleForm>
  );
}

export function SummaryForm({
  timezone,
  enabled,
  reminder,
  ...callbacks
}: FormProps) {
  const t = useTranslations("Workspace");
  return (
    <ScheduleForm
      {...callbacks}
      editing={Boolean(callbacks.onSaved)}
      submitLabel={callbacks.onSaved ? t("save") : t("saveReminderSummary")}
      onSave={async (data) => {
        await saveReminder({
          id: reminder?.id,
          targetType: "summary",
          timeOfDay: data.get("time"),
          timezone,
          enabled,
        });
      }}
    >
      <label>
        {t("reminderTime")}
        <input
          type="time"
          name="time"
          defaultValue={reminder?.time_of_day?.slice(0, 5) ?? defaultTime}
          required
        />
      </label>
    </ScheduleForm>
  );
}

function TargetCombobox({
  targets,
  value,
  onChange,
  type,
  hasError,
}: {
  targets: ReminderTarget[];
  value: string;
  onChange: (value: string) => void;
  type: ReminderTarget["type"];
  hasError: boolean;
}) {
  const t = useTranslations("Workspace");
  const router = useRouter();
  const inputId = useId();
  const listId = inputId + "-options";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const selected = targets.find((item) => targetKey(item) === value);
  const results = useMemo(() => {
    const needle = normalizeTaskSearch(query);
    return targets
      .filter((item) => normalizeTaskSearch(item.title).includes(needle))
      .slice(0, 50);
  }, [query, targets]);
  const label = type === "task" ? t("searchTask") : t("searchEvent");
  const emptyLabel =
    type === "task"
      ? t(targets.length ? "noTasksMatch" : "noTasksFound")
      : t("noEventsFound");
  const showList = open && results.length > 0;

  function choose(item: ReminderTarget) {
    onChange(targetKey(item));
    setQuery("");
    setActive(0);
    setOpen(false);
  }

  return (
    <div
      className="target-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery("");
          setActive(0);
        }
      }}
    >
      <label htmlFor={inputId} className="visually-hidden">
        {label}
      </label>
      <div className="target-combobox-control">
        <Search size={17} aria-hidden="true" />
        <input
          id={inputId}
          ref={input}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={
            showList && results[active] ? listId + "-" + active : undefined
          }
          placeholder={label}
          value={open ? query : (selected?.title ?? "")}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (
              (event.key === "ArrowDown" || event.key === "ArrowUp") &&
              results.length
            ) {
              event.preventDefault();
              setOpen(true);
              const delta = event.key === "ArrowDown" ? 1 : -1;
              setActive((current) =>
                open
                  ? Math.min(results.length - 1, Math.max(current + delta, 0))
                  : 0,
              );
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              if (results[active]) choose(results[active]);
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              setOpen(false);
              setQuery("");
              setActive(0);
            }
          }}
        />
        {value && (
          <button
            type="button"
            className="target-clear"
            aria-label={t("clearSelection")}
            onClick={() => {
              onChange("");
              setQuery("");
              setActive(0);
              setOpen(true);
              input.current?.focus();
            }}
          >
            <X size={17} />
          </button>
        )}
      </div>
      {hasError && (
        <p className="target-unavailable">
          {t("tasksLoadError")}{" "}
          <button
            type="button"
            className="pill"
            onClick={() => router.refresh()}
          >
            {t("retry")}
          </button>
        </p>
      )}
      {open && !showList && !hasError && (
        <p className="target-unavailable" role="status">
          {emptyLabel}
        </p>
      )}
      {showList && (
        <div
          className="target-combobox-options"
          id={listId}
          role="listbox"
          aria-label={label}
        >
          {results.map((item, index) => (
            <button
              key={targetKey(item)}
              id={listId + "-" + index}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={targetKey(item) === value}
              data-active={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
            >
              <span>{item.emoji || "•"}</span>
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.scope === "global" ? "Global · " : ""}
                  {item.date}
                  {item.time ? " · " + item.time.slice(0, 5) : ""}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomDurationFields({
  offset,
  visible,
  locale,
}: {
  offset: number;
  visible: boolean;
  locale: Locale;
}) {
  const t = useTranslations("Workspace");
  const [parts, setParts] = useState(() => ({
    days: Math.floor(offset / 1440),
    hours: Math.floor((offset % 1440) / 60),
    minutes: offset % 60,
  }));
  const fields = [
    { name: "days", unit: "day", max: 7 },
    { name: "hours", unit: "hour", max: 23 },
    { name: "minutes", unit: "minute", max: 59 },
  ] as const;
  return (
    <fieldset className="custom-duration" hidden={!visible} disabled={!visible}>
      {fields.map(({ name, max }) => (
        <label key={name}>
          {t(name)}
          <input
            type="number"
            name={name}
            min={0}
            max={max}
            inputMode="numeric"
            defaultValue={parts[name]}
            onChange={(event) =>
              setParts({ ...parts, [name]: Number(event.target.value) })
            }
          />
        </label>
      ))}
      <p role="status">
        {t("customDurationSummary", {
          duration: new Intl.ListFormat(locale).format(
            fields
              .filter(({ name }) => parts[name] > 0)
              .map(({ name, unit }) =>
                new Intl.NumberFormat(locale, {
                  style: "unit",
                  unit,
                  unitDisplay: "long",
                }).format(parts[name]),
              ),
          ),
        })}
      </p>
    </fieldset>
  );
}

export function LinkedReminderForm({
  locale,
  timezone,
  enabled,
  reminder,
  targets,
  originalTarget,
  taskLoadError,
  ...callbacks
}: FormProps & {
  targets: ReminderTarget[];
  originalTarget?: ReminderTarget;
  taskLoadError: boolean;
}) {
  const t = useTranslations("Workspace");
  const initialTarget = reminder
    ? originalTarget
    : (targets.find((item) => item.type === "task") ?? targets[0]);
  const [type, setType] = useState<ReminderTarget["type"]>(
    initialTarget?.type ?? (reminder?.task_id ? "task" : "event"),
  );
  const [value, setValue] = useState(
    initialTarget ? targetKey(initialTarget) : "",
  );
  const targetOptions = useMemo(() => {
    const options = targets.filter((item) => item.type === type);
    if (
      originalTarget?.type === type &&
      !options.some((item) => targetKey(item) === targetKey(originalTarget))
    ) {
      return [originalTarget, ...options];
    }
    return options;
  }, [targets, originalTarget, type]);
  const target = targetOptions.find((item) => targetKey(item) === value);
  const offset = reminder?.minutes_before ?? 30;
  const [selectedTiming, setSelectedTiming] = useState<string | null>(
    reminder
      ? reminder.time_of_day
        ? "exact"
        : offsets.includes(offset)
          ? String(offset)
          : "custom"
      : null,
  );
  const timing = selectedTiming ?? (target && !target.time ? "exact" : "30");
  const [clockTime, setClockTime] = useState(
    reminder?.time_of_day?.slice(0, 5) ??
      (reminder
        ? formatInTimeZone(reminder.next_trigger_at, timezone, "HH:mm")
        : defaultTime),
  );

  return (
    <ScheduleForm
      {...callbacks}
      editing={Boolean(reminder)}
      disabled={!target}
      submitLabel={reminder ? t("save") : t("addLinkedReminder")}
      onSave={async (data) => {
        if (!target) return t("reminderTargetUnavailable");
        const recurrence = data.get("recurrence") as ReminderRecurrence;
        const minutesBefore =
          timing === "exact"
            ? null
            : timing === "custom"
              ? Number(data.get("days")) * 1440 +
                Number(data.get("hours")) * 60 +
                Number(data.get("minutes"))
              : Number(timing);
        if (
          timing === "custom" &&
          (!minutesBefore || minutesBefore > MAX_REMINDER_OFFSET)
        ) {
          return t("customDurationInvalid");
        }
        const first =
          minutesBefore === null
            ? exactTrigger(target.date, clockTime, timezone)
            : relativeTrigger(
                target.date,
                target.time,
                timezone,
                minutesBefore,
              );
        if (!first) return t("reminderInvalidTime");
        if (!nextLinkedTrigger(first, recurrence, timezone))
          return t("linkedReminderFutureTime");
        await saveReminder({
          id: reminder?.id,
          targetType: target.type,
          targetId: target.id,
          minutesBefore,
          timeOfDay: minutesBefore === null ? clockTime : null,
          timezone,
          recurrence,
          enabled,
        });
      }}
    >
      <label>
        {t("reminderItem")}
        <select
          value={type}
          onChange={(event) => {
            const next = event.target.value as ReminderTarget["type"];
            setType(next);
            const first =
              targets.find((item) => item.type === next) ??
              (originalTarget?.type === next ? originalTarget : undefined);
            setValue(first ? targetKey(first) : "");
          }}
        >
          <option value="task">{t("reminderTask")}</option>
          <option value="event">{t("reminderEvent")}</option>
        </select>
      </label>
      <TargetCombobox
        key={type}
        targets={targetOptions}
        value={value}
        onChange={setValue}
        type={type}
        hasError={type === "task" && taskLoadError}
      />
      <label>
        {t("reminderTiming")}
        <select
          value={timing}
          onChange={(event) => setSelectedTiming(event.target.value)}
        >
          <option value="exact">{t("reminderExactTime")}</option>
          <option value="0">{t("reminderAtStart")}</option>
          <option value="5">{t("reminderMinutesBefore", { count: 5 })}</option>
          <option value="15">
            {t("reminderMinutesBefore", { count: 15 })}
          </option>
          <option value="30">
            {t("reminderMinutesBefore", { count: 30 })}
          </option>
          <option value="60">{t("reminderHoursBefore", { count: 1 })}</option>
          <option value="120">{t("reminderHoursBefore", { count: 2 })}</option>
          <option value="1440">{t("reminderOneDay")}</option>
          <option value="custom">{t("customDuration")}</option>
        </select>
      </label>
      {reminder && !target && (
        <p className="muted">{t("reminderTargetUnavailable")}</p>
      )}
      <div className="reminder-exact-time" hidden={timing !== "exact"}>
        <label>
          {t("reminderTime")}
          <input
            type="time"
            value={clockTime}
            onChange={(event) => setClockTime(event.target.value)}
            required={timing === "exact"}
            disabled={timing !== "exact"}
          />
        </label>
        {target && (
          <p className="muted">
            {t("reminderExactDate", {
              date: new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeZone: timezone,
              }).format(zonedDate(target.date, timezone)),
            })}
          </p>
        )}
      </div>
      {timing !== "exact" && target && !target.time && (
        <p className="muted">{t("reminderNoStartTime")}</p>
      )}
      <CustomDurationFields
        offset={offset}
        visible={timing === "custom"}
        locale={locale}
      />
      <RepeatField value={reminder?.recurrence} />
    </ScheduleForm>
  );
}

export function ReminderEditor({
  reminder,
  target,
  targets,
  taskLoadError,
  locale,
  onClose,
  triggerRef,
}: {
  reminder: Reminder;
  target?: ReminderTarget;
  targets: ReminderTarget[];
  taskLoadError: boolean;
  locale: Locale;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("Workspace");
  const [pending, setPending] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const formProps = {
    locale,
    timezone: reminder.timezone,
    enabled: reminder.enabled,
    reminder,
    onSaved: onClose,
    onPendingChange: setPending,
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content reminder-editor-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            title.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus({ preventScroll: true });
          }}
        >
          <Dialog.Title ref={title} tabIndex={-1}>
            {t(
              reminder.kind === "alarm"
                ? "editAlarm"
                : reminder.kind === "daily_summary"
                  ? "editReminderSummary"
                  : "editLinkedReminder",
            )}
          </Dialog.Title>
          <Dialog.Description className="muted">
            {target ? target.title + " · " : ""}
            {t("reminderTimeZone", { timezone: reminder.timezone })}
          </Dialog.Description>
          {reminder.kind === "alarm" ? (
            <AlarmForm {...formProps} />
          ) : reminder.kind === "daily_summary" ? (
            <SummaryForm {...formProps} />
          ) : (
            <LinkedReminderForm
              {...formProps}
              targets={targets}
              originalTarget={target}
              taskLoadError={taskLoadError}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
