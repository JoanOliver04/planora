"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { addDays, format } from "date-fns";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Logo } from "@/components/navigation";
import {
  createDemoState,
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

export function DemoWorkspace({
  initialState,
  locale,
  view,
}: {
  initialState: DemoState;
  locale: "es" | "en";
  view: DemoView;
}) {
  const copy = labels[locale],
    [state, setState] = useState(initialState),
    [restored, setRestored] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      setState(
        parseDemoState(
          localStorage.getItem(DEMO_STORAGE_KEY),
          Date.now(),
          locale,
        ) ?? initialState,
      );
      setRestored(true);
    });
  }, [initialState, locale]);
  useEffect(() => {
    if (restored) localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  }, [restored, state]);
  useEffect(() => {
    const remaining = state.expiresAt - Date.now();
    const timer = window.setTimeout(
      () => setState(createDemoState(new Date(), locale)),
      Math.max(0, Math.min(remaining, 2_147_483_647)),
    );
    return () => window.clearTimeout(timer);
  }, [locale, state.expiresAt]);
  const today = format(new Date(), "yyyy-MM-dd"),
    activeTasks = state.tasks.filter(
      (task) => task.scheduleId === state.activeScheduleId && !task.archived,
    ),
    completedToday = state.completions.filter(
      (item) => item.date === today,
    ).length;
  function reset() {
    const fresh = createDemoState(new Date(), locale);
    setState(fresh);
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(fresh));
  }
  return (
    <div className="app-shell demo-shell">
      <a className="skip-link" href="#main-content">
        {copy.skip}
      </a>
      <aside className="sidebar demo-sidebar">
        <Logo />
        <DemoNav locale={locale} view={view} />
        <div className="demo-badge">
          <b>{copy.demo}</b>
          <span>{copy.demoHint}</span>
        </div>
      </aside>
      <main className="main" id="main-content" tabIndex={-1}>
        <header className="demo-topbar surface">
          <div>
            <b>{copy.demo}</b>
            <span className="muted">{copy.demoHint}</span>
          </div>
          <Link className="primary" href={`/${locale}/login`}>
            {copy.create}
          </Link>
        </header>
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
        {view === "week" && <WeekDemo state={state} copy={copy} />}
        {view === "month" && <MonthDemo state={state} copy={copy} />}
        {view === "search" && <SearchDemo state={state} copy={copy} />}
        {view === "tasks" && (
          <TasksDemo state={state} setState={setState} copy={copy} />
        )}
        {view === "focus" && <FocusDemo state={state} copy={copy} />}
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
            <div className="surface demo-settings">
              <p>{copy.isolated}</p>
              <p className="muted">{copy.protected}</p>
              <button className="pill" onClick={reset}>
                <RotateCcw size={17} /> {copy.reset}
              </button>
            </div>
          </section>
        )}
        {view === "data" && (
          <DataDemo state={state} copy={copy} reset={reset} />
        )}
        {view === "more" && <MoreDemo locale={locale} copy={copy} />}
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
  return (
    <>
      <header className="today-header">
        <div>
          <div className="eyebrow">{copy.sample}</div>
          <h1 className="title">{copy.today}</h1>
        </div>
      </header>
      <section className="progress-card surface">
        <div>
          <div className="eyebrow">{copy.progress}</div>
          <h2>
            {completed} / {activeTasks.length}
          </h2>
        </div>
      </section>
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

function WeekDemo({ state, copy }: { state: DemoState; copy: Copy }) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(new Date(), index)),
    [],
  );
  return (
    <section>
      <h1 className="title">{copy.week}</h1>
      <div className="week-grid">
        {days.map((date) => {
          const value = format(date, "yyyy-MM-dd");
          return (
            <div className="day surface" key={value}>
              <b>
                {new Intl.DateTimeFormat(undefined, {
                  weekday: "short",
                  day: "numeric",
                }).format(date)}
              </b>
              {state.tasks
                .filter(
                  (task) =>
                    !task.archived &&
                    task.scheduleId === state.activeScheduleId,
                )
                .slice(0, 3)
                .map((task) => (
                  <div className="mini-task" key={task.id}>
                    {task.emoji} {task.title}
                  </div>
                ))}
              {state.events
                .filter((event) => event.date === value)
                .map((event) => (
                  <div className="event-card" key={event.id}>
                    {event.emoji} {event.title}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TasksDemo({
  state,
  setState,
  copy,
}: {
  state: DemoState;
  setState: Setter;
  copy: Copy;
}) {
  const [title, setTitle] = useState("");
  function addTask(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setState((current) => ({
      ...current,
      tasks: [
        ...current.tasks,
        {
          id: crypto.randomUUID(),
          title: title.trim(),
          emoji: "✨",
          categoryId: current.categories[0]?.id ?? "",
          scheduleId: current.activeScheduleId,
          dayPart: "anytime",
          archived: false,
        },
      ],
    }));
    setTitle("");
  }
  return (
    <section>
      <h1 className="title">{copy.tasks}</h1>
      <DemoForm
        label={copy.addTask}
        value={title}
        setValue={setTitle}
        onSubmit={addTask}
      />
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
