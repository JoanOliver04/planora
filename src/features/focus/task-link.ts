import { isTaskExpectedOnDate } from "@/lib/recurrence";
import { recurrenceFromJson } from "@/features/workspace/types";
import type { Category, Schedule, Task } from "@/features/workspace/types";
import type { FocusLinkSnapshot } from "./types";
import type { SessionStartDraft } from "./session-start-dialog";

export type FocusTaskSource = Pick<
  Task,
  | "id"
  | "title"
  | "emoji"
  | "task_kind"
  | "category_id"
  | "schedule_id"
  | "start_date"
  | "end_date"
  | "archived_at"
  | "recurrence_type"
  | "recurrence_config"
>;

export function buildLinkSnapshot(
  task: FocusTaskSource,
  category?: Pick<Category, "name" | "colour" | "emoji"> | null,
  schedule?: Pick<Schedule, "name"> | null,
): FocusLinkSnapshot {
  return {
    taskTitle: task.title,
    taskEmoji: task.emoji,
    taskKind: task.task_kind,
    categoryName: category?.name ?? null,
    categoryColour: category?.colour ?? null,
    scheduleName: schedule?.name ?? null,
  };
}

export function isTaskOccurrenceAllowed(
  task: FocusTaskSource,
  occurrenceDate: string,
): boolean {
  return isTaskExpectedOnDate(
    {
      startDate: task.start_date,
      endDate: task.end_date,
      archivedAt: task.archived_at?.slice(0, 10),
      recurrence: recurrenceFromJson(
        task.recurrence_config,
        task.recurrence_type,
      ),
    },
    occurrenceDate,
  );
}

/**
 * Build a focus start draft from a task/habit card.
 * Defaults to a calm 25-minute countdown; user can change mode in the dialog.
 */
export function buildFocusDraftFromTask(input: {
  task: FocusTaskSource;
  occurrenceDate: string;
  category?: Pick<Category, "name" | "colour" | "emoji"> | null;
  schedule?: Pick<Schedule, "name"> | null;
  focusDurationSec?: number;
}): SessionStartDraft {
  const { task, occurrenceDate, category, schedule } = input;
  return {
    mode: "countdown",
    focusDurationSec: input.focusDurationSec ?? 25 * 60,
    title: task.title,
    taskId: task.id,
    // category/schedule go through dialog task selection + snapshot
    occurrenceDate,
    linkSnapshot: buildLinkSnapshot(task, category, schedule),
    completeTaskOnEnd: false,
  };
}

export type TaskFocusStats = {
  sessionCount: number;
  totalFocusSec: number;
  lastStartedAt: string | null;
};

export function aggregateTaskFocusStats(
  sessions: Array<{
    taskId: string | null;
    focusSec: number;
    startedAt: string;
    status: string;
  }>,
  taskId: string,
): TaskFocusStats {
  const own = sessions.filter((session) => session.taskId === taskId);
  if (own.length === 0) {
    return { sessionCount: 0, totalFocusSec: 0, lastStartedAt: null };
  }
  const sorted = [...own].sort((a, b) =>
    a.startedAt < b.startedAt ? 1 : -1,
  );
  return {
    sessionCount: own.length,
    totalFocusSec: own.reduce((sum, item) => sum + Math.max(0, item.focusSec), 0),
    lastStartedAt: sorted[0]?.startedAt ?? null,
  };
}
