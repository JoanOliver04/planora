"use client";

import {
  deleteArchivedTask,
  duplicateTask,
  reorderResources,
  setTaskArchived,
} from "@/app/actions/domain";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SortableResourceList } from "@/components/sortable-resource-list";
import { formatRecurrenceDescription } from "@/lib/recurrence";
import { normalizeTaskSearch } from "@/lib/workspace/task-search";
import { useHashTarget } from "@/lib/workspace/use-hash-target";
import { filterTasks, type TaskVisibility } from "@/lib/workspace/visibility";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Archive,
  Copy,
  Edit3,
  Plus,
  RotateCcw,
  Search,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useItemSearch } from "@/lib/workspace/use-item-search";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { categoriesForSchedule } from "./categories";
import { formatTaskTime, uniqueMetadata } from "./presentation";
import { TaskForm } from "./task-form";
import { QuickTaskCapture } from "./quick-task-capture";

import type { Task, WorkspaceData } from "./types";
import { recurrenceFromJson } from "./types";

export function TasksView({
  data,
  reload,
}: {
  data: WorkspaceData;
  reload: () => Promise<void>;
}) {
  const t = useTranslations("Workspace"),
    locale = useLocale() as "es" | "en",
    {
      query: search,
      setQuery: setSearch,
      selectedId,
      fromLink,
    } = useItemSearch(data.tasks),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Task | null>(null),
    [allSchedules, setAllSchedules] = useState(fromLink),
    [category, setCategory] = useState("all"),
    [status, setStatus] = useState<TaskVisibility>(fromLink ? "all" : "active"),
    [sort, setSort] = useState("manual"),
    [selectedNote, setSelectedNote] = useState<Task | null>(null),
    [confirmTask, setConfirmTask] = useState<Task | null>(null),
    [deleteTask, setDeleteTask] = useState<Task | null>(null);
  const categoriesById = useMemo(
    () => new Map(data.categories.map((item) => [item.id, item])),
    [data.categories],
  );
  const scheduleNames = useMemo(
    () => new Map(data.schedules.map((item) => [item.id, item.name])),
    [data.schedules],
  );
  const tasks = useMemo(() => {
    const needle = normalizeTaskSearch(search);
    const filtered = filterTasks(data.tasks, data.completions, status).filter(
      (task) =>
        (allSchedules ||
          task.scope === "global" ||
          task.schedule_id === data.profile.active_schedule_id) &&
        (category === "all" || task.category_id === category) &&
        (selectedId
          ? task.id === selectedId
          : normalizeTaskSearch(
              `${task.title} ${task.description ?? ""}`,
            ).includes(needle)),
    );
    if (sort === "manual") return filtered;
    const categoryName = (task: Task) =>
      categoriesById.get(task.category_id ?? "")?.name ?? "";
    return [...filtered].sort((left, right) => {
      const values: Record<string, [string, string]> = {
        name: [left.title, right.title],
        startDate: [left.start_date, right.start_date],
        endDate: [left.end_date ?? "9999", right.end_date ?? "9999"],
        category: [categoryName(left), categoryName(right)],
        time: [left.start_time ?? "99:99", right.start_time ?? "99:99"],
      };
      const [a, b] = values[sort] ?? values.name;
      return a.localeCompare(b, locale === "es" ? "es" : "en", {
        sensitivity: "base",
        numeric: true,
      });
    });
  }, [
    data.tasks,
    data.completions,
    data.profile.active_schedule_id,
    allSchedules,
    category,
    status,
    search,
    selectedId,
    sort,
    locale,
    categoriesById,
  ]);
  const canReorder =
    sort === "manual" &&
    !allSchedules &&
    !tasks.some((task) => task.archived_at);
  useHashTarget(tasks);
  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">{t("manageRoutines")}</div>
          <h1 className="title">{t("tasks")}</h1>
        </div>
        <button
          className="primary"
          onClick={(event) => {
            event.currentTarget.focus();
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus size={18} />
          {t("add")}
        </button>
      </header>
      {!allSchedules && (status === "active" || status === "all") && (
        <QuickTaskCapture data={data} onSaved={reload} />
      )}
      <div className="filterbar surface task-filterbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label={t("search")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("search")}
          />
        </label>
        <select
          className="pill"
          aria-label={t("taskScheduleFilter")}
          value={allSchedules ? "all" : "current"}
          onChange={(event) => {
            setAllSchedules(event.target.value === "all");
            setCategory("all");
          }}
        >
          <option value="current">{t("activeSchedule")}</option>
          <option value="all">{t("allSchedules")}</option>
        </select>
        <select
          className="pill"
          aria-label={t("category")}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">{t("allCategories")}</option>
          {(allSchedules
            ? data.categories
            : categoriesForSchedule(
                data.categories,
                data.profile.active_schedule_id,
              )
          ).map((item) => (
            <option key={item.id} value={item.id}>
              {item.emoji} {item.name}
            </option>
          ))}
        </select>
        <select
          className="pill"
          aria-label={t("taskStatus")}
          value={status}
          onChange={(event) => setStatus(event.target.value as TaskVisibility)}
        >
          <option value="active">{t("active")}</option>
          <option value="completed">{t("completedOneTime")}</option>
          <option value="archived">{t("archived")}</option>
          <option value="all">{t("all")}</option>
        </select>
        <select
          className="pill"
          aria-label={t("sortBy")}
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="manual">{t("manualOrder")}</option>
          <option value="name">{t("sortName")}</option>
          <option value="startDate">{t("sortStartDate")}</option>
          <option value="endDate">{t("sortEndDate")}</option>
          <option value="category">{t("sortCategory")}</option>
          <option value="time">{t("sortTime")}</option>
        </select>
      </div>
      <SortableResourceList
        key={tasks.map((item) => item.id).join()}
        items={tasks}
        className="task-list management-list"
        locale={locale}
        disabled={!canReorder}
        getLabel={(item) => item.title}
        onCommit={async (ids) => {
          if (!canReorder) return;
          const visible = new Set(ids);
          const iterator = ids[Symbol.iterator]();
          const merged = data.tasks
            .filter(
              (item) =>
                (item.scope === "global" ||
                  item.schedule_id === data.profile.active_schedule_id) &&
                !item.archived_at,
            )
            .map((item) =>
              visible.has(item.id) ? iterator.next().value! : item.id,
            );
          await reorderResources({ type: "tasks", ids: merged });
        }}
        onError={() => toast.error(t("error"))}
        renderItem={(task) => {
          const categoryItem = categoriesById.get(task.category_id ?? ""),
            timing =
              formatTaskTime(
                task.start_time,
                task.time_mode === "time_range" ? task.end_time : null,
              ) ??
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
              task.archived_at ? t("archived") : null,
              task.focus_enabled ? t("focusEnabledBadge") : null,
              task.scope === "global"
                ? t("global")
                : allSchedules
                  ? scheduleNames.get(task.schedule_id ?? "")
                  : null,
            ]);
          return (
            <article
              className="task surface"
              id={`task-${task.id}`}
              tabIndex={-1}
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
                {task.description && (
                  <button
                    className="pill note-button"
                    onClick={() => setSelectedNote(task)}
                  >
                    <StickyNote size={16} /> {t("viewNote")}
                  </button>
                )}
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
                {task.archived_at && (
                  <button
                    className="icon-button danger-action"
                    onClick={() => setDeleteTask(task)}
                    aria-label={`${t("deletePermanently")} ${task.title}`}
                    title={t("deletePermanently")}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </article>
          );
        }}
      />
      {!tasks.length && (
        <div className="empty empty-compact surface">
          <span className="empty-icon">📋</span>
          <h2>{t("empty")}</h2>
          <p>{t("noMatchingTasks")}</p>
          {selectedId && (
            <button
              className="pill"
              type="button"
              onClick={() => {
                setSearch("");
                setStatus("all");
                setCategory("all");
                setAllSchedules(true);
              }}
            >
              {t("showAllTasks")}
            </button>
          )}
        </div>
      )}
      {open && (
        <TaskForm
          key={open ? (editing?.id ?? "new") : "closed"}
          open={open}
          onOpenChange={setOpen}
          schedules={data.schedules}
          defaultScheduleId={data.profile.active_schedule_id ?? undefined}
          categories={data.categories}
          focusPresets={data.focusPresets ?? []}
          timezone={data.profile.timezone}
          task={editing}
          onSaved={reload}
        />
      )}
      <Dialog.Root
        open={!!selectedNote}
        onOpenChange={(value) => !value && setSelectedNote(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content note-dialog">
            <Dialog.Title>
              {t("note")} · {selectedNote?.title}
            </Dialog.Title>
            <p className="task-note">{selectedNote?.description}</p>
            <div className="dialog-actions">
              <Dialog.Close className="pill">{t("close")}</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ConfirmDialog
        open={!!confirmTask}
        onOpenChange={(open) => !open && setConfirmTask(null)}
        title={`${t("archive")} ${confirmTask?.title ?? ""}`}
        description={t("archiveTaskWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("archive")}
        onConfirm={async () => {
          if (!confirmTask) return;
          const archivedTask = confirmTask;
          try {
            await setTaskArchived(archivedTask.id, true);
            await reload();
            setConfirmTask(null);
            toast.success(t("taskArchived"), {
              action: {
                label: t("undo"),
                onClick: () =>
                  void setTaskArchived(archivedTask.id, false)
                    .then(reload)
                    .catch((error) =>
                      toast.error(
                        error instanceof Error ? error.message : t("error"),
                      ),
                    ),
              },
            });
          } catch (error) {
            toast.error(error instanceof Error ? error.message : t("error"));
          }
        }}
      />
      <ConfirmDialog
        open={!!deleteTask}
        onOpenChange={(open) => !open && setDeleteTask(null)}
        title={`${t("deletePermanently")} ${deleteTask?.title ?? ""}`}
        description={t("deleteArchivedTaskWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("deletePermanently")}
        onConfirm={async () => {
          if (!deleteTask) return false;
          try {
            await deleteArchivedTask(deleteTask.id);
            await reload();
            setDeleteTask(null);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : t("error"));
            return false;
          }
        }}
      />
    </>
  );
}
