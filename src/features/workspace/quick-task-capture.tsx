"use client";

import { saveTask } from "@/app/actions/domain";
import { localDate } from "@/lib/dates/timezone";
import { formatRecurrenceDescription } from "@/lib/recurrence";
import {
  parseQuickTask,
  type QuickTaskValues,
} from "@/lib/workspace/quick-task";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import { TaskForm } from "./task-form";
import type { WorkspaceData } from "./types";

export function QuickTaskCapture({
  data,
  onSaved,
}: {
  data: WorkspaceData;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations("QuickAdd");
  const workspace = useTranslations("Workspace");
  const locale = useLocale() as "es" | "en";
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const focusAfterSave = useRef(false);
  const [text, setText] = useState("");
  const [detect, setDetect] = useState(true);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState("");
  const [advanced, setAdvanced] = useState<QuickTaskValues | null>(null);
  const [pending, startTransition] = useTransition();
  const today = localDate(data.profile.timezone);
  const draft = parseQuickTask(text, today, detect);
  const schedule = data.schedules.find(
    (item) => item.id === data.profile.active_schedule_id && !item.is_archived,
  );
  const issue = text.trim() && draft.issue ? t(draft.issue) : "";
  const message = error || issue;
  const values = draft.values;
  const date = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${values.startDate}T12:00:00Z`));
  const plan = [
    date,
    formatRecurrenceDescription(values.recurrence, locale),
    values.timing.mode === "specific_time"
      ? values.timing.startTime
      : workspace("anytime"),
  ].join(" · ");

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!pending && focusAfterSave.current) {
      input.current?.focus();
      focusAfterSave.current = false;
    }
  }, [pending]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || draft.issue || !schedule) return;
    if (!navigator.onLine) {
      setOnline(false);
      return;
    }
    // A form left open overnight must show the new date before saving.
    if (localDate(data.profile.timezone) !== today) {
      setError(t("dayChanged"));
      return;
    }
    submitting.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await saveTask({
          ...values,
          scope: "schedule",
          scheduleId: schedule.id,
          categoryId: null,
          endDate: null,
        });
        if (!result.ok) {
          setError(t("saveError"));
          return;
        }
        setText("");
        setDetect(true);
        focusAfterSave.current = true;
        toast.success(t("created"));
        try {
          await onSaved();
        } catch {
          setError(t("refreshError"));
        }
      } catch {
        setError(t("saveError"));
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <section className="quick-task surface" aria-label={t("label")}>
      <form onSubmit={submit} aria-busy={pending}>
        <div className="quick-task-head">
          <label htmlFor={id} className="quick-task-label">
            {t("label")}
          </label>
          <button
            className="pill"
            type="button"
            disabled={
              pending || Boolean(draft.issue && draft.issue !== "emptyTitle")
            }
            onClick={() => setAdvanced(values)}
          >
            {t("more")}
          </button>
        </div>
        <div className="quick-task-entry">
          <input
            id={id}
            ref={input}
            name="quickTask"
            value={text}
            maxLength={280}
            placeholder={t("placeholder")}
            autoComplete="off"
            readOnly={pending}
            aria-describedby={
              text.trim() || message
                ? `${id}-hint${message ? ` ${id}-error` : ""}`
                : undefined
            }
            aria-invalid={Boolean(issue)}
            onChange={(event) => {
              setText(event.target.value);
              setError("");
            }}
          />
          <button
            className="primary"
            type="submit"
            aria-label={pending ? t("saving") : t("create")}
            disabled={pending || !online || Boolean(draft.issue) || !schedule}
          >
            <Plus size={18} aria-hidden="true" />
            <span className="quick-task-submit-label">
              {pending ? t("saving") : t("create")}
            </span>
          </button>
        </div>
        {(text.trim() || message) && (
          <p id={`${id}-hint`} className="muted quick-task-hint">
            {t("hint")}
          </p>
        )}
        {text.trim() && !draft.issue && (
          <div className="quick-task-preview">
            <strong>{values.title}</strong>
            <p role="status">{plan}</p>
            <small className="muted">
              {t("schedule", { name: schedule?.name ?? t("noSchedule") })}
            </small>
          </div>
        )}
        {message && (
          <p id={`${id}-error`} className="quick-task-error" role="alert">
            {message}
          </p>
        )}
        {!online && (
          <p className="quick-task-error" role="status">
            {t("offline")}
          </p>
        )}
        {!schedule && <p className="quick-task-error">{t("noSchedule")}</p>}
        {text.trim() && (
          <div className="quick-task-options">
            <label className="check-row">
              <input
                type="checkbox"
                checked={detect}
                disabled={pending}
                onChange={(event) => {
                  setDetect(event.target.checked);
                  setError("");
                }}
              />
              {t("detect")}
            </label>
          </div>
        )}
      </form>
      {advanced && (
        <TaskForm
          open
          onOpenChange={(open) => {
            if (!open) setAdvanced(null);
          }}
          schedules={data.schedules}
          categories={data.categories}
          focusPresets={data.focusPresets ?? []}
          timezone={data.profile.timezone}
          defaultDraft={advanced}
          defaultScheduleId={schedule?.id}
          onSaved={async () => {
            setText("");
            setDetect(true);
            try {
              await onSaved();
            } catch {
              setError(t("refreshError"));
            }
          }}
        />
      )}
    </section>
  );
}
