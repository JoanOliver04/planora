"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { addDays, format } from "date-fns";
import {
  ArrowUpRight,
  CalendarDays,
  Plus,
  RotateCcw,
  Timer,
  Trash2,
} from "lucide-react";
import { PublicHomeLogo } from "@/components/navigation";
import { AuthLink } from "@/components/auth-link";
import { AppAbout } from "@/components/app-about";
import { useTheme } from "@/components/theme-provider";
import {
  addDemoTask,
  createDemoState,
  finishDemoFocus,
  getDemoAgenda,
  getDemoProgress,
  DEMO_TTL,
  DEMO_STORAGE_KEY,
  parseDemoState,
  toggleDemoCompletion,
  type DemoState,
} from "./demo-store";
import { demoViews, type DemoView } from "./demo-views";
import { labels, type DemoCopy as Copy } from "./demo-copy";
import { demoIcons as icons } from "./demo-navigation";
const MonthDemo = dynamic(() =>
  import("./demo-modern-views").then((module) => module.MonthDemo),
);
const SearchDemo = dynamic(() =>
  import("./demo-modern-views").then((module) => module.SearchDemo),
);
const FocusDemo = dynamic(() =>
  import("./demo-modern-views").then((module) => module.FocusDemo),
);
const StatisticsDemo = dynamic(() =>
  import("./demo-modern-views").then((module) => module.StatisticsDemo),
);
const RemindersDemo = dynamic(() =>
  import("./demo-modern-views").then((module) => module.RemindersDemo),
);
const TemplatesDemo = dynamic(() =>
  import("./demo-modern-views").then((module) => module.TemplatesDemo),
);
const DataDemo = dynamic(() =>
  import("./demo-modern-views").then((module) => module.DataDemo),
);
const MoreDemo = dynamic(() =>
  import("./demo-modern-views").then((module) => module.MoreDemo),
);

// Only used by browser effects when persistent storage is unavailable.
let volatileDemo: string | null = null;

export function DemoWorkspace({
  initialState,
  locale,
  view,
}: {
  initialState: DemoState;
  locale: "es" | "en";
  view: DemoView;
}) {
  const { theme, setTheme } = useTheme();
  const copy = labels[locale],
    [state, setState] = useState(initialState),
    [restored, setRestored] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      let saved: string | null = volatileDemo;
      try {
        saved ??= localStorage.getItem(DEMO_STORAGE_KEY);
      } catch {
        // A browser that blocks storage can still run the demo in memory.
      }
      setState(
        parseDemoState(saved, Date.now(), locale) ??
          createDemoState(new Date(), locale),
      );
      setRestored(true);
    });
  }, [initialState, locale]);
  useEffect(() => {
    if (!restored) return;
    const serialized = JSON.stringify(state);
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, serialized);
      volatileDemo = null;
    } catch {
      volatileDemo = serialized;
    }
  }, [restored, state]);
  useEffect(() => {
    const remaining = state.expiresAt - Date.now();
    const timer = window.setTimeout(
      () => setState(createDemoState(new Date(), locale)),
      Math.max(0, Math.min(remaining, 2_147_483_647)),
    );
    return () => window.clearTimeout(timer);
  }, [locale, state.expiresAt]);
  useEffect(() => {
    if (!restored || state.focus.deadline === null) return;
    const timer = window.setTimeout(
      () => {
        setState((current) => finishDemoFocus(current, Date.now()));
      },
      Math.max(0, state.focus.deadline - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [restored, state.focus.deadline]);
  // The first browser render must use the same calendar date as the cached
  // server HTML. Switch to the device's date only after hydration.
  const today = restored
      ? format(new Date(), "yyyy-MM-dd")
      : new Date(initialState.expiresAt - DEMO_TTL).toISOString().slice(0, 10),
    { tasks: activeTasks, completed: completedToday } = getDemoProgress(
      state,
      today,
    );
  function reset() {
    const fresh = createDemoState(new Date(), locale);
    setState(fresh);
    setTheme("light");
  }
  return (
    <div className="app-shell demo-shell">
      <a className="skip-link" href="#main-content">
        {copy.skip}
      </a>
      <aside className="sidebar demo-sidebar">
        <PublicHomeLogo locale={locale} />
        <DemoNav locale={locale} view={view} />
        <div className="demo-badge">
          <b>{copy.demo}</b>
          <span>{copy.demoHint}</span>
        </div>
      </aside>
      <main
        className="main"
        id="main-content"
        tabIndex={-1}
        aria-busy={!restored}
      >
        <header className="demo-topbar surface">
          <div className="demo-topbar-intro">
            <PublicHomeLogo locale={locale} variant="compact" />
            <div className="demo-topbar-copy">
              <b>{copy.demo}</b>
              <span className="muted">
                {restored ? copy.demoHint : copy.loadingDemo}
              </span>
            </div>
          </div>
          <AuthLink className="primary" href={`/${locale}/login`}>
            {copy.create}
          </AuthLink>
        </header>
        <fieldset
          className="demo-controls"
          disabled={!restored}
          aria-label={copy.demo}
        >
          {view === "today" && (
            <TodayDemo
              state={state}
              setState={setState}
              today={today}
              copy={copy}
              activeTasks={activeTasks}
              completed={completedToday}
            />
          )}
          {view === "week" && (
            <WeekDemo state={state} copy={copy} today={today} />
          )}
          {view === "month" && (
            <MonthDemo state={state} copy={copy} today={today} />
          )}
          {view === "search" && <SearchDemo state={state} copy={copy} />}
          {view === "tasks" && (
            <TasksDemo
              state={state}
              setState={setState}
              copy={copy}
              today={today}
            />
          )}
          {view === "focus" && (
            <FocusDemo state={state} setState={setState} copy={copy} />
          )}
          {view === "events" && (
            <EventsDemo state={state} setState={setState} copy={copy} />
          )}
          {view === "history" && <HistoryDemo state={state} copy={copy} />}
          {view === "statistics" && (
            <StatisticsDemo state={state} copy={copy} today={today} />
          )}
          {view === "reminders" && <RemindersDemo copy={copy} />}
          {view === "schedules" && (
            <SimpleResourceDemo
              kind="schedules"
              state={state}
              setState={setState}
              copy={copy}
            />
          )}
          {view === "categories" && (
            <SimpleResourceDemo
              kind="categories"
              state={state}
              setState={setState}
              copy={copy}
            />
          )}
          {view === "templates" && (
            <TemplatesDemo state={state} setState={setState} copy={copy} />
          )}
          {view === "settings" && (
            <section>
              <h1 className="title">{copy.settings}</h1>
              <div className="surface settings-row demo-theme-setting">
                <label htmlFor="demo-theme">{copy.theme}</label>
                <select
                  id="demo-theme"
                  className="pill"
                  value={theme}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (
                      next === "light" ||
                      next === "dark" ||
                      next === "system"
                    )
                      setTheme(next);
                  }}
                >
                  <option value="light">{copy.light}</option>
                  <option value="dark">{copy.dark}</option>
                  <option value="system">{copy.system}</option>
                </select>
              </div>
              <div className="surface demo-settings">
                <p>{copy.isolated}</p>
                <p className="muted">{copy.protected}</p>
                <button className="pill" onClick={reset}>
                  <RotateCcw size={17} /> {copy.reset}
                </button>
              </div>
              <AppAbout locale={locale} source="demo-settings" />
            </section>
          )}
          {view === "data" && (
            <DataDemo state={state} copy={copy} reset={reset} />
          )}
          {view === "more" && <MoreDemo locale={locale} copy={copy} />}
        </fieldset>
      </main>
      <nav className="mobile-nav">
        <DemoNav locale={locale} view={view} mobile />
      </nav>
    </div>
  );
}

function DemoNav({
  locale,
  view,
  mobile = false,
}: {
  locale: "es" | "en";
  view: DemoView;
  mobile?: boolean;
}) {
  const copy = labels[locale],
    entries = demoViews.filter((item) =>
      mobile
        ? ["today", "week", "tasks", "events", "more"].includes(item)
        : item !== "more",
    );
  const content = (
    <>
      {entries.map((item) => {
        const Icon = icons[item];
        return (
          <Link
            key={item}
            className="nav-link"
            data-active={view === item}
            aria-current={view === item ? "page" : undefined}
            href={`/${locale}/demo/${item}`}
            prefetch={false}
          >
            <Icon size={20} />
            <span>{copy[item]}</span>
          </Link>
        );
      })}
    </>
  );
  return mobile ? (
    <div className="demo-mobile-links">{content}</div>
  ) : (
    <nav className="side-links">{content}</nav>
  );
}

type Setter = React.Dispatch<React.SetStateAction<DemoState>>;

function TodayDemo({
  state,
  setState,
  today,
  copy,
  activeTasks,
  completed,
}: {
  state: DemoState;
  setState: Setter;
  today: string;
  copy: Copy;
  activeTasks: DemoState["tasks"];
  completed: number;
}) {
  const locale = state.locale ?? "es";
  const events = state.events.filter((event) => event.date === today);
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${today}T12:00:00`));
  const schedule = state.schedules.find(
    (item) => item.id === state.activeScheduleId,
  );
  return (
    <>
      <header className="today-header">
        <div>
          <div className="eyebrow">{dateLabel}</div>
          <h1 className="title">{copy.today}</h1>
        </div>
      </header>
      <section className="demo-day-summary">
        <div>
          <span>
            {schedule?.emoji} {schedule?.name}
          </span>
          <h2>{copy.dayPlan}</h2>
          <p aria-live="polite">
            <strong>
              {completed} / {activeTasks.length}
            </strong>{" "}
            {copy.progressUnit}
          </p>
          <progress
            aria-label={copy.progress}
            value={completed}
            max={activeTasks.length || 1}
          />
        </div>
        <Link
          className="demo-day-focus"
          prefetch={false}
          href={`/${locale}/demo/focus`}
        >
          <Timer aria-hidden size={22} />
          <b>{copy.next}</b>
          <span>{copy.tryFocus}</span>
          <ArrowUpRight aria-hidden size={17} />
        </Link>
      </section>
      <TaskCapture copy={copy} setState={setState} today={today} />
      {events.length > 0 && (
        <section className="demo-day-events" aria-label={copy.nextEvent}>
          <h2>
            <CalendarDays size={16} aria-hidden />
            {copy.nextEvent}
          </h2>
          {events.map((event) => (
            <p key={event.id}>
              <time>{event.time}</time>
              {event.title}
            </p>
          ))}
        </section>
      )}
      {(["morning", "afternoon", "night", "anytime"] as const).map((part) => {
        const tasks = activeTasks.filter((task) => task.dayPart === part);
        if (!tasks.length) return null;
        return (
          <section className="section" key={part}>
            <div className="section-head">
              <h2>{copy[part]}</h2>
            </div>
            <div className="task-list">
              {tasks.map((task) => {
                const done = state.completions.some(
                  (item) => item.taskId === task.id && item.date === today,
                );
                return (
                  <article
                    className="task surface"
                    data-completed={done}
                    key={task.id}
                  >
                    <button
                      className="task-check"
                      data-done={done}
                      aria-pressed={done}
                      aria-label={`${done ? copy.completed : copy.mark}: ${task.title}`}
                      onClick={() =>
                        setState((current) =>
                          toggleDemoCompletion(current, task.id, today),
                        )
                      }
                    >
                      {done ? "✓" : ""}
                    </button>
                    <div className="task-body">
                      <div className="task-title" data-done={done}>
                        {task.emoji} {task.title}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

function WeekDemo({
  state,
  copy,
  today,
}: {
  state: DemoState;
  copy: Copy;
  today: string;
}) {
  const [offset, setOffset] = useState(0);
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(new Date(`${today}T12:00:00`), offset + index),
  );
  const dates = new Intl.DateTimeFormat(state.locale ?? "es", {
    month: "short",
    day: "numeric",
  });
  return (
    <section>
      <h1 className="title">{copy.week}</h1>
      <div className="demo-week-tools">
        <b aria-live="polite">
          {dates.format(days[0])} – {dates.format(days[6])}
        </b>
        <div>
          <button
            className="pill"
            aria-label={copy.prevWeek}
            onClick={() => setOffset(offset - 7)}
          >
            ←
          </button>
          <button
            className="pill"
            disabled={!offset}
            onClick={() => setOffset(0)}
          >
            {copy.today}
          </button>
          <button
            className="pill"
            aria-label={copy.nextWeek}
            onClick={() => setOffset(offset + 7)}
          >
            →
          </button>
        </div>
      </div>
      <div
        className="week-grid"
        role="region"
        aria-label={copy.week}
        tabIndex={0}
      >
        {days.map((date) => {
          const value = format(date, "yyyy-MM-dd");
          return (
            <div
              className="day surface"
              data-today={value === today}
              key={value}
            >
              <b>
                {new Intl.DateTimeFormat(state.locale ?? "es", {
                  weekday: "short",
                  day: "numeric",
                }).format(date)}
              </b>
              {getDemoAgenda(state, value).map((task) => (
                <div className="mini-task" key={task.id}>
                  {task.emoji} {task.title}
                </div>
              ))}
              {state.events
                .filter((event) => event.date === value)
                .map((event) => (
                  <div className="event-card" key={event.id}>
                    {event.time} {event.emoji} {event.title}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TaskCapture({
  copy,
  setState,
  today,
}: {
  copy: Copy;
  setState: Setter;
  today: string;
}) {
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState("");
  return (
    <>
      <form
        className="surface demo-form demo-capture"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = title.trim();
          if (!trimmed) return;
          const id = crypto.randomUUID();
          setState((current) => addDemoTask(current, trimmed, id, today));
          setTitle("");
          setSaved(trimmed);
        }}
      >
        <input
          required
          maxLength={500}
          value={title}
          aria-label={copy.addTask}
          placeholder={copy.capture}
          onChange={(event) => {
            setTitle(event.target.value);
            setSaved("");
          }}
        />
        <button className="primary">
          <Plus size={17} />
          {copy.quick}
        </button>
      </form>
      <p className="demo-saved" role="status">
        {saved && `${copy.saved} · ${saved}`}
      </p>
    </>
  );
}

function TasksDemo({
  state,
  setState,
  copy,
  today,
}: {
  state: DemoState;
  setState: Setter;
  copy: Copy;
  today: string;
}) {
  return (
    <section>
      <h1 className="title">{copy.tasks}</h1>
      <TaskCapture copy={copy} setState={setState} today={today} />
      <div className="management-list">
        {state.tasks.map((task) => (
          <article className="task surface" key={task.id}>
            <span>{task.emoji}</span>
            <div>{task.title}</div>
            <button
              className="icon-button"
              aria-label={`${copy.delete}: ${task.title}`}
              onClick={() =>
                setState((current) => ({
                  ...current,
                  tasks: current.tasks.filter((item) => item.id !== task.id),
                }))
              }
            >
              <Trash2 size={17} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function EventsDemo({
  state,
  setState,
  copy,
}: {
  state: DemoState;
  setState: Setter;
  copy: Copy;
}) {
  const [title, setTitle] = useState(""),
    [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  return (
    <section>
      <h1 className="title">{copy.events}</h1>
      <form
        className="surface demo-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) return;
          setState((current) => ({
            ...current,
            events: [
              ...current.events,
              {
                id: crypto.randomUUID(),
                title: title.trim(),
                emoji: "📌",
                date,
              },
            ],
          }));
          setTitle("");
        }}
      >
        <input
          aria-label={copy.title}
          value={title}
          placeholder={copy.title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          aria-label={copy.date}
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <button className="primary">
          <Plus size={17} /> {copy.addEvent}
        </button>
      </form>
      <div className="management-list">
        {state.events.map((item) => (
          <article className="task surface" key={item.id}>
            <span>{item.emoji}</span>
            <div>
              <b>{item.title}</b>
              <div className="muted">
                {item.date} {item.time}
              </div>
            </div>
            <button
              className="icon-button"
              aria-label={`${copy.delete}: ${item.title}`}
              onClick={() =>
                setState((current) => ({
                  ...current,
                  events: current.events.filter(
                    (event) => event.id !== item.id,
                  ),
                }))
              }
            >
              <Trash2 size={17} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function HistoryDemo({ state, copy }: { state: DemoState; copy: Copy }) {
  return (
    <section>
      <h1 className="title">{copy.history}</h1>
      <div className="management-list">
        {state.completions.map((item) => {
          const task = state.tasks.find((entry) => entry.id === item.taskId);
          return (
            <article
              className="task surface"
              key={`${item.taskId}-${item.date}`}
            >
              <span>✓</span>
              <div>
                <b>{task?.title ?? copy.completed}</b>
                <div className="muted">{item.date}</div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SimpleResourceDemo({
  kind,
  state,
  setState,
  copy,
}: {
  kind: "schedules" | "categories";
  state: DemoState;
  setState: Setter;
  copy: Copy;
}) {
  const [name, setName] = useState(""),
    items = state[kind];
  return (
    <section>
      <h1 className="title">{copy[kind]}</h1>
      <DemoForm
        label={kind === "schedules" ? copy.addSchedule : copy.addCategory}
        value={name}
        setValue={setName}
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          const id = crypto.randomUUID();
          setState((current) =>
            kind === "schedules"
              ? {
                  ...current,
                  schedules: [
                    ...current.schedules,
                    { id, name: name.trim(), emoji: "🗓️" },
                  ],
                }
              : {
                  ...current,
                  categories: [
                    ...current.categories,
                    { id, name: name.trim(), emoji: "✨", color: "#0f766e" },
                  ],
                },
          );
          setName("");
        }}
      />
      <div className="grid-cards">
        {items.map((item) => (
          <article className="surface resource-card" key={item.id}>
            <div className="resource-emoji">{item.emoji}</div>
            <h2>{item.name}</h2>
            {kind === "schedules" && (
              <button
                className="pill"
                disabled={state.activeScheduleId === item.id}
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    activeScheduleId: item.id,
                  }))
                }
              >
                {state.activeScheduleId === item.id ? copy.active : copy.use}
              </button>
            )}
            {(kind === "categories" || state.activeScheduleId !== item.id) && (
              <button
                className="icon-button"
                aria-label={`${copy.delete}: ${item.name}`}
                onClick={() =>
                  setState((current) =>
                    kind === "schedules"
                      ? {
                          ...current,
                          schedules: current.schedules.filter(
                            (entry) => entry.id !== item.id,
                          ),
                        }
                      : {
                          ...current,
                          categories: current.categories.filter(
                            (entry) => entry.id !== item.id,
                          ),
                        },
                  )
                }
              >
                <Trash2 size={17} />
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function DemoForm({
  label,
  value,
  setValue,
  onSubmit,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <form className="surface demo-form" onSubmit={onSubmit}>
      <input
        aria-label={label}
        value={value}
        placeholder={label}
        onChange={(event) => setValue(event.target.value)}
      />
      <button className="primary">
        <Plus size={17} /> {label}
      </button>
    </form>
  );
}
