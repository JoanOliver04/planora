"use client";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
  formatRecurrenceDescription,
  isTaskExpectedOnDate,
} from "@/lib/recurrence";
import { localDate, localWeek, zonedDate } from "@/lib/dates/timezone";
import { duplicateTask, setTaskArchived } from "@/app/actions/domain";
import type { Category, Completion, Task, WorkspaceData } from "./types";
import { recurrenceFromJson } from "./types";
import { TaskForm } from "./task-form";
const adapter = (task: Task) => ({
  startDate: task.start_date,
  endDate: task.end_date,
  archivedAt: task.archived_at?.slice(0, 10),
  recurrence: recurrenceFromJson(task.recurrence_config, task.recurrence_type),
});
function TaskCard({
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
  onToggle?: () => void;
  onEdit?: () => void;
  progress?: string;
}) {
  const t = useTranslations("Workspace"),
    cat = categories.find((c) => c.id === task.category_id),
    [done, setDone] = useState(!!completion);
  return (
    <article
      className="task surface"
      style={
        { "--accent": cat?.colour ?? "var(--primary)" } as React.CSSProperties
      }
    >
      {onToggle ? (
        <button
          className="task-check"
          data-done={done}
          aria-label={`${done ? t("completed") : t("today")}: ${task.title}`}
          onClick={() => {
            setDone((value) => !value);
            onToggle();
          }}
        >
          {done && <Check size={19} />}
        </button>
      ) : (
        <span style={{ fontSize: 24 }}>{task.emoji || "•"}</span>
      )}
      <div>
        <div className="task-title" data-done={done}>
          {task.emoji} {task.title}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {cat?.name ?? t("anytime")} ·{" "}
          {task.start_time?.slice(0, 5) ??
            t(
              task.time_mode === "day_part"
                ? (task.day_part ?? "anytime")
                : "anytime",
            )}{" "}
          {progress && `· ${progress}`}
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
  reload: () => void,
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
  if (error) toast.error(error.message);
  else reload();
}
export function TodayView({
  data,
  db,
  reload,
}: {
  data: WorkspaceData;
  db: ReturnType<typeof import("@/lib/supabase/client").createClient>;
  reload: () => void;
}) {
  const t = useTranslations("Workspace"),
    [open, setOpen] = useState(false),
    day = localDate(data.profile.timezone),
    week = localWeek(data.profile.timezone),
    active = data.profile.active_schedule_id,
    tasks = data.tasks
      .filter(
        (x) =>
          x.schedule_id === active &&
          !x.archived_at &&
          x.is_active &&
          isTaskExpectedOnDate(
            adapter(x),
            zonedDate(day, data.profile.timezone),
          ),
      )
      .filter((x) => {
        const r = recurrenceFromJson(x.recurrence_config, x.recurrence_type);
        if (r.type !== "times_per_week") return true;
        const done = data.completions.filter(
          (c) =>
            c.task_id === x.id &&
            c.occurrence_date >= week.start &&
            c.occurrence_date <= week.end,
        ).length;
        return (
          done < r.target ||
          data.completions.some(
            (c) => c.task_id === x.id && c.occurrence_date === day,
          )
        );
      }),
    events = data.events.filter(
      (e) =>
        e.event_date === day && (!e.schedule_id || e.schedule_id === active),
    );
  const weeklyTasks = data.tasks.filter(
      (x) => x.schedule_id === active && !x.archived_at && x.is_active,
    ),
    recurring = weeklyTasks.map(adapter),
    map = new Map(
      recurring.map((r, i) => [
        r,
        data.completions
          .filter((c) => c.task_id === weeklyTasks[i].id)
          .map((c) => c.occurrence_date),
      ]),
    ),
    stats = calculateWeeklyProgress(
      recurring,
      map,
      zonedDate(day, data.profile.timezone),
    );
  const groups = ["morning", "afternoon", "night", "anytime"] as const;
  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">{day}</div>
          <h1 className="title">{t("today")}</h1>
        </div>
        <button className="primary" onClick={() => setOpen(true)}>
          <Plus size={18} />
          {t("add")}
        </button>
      </header>
      <section className="progress-card surface">
        <div>
          <div className="eyebrow">{t("week")}</div>
          <h2>
            {t("progress", { done: stats.completed, total: stats.expected })}
          </h2>
        </div>
        <div
          className="progress-ring"
          style={
            { "--progress": `${stats.percentage}%` } as React.CSSProperties
          }
        >
          <span>{stats.percentage}%</span>
        </div>
      </section>
      {groups.map((group) => {
        const list = tasks.filter(
          (x) =>
            (x.time_mode === "day_part"
              ? x.day_part
              : x.time_mode === "anytime"
                ? "anytime"
                : x.start_time && x.start_time < "12:00"
                  ? "morning"
                  : x.start_time && x.start_time < "18:00"
                    ? "afternoon"
                    : "night") === group,
        );
        return list.length ? (
          <section className="section" key={group}>
            <h2>{t(group)}</h2>
            <div className="task-list">
              {list.map((task) => {
                const r = recurrenceFromJson(
                    task.recurrence_config,
                    task.recurrence_type,
                  ),
                  done = data.completions.find(
                    (c) => c.task_id === task.id && c.occurrence_date === day,
                  ),
                  weekly =
                    r.type === "times_per_week"
                      ? `${data.completions.filter((c) => c.task_id === task.id && c.occurrence_date >= week.start && c.occurrence_date <= week.end).length}/${r.target}`
                      : undefined;
                return (
                  <TaskCard
                    key={task.id}
                    task={task}
                    categories={data.categories}
                    completion={done}
                    progress={weekly}
                    onToggle={() => void toggle(db, data, task, day, reload)}
                  />
                );
              })}
            </div>
          </section>
        ) : null;
      })}
      {!tasks.length && (
        <div className="empty surface">
          🌱<p>{t("noTasksToday")}</p>
        </div>
      )}
      {events.length > 0 && (
        <section className="section">
          <h2>{t("upcoming")}</h2>
          {events.map((e) => (
            <article className="task surface" key={e.id}>
              <span>{e.emoji || "📅"}</span>
              <b>{e.title}</b>
              <span>{e.start_time?.slice(0, 5) ?? t("allDay")}</span>
            </article>
          ))}
        </section>
      )}
      <TaskForm
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
    week = localWeek(data.profile.timezone),
    active = data.profile.active_schedule_id;
  return (
    <>
      <h1 className="title">{t("week")}</h1>
      <div className="week-grid">
        {week.days.map((day) => {
          const tasks = data.tasks.filter(
              (x) =>
                x.schedule_id === active &&
                !x.archived_at &&
                isTaskExpectedOnDate(
                  adapter(x),
                  zonedDate(day, data.profile.timezone),
                ),
            ),
            events = data.events.filter(
              (e) =>
                e.event_date === day &&
                (!e.schedule_id || e.schedule_id === active),
            );
          return (
            <article className="day surface" key={day}>
              <div className="day-label">{day.slice(5)}</div>
              {events.map((e) => (
                <div className="mini-task" key={e.id}>
                  📅 {e.title}
                </div>
              ))}
              {tasks.map((x) => (
                <div className="mini-task" key={x.id}>
                  {x.emoji} {x.title}
                </div>
              ))}
            </article>
          );
        })}
      </div>
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
    [status, setStatus] = useState("active");
  const tasks = useMemo(
    () =>
      data.tasks.filter(
        (x) =>
          (status === "all"
            ? true
            : status === "archived"
              ? !!x.archived_at
              : !x.archived_at) &&
          x.title.toLowerCase().includes(search.toLowerCase()),
      ),
    [data.tasks, status, search],
  );
  return (
    <>
      <header className="topbar">
        <h1 className="title">{t("tasks")}</h1>
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
      <div className="filterbar">
        <label className="pill">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
          />
        </label>
        <select
          className="pill"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="active">{t("active")}</option>
          <option value="archived">{t("archived")}</option>
          <option value="all">{t("all")}</option>
        </select>
      </div>
      <div className="task-list">
        {tasks.map((task) => (
          <article className="task surface" key={task.id}>
            <span style={{ fontSize: 24 }}>{task.emoji || "•"}</span>
            <div>
              <b>{task.title}</b>
              <div className="muted">
                {formatRecurrenceDescription(
                  recurrenceFromJson(
                    task.recurrence_config,
                    task.recurrence_type,
                  ),
                  locale,
                )}
              </div>
            </div>
            <div className="row-actions">
              <button
                className="icon-button"
                onClick={() => {
                  setEditing(task);
                  setOpen(true);
                }}
                aria-label={t("edit")}
              >
                <Edit3 size={16} />
              </button>
              <button
                className="icon-button"
                onClick={() => void duplicateTask(task.id).then(reload)}
                aria-label={t("duplicate")}
              >
                <Copy size={16} />
              </button>
              <button
                className="icon-button"
                onClick={() =>
                  void setTaskArchived(task.id, !task.archived_at).then(reload)
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
        ))}
      </div>
      <TaskForm
        open={open}
        onOpenChange={setOpen}
        schedules={data.schedules}
        categories={data.categories}
        timezone={data.profile.timezone}
        task={editing}
        onSaved={reload}
      />
    </>
  );
}
export function HistoryView({ data }: { data: WorkspaceData }) {
  const t = useTranslations("Workspace"),
    groups = Object.groupBy(data.completions, (c) => c.occurrence_date);
  return (
    <>
      <h1 className="title">{t("history")}</h1>
      {Object.entries(groups).map(([day, items]) => (
        <section className="section surface" key={day}>
          <div className="settings-row">
            <b>{day}</b>
            <span>{items?.length}</span>
          </div>
          {items?.map((c) => {
            const s = c.task_snapshot as Record<string, unknown>;
            return (
              <div className="settings-row" key={c.id}>
                <span>
                  {String(s.emoji ?? "")} {String(s.title ?? "")}
                </span>
                <span className="muted">
                  {new Date(c.completed_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
