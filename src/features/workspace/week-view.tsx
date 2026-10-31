"use client";

import { buildFocusHref } from "@/features/focus/focus-deep-link";
import { useOptionalFocusSessionState } from "@/features/focus/focus-session-context";
import { isTaskFocusActionAvailable } from "@/features/focus/task-link";
import { useRouter } from "@/i18n/routing";
import { localDate, localWeek, zonedDate } from "@/lib/dates/timezone";
import { isTaskExpectedOnDate } from "@/lib/recurrence";
import { addDays } from "date-fns";
import { Timer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Task, WorkspaceData } from "./types";
import { recurrenceFromJson } from "./types";

const adapter = (task: Task) => ({
  startDate: task.start_date,
  endDate: task.end_date,
  archivedAt: task.archived_at?.slice(0, 10),
  recurrence: recurrenceFromJson(task.recurrence_config, task.recurrence_type),
});

export function WeekView({
  data,
  loadEventRange,
}: {
  data: WorkspaceData;
  loadEventRange: (start: string, end: string) => Promise<boolean>;
}) {
  const t = useTranslations("Workspace"),
    locale = useLocale() as "es" | "en",
    searchParams = useSearchParams(),
    router = useRouter(),
    liveFocus = useOptionalFocusSessionState(),
    hasActiveFocus =
      Boolean(liveFocus) &&
      (liveFocus?.status === "running" ||
        liveFocus?.status === "paused" ||
        liveFocus?.status === "on_break"),
    focusActionLabel = hasActiveFocus ? t("continueFocus") : t("startFocus"),
    today = localDate(data.profile.timezone),
    requestedDate = searchParams.get("date"),
    initialDate =
      requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
        ? requestedDate
        : today,
    [viewDate, setViewDate] = useState(initialDate),
    week = localWeek(
      data.profile.timezone,
      zonedDate(viewDate, data.profile.timezone),
      data.profile.week_starts_on === 0 ? 0 : 1,
    ),
    currentWeek = localWeek(
      data.profile.timezone,
      new Date(),
      data.profile.week_starts_on === 0 ? 0 : 1,
    ),
    active = data.profile.active_schedule_id,
    [selectedDay, setSelectedDay] = useState(
      week.days.includes(initialDate) ? initialDate : week.start,
    );
  useEffect(() => {
    void loadEventRange(week.start, week.end);
  }, [loadEventRange, week.end, week.start]);
  const moveWeek = (amount: number) => {
    const next = localDate(
      data.profile.timezone,
      addDays(zonedDate(week.start, data.profile.timezone), amount * 7),
    );
    setViewDate(next);
    setSelectedDay(next);
  };
  const goToToday = () => {
    setViewDate(today);
    setSelectedDay(today);
  };
  const dayContent = (day: string) => {
    const tasks = data.tasks.filter(
        (task) =>
          (task.scope === "global" || task.schedule_id === active) &&
          !task.archived_at &&
          isTaskExpectedOnDate(adapter(task), day),
      ),
      events = data.events.filter(
        (event) =>
          event.event_date === day &&
          (!event.schedule_id || event.schedule_id === active),
      );
    return (
      <article className="day surface" data-today={day === today} key={day}>
        <div className="day-heading">
          <div>
            <span className="day-name">
              {new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
                weekday: "short",
                timeZone: "UTC",
              }).format(new Date(`${day}T12:00:00Z`))}
            </span>
            <strong>{day.slice(8)}</strong>
          </div>
          {day === today && <span className="today-badge">{t("today")}</span>}
        </div>
        <div className="day-agenda">
          {events.map((event) => {
            const category = data.categories.find(
              (item) => item.id === event.category_id,
            );
            return (
              <div
                className="mini-task mini-event"
                key={event.id}
                style={
                  {
                    "--accent": category?.colour ?? "var(--warning)",
                  } as React.CSSProperties
                }
              >
                <span>{event.emoji || "📅"}</span>
                <span>{event.title}</span>
              </div>
            );
          })}
          {tasks.map((task) => {
            const category = data.categories.find(
              (item) => item.id === task.category_id,
            );
            return (
              <div
                className="mini-task mini-task-with-focus"
                key={task.id}
                style={
                  {
                    "--accent": category?.colour ?? "var(--primary)",
                  } as React.CSSProperties
                }
              >
                <span>{task.emoji || "•"}</span>
                <span className="mini-task-title">{task.title}</span>
                {isTaskFocusActionAvailable({
                  focusEnabled: task.focus_enabled,
                  occurrenceDate: day,
                  today,
                }) ? (
                  <button
                    type="button"
                    className="icon-button mini-task-focus"
                    onClick={() =>
                      router.push(
                        hasActiveFocus
                          ? "/focus"
                          : buildFocusHref({
                              taskId: task.id,
                              date: day,
                            }),
                      )
                    }
                    aria-label={`${focusActionLabel}: ${task.title}`}
                    title={focusActionLabel}
                  >
                    <Timer size={15} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            );
          })}
          {!events.length && !tasks.length && (
            <p className="day-empty">{t("clearDay")}</p>
          )}
        </div>
      </article>
    );
  };
  return (
    <>
      <header className="topbar week-header">
        <div>
          <div className="eyebrow">{t("weeklyAgenda")}</div>
          <h1 className="title">{t("week")}</h1>
          <p className="header-context">
            {new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${week.start}T12:00:00Z`))}
            {" – "}
            {new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${week.end}T12:00:00Z`))}
          </p>
        </div>
        {(week.start !== currentWeek.start || selectedDay !== today) && (
          <button className="pill" onClick={goToToday}>
            {t("goToday")}
          </button>
        )}
      </header>
      <div className="week-controls surface">
        <button
          className="pill"
          type="button"
          onClick={() => moveWeek(-1)}
          aria-label={t("previousWeek")}
        >
          ← {t("previous")}
        </button>
        <label className="week-picker">
          <span>{t("chooseWeek")}</span>
          <input
            className="pill"
            type="date"
            value={viewDate}
            onChange={(event) => {
              if (!event.target.value) return;
              setViewDate(event.target.value);
              setSelectedDay(event.target.value);
            }}
          />
        </label>
        <button
          className="pill"
          type="button"
          onClick={() => moveWeek(1)}
          aria-label={t("nextWeek")}
        >
          {t("next")} →
        </button>
      </div>
      <div className="week-mobile">
        <div className="day-selector" aria-label={t("selectDay")}>
          {week.days.map((day) => (
            <button
              className="day-tab"
              data-selected={selectedDay === day}
              data-today={today === day}
              key={day}
              onClick={() => setSelectedDay(day)}
            >
              <span>
                {new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
                  weekday: "narrow",
                  timeZone: "UTC",
                }).format(new Date(`${day}T12:00:00Z`))}
              </span>
              <strong>{day.slice(8)}</strong>
            </button>
          ))}
        </div>
        {dayContent(selectedDay)}
      </div>
      <div className="week-grid week-desktop">{week.days.map(dayContent)}</div>
    </>
  );
}
