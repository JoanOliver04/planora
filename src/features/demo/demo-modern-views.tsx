"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { addDays, format, getDaysInMonth } from "date-fns";
import {
  BellRing,
  DatabaseBackup,
  Pause,
  Play,
  RotateCcw,
  Search,
} from "lucide-react";
import type { DemoCopy as Copy } from "./demo-copy";
import { demoIcons as icons } from "./demo-navigation";
import type { DemoState } from "./demo-store";
import { demoViews, getMonthGridCellCount } from "./demo-views";

type Setter = React.Dispatch<React.SetStateAction<DemoState>>;

export function MonthDemo({ state, copy }: { state: DemoState; copy: Copy }) {
  const start = new Date();
  start.setDate(1);
  const leading = (start.getDay() + 6) % 7;
  const cellCount = getMonthGridCellCount(leading, getDaysInMonth(start));
  const days = Array.from({ length: cellCount }, (_, index) =>
    addDays(start, index - leading),
  );
  return (
    <section>
      <div className="today-header">
        <div>
          <div className="eyebrow">{copy.thisMonth}</div>
          <h1 className="title">
            {new Intl.DateTimeFormat(undefined, {
              month: "long",
              year: "numeric",
            }).format(start)}
          </h1>
        </div>
      </div>
      <div className="demo-month-grid surface">
        {days.map((date) => {
          const value = format(date, "yyyy-MM-dd");
          const events = state.events.filter((item) => item.date === value);
          return (
            <div
              className="demo-month-day"
              data-outside={date.getMonth() !== start.getMonth()}
              key={value}
            >
              <b>{date.getDate()}</b>
              {events.map((event) => (
                <span className="event-card" key={event.id}>
                  {event.emoji} {event.title}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SearchDemo({ state, copy }: { state: DemoState; copy: Copy }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase();
  const results = [
    ...state.tasks.map((item) => ({ ...item, kind: copy.tasks })),
    ...state.events.map((item) => ({ ...item, kind: copy.events })),
  ].filter((item) => item.title.toLocaleLowerCase().includes(normalized));
  return (
    <section>
      <h1 className="title">{copy.search}</h1>
      <label className="surface demo-search">
        <Search size={20} aria-hidden />
        <span className="sr-only">{copy.searchPlaceholder}</span>
        <input
          autoFocus
          value={query}
          placeholder={copy.searchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="management-list" aria-live="polite">
        {results.map((item) => (
          <article className="task surface" key={`${item.kind}-${item.id}`}>
            <span>{item.emoji}</span>
            <div>
              <b>{item.title}</b>
              <div className="muted">{item.kind}</div>
            </div>
          </article>
        ))}
        {!results.length && <p className="muted">{copy.noResults}</p>}
      </div>
    </section>
  );
}

export function FocusDemo({ state, copy }: { state: DemoState; copy: Copy }) {
  const [duration, setDuration] = useState(25 * 60);
  const [remaining, setRemaining] = useState(duration);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [taskId, setTaskId] = useState(state.tasks[2]?.id ?? "");
  useEffect(() => {
    if (deadline === null) return;
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0) setDeadline(null);
    }, 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  const running = deadline !== null;
  const minutes = Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (remaining % 60).toString().padStart(2, "0");
  function selectDuration(secondsValue: number) {
    setDuration(secondsValue);
    setRemaining(secondsValue);
    setDeadline(null);
  }
  return (
    <section>
      <div className="eyebrow">{copy.focusIntro}</div>
      <h1 className="title">{copy.focus}</h1>
      <div className="surface demo-focus-card">
        <div className="demo-focus-presets" aria-label={copy.focusTime}>
          {[25, 50, 90].map((minutesValue) => (
            <button
              className="pill"
              data-active={duration === minutesValue * 60}
              key={minutesValue}
              onClick={() => selectDuration(minutesValue * 60)}
            >
              {minutesValue} min
            </button>
          ))}
        </div>
        <div className="demo-timer" aria-live="off">
          {minutes}:{seconds}
        </div>
        <label className="demo-focus-task">
          <span>{copy.selectTask}</span>
          <select
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
          >
            {state.tasks.map((task) => (
              <option value={task.id} key={task.id}>
                {task.emoji} {task.title}
              </option>
            ))}
          </select>
        </label>
        <div className="demo-focus-actions">
          <button
            className="primary"
            onClick={() => {
              if (deadline === null) {
                setDeadline(Date.now() + remaining * 1000);
              } else {
                setRemaining(
                  Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
                );
                setDeadline(null);
              }
            }}
          >
            {running ? <Pause size={18} /> : <Play size={18} />}
            {running
              ? copy.pause
              : remaining < duration
                ? copy.resume
                : copy.start}
          </button>
          <button
            className="pill"
            onClick={() => {
              setDeadline(null);
              setRemaining(duration);
            }}
          >
            <RotateCcw size={17} /> {copy.resetTimer}
          </button>
        </div>
      </div>
    </section>
  );
}

export function StatisticsDemo({
  state,
  copy,
  today,
}: {
  state: DemoState;
  copy: Copy;
  today: string;
}) {
  const active = state.tasks.filter((task) => !task.archived).length;
  const completedToday = state.completions.filter(
    (item) => item.date === today,
  ).length;
  const rate = active ? Math.round((completedToday / active) * 100) : 0;
  const week = Array.from({ length: 7 }, (_, index) => ({
    date: addDays(new Date(), index - 6),
    value: 20 + ((index * 17 + state.completions.length * 11) % 55),
  }));
  return (
    <section>
      <h1 className="title">{copy.statistics}</h1>
      <div className="demo-stat-grid">
        <article className="surface">
          <span>{copy.focusedMinutes}</span>
          <b>185</b>
        </article>
        <article className="surface">
          <span>{copy.completedSessions}</span>
          <b>7</b>
        </article>
        <article className="surface">
          <span>{copy.completionRate}</span>
          <b>{rate}%</b>
        </article>
      </div>
      <div className="surface demo-chart" aria-label={copy.focusedMinutes}>
        {week.map((day) => (
          <div key={day.date.toISOString()}>
            <span style={{ height: `${day.value}%` }} />
            <small>
              {new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(
                day.date,
              )}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}

export function RemindersDemo({ copy }: { copy: Copy }) {
  const [enabled, setEnabled] = useState([true, true, false]);
  const reminders = [copy.focusTime, copy.breakTime, copy.history];
  return (
    <section>
      <h1 className="title">{copy.reminders}</h1>
      <p className="muted">{copy.reminderHint}</p>
      <div className="management-list">
        {reminders.map((label, index) => (
          <article className="surface demo-reminder" key={label}>
            <BellRing size={20} />
            <div>
              <b>{label}</b>
              <div className="muted">
                {enabled[index] ? copy.enabled : copy.disabled}
              </div>
            </div>
            <button
              className="pill"
              aria-pressed={enabled[index]}
              onClick={() =>
                setEnabled((values) =>
                  values.map((value, item) =>
                    item === index ? !value : value,
                  ),
                )
              }
            >
              {enabled[index] ? copy.enabled : copy.disabled}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function TemplatesDemo({
  state,
  setState,
  copy,
}: {
  state: DemoState;
  setState: Setter;
  copy: Copy;
}) {
  const [message, setMessage] = useState("");
  const templates = [
    {
      emoji: "🌅",
      es: "Rutina de mañana",
      en: "Morning routine",
      titleEs: "Preparar el día con calma",
      titleEn: "Prepare for the day",
    },
    {
      emoji: "🧠",
      es: "Trabajo profundo",
      en: "Deep work",
      titleEs: "Bloque de concentración",
      titleEn: "Focus block",
    },
    {
      emoji: "🌙",
      es: "Cierre del día",
      en: "End of day",
      titleEs: "Revisar y desconectar",
      titleEn: "Review and disconnect",
    },
  ];
  const locale = state.locale ?? "es";
  return (
    <section>
      <h1 className="title">{copy.templates}</h1>
      <div className="grid-cards">
        {templates.map((template) => (
          <article className="surface resource-card" key={template.en}>
            <div className="resource-emoji">{template.emoji}</div>
            <h2>{locale === "es" ? template.es : template.en}</h2>
            <button
              className="primary"
              onClick={() => {
                setState((current) => ({
                  ...current,
                  tasks: [
                    ...current.tasks,
                    {
                      id: crypto.randomUUID(),
                      title:
                        locale === "es" ? template.titleEs : template.titleEn,
                      emoji: template.emoji,
                      categoryId: current.categories[0]?.id ?? "",
                      scheduleId: current.activeScheduleId,
                      dayPart: "anytime",
                      archived: false,
                    },
                  ],
                }));
                setMessage(copy.templateAdded);
              }}
            >
              {copy.useTemplate}
            </button>
          </article>
        ))}
      </div>
      <p className="muted" aria-live="polite">
        {message}
      </p>
    </section>
  );
}

export function DataDemo({
  state,
  copy,
  reset,
}: {
  state: DemoState;
  copy: Copy;
  reset: () => void;
}) {
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "planora-demo.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section>
      <h1 className="title">{copy.data}</h1>
      <div className="surface demo-settings">
        <p>{copy.dataHint}</p>
        <div className="demo-focus-actions">
          <button className="primary" onClick={download}>
            <DatabaseBackup size={18} /> {copy.exportDemo}
          </button>
          <button className="pill" onClick={reset}>
            <RotateCcw size={17} /> {copy.reset}
          </button>
        </div>
      </div>
    </section>
  );
}

export function MoreDemo({
  locale,
  copy,
}: {
  locale: "es" | "en";
  copy: Copy;
}) {
  const entries = demoViews.filter(
    (view) => !["today", "week", "tasks", "events", "more"].includes(view),
  );
  return (
    <section>
      <div className="eyebrow">{copy.exploreMore}</div>
      <h1 className="title">{copy.more}</h1>
      <div className="grid-cards">
        {entries.map((view) => {
          const Icon = icons[view];
          return (
            <Link
              className="surface demo-more-card"
              href={`/${locale}/demo/${view}`}
              key={view}
            >
              <Icon size={22} />
              <b>{copy[view]}</b>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
