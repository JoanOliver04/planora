"use client";

import { reorderResources } from "@/app/actions/domain";
import { SortableResourceList } from "@/components/sortable-resource-list";
import { buildFocusHref } from "@/features/focus/focus-deep-link";
import { useOptionalFocusSessionState } from "@/features/focus/focus-session-context";
import { FocusTodayShortcuts } from "@/features/focus/focus-today-shortcuts";
import { isTaskFocusActionAvailable } from "@/features/focus/task-link";
import { useRouter } from "@/i18n/routing";
import { localDate, localWeek, zonedDate } from "@/lib/dates/timezone";
import { enqueueCompletion } from "@/lib/offline/queue";
import { normalizePreferences } from "@/lib/preferences";
import { calculateWeeklyProgress, classifyDayPart } from "@/lib/recurrence";
import { addDays } from "date-fns";
import { Plus, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  canToggleOccurrence,
  overdueOneTimeTasks,
  shouldShowOccurrence,
  tasksForDay,
} from "./daily-occurrences";
import { formatNaturalDate, greetingKey } from "./presentation";
import { TaskCard } from "./task-card";
import { TaskForm } from "./task-form";

import type { Task, WorkspaceData } from "./types";
import { recurrenceFromJson } from "./types";

const adapter = (task: Task) => ({
  startDate: task.start_date,
  endDate: task.end_date,
  archivedAt: task.archived_at?.slice(0, 10),
  recurrence: recurrenceFromJson(task.recurrence_config, task.recurrence_type),
});
async function toggle(
  db: ReturnType<typeof import("@/lib/supabase/client").createClient>,
  data: WorkspaceData,
  task: Task,
  day: string,
  completed: boolean,
  reload: () => Promise<void>,
  errorMessage: string,
) {
  if (
    !canToggleOccurrence(
      task,
      day,
      localDate(data.profile.timezone),
      data.completions,
      data.profile.week_starts_on === 0 ? 0 : 1,
    )
  ) {
    toast.error(errorMessage);
    return false;
  }
  const old = data.completions.find(
      (c) => c.task_id === task.id && c.occurrence_date === day,
    ),
    cat = data.categories.find((c) => c.id === task.category_id);
  const snapshot = {
    title: task.title,
    emoji: task.emoji,
    category_id: task.category_id,
    category_name: cat?.name ?? null,
    category_colour: cat?.colour ?? null,
  };
  if (!navigator.onLine) {
    enqueueCompletion({
      userId: data.user.id,
      taskId: task.id,
      occurrenceDate: day,
      completed,
      snapshot,
    });
    return true;
  }
  if (Boolean(old) === completed) return true;
  const q = old
    ? db.from("task_completions").delete().eq("id", old.id)
    : db.from("task_completions").insert({
        user_id: data.user.id,
        task_id: task.id,
        occurrence_date: day,
        task_snapshot: snapshot,
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
  loadDate,
}: {
  data: WorkspaceData;
  db: ReturnType<typeof import("@/lib/supabase/client").createClient>;
  reload: () => Promise<void>;
  loadDate: (day: string) => Promise<boolean>;
}) {
  const t = useTranslations("Workspace"),
    locale = useLocale() as "es" | "en",
    router = useRouter(),
    liveFocus = useOptionalFocusSessionState(),
    hasActiveFocus =
      Boolean(liveFocus) &&
      (liveFocus?.status === "running" ||
        liveFocus?.status === "paused" ||
        liveFocus?.status === "on_break"),
    focusActionLabel = hasActiveFocus ? t("continueFocus") : t("startFocus"),
    [open, setOpen] = useState(false),
    [datePending, setDatePending] = useState(false),
    [viewDate, setViewDate] = useState(() => localDate(data.profile.timezone)),
    [, setClock] = useState(0),
    today = localDate(data.profile.timezone),
    day = viewDate,
    isToday = day === today,
    week = localWeek(
      data.profile.timezone,
      zonedDate(day, data.profile.timezone),
      data.profile.week_starts_on === 0 ? 0 : 1,
    ),
    active = data.profile.active_schedule_id,
    activeSchedule = data.schedules.find((item) => item.id === active),
    preferences = normalizePreferences(data.profile.preferences),
    tasks = tasksForDay(data.tasks, day, active)
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
      .filter((task) =>
        shouldShowOccurrence(
          isToday,
          preferences.showCompleted,
          data.completions.some(
            (item) => item.task_id === task.id && item.occurrence_date === day,
          ),
        ),
      ),
    overdueTasks = isToday
      ? overdueOneTimeTasks(data.tasks, data.completions, today, active)
      : [],
    events = data.events.filter(
      (event) =>
        event.event_date === day &&
        (!event.schedule_id || event.schedule_id === active),
    );
  const weeklyTasks = data.tasks.filter(
      (task) =>
        (task.scope === "global" || task.schedule_id === active) &&
        !task.archived_at &&
        task.is_active,
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
      day,
      data.profile.week_starts_on === 0 ? 0 : 1,
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
  const selectDay = async (next: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next) || next > today || next === day)
      return;
    setDatePending(true);
    try {
      if (await loadDate(next)) setViewDate(next);
      else toast.error(t("error"));
    } finally {
      setDatePending(false);
    }
  };
  const moveDay = (amount: number) => {
    const next = localDate(
      data.profile.timezone,
      addDays(zonedDate(day, data.profile.timezone), amount),
    );
    void selectDay(next);
  };
  const reloadSelected = async () => {
    await reload();
    if (!isToday) await loadDate(day);
  };
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
            {!isToday && ` · ${t("viewingPastDay")}`}
          </p>
        </div>
        <div className="today-actions">
          <div className="day-navigation" aria-label={t("chooseDay")}>
            <button
              className="pill"
              type="button"
              onClick={() => moveDay(-1)}
              disabled={datePending}
              aria-label={t("previousDay")}
            >
              ←
            </button>
            <input
              className="pill"
              type="date"
              max={today}
              value={day}
              disabled={datePending}
              onChange={(event) => void selectDay(event.target.value)}
              aria-label={t("chooseDay")}
            />
            <button
              className="pill"
              type="button"
              onClick={() => moveDay(1)}
              disabled={isToday || datePending}
              aria-label={t("nextDay")}
            >
              →
            </button>
          </div>
          {!isToday && (
            <button
              className="pill go-today-button"
              type="button"
              disabled={datePending}
              onClick={() => void selectDay(today)}
            >
              <RotateCcw size={16} aria-hidden="true" />
              {t("goToday")}
            </button>
          )}
          {isToday && (
            <button className="primary" onClick={() => setOpen(true)}>
              <Plus size={18} />
              {t("add")}
            </button>
          )}
        </div>
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
      <FocusTodayShortcuts
        day={day}
        tasks={tasks.filter(
          (task) =>
            isToday &&
            isTaskFocusActionAvailable({
              focusEnabled: task.focus_enabled,
              occurrenceDate: day,
              today,
            }),
        )}
        completedTaskIds={
          new Set(
            data.completions
              .filter((item) => item.occurrence_date === day)
              .map((item) => item.task_id),
          )
        }
      />
      {overdueTasks.length > 0 && (
        <section className="section task-group overdue-group">
          <div className="section-head">
            <div>
              <h2>{t("overdue")}</h2>
              <p className="muted">{t("overdueHint")}</p>
            </div>
            <span className="count-badge">{overdueTasks.length}</span>
          </div>
          <div className="task-list overdue-list">
            {overdueTasks.map((task) => (
              <div className="overdue-item" key={task.id}>
                <p className="overdue-date" title={task.start_date}>
                  {t("pendingSince", {
                    date: new Intl.DateTimeFormat(locale, {
                      day: "numeric",
                      month: "short",
                      timeZone: data.profile.timezone,
                    }).format(
                      zonedDate(task.start_date, data.profile.timezone),
                    ),
                  })}
                </p>
                <TaskCard
                  task={task}
                  categories={data.categories}
                  occurrenceDate={task.start_date}
                  onToggle={(completed) =>
                    toggle(
                      db,
                      data,
                      task,
                      task.start_date,
                      completed,
                      reloadSelected,
                      t("error"),
                    )
                  }
                />
              </div>
            ))}
          </div>
        </section>
      )}
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
            <SortableResourceList
              key={list.map((item) => item.id).join()}
              items={list}
              className="task-list"
              locale={locale}
              getLabel={(item) => item.title}
              onCommit={async (ids) => {
                const visible = new Set(ids);
                const iterator = ids[Symbol.iterator]();
                const merged = data.tasks
                  .filter(
                    (item) => item.schedule_id === active && !item.archived_at,
                  )
                  .map((item) =>
                    visible.has(item.id) ? iterator.next().value! : item.id,
                  );
                await reorderResources({ type: "tasks", ids: merged });
              }}
              onError={() => toast.error(t("error"))}
              renderItem={(task) => {
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
                    occurrenceDate={day}
                    progress={weekly}
                    onToggle={(completed) =>
                      toggle(
                        db,
                        data,
                        task,
                        day,
                        completed,
                        reloadSelected,
                        t("error"),
                      )
                    }
                    focusActionLabel={focusActionLabel}
                    onStartFocus={
                      isTaskFocusActionAvailable({
                        focusEnabled: task.focus_enabled,
                        occurrenceDate: day,
                        today,
                      })
                        ? () =>
                            router.push(
                              hasActiveFocus
                                ? "/focus"
                                : buildFocusHref({
                                    taskId: task.id,
                                    date: day,
                                  }),
                            )
                        : undefined
                    }
                  />
                );
              }}
            />
          </section>
        ) : null;
      })}
      {!tasks.length && !overdueTasks.length && (
        <div className="empty empty-compact surface">
          <span className="empty-icon">🌱</span>
          <h2>{t("clearDay")}</h2>
          <p>{t("noTasksToday")}</p>
          {isToday && (
            <button className="pill" onClick={() => setOpen(true)}>
              {t("add")}
            </button>
          )}
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
      {open && (
        <TaskForm
          key={open ? "open" : "closed"}
          open={open}
          onOpenChange={setOpen}
          schedules={data.schedules}
          categories={data.categories}
          focusPresets={data.focusPresets ?? []}
          timezone={data.profile.timezone}
          onSaved={reload}
        />
      )}
    </>
  );
}
