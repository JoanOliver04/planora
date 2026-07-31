"use client";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { addDays } from "date-fns";
import {
  Archive,
  Check,
  Copy,
  Edit3,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  calculateWeeklyProgress,
  classifyDayPart,
  formatRecurrenceDescription,
  isTaskExpectedOnDate,
} from "@/lib/recurrence";
import { localDate, localWeek, zonedDate } from "@/lib/dates/timezone";
import { duplicateTask, setTaskArchived } from "@/app/actions/domain";
import type { Category, Completion, Task, WorkspaceData } from "./types";
import { recurrenceFromJson } from "./types";
import { TaskForm } from "./task-form";
import { normalizePreferences } from "@/lib/preferences";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  formatCategoryMetadata,
  formatNaturalDate,
  greetingKey,
  uniqueMetadata,
} from "./presentation";
const adapter = (task: Task) => ({
  startDate: task.start_date,
  endDate: task.end_date,
  archivedAt: task.archived_at?.slice(0, 10),
  recurrence: recurrenceFromJson(task.recurrence_config, task.recurrence_type),
});
export function TaskCard({
  task,
  categories,
  completion,
  onToggle,
  onEdit,
  progress,
}: {
  task: Task;
  categories: Category[];
  completion?: Completion;
  onToggle?: () => Promise<boolean>;
  onEdit?: () => void;
  progress?: string;
}) {
  const t = useTranslations("Workspace"),
    locale = useLocale() as "es" | "en",
    cat = categories.find((c) => c.id === task.category_id),
    [optimisticDone, setOptimisticDone] = useState<boolean | null>(null),
    [togglePending, setTogglePending] = useState(false),
    done = optimisticDone ?? Boolean(completion),
    timing =
      task.start_time?.slice(0, 5) ??
      (task.time_mode === "day_part"
        ? t(task.day_part ?? "anytime")
        : t("anytime")),
    metadata = uniqueMetadata([
      cat ? formatCategoryMetadata(cat.name, cat.emoji) : null,
      timing,
      formatRecurrenceDescription(
        recurrenceFromJson(task.recurrence_config, task.recurrence_type),
        locale,
      ),
      progress,
    ]);
  return (
    <article
      className="task surface"
      data-completed={done}
      style={
        { "--accent": cat?.colour ?? "var(--primary)" } as React.CSSProperties
      }
    >
      {onToggle ? (
        <button
          className="task-check"
          data-done={done}
          aria-pressed={done}
          aria-busy={togglePending}
          disabled={togglePending}
          aria-label={`${done ? t("completed") : t("markComplete")}: ${task.title}`}
          onClick={async () => {
            const previous = done;
            setOptimisticDone(!previous);
            setTogglePending(true);
            try {
              await onToggle();
            } finally {
              setOptimisticDone(null);
              setTogglePending(false);
            }
          }}
        >
          {done && <Check size={19} />}
        </button>
      ) : (
        <span className="task-emoji">{task.emoji || "?"}</span>
      )}
      <div className="task-body">
        <div className="task-title" data-done={done}>
          <span className="task-emoji-inline">{task.emoji}</span>
          {task.title}
        </div>
        <div className="task-metadata">
          {metadata.map((item, index) => (
            <span
              className={index === 0 && cat ? "category-badge" : ""}
              key={item}
            >
              {item}
            </span>
          ))}
        </div>
      </div>
      {onEdit && (
        <button
          className="icon-button"
          onClick={onEdit}
          aria-label={`${t("edit")} ${task.title}`}
        >
          <Edit3 size={17} />
        </button>
      )}
    </article>
  );
}
async function toggle(
  db: ReturnType<typeof import("@/lib/supabase/client").createClient>,
  data: WorkspaceData,
  task: Task,
  day: string,
  reload: () => Promise<void>,
  errorMessage: string,
) {
  const old = data.completions.find(
      (c) => c.task_id === task.id && c.occurrence_date === day,
    ),
    cat = data.categories.find((c) => c.id === task.category_id);
  const q = old
    ? db.from("task_completions").delete().eq("id", old.id)
    : db.from("task_completions").insert({
        user_id: data.user.id,
        task_id: task.id,
        occurrence_date: day,
        task_snapshot: {
          title: task.title,
          emoji: task.emoji,
          category_name: cat?.name ?? null,
          category_colour: cat?.colour ?? null,
        },
      });
  const { error } = await q;
  if (error) {
    toast.error(errorMessage);
    return false;
  }
  await reload();
  return true;
}
export function TodayView({
  data,
  db,
  reload,
}: {
  data: WorkspaceData;
  db: ReturnType<typeof import("@/lib/supabase/client").createClient>;
  reload: () => Promise<void>;
}) {
  const t = useTranslations("Workspace"),
    locale = useLocale() as "es" | "en",
    [open, setOpen] = useState(false),
    [, setClock] = useState(0),
    day = localDate(data.profile.timezone),
    week = localWeek(
      data.profile.timezone,
      new Date(),
      data.profile.week_starts_on === 0 ? 0 : 1,
    ),
    active = data.profile.active_schedule_id,
    activeSchedule = data.schedules.find((item) => item.id === active),
    preferences = normalizePreferences(data.profile.preferences),
    tasks = data.tasks
      .filter(
        (task) =>
          task.schedule_id === active &&
          !task.archived_at &&
          task.is_active &&
          isTaskExpectedOnDate(
            adapter(task),
            zonedDate(day, data.profile.timezone),
          ),
      )
      .filter((task) => {
        const recurrence = recurrenceFromJson(
          task.recurrence_config,
          task.recurrence_type,
        );
        if (recurrence.type !== "times_per_week") return true;
        const completed = data.completions.filter(
          (item) =>
            item.task_id === task.id &&
            item.occurrence_date >= week.start &&
            item.occurrence_date <= week.end,
        ).length;
        return (
          completed < recurrence.target ||
          data.completions.some(
            (item) => item.task_id === task.id && item.occurrence_date === day,
          )
        );
      })
      .filter(
        (task) =>
          preferences.showCompleted ||
          !data.completions.some(
            (item) => item.task_id === task.id && item.occurrence_date === day,
          ),
      ),
    events = data.events.filter(
      (event) =>
        event.event_date === day &&
        (!event.schedule_id || event.schedule_id === active),
    );
  const weeklyTasks = data.tasks.filter(
      (task) =>
        task.schedule_id === active && !task.archived_at && task.is_active,
    ),
    recurring = weeklyTasks.map(adapter),
    completionMap = new Map(
      recurring.map((recurrence, index) => [
        recurrence,
        data.completions
          .filter((item) => item.task_id === weeklyTasks[index].id)
          .map((item) => item.occurrence_date),
      ]),
    ),
    stats = calculateWeeklyProgress(
      recurring,
      completionMap,
      zonedDate(day, data.profile.timezone),
    ),
    remaining = Math.max(stats.expected - stats.completed, 0),
    progressCopy =
      stats.expected === 0
        ? t("noWeekGoals")
        : remaining === 0
          ? t("weekComplete")
          : t("remainingThisWeek", { count: remaining });
  useEffect(() => {
    const timer = setInterval(() => setClock((value) => value + 1), 60000);
    return () => clearInterval(timer);
  }, []);
  const groups = ["morning", "afternoon", "night", "anytime"] as const;
  return (
    <>
      <header className="today-header">
        <div>
          <div className="eyebrow">{t(greetingKey(data.profile.timezone))}</div>
          <h1 className="title today-date">
            {formatNaturalDate(day, locale, data.profile.timezone)}
          </h1>
          <p className="header-context">
            <span>{activeSchedule?.emoji || "🌿"}</span>
            {activeSchedule?.name}
          </p>
        </div>
        <button className="primary" onClick={() => setOpen(true)}>
          <Plus size={18} />
          {t("add")}
        </button>
      </header>
      <section
        className="progress-card surface"
        aria-label={t("weeklyProgress")}
      >
        <div className="progress-copy">
          <div className="eyebrow">{t("weeklyProgress")}</div>
          <h2>
            {t("progress", { done: stats.completed, total: stats.expected })}
          </h2>
          <p className="muted">{progressCopy}</p>
        </div>
        <div
          className="progress-ring"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={stats.expected || 1}
          aria-valuenow={stats.completed}
          style={
            { "--progress": `${stats.percentage}%` } as React.CSSProperties
          }
        >
          <span>{stats.expected ? `${stats.percentage}%` : "—"}</span>
        </div>
      </section>
      {groups.map((group) => {
        const list = tasks.filter(
          (task) =>
            (task.time_mode === "day_part"
              ? task.day_part
              : task.time_mode === "anytime"
                ? "anytime"
                : task.start_time
                  ? classifyDayPart(
                      task.start_time.slice(0, 5),
                      data.profile.day_part_settings as Parameters<
                        typeof classifyDayPart
                      >[1],
                    )
                  : "anytime") === group,
        );
        return list.length ? (
          <section className="section task-group" key={group}>
            <div className="section-head">
              <h2>{t(group)}</h2>
              <span className="count-badge">{list.length}</span>
            </div>
            <div className="task-list">
              {list.map((task) => {
                const recurrence = recurrenceFromJson(
                    task.recurrence_config,
                    task.recurrence_type,
                  ),
                  completion = data.completions.find(
                    (item) =>
                      item.task_id === task.id && item.occurrence_date === day,
                  ),
                  weekly =
                    recurrence.type === "times_per_week"
                      ? t("weeklyTarget", {
                          done: data.completions.filter(
                            (item) =>
                              item.task_id === task.id &&
                              item.occurrence_date >= week.start &&
                              item.occurrence_date <= week.end,
                          ).length,
                          total: recurrence.target,
                        })
                      : undefined;
                return (
                  <TaskCard
                    key={task.id}
                    task={task}
                    categories={data.categories}
                    completion={completion}
                    progress={weekly}
                    onToggle={() =>
                      toggle(db, data, task, day, reload, t("error"))
                    }
                  />
                );
              })}
            </div>
          </section>
        ) : null;
      })}
      {!tasks.length && (
        <div className="empty empty-compact surface">
          <span className="empty-icon">🌱</span>
          <h2>{t("clearDay")}</h2>
          <p>{t("noTasksToday")}</p>
          <button className="pill" onClick={() => setOpen(true)}>
            {t("add")}
          </button>
        </div>
      )}
      {events.length > 0 && (
        <section className="section task-group">
          <div className="section-head">
            <h2>{t("events")}</h2>
            <span className="count-badge">{events.length}</span>
          </div>
          <div className="task-list">
            {events.map((event) => {
              const category = data.categories.find(
                (item) => item.id === event.category_id,
              );
              return (
                <article
                  className="task event-row surface"
                  key={event.id}
                  style={
                    {
                      "--accent": category?.colour ?? "var(--warning)",
                    } as React.CSSProperties
                  }
                >
                  <span className="task-emoji">{event.emoji || "📅"}</span>
                  <div className="task-body">
                    <b>{event.title}</b>
                    <span className="task-metadata">
                      {event.start_time?.slice(0, 5) ?? t("allDay")}
                    </span>
                  </div>
                  <span className="event-badge">{t("event")}</span>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <TaskForm
        key={open ? "open" : "closed"}
        open={open}
        onOpenChange={setOpen}
        schedules={data.schedules}
        categories={data.categories}
        timezone={data.profile.timezone}
        onSaved={reload}
      />
    </>
  );
}
export function WeekView({ data }: { data: WorkspaceData }) {
  const t = useTranslations("Workspace"),
    locale = useLocale() as "es" | "en",
    today = localDate(data.profile.timezone),
    [viewDate, setViewDate] = useState(today),
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
      week.days.includes(today) ? today : week.start,
    );
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
          task.schedule_id === active &&
          !task.archived_at &&
          isTaskExpectedOnDate(
            adapter(task),
            zonedDate(day, data.profile.timezone),
          ),
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
                className="mini-task"
                key={task.id}
                style={
                  {
                    "--accent": category?.colour ?? "var(--primary)",
                  } as React.CSSProperties
                }
              >
                <span>{task.emoji || "•"}</span>
                <span>{task.title}</span>
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
export function TasksView({
  data,
  reload,
}: {
  data: WorkspaceData;
  reload: () => void;
}) {
  const t = useTranslations("Workspace"),
    locale = useLocale() as "es" | "en",
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Task | null>(null),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [status, setStatus] = useState("active"),
    [confirmTask, setConfirmTask] = useState<Task | null>(null);
  const tasks = useMemo(
    () =>
      data.tasks.filter(
        (task) =>
          task.schedule_id === data.profile.active_schedule_id &&
          (category === "all" || task.category_id === category) &&
          (status === "all"
            ? true
            : status === "archived"
              ? !!task.archived_at
              : !task.archived_at) &&
          task.title.toLowerCase().includes(search.toLowerCase()),
      ),
    [data.tasks, data.profile.active_schedule_id, category, status, search],
  );
  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">{t("manageRoutines")}</div>
          <h1 className="title">{t("tasks")}</h1>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus size={18} />
          {t("add")}
        </button>
      </header>
      <div className="filterbar surface">
        <label className="search-field">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("search")}
          />
        </label>
        <select
          className="pill"
          aria-label={t("category")}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">{t("allCategories")}</option>
          {data.categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.emoji} {item.name}
            </option>
          ))}
        </select>
        <select
          className="pill"
          aria-label={t("active")}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="active">{t("active")}</option>
          <option value="archived">{t("archived")}</option>
          <option value="all">{t("all")}</option>
        </select>
      </div>
      <div className="task-list management-list">
        {tasks.map((task) => {
          const categoryItem = data.categories.find(
              (item) => item.id === task.category_id,
            ),
            timing =
              task.start_time?.slice(0, 5) ??
              (task.time_mode === "day_part"
                ? t(task.day_part ?? "anytime")
                : t("anytime")),
            metadata = uniqueMetadata([
              categoryItem?.name,
              formatRecurrenceDescription(
                recurrenceFromJson(
                  task.recurrence_config,
                  task.recurrence_type,
                ),
                locale,
              ),
              timing,
            ]);
          return (
            <article
              className="task surface"
              key={task.id}
              style={
                {
                  "--accent": categoryItem?.colour ?? "var(--primary)",
                } as React.CSSProperties
              }
            >
              <span className="task-emoji">{task.emoji || "•"}</span>
              <div className="task-body">
                <b>{task.title}</b>
                <div className="task-metadata">
                  {metadata.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
              <div className="row-actions">
                <button
                  className="icon-button"
                  onClick={() => {
                    setEditing(task);
                    setOpen(true);
                  }}
                  aria-label={`${t("edit")} ${task.title}`}
                >
                  <Edit3 size={16} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => void duplicateTask(task.id).then(reload)}
                  aria-label={`${t("duplicate")} ${task.title}`}
                >
                  <Copy size={16} />
                </button>
                <button
                  className="icon-button"
                  onClick={() =>
                    task.archived_at
                      ? void setTaskArchived(task.id, false).then(reload)
                      : setConfirmTask(task)
                  }
                  aria-label={task.archived_at ? t("restore") : t("archive")}
                >
                  {task.archived_at ? (
                    <RotateCcw size={16} />
                  ) : (
                    <Archive size={16} />
                  )}
                </button>
              </div>
            </article>
          );
        })}
        {!tasks.length && (
          <div className="empty empty-compact surface">
            <span className="empty-icon">📋</span>
            <h2>{t("empty")}</h2>
            <p>{t("noMatchingTasks")}</p>
          </div>
        )}
      </div>
      <TaskForm
        key={open ? (editing?.id ?? "new") : "closed"}
        open={open}
        onOpenChange={setOpen}
        schedules={data.schedules}
        categories={data.categories}
        timezone={data.profile.timezone}
        task={editing}
        onSaved={reload}
      />
      <ConfirmDialog
        open={!!confirmTask}
        onOpenChange={(open) => !open && setConfirmTask(null)}
        title={`${t("archive")} ${confirmTask?.title ?? ""}`}
        description={t("archiveTaskWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("archive")}
        onConfirm={async () => {
          if (!confirmTask) return;
          try {
            await setTaskArchived(confirmTask.id, true);
            await reload();
            setConfirmTask(null);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : t("error"));
          }
        }}
      />
    </>
  );
}
export function HistoryView({ data }: { data: WorkspaceData }) {
  const t = useTranslations("Workspace"),
    locale = useLocale() as "es" | "en",
    groups = Object.groupBy(data.completions, (item) => item.occurrence_date),
    week = localWeek(
      data.profile.timezone,
      new Date(),
      data.profile.week_starts_on === 0 ? 0 : 1,
    ),
    thisWeek = data.completions.filter(
      (item) =>
        item.occurrence_date >= week.start && item.occurrence_date <= week.end,
    ).length;
  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">{t("last7Days")}</div>
          <h1 className="title">{t("history")}</h1>
        </div>
        <div className="history-summary surface">
          <strong>{thisWeek}</strong>
          <span>{t("completedThisWeek")}</span>
        </div>
      </header>
      <div className="history-list">
        {Object.entries(groups).map(([day, items]) => (
          <section className="history-day" key={day}>
            <div className="history-date">
              <h2>
                {formatNaturalDate(day, locale, data.profile.timezone, {
                  year: true,
                })}
              </h2>
              <span className="count-badge">{items?.length}</span>
            </div>
            <div className="history-items surface">
              {items?.map((completion) => {
                const snapshot = completion.task_snapshot as Record<
                    string,
                    unknown
                  >,
                  colour = String(snapshot.category_colour ?? "var(--primary)"),
                  categoryName = String(snapshot.category_name ?? "");
                return (
                  <div
                    className="history-item"
                    key={completion.id}
                    style={{ "--accent": colour } as React.CSSProperties}
                  >
                    <span className="history-check">
                      <Check size={15} />
                    </span>
                    <div>
                      <b>
                        {String(snapshot.emoji ?? "")}{" "}
                        {String(snapshot.title ?? "")}
                      </b>
                      {categoryName && (
                        <span className="task-metadata">{categoryName}</span>
                      )}
                    </div>
                    <time className="muted">
                      {new Date(completion.completed_at).toLocaleTimeString(
                        locale === "es" ? "es-ES" : "en-GB",
                        { hour: "2-digit", minute: "2-digit" },
                      )}
                    </time>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {!data.completions.length && (
          <div className="empty empty-compact surface">
            <span className="empty-icon">✓</span>
            <h2>{t("noHistory")}</h2>
            <p>{t("historyHint")}</p>
          </div>
        )}
      </div>
    </>
  );
}
