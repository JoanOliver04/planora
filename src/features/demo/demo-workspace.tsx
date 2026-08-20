"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addDays, format } from "date-fns";
import {
  BarChart3,
  BellRing,
  CalendarRange,
  CalendarDays,
  Clock3,
  DatabaseBackup,
  FolderKanban,
  History,
  LibraryBig,
  LayoutList,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Tags,
  Timer,
  Trash2,
} from "lucide-react";
import { Logo } from "@/components/navigation";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";
import {
  createDemoState,
  DEMO_STORAGE_KEY,
  parseDemoState,
  toggleDemoCompletion,
  type DemoState,
} from "./demo-store";

type View =
  | "today"
  | "week"
  | "month"
  | "search"
  | "tasks"
  | "focus"
  | "events"
  | "history"
  | "statistics"
  | "reminders"
  | "schedules"
  | "categories"
  | "templates"
  | "settings"
  | "data"
  | "more";

const icons = {
  today: Clock3,
  week: CalendarDays,
  month: CalendarRange,
  search: Search,
  tasks: LayoutList,
  focus: Timer,
  events: CalendarDays,
  history: History,
  statistics: BarChart3,
  reminders: BellRing,
  schedules: FolderKanban,
  categories: Tags,
  templates: LibraryBig,
  settings: Settings,
  data: DatabaseBackup,
  more: MoreHorizontal,
};
const labels = {
  es: {
    today: "Hoy",
    week: "Semana",
    month: "Mes",
    search: "Buscar",
    tasks: "Tareas",
    focus: "Enfoque",
    events: "Eventos",
    history: "Historial",
    statistics: "Estadísticas",
    reminders: "Recordatorios",
    schedules: "Horarios",
    categories: "Categorías",
    templates: "Plantillas",
    settings: "Ajustes",
    data: "Datos",
    more: "Más",
    demo: "Modo demo",
    demoHint: "Datos privados de prueba · se restablecen en 24 h",
    reset: "Restablecer demo",
    create: "Crear mi cuenta",
    addTask: "Añadir tarea",
    addEvent: "Añadir evento",
    addSchedule: "Añadir horario",
    addCategory: "Añadir categoría",
    title: "Título",
    name: "Nombre",
    date: "Fecha",
    empty: "No hay elementos todavía",
    completed: "Completada",
    mark: "Marcar como completada",
    active: "Activo",
    isolated:
      "Esta demo funciona solo en tu navegador y nunca modifica cuentas reales.",
    protected:
      "Las acciones de cuenta y cualquier operación destructiva real están desactivadas.",
    morning: "Mañana",
    afternoon: "Tarde",
    night: "Noche",
    anytime: "En cualquier momento",
    progress: "Progreso de hoy",
    sample: "Explora, añade, completa y elimina elementos libremente.",
    focusIntro: "Prueba una sesión guiada vinculada a una tarea.",
    start: "Iniciar",
    pause: "Pausar",
    resume: "Continuar",
    resetTimer: "Reiniciar",
    focusTime: "Enfoque profundo",
    breakTime: "Descanso",
    selectTask: "Tarea vinculada",
    searchPlaceholder: "Buscar tareas y eventos",
    noResults: "No hay resultados para esta búsqueda.",
    thisMonth: "Vista general del mes",
    completedSessions: "Sesiones completadas",
    focusedMinutes: "Minutos de enfoque",
    completionRate: "Tareas completadas",
    reminderHint:
      "Los recordatorios de la demo no envían notificaciones reales.",
    enabled: "Activado",
    disabled: "Desactivado",
    useTemplate: "Usar plantilla",
    templateAdded: "Plantilla añadida a tus tareas",
    dataHint: "Tus cambios de la demo se guardan solo en este navegador.",
    exportDemo: "Descargar datos de la demo",
    exploreMore: "Explora todas las herramientas de Planora",
  },
  en: {
    today: "Today",
    week: "Week",
    month: "Month",
    search: "Search",
    tasks: "Tasks",
    focus: "Focus",
    events: "Events",
    history: "History",
    statistics: "Statistics",
    reminders: "Reminders",
    schedules: "Schedules",
    categories: "Categories",
    templates: "Templates",
    settings: "Settings",
    data: "Data",
    more: "More",
    demo: "Demo mode",
    demoHint: "Private sample data · resets in 24 hours",
    reset: "Reset demo",
    create: "Create my account",
    addTask: "Add task",
    addEvent: "Add event",
    addSchedule: "Add schedule",
    addCategory: "Add category",
    title: "Title",
    name: "Name",
    date: "Date",
    empty: "Nothing here yet",
    completed: "Completed",
    mark: "Mark as complete",
    active: "Active",
    isolated:
      "This demo runs only in your browser and never changes real accounts.",
    protected:
      "Account actions and every real destructive operation are disabled.",
    morning: "Morning",
    afternoon: "Afternoon",
    night: "Night",
    anytime: "Anytime",
    progress: "Today's progress",
    sample: "Explore, add, complete and remove items freely.",
    focusIntro: "Try a guided session linked to a task.",
    start: "Start",
    pause: "Pause",
    resume: "Resume",
    resetTimer: "Reset",
    focusTime: "Deep focus",
    breakTime: "Break",
    selectTask: "Linked task",
    searchPlaceholder: "Search tasks and events",
    noResults: "No results for this search.",
    thisMonth: "Month overview",
    completedSessions: "Completed sessions",
    focusedMinutes: "Focus minutes",
    completionRate: "Tasks completed",
    reminderHint: "Demo reminders never send real notifications.",
    enabled: "Enabled",
    disabled: "Disabled",
    useTemplate: "Use template",
    templateAdded: "Template added to your tasks",
    dataHint: "Demo changes are stored only in this browser.",
    exportDemo: "Download demo data",
    exploreMore: "Explore every Planora tool",
  },
} as const;

export function DemoWorkspace({
  locale,
  view,
}: {
  locale: "es" | "en";
  view: View;
}) {
  const copy = labels[locale],
    [state, setState] = useState(() => createDemoState(new Date(), locale)),
    [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      setState(
        parseDemoState(
          localStorage.getItem(DEMO_STORAGE_KEY),
          Date.now(),
          locale,
        ) ?? createDemoState(new Date(), locale),
      );
      setHydrated(true);
    });
  }, [locale]);
  useEffect(() => {
    if (hydrated) localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);
  useEffect(() => {
    const remaining = state.expiresAt - Date.now();
    const timer = window.setTimeout(
      () => setState(createDemoState(new Date(), locale)),
      Math.max(0, Math.min(remaining, 2_147_483_647)),
    );
    return () => window.clearTimeout(timer);
  }, [locale, state.expiresAt]);
  if (!hydrated)
    return (
      <main className="main">
        <WorkspaceSkeleton />
      </main>
    );

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
        Skip
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
  view: View;
  mobile?: boolean;
}) {
  const copy = labels[locale],
    entries = (Object.keys(icons) as View[]).filter((item) =>
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

type Copy = (typeof labels)["es"] | (typeof labels)["en"];
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
              aria-label={`Delete ${task.title}`}
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
              aria-label={`Delete ${item.title}`}
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
                {state.activeScheduleId === item.id ? copy.active : "Use"}
              </button>
            )}
            {(kind === "categories" || state.activeScheduleId !== item.id) && (
              <button
                className="icon-button"
                aria-label={`Delete ${item.name}`}
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

function MonthDemo({ state, copy }: { state: DemoState; copy: Copy }) {
  const start = new Date();
  start.setDate(1);
  const leading = (start.getDay() + 6) % 7;
  const days = Array.from({ length: 35 }, (_, index) =>
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

function SearchDemo({ state, copy }: { state: DemoState; copy: Copy }) {
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

function FocusDemo({ state, copy }: { state: DemoState; copy: Copy }) {
  const [duration, setDuration] = useState(25 * 60);
  const [remaining, setRemaining] = useState(duration);
  const [running, setRunning] = useState(false);
  const [taskId, setTaskId] = useState(state.tasks[2]?.id ?? "");
  useEffect(() => {
    if (!running || remaining <= 0) return;
    const timer = window.setInterval(
      () =>
        setRemaining((value) => {
          if (value <= 1) {
            setRunning(false);
            return 0;
          }
          return value - 1;
        }),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [remaining, running]);
  const minutes = Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (remaining % 60).toString().padStart(2, "0");
  function selectDuration(secondsValue: number) {
    setDuration(secondsValue);
    setRemaining(secondsValue);
    setRunning(false);
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
            onClick={() => setRunning((value) => !value)}
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
              setRunning(false);
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

function StatisticsDemo({
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

function RemindersDemo({ copy }: { copy: Copy }) {
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

function TemplatesDemo({
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

function DataDemo({
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

function MoreDemo({ locale, copy }: { locale: "es" | "en"; copy: Copy }) {
  const entries = (Object.keys(icons) as View[]).filter(
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
