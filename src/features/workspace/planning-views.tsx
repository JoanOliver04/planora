"use client";

import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { localDate } from "@/lib/dates/timezone";
import { isCalendarDay, shiftCalendarDay } from "@/lib/dates/calendar-day";
import { agendaForDay } from "./calendar-agenda";
import {
  WorkspaceRangeStatus,
  type LoadWorkspaceRange,
} from "./workspace-range-status";
import { isWithinWeeklyTarget, tasksForDay } from "./daily-occurrences";
import { getMonthEventRange } from "./workspace-data";
import { formatTaskTime } from "./presentation";
import type { WorkspaceData } from "./types";

export function MonthView({
  data,
  loadEventRange,
}: {
  data: WorkspaceData;
  loadEventRange: LoadWorkspaceRange;
}) {
  const t = useTranslations("Planning"),
    locale = useLocale(),
    today = localDate(data.profile.timezone),
    requested = `${useSearchParams().get("month")}-01`,
    anchor = isCalendarDay(requested) ? requested : `${today.slice(0, 7)}-01`,
    first = new Date(`${anchor}T12:00:00Z`),
    weekStartsOn = data.profile.week_starts_on === 0 ? 0 : 1,
    { start: rangeStart, end: rangeEnd } = getMonthEventRange(
      anchor,
      weekStartsOn,
    ),
    range = `${rangeStart}:${rangeEnd}`,
    eventsReady = data.eventRange === range,
    days = Array.from({ length: 42 }, (_, index) =>
      shiftCalendarDay(rangeStart, index),
    );
  const formatter = new Intl.DateTimeFormat(
    locale === "es" ? "es-ES" : "en-GB",
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  );
  const weekdayFormatter = new Intl.DateTimeFormat(
    locale === "es" ? "es-ES" : "en-GB",
    {
      weekday: "narrow",
      timeZone: "UTC",
    },
  );
  const fullDate = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: "UTC",
  });
  function selectMonth(month: string) {
    const url = new URL(window.location.href);
    if (month === today.slice(0, 7)) url.searchParams.delete("month");
    else url.searchParams.set("month", month);
    window.history.replaceState(null, "", url);
  }
  function move(delta: number) {
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + delta);
    selectMonth(next.toISOString().slice(0, 7));
  }
  return (
    <section className="month-page" aria-labelledby="month-title">
      <header className="topbar month-header">
        <div>
          <div className="eyebrow">{t("eyebrow")}</div>
          <h1 className="title" id="month-title">
            {t("title")}
          </h1>
        </div>
        <Link
          className="pill"
          href={
            anchor.slice(0, 7) === today.slice(0, 7)
              ? "/week"
              : `/week?date=${anchor}`
          }
        >
          {t("weekView")}
        </Link>
      </header>
      <div className="month-toolbar surface">
        <button
          className="icon-button"
          onClick={() => move(-1)}
          aria-label={t("previousMonth")}
        >
          <ChevronLeft size={20} />
        </button>
        <strong aria-live="polite">{formatter.format(first)}</strong>
        <button className="pill" onClick={() => selectMonth(today.slice(0, 7))}>
          {t("today")}
        </button>
        <button
          className="icon-button"
          onClick={() => move(1)}
          aria-label={t("nextMonth")}
        >
          <ChevronRight size={20} />
        </button>
      </div>
      {!eventsReady && (
        <WorkspaceRangeStatus
          resource="events"
          key={range}
          start={rangeStart}
          end={rangeEnd}
          load={loadEventRange}
        />
      )}
      <div
        className="month-grid"
        role="group"
        aria-label={formatter.format(first)}
      >
        {days.slice(0, 7).map((day) => (
          <div className="month-weekday" key={`head-${day}`}>
            {weekdayFormatter.format(new Date(`${day}T12:00:00Z`))}
          </div>
        ))}
        {days.map((day) => {
          const { entries, taskCount, eventCount } = agendaForDay(data, day);
          const openDay = t("openDay", {
            date: fullDate.format(new Date(`${day}T12:00:00Z`)),
          });
          return (
            <Link
              className="month-day surface"
              data-outside={day.slice(0, 7) !== anchor.slice(0, 7)}
              data-today={day === today}
              key={day}
              href={`/week?date=${day}`}
              prefetch={false}
              aria-current={day === today ? "date" : undefined}
              aria-label={
                eventsReady
                  ? `${openDay}. ${t("dayContents", { tasks: taskCount, events: eventCount })}`
                  : openDay
              }
            >
              <time dateTime={day}>{Number(day.slice(8))}</time>
              <div className="month-items">
                {entries.slice(0, 5).map(({ kind, item }) => (
                  <span
                    className={
                      kind === "event" ? "month-item month-event" : "month-item"
                    }
                    key={`${kind}-${item.id}`}
                  >
                    {item.emoji} {item.title}
                  </span>
                ))}
                {eventsReady && entries.length > 5 && (
                  <small>+{entries.length - 5}</small>
                )}
              </div>
              {eventsReady && entries.length > 0 && (
                <span className="month-mobile-count" aria-hidden="true">
                  {entries.length}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function DailySummaryView({ data }: { data: WorkspaceData }) {
  const t = useTranslations("DailySummary"),
    locale = useLocale(),
    today = localDate(data.profile.timezone),
    activeSchedule = data.profile.active_schedule_id,
    tasks = tasksForDay(data.tasks, today, activeSchedule).filter((task) =>
      isWithinWeeklyTarget(
        task,
        today,
        data.completions,
        data.profile.week_starts_on === 0 ? 0 : 1,
      ),
    ),
    completedIds = new Set(
      data.completions
        .filter((completion) => completion.occurrence_date === today)
        .map((completion) => completion.task_id),
    ),
    completed = tasks.filter((task) => completedIds.has(task.id)),
    pending = tasks.filter((task) => !completedIds.has(task.id)),
    events = data.events.filter(
      (event) =>
        event.event_date === today &&
        (!event.schedule_id || event.schedule_id === activeSchedule),
    ),
    progress = tasks.length
      ? Math.round((completed.length / tasks.length) * 100)
      : 0,
    formattedDate = new Intl.DateTimeFormat(
      locale === "es" ? "es-ES" : "en-GB",
      { dateStyle: "full", timeZone: "UTC" },
    ).format(new Date(`${today}T12:00:00Z`));

  return (
    <section
      className="daily-summary-page"
      aria-labelledby="daily-summary-title"
    >
      <header className="topbar">
        <div>
          <div className="eyebrow">{t("eyebrow")}</div>
          <h1 className="title" id="daily-summary-title">
            {t("title")}
          </h1>
          <p className="muted">{formattedDate}</p>
        </div>
        <Link className="pill" href="/today">
          {t("openToday")}
        </Link>
      </header>
      <section
        className="summary-progress surface"
        aria-label={t("progressLabel")}
      >
        <div>
          <strong>{progress}%</strong>
          <span>
            {t("completedCount", {
              done: completed.length,
              total: tasks.length,
            })}
          </span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      </section>
      <div className="summary-columns">
        <section className="surface summary-section">
          <h2>
            <Circle size={19} /> {t("pending", { count: pending.length })}
          </h2>
          {pending.length ? (
            pending.map((task) => (
              <article className="summary-item" key={task.id}>
                <span>{task.emoji}</span>
                <div>
                  <strong>{task.title}</strong>
                  {task.start_time && (
                    <small>
                      {formatTaskTime(
                        task.start_time,
                        task.time_mode === "time_range" ? task.end_time : null,
                      )}
                    </small>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="muted">{t("nothingPending")}</p>
          )}
        </section>
        <section className="surface summary-section">
          <h2>
            <CheckCircle2 size={19} />{" "}
            {t("completed", { count: completed.length })}
          </h2>
          {completed.length ? (
            completed.map((task) => (
              <article className="summary-item" key={task.id}>
                <span>{task.emoji}</span>
                <div>
                  <strong>{task.title}</strong>
                  {task.start_time && (
                    <small>
                      {formatTaskTime(
                        task.start_time,
                        task.time_mode === "time_range" ? task.end_time : null,
                      )}
                    </small>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="muted">{t("nothingCompleted")}</p>
          )}
        </section>
        <section className="surface summary-section">
          <h2>
            <CalendarDays size={19} /> {t("events", { count: events.length })}
          </h2>
          {events.length ? (
            events.map((event) => (
              <article className="summary-item" key={event.id}>
                <span>{event.emoji}</span>
                <div>
                  <strong>{event.title}</strong>
                  <small>
                    {event.all_day
                      ? t("allDay")
                      : event.start_time?.slice(0, 5)}
                  </small>
                </div>
              </article>
            ))
          ) : (
            <p className="muted">{t("noEvents")}</p>
          )}
        </section>
      </div>
    </section>
  );
}
