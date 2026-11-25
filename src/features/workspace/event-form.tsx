"use client";

import { saveEvent } from "@/app/actions/domain";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { categoriesForSchedule } from "./categories";
import type { Category, Event, Schedule } from "./types";

export function EventForm({
  editing,
  defaultDate,
  defaultScheduleId,
  schedules,
  categories,
  trigger,
  onClose,
  onSaved,
}: {
  editing?: Event;
  defaultDate?: string;
  defaultScheduleId?: string | null;
  schedules: Schedule[];
  categories: Category[];
  trigger: HTMLButtonElement;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations("Workspace");
  const [allDay, setAllDay] = useState(editing?.all_day ?? true);
  const [timeError, setTimeError] = useState(false);
  const [eventSchedule, setEventSchedule] = useState(
    editing?.schedule_id ?? defaultScheduleId ?? "",
  );
  const [pending, start] = useTransition();
  function submit(fd: FormData) {
    const startTime = allDay ? null : String(fd.get("startTime"));
    const endTime = allDay ? null : String(fd.get("endTime") || "") || null;
    if (startTime && endTime && startTime >= endTime) {
      setTimeError(true);
      return;
    }
    setTimeError(false);
    start(async () => {
      try {
        await saveEvent({
          id: editing?.id,
          title: String(fd.get("title")),
          description: String(fd.get("description") || "") || null,
          emoji: String(fd.get("emoji") || "") || null,
          categoryId: String(fd.get("categoryId") || "") || null,
          scheduleId: String(fd.get("scheduleId") || "") || null,
          eventDate: String(fd.get("eventDate")),
          allDay,
          startTime,
          endTime,
        });
        await onSaved();
        onClose();
        toast.success(t("success"));
      } catch {
        toast.error(t("error"));
      }
    });
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (trigger.isConnected) trigger.focus();
            else document.getElementById("main-content")?.focus();
          }}
          {...(editing ? {} : { "aria-describedby": undefined })}
        >
          <Dialog.Title>
            {t(editing ? "editEventTitle" : "addEventTitle")}
          </Dialog.Title>
          {editing && (
            <Dialog.Description className="muted">
              {t("editEventReminderHint")}
            </Dialog.Description>
          )}
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pending) submit(new FormData(event.currentTarget));
            }}
          >
            <label>
              {t("title")}
              <input
                name="title"
                required
                maxLength={140}
                defaultValue={editing?.title}
              />
            </label>
            <div className="form-row">
              <label>
                {t("emoji")}
                <input name="emoji" defaultValue={editing?.emoji ?? ""} />
              </label>
              <label>
                {t("date")}
                <input
                  name="eventDate"
                  type="date"
                  required
                  defaultValue={editing?.event_date ?? defaultDate}
                />
              </label>
            </div>
            <label>
              {t("schedule")}
              <select
                name="scheduleId"
                value={eventSchedule}
                onChange={(event) => setEventSchedule(event.target.value)}
              >
                <option value="">{t("global")}</option>
                {schedules.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("category")}
              <select
                name="categoryId"
                defaultValue={editing?.category_id ?? ""}
              >
                <option value="">—</option>
                {categoriesForSchedule(categories, eventSchedule).map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => {
                  setAllDay(e.target.checked);
                  setTimeError(false);
                }}
              />
              {t("allDay")}
            </label>
            <div className={allDay ? "hidden" : "form-row"}>
              <label>
                {t("startTime")}
                <input
                  name="startTime"
                  type="time"
                  required={!allDay}
                  disabled={allDay}
                  defaultValue={editing?.start_time?.slice(0, 5)}
                  onChange={() => setTimeError(false)}
                />
              </label>
              <label>
                {t("endTime")}
                <input
                  name="endTime"
                  type="time"
                  disabled={allDay}
                  defaultValue={editing?.end_time?.slice(0, 5)}
                  onChange={() => setTimeError(false)}
                />
              </label>
            </div>
            {timeError && <p role="alert">{t("invalidEventTimeRange")}</p>}
            <label>
              {t("description")}
              <textarea
                name="description"
                defaultValue={editing?.description ?? ""}
              />
            </label>
            <div className="dialog-actions">
              <Dialog.Close className="pill" type="button" disabled={pending}>
                {t("cancel")}
              </Dialog.Close>
              <button className="primary" disabled={pending}>
                {t("save")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
