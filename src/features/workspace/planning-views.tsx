"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, addMonths } from "date-fns";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Search,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { localDate } from "@/lib/dates/timezone";
import { isTaskExpectedOnDate } from "@/lib/recurrence";
import { normalizeTaskSearch } from "@/lib/workspace/task-search";
import { recurrenceFromJson, type WorkspaceData } from "./types";

const iso = (date: Date) => date.toISOString().slice(0, 10);
const taskAdapter = (task: WorkspaceData["tasks"][number]) => ({
  startDate: task.start_date,
  endDate: task.end_date,
  archivedAt: task.archived_at?.slice(0, 10),
  recurrence: recurrenceFromJson(task.recurrence_config, task.recurrence_type),
});

export function MonthView({
  data,
  loadEventRange,
}: {
  data: WorkspaceData;
  loadEventRange: (start: string, end: string) => Promise<boolean>;
}) {
  const t = useTranslations("Planning"),
    locale = useLocale(),
    today = localDate(data.profile.timezone),
    [anchor, setAnchor] = useState(`${today.slice(0, 7)}-01`),
    first = new Date(`${anchor}T12:00:00Z`),
    weekStartsOn = data.profile.week_starts_on === 0 ? 0 : 1,
    offset = (first.getUTCDay() - weekStartsOn + 7) % 7,
    gridStart = addDays(first, -offset),
    days = Array.from({ length: 42 }, (_, index) =>
      iso(addDays(gridStart, index)),
    ),
    activeSchedule = data.profile.active_schedule_id,
    rangeStart = days[0],
    rangeEnd = days[days.length - 1];
  useEffect(() => {
    void loadEventRange(rangeStart, rangeEnd);
  }, [loadEventRange, rangeEnd, rangeStart]);
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
  function move(delta: number) {
    setAnchor(iso(addMonths(first, delta)).slice(0, 7) + "-01");
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
        <Link className="pill" href="/week">
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
        <strong>{formatter.format(first)}</strong>
        <button
          className="pill"
          onClick={() => setAnchor(`${today.slice(0, 7)}-01`)}
        >
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
      <div
        className="month-grid"
        role="grid"
        aria-label={formatter.format(first)}
      >
        {days.slice(0, 7).map((day) => (
          <div className="month-weekday" key={`head-${day}`}>
            {weekdayFormatter.format(new Date(`${day}T12:00:00Z`))}
          </div>
        ))}
        {days.map((day) => {
          const tasks = data.tasks.filter(
            (task) =>
              !task.archived_at &&
              task.is_active &&
              (task.scope === "global" ||
                task.schedule_id === activeSchedule) &&
              isTaskExpectedOnDate(taskAdapter(task), day),
          );
          const events = data.events.filter(
            (event) =>
              event.event_date === day &&
              (!event.schedule_id || event.schedule_id === activeSchedule),
          );
          return (
            <Link
              className="month-day surface"
              data-outside={day.slice(0, 7) !== anchor.slice(0, 7)}
              data-today={day === today}
              key={day}
              role="gridcell"
              href={`/week?date=${day}`}
              aria-label={t("openDay", { date: day })}
            >
              <time dateTime={day}>{Number(day.slice(8))}</time>
              <div className="month-items">
                {tasks.slice(0, 3).map((task) => (
                  <span className="month-item" key={task.id}>
                    {task.emoji} {task.title}
                  </span>
                ))}
                {events.slice(0, 2).map((event) => (
                  <span className="month-item month-event" key={event.id}>
                    <CalendarDays size={12} /> {event.title}
                  </span>
                ))}
                {tasks.length + events.length > 5 && (
                  <small>+{tasks.length + events.length - 5}</small>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function GlobalSearchView({ data }: { data: WorkspaceData }) {
  const t = useTranslations("Planning"),
    [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = normalizeTaskSearch(query);
    if (q.length < 2) return [];
    const matches = (value: string | null | undefined) =>
      normalizeTaskSearch(value ?? "").includes(q);
    return [
      ...data.tasks
        .filter((item) => matches(`${item.title} ${item.description ?? ""}`))
        .map((item) => ({
          id: `task-${item.id}`,
          type: t("task"),
          title: item.title,
          meta: item.description,
          href: `/tasks?q=${encodeURIComponent(item.title)}#task-${item.id}`,
        })),
      ...data.events
        .filter((item) => matches(`${item.title} ${item.description ?? ""}`))
        .map((item) => ({
          id: `event-${item.id}`,
          type: t("event"),
          title: item.title,
          meta: item.event_date,
          href: `/events?q=${encodeURIComponent(item.title)}#event-${item.id}`,
        })),
      ...data.categories
        .filter((item) => matches(item.name))
        .map((item) => ({
          id: `category-${item.id}`,
          type: t("category"),
          title: item.name,
          meta: null,
          href: `/categories#category-${item.id}`,
        })),
      ...data.schedules
        .filter((item) => matches(`${item.name} ${item.description ?? ""}`))
        .map((item) => ({
          id: `schedule-${item.id}`,
          type: t("schedule"),
          title: item.name,
          meta: item.description,
          href: `/schedules#schedule-${item.id}`,
        })),
    ].slice(0, 50);
  }, [data, query, t]);
  return (
    <section className="global-search-page" aria-labelledby="search-title">
      <header className="topbar">
        <div>
          <div className="eyebrow">{t("searchEyebrow")}</div>
          <h1 className="title" id="search-title">
            {t("searchTitle")}
          </h1>
        </div>
      </header>
      <label className="global-search-input surface">
        <Search size={21} />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchTitle")}
        />
      </label>
      {query.trim().length < 2 ? (
        <div className="empty surface">
          <Search size={28} />
          <h2>{t("searchHintTitle")}</h2>
          <p>{t("searchHint")}</p>
        </div>
      ) : results.length ? (
        <div className="search-results" aria-live="polite">
          {results.map((result) => (
            <Link
              className="search-result surface"
              href={result.href}
              key={result.id}
            >
              <span className="search-result-type">{result.type}</span>
              <strong>{result.title}</strong>
              {result.meta && <small>{result.meta}</small>}
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty surface">
          <h2>{t("noResults")}</h2>
          <p>{t("noResultsHint")}</p>
        </div>
      )}
    </section>
  );
}

export function DailySummaryView({ data }: { data: WorkspaceData }) {
  const t = useTranslations("DailySummary"),
    locale = useLocale(),
    today = localDate(data.profile.timezone),
    activeSchedule = data.profile.active_schedule_id,
    tasks = data.tasks.filter(
      (task) =>
        !task.archived_at &&
        task.is_active &&
        (task.scope === "global" || task.schedule_id === activeSchedule) &&
        isTaskExpectedOnDate(taskAdapter(task), today),
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
                    <small>{task.start_time.slice(0, 5)}</small>
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
                <strong>{task.title}</strong>
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
