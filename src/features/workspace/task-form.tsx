"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { saveTask } from "@/app/actions/domain";
import type { Category, Schedule, Task } from "./types";
import { recurrenceFromJson } from "./types";
import { localDate } from "@/lib/dates/timezone";
import { toast } from "sonner";
import { categoriesForSchedule } from "./categories";

export function TaskForm({
  open,
  onOpenChange,
  schedules,
  categories,
  timezone,
  task,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schedules: Schedule[];
  categories: Category[];
  timezone: string;
  task?: Task | null;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations("Workspace"),
    locale = useLocale(),
    existing = task
      ? recurrenceFromJson(task.recurrence_config, task.recurrence_type)
      : null,
    [recurrence, setRecurrence] = useState(existing?.type ?? "once"),
    [timing, setTiming] = useState(task?.time_mode ?? "anytime"),
    [scheduleId, setScheduleId] = useState(
      task?.schedule_id ??
        schedules.find((item) => !item.is_archived)?.id ??
        "",
    ),
    [pending, startTransition] = useTransition();

  const weekdays = existing?.type === "weekdays" ? existing.weekdays : [];
  const weekdayLabels =
    locale === "es"
      ? ["L", "M", "X", "J", "V", "S", "D"]
      : ["M", "T", "W", "T", "F", "S", "S"];
  const summary = useMemo(
    () => `${t(recurrence)} · ${t(timing)}`,
    [recurrence, timing, t],
  );
  function submit(fd: FormData) {
    const type = String(fd.get("recurrence"));
    const recurrenceValue: Record<string, unknown> = { type };
    if (type === "weekdays")
      recurrenceValue.weekdays = fd.getAll("weekdays").map(Number);
    if (type === "times_per_week")
      recurrenceValue.target = Number(fd.get("target"));
    if (type === "interval") {
      recurrenceValue.every = Number(fd.get("every"));
      recurrenceValue.unit = String(fd.get("unit"));
    }
    const mode = String(fd.get("timing"));
    const timingValue: Record<string, unknown> = { mode };
    if (mode === "day_part") timingValue.dayPart = String(fd.get("dayPart"));
    if (mode === "specific_time")
      timingValue.startTime = String(fd.get("startTime"));
    if (mode === "time_range") {
      timingValue.startTime = String(fd.get("startTime"));
      timingValue.endTime = String(fd.get("endTime"));
    }
    const input = {
      title: String(fd.get("title")),
      description: String(fd.get("description") || "") || null,
      emoji: String(fd.get("emoji") || "") || null,
      scheduleId: String(fd.get("scheduleId")),
      categoryId: String(fd.get("categoryId") || "") || null,
      recurrence: recurrenceValue,
      startDate: String(fd.get("startDate") || "") || localDate(timezone),
      endDate: String(fd.get("endDate") || "") || null,
      timing: timingValue,
    };
    startTransition(async () => {
      try {
        await saveTask(input, task?.id);
        await onSaved();
        toast.success(t("success"));
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("error"));
      }
    });
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title>
            {task ? t("edit") : t("add")} · {t("title")}
          </Dialog.Title>
          <Dialog.Description className="muted">{summary}</Dialog.Description>
          <form action={submit} className="form-grid" key={task?.id ?? "new"}>
            <label>
              {t("title")}
              <input
                name="title"
                required
                maxLength={140}
                defaultValue={task?.title}
              />
            </label>
            <div className="form-row">
              <label>
                {t("emoji")}
                <input
                  name="emoji"
                  maxLength={16}
                  defaultValue={task?.emoji ?? ""}
                />
              </label>
              <label>
                {t("schedule")}
                <select
                  name="scheduleId"
                  value={scheduleId}
                  onChange={(event) => setScheduleId(event.target.value)}
                >
                  {schedules
                    .filter((s) => !s.is_archived)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.emoji} {s.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label>
              {t("category")}
              <select name="categoryId" defaultValue={task?.category_id ?? ""}>
                <option value="">—</option>
                {categoriesForSchedule(categories, scheduleId).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("description")}
              <textarea
                name="description"
                maxLength={2000}
                defaultValue={task?.description ?? ""}
              />
            </label>
            <label>
              {t("recurrence")}
              <select
                name="recurrence"
                value={recurrence}
                onChange={(e) =>
                  setRecurrence(e.target.value as typeof recurrence)
                }
              >
                <option value="once">{t("once")}</option>
                <option value="daily">{t("daily")}</option>
                <option value="weekdays">{t("weekdays")}</option>
                <option value="times_per_week">{t("timesPerWeek")}</option>
                <option value="interval">{t("interval")}</option>
              </select>
            </label>
            {recurrence === "weekdays" && (
              <fieldset>
                <legend>{t("weekdays")}</legend>
                <div className="weekday-grid">
                  {[1, 2, 3, 4, 5, 6, 0].map((d, i) => (
                    <label className="chip" key={d}>
                      <input
                        type="checkbox"
                        name="weekdays"
                        value={d}
                        defaultChecked={weekdays.includes(d)}
                      />
                      {weekdayLabels[i]}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {recurrence === "times_per_week" && (
              <label>
                {t("timesPerWeek")}
                <input
                  name="target"
                  type="number"
                  min="1"
                  max="7"
                  defaultValue={
                    existing?.type === "times_per_week" ? existing.target : 3
                  }
                />
              </label>
            )}
            {recurrence === "interval" && (
              <div className="form-row">
                <label>
                  {t("every")}
                  <input
                    name="every"
                    type="number"
                    min="1"
                    max="365"
                    defaultValue={
                      existing?.type === "interval" ? existing.every : 2
                    }
                  />
                </label>
                <label>
                  {t("interval")}
                  <select
                    name="unit"
                    defaultValue={
                      existing?.type === "interval" ? existing.unit : "day"
                    }
                  >
                    <option value="day">{t("days")}</option>
                    <option value="week">{t("weeks")}</option>
                    <option value="month">{t("months")}</option>
                  </select>
                </label>
              </div>
            )}
            <label>
              {t("timing")}
              <select
                name="timing"
                value={timing}
                onChange={(e) => setTiming(e.target.value as typeof timing)}
              >
                <option value="anytime">{t("anytime")}</option>
                <option value="day_part">{t("dayPart")}</option>
                <option value="specific_time">{t("specificTime")}</option>
                <option value="time_range">{t("timeRange")}</option>
              </select>
            </label>
            {timing === "day_part" && (
              <label>
                {t("dayPart")}
                <select
                  name="dayPart"
                  defaultValue={task?.day_part ?? "morning"}
                >
                  <option value="morning">{t("morning")}</option>
                  <option value="afternoon">{t("afternoon")}</option>
                  <option value="night">{t("night")}</option>
                </select>
              </label>
            )}
            {(timing === "specific_time" || timing === "time_range") && (
              <label>
                {t("startTime")}
                <input
                  name="startTime"
                  type="time"
                  required
                  defaultValue={task?.start_time?.slice(0, 5) ?? "09:00"}
                />
              </label>
            )}
            {timing === "time_range" && (
              <label>
                {t("endTime")}
                <input
                  name="endTime"
                  type="time"
                  required
                  defaultValue={task?.end_time?.slice(0, 5) ?? "10:00"}
                />
              </label>
            )}
            <div className="form-row">
              <label>
                {t("startDate")}
                <input
                  name="startDate"
                  type="date"
                  defaultValue={task?.start_date ?? ""}
                />
              </label>
              <label>
                {t("endDate")}
                <input
                  name="endDate"
                  type="date"
                  defaultValue={task?.end_date ?? ""}
                />
              </label>
            </div>
            <div className="dialog-actions">
              <Dialog.Close className="pill" type="button">
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
