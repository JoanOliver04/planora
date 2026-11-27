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
  Timer,
} from "lucide-react";
import type { DemoCopy as Copy } from "./demo-copy";
import { demoIcons as icons } from "./demo-navigation";
import { finishDemoFocus, getDemoProgress, type DemoState } from "./demo-store";
import { demoViews, getMonthGridCellCount } from "./demo-views";

type Setter = React.Dispatch<React.SetStateAction<DemoState>>;

export function MonthDemo({
  state,
  copy,
  today,
}: {
  state: DemoState;
  copy: Copy;
  today: string;
}) {
  const start = new Date(`${today}T12:00:00`);
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
            {new Intl.DateTimeFormat(state.locale ?? "es", {
              month: "long",
              year: "numeric",
            }).format(start)}
          </h1>
        </div>
      </div>
      <div
        className="demo-month-grid surface"
        role="region"
        aria-label={copy.month}
        tabIndex={0}
      >
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

export function FocusDemo({
  state,
  setState,
  copy,
}: {
  state: DemoState;
  setState: Setter;
  copy: Copy;
}) {
  const { focus } = state;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (focus.deadline === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [focus.deadline]);
  const running = focus.deadline !== null;
  const remaining =
    focus.deadline === null
      ? focus.remaining
      : Math.min(
          focus.duration,
          Math.max(0, Math.ceil((focus.deadline - now) / 1000)),
        );
  const finished = focus.deadline === null && remaining === 0;
  const started = running || (remaining > 0 && remaining < focus.duration);
  const taskId = state.tasks.some((task) => task.id === focus.taskId)
    ? focus.taskId
    : "";
  function resetTimer(duration: number) {
    setState((current) => ({
      ...current,
      focus: {
        ...current.focus,
        duration,
        remaining: duration,
        deadline: null,
      },
    }));
  }
  return (
    <section>
      <h1 className="title">{copy.focus}</h1>
      <div className="surface demo-focus-card">
        <p className="demo-focus-intro">{copy.focusExample}</p>
        <div
          className="demo-focus-presets"
          role="group"
          aria-label={copy.focusTime}
        >
          {[15, 1500, 3000, 5400].map((seconds) => (
            <button
              className="pill"
              key={seconds}
              disabled={started}
              data-active={focus.duration === seconds}
              aria-pressed={focus.duration === seconds}
              onClick={() => resetTimer(seconds)}
            >
              {seconds === 15 ? copy.preview : `${seconds / 60} min`}
            </button>
          ))}
        </div>
        <div className="demo-timer" role="timer">
          {Math.floor(remaining / 60)
            .toString()
            .padStart(2, "0")}
          :{(remaining % 60).toString().padStart(2, "0")}
        </div>
        <label className="demo-focus-task">
          <span>{copy.selectTask}</span>
          <select
            disabled={started}
            value={taskId}
            onChange={(event) => {
              const selected = event.target.value;
              setState((current) => ({
                ...current,
                focus: { ...current.focus, taskId: selected },
              }));
            }}
          >
            <option value="">{copy.noTask}</option>
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
              const stamp = Date.now();
              setNow(stamp);
              setState((current) => {
                const timer = current.focus;
                if (timer.deadline !== null && timer.deadline <= stamp)
                  return finishDemoFocus(current, stamp);
                const seconds =
                  timer.deadline === null
                    ? timer.remaining || timer.duration
                    : Math.ceil((timer.deadline - stamp) / 1000);
                return {
                  ...current,
                  focus: {
                    ...timer,
                    remaining: seconds,
                    deadline:
                      timer.deadline === null ? stamp + seconds * 1000 : null,
                  },
                };
              });
            }}
          >
            {running ? <Pause size={18} /> : <Play size={18} />}
            {running
              ? copy.pause
              : finished
                ? copy.again
                : started
                  ? copy.resume
                  : copy.start}
          </button>
          <button className="pill" onClick={() => resetTimer(focus.duration)}>
            <RotateCcw size={17} />
            {copy.resetTimer}
          </button>
        </div>
        <div className="demo-focus-result" role="status">
          {finished && (
            <>
              <b>✓ {copy.finished}</b>
              <Link href={`/${state.locale ?? "es"}/demo/statistics`}>
                {copy.seeStats} →
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function focusTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!rest) return `${minutes} min`;
  return minutes ? `${minutes} min ${rest} s` : `${rest} s`;
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
  const { tasks, completed } = getDemoProgress(state, today);
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(new Date(`${today}T12:00:00`), index - 6);
    const day = format(date, "yyyy-MM-dd");
    const sessions = state.sessions.filter((session) => session.date === day);
    return {
      day,
      date,
      seconds: sessions.reduce((total, session) => total + session.seconds, 0),
      count: sessions.length,
    };
  });
  const latest = state.sessions.at(-1);
  const latestTask = state.tasks.find((task) => task.id === latest?.taskId);
  const total = week.reduce((sum, day) => sum + day.seconds, 0);
  const max = Math.max(1, ...week.map((day) => day.seconds));
  const dates = new Intl.DateTimeFormat(state.locale ?? "es", {
    weekday: "short",
    day: "numeric",
  });
  return (
    <section>
      <div className="eyebrow">{copy.period}</div>
      <h1 className="title">{copy.statistics}</h1>
      <div className="demo-stat-grid">
        <article className="surface">
          <span>{copy.focus}</span>
          <b>{focusTime(total)}</b>
        </article>
        <article className="surface">
          <span>{copy.completedSessions}</span>
          <b>{week.reduce((sum, day) => sum + day.count, 0)}</b>
        </article>
        <article className="surface">
          <span>{copy.todayRate}</span>
          <b>
            {completed} / {tasks.length}
          </b>
        </article>
      </div>
      {latest && (
        <article className="surface demo-session-receipt">
          <Timer size={21} aria-hidden />
          <div>
            <small>{copy.latestSession}</small>
            <strong>{latestTask?.title ?? copy.noTask}</strong>
          </div>
          <b>{focusTime(latest.seconds)}</b>
        </article>
      )}
      <section className="surface demo-focus-week">
        <h2>{copy.lastWeek}</h2>
        {week.map((day) => (
          <div key={day.day}>
            <time dateTime={day.day}>{dates.format(day.date)}</time>
            <progress
              aria-label={dates.format(day.date)}
              value={day.seconds}
              max={max}
            />
            <b>{focusTime(day.seconds)}</b>
          </div>
        ))}
      </section>
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
              prefetch={false}
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
