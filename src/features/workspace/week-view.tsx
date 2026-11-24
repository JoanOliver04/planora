"use client";

import dynamic from "next/dynamic";
import { Plus, Timer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { buildFocusHref } from "@/features/focus/focus-deep-link";
import { useOptionalFocusSessionState } from "@/features/focus/focus-session-context";
import { isTaskFocusActionAvailable } from "@/features/focus/task-link";
import { Link } from "@/i18n/routing";
import { isCalendarDay, shiftCalendarDay } from "@/lib/dates/calendar-day";
import { calendarWeek, localDate } from "@/lib/dates/timezone";
import { agendaForDay } from "./calendar-agenda";
import {
  CalendarEventsStatus,
  type LoadCalendarEvents,
} from "./calendar-events-status";
import { formatTaskTime } from "./presentation";
import type { WorkspaceData } from "./types";

const TaskForm = dynamic(
  () => import("./task-form").then((module) => module.TaskForm),
  { loading: () => null },
);

export function WeekView({
  data,
  loadEventRange,
  reload,
}: {
  data: WorkspaceData;
  loadEventRange: LoadCalendarEvents;
  reload: () => Promise<void>;
}) {
  const t = useTranslations("Workspace");
  const locale = useLocale() === "es" ? "es-ES" : "en-GB";
  const today = localDate(data.profile.timezone);
  const requested = useSearchParams().get("date");
  const selected = isCalendarDay(requested) ? requested : today;
  const week = calendarWeek(
    selected,
    data.profile.week_starts_on === 0 ? 0 : 1,
  );
  const range = `${week.start}:${week.end}`;
  const eventsReady = range === data.eventRange;
  const [editor, setEditor] = useState<{
    day: string;
    trigger: HTMLButtonElement;
  } | null>(null);
  const focus = useOptionalFocusSessionState();
  const activeFocus =
    focus && ["running", "paused", "on_break"].includes(focus.status);
  const focusLabel = t(activeFocus ? "continueFocus" : "startFocus");
  const fullDate = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: "UTC",
  });
  const shortDate = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  });
  const narrowDay = new Intl.DateTimeFormat(locale, {
    weekday: "narrow",
    timeZone: "UTC",
  });
  const date = (day: string) => new Date(`${day}T12:00:00Z`);

  function selectDay(day: string) {
    if (!isCalendarDay(day)) return;
    const url = new URL(window.location.href);
    if (day === today) url.searchParams.delete("date");
    else url.searchParams.set("date", day);
    window.history.replaceState(null, "", url);
  }

  function renderDay(day: string) {
    const { entries } = agendaForDay(data, day);
    const label = fullDate.format(date(day));
    return (
      <article
        className="day surface"
        key={day}
        aria-label={label}
        data-today={day === today}
        data-selected={selected === day}
      >
        <div className="day-heading agenda-day-heading">
          <div>
            <span className="day-name">{weekday.format(date(day))}</span>
            <strong>{Number(day.slice(8))}</strong>
          </div>
          {day === today && <span className="today-badge">{t("today")}</span>}
          <button
            type="button"
            className="agenda-add"
            title={t("addTaskOn", { date: label })}
            aria-label={t("addTaskOn", { date: label })}
            onClick={(event) => {
              event.currentTarget.focus();
              setEditor({ day, trigger: event.currentTarget });
            }}
          >
            <Plus size={16} aria-hidden="true" /> <span>{t("add")}</span>
          </button>
        </div>
        <div className="day-agenda">
          {entries.map((entry) => {
            const { item, kind } = entry;
            const category = data.categories.find(
              (row) => row.id === item.category_id,
            );
            const timing =
              entry.kind === "event" && entry.item.all_day
                ? t("allDay")
                : (formatTaskTime(item.start_time, item.end_time) ??
                  t(
                    entry.kind === "task" && entry.item.day_part
                      ? entry.item.day_part
                      : "anytime",
                  ));
            const href = `/${kind === "event" ? "events" : "tasks"}?q=${encodeURIComponent(item.title)}#${kind}-${item.id}`;
            return (
              <div
                className={`mini-task agenda-entry ${kind === "event" ? "mini-event" : ""}`}
                key={`${kind}-${item.id}`}
                style={
                  {
                    "--accent":
                      category?.colour ??
                      (kind === "event" ? "var(--warning)" : "var(--primary)"),
                  } as React.CSSProperties
                }
              >
                <Link className="agenda-detail" href={href} prefetch={false}>
                  <small>{timing}</small>
                  <span>
                    {item.emoji && (
                      <span aria-hidden="true">{item.emoji} </span>
                    )}
                    {item.title}
                  </span>
                </Link>
                {entry.kind === "task" &&
                  isTaskFocusActionAvailable({
                    focusEnabled: entry.item.focus_enabled,
                    occurrenceDate: day,
                    today,
                  }) && (
                    <Link
                      className="agenda-focus"
                      href={
                        activeFocus
                          ? "/focus"
                          : buildFocusHref({ taskId: item.id, date: day })
                      }
                      prefetch={false}
                      aria-label={`${focusLabel}: ${item.title}`}
                    >
                      <Timer size={15} aria-hidden="true" /> {focusLabel}
                    </Link>
                  )}
              </div>
            );
          })}
          {eventsReady && !entries.length && (
            <p className="day-empty">{t("clearDay")}</p>
          )}
        </div>
      </article>
    );
  }

  return (
    <>
      <header className="topbar week-header">
        <div>
          <div className="eyebrow">{t("weeklyAgenda")}</div>
          <h1 className="title">{t("week")}</h1>
          <p className="header-context" aria-live="polite">
            {shortDate.formatRange(date(week.start), date(week.end))}
          </p>
        </div>
        {selected !== today && (
          <button className="pill" onClick={() => selectDay(today)}>
            {t("goToday")}
          </button>
        )}
      </header>
      <div className="week-controls surface">
        <button
          className="pill"
          type="button"
          onClick={() => selectDay(shiftCalendarDay(selected, -7))}
          aria-label={t("previousWeek")}
        >
          ← {t("previous")}
        </button>
        <label className="week-picker">
          <span>{t("chooseWeek")}</span>
          <input
            className="pill"
            type="date"
            value={selected}
            onChange={(event) => selectDay(event.target.value)}
          />
        </label>
        <button
          className="pill"
          type="button"
          onClick={() => selectDay(shiftCalendarDay(selected, 7))}
          aria-label={t("nextWeek")}
        >
          {t("next")} →
        </button>
      </div>
      {!eventsReady && (
        <CalendarEventsStatus
          key={range}
          start={week.start}
          end={week.end}
          load={loadEventRange}
        />
      )}
      <div className="week-mobile">
        <div className="day-selector" role="group" aria-label={t("selectDay")}>
          {week.days.map((day) => (
            <button
              type="button"
              className="day-tab"
              data-selected={selected === day}
              aria-pressed={selected === day}
              data-today={today === day}
              aria-current={day === today ? "date" : undefined}
              aria-label={fullDate.format(date(day))}
              key={day}
              onClick={() => selectDay(day)}
            >
              <span>{narrowDay.format(date(day))}</span>
              <strong>{day.slice(8)}</strong>
            </button>
          ))}
        </div>
        {renderDay(selected)}
      </div>
      <div className="week-grid week-desktop">{week.days.map(renderDay)}</div>
      {editor && (
        <TaskForm
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          schedules={data.schedules}
          categories={data.categories}
          focusPresets={data.focusPresets}
          timezone={data.profile.timezone}
          defaultScheduleId={data.profile.active_schedule_id ?? undefined}
          defaultStartDate={editor.day}
          trigger={editor.trigger}
          onSaved={reload}
        />
      )}
    </>
  );
}
