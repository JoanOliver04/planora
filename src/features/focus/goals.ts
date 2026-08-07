import { localWeek } from "@/lib/dates/timezone";
import type {
  FocusGoal,
  FocusSession,
  FocusWeeklyGoalProgress,
} from "./types";
import { elapsedFocusSec } from "./time";

export function sessionStartedLocalDay(
  startedAt: string,
  timezone: string,
): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(startedAt));
  } catch {
    return startedAt.slice(0, 10);
  }
}

/**
 * Weekly goal progress using the user's timezone and week start preference.
 * Counts focus seconds from sessions that started within the local week window.
 */
export function calculateWeeklyGoalProgress(
  goal: Pick<FocusGoal, "targetFocusSec" | "timezone" | "weekStartsOn">,
  sessions: FocusSession[],
  now: Date = new Date(),
): FocusWeeklyGoalProgress {
  const weekStartsOn = goal.weekStartsOn === 0 ? 0 : 1;
  const week = localWeek(goal.timezone, now, weekStartsOn);
  const completedFocusSec = sessions.reduce((total, session) => {
    const startDay = sessionStartedLocalDay(session.startedAt, goal.timezone);
    if (startDay < week.start || startDay > week.end) return total;
    if (session.status === "completed" || session.status === "cancelled") {
      return total + Math.max(0, session.focusSec);
    }
    return total + elapsedFocusSec(session, now);
  }, 0);

  const target = Math.max(1, goal.targetFocusSec);
  const remainingFocusSec = Math.max(0, target - completedFocusSec);
  return {
    targetFocusSec: target,
    completedFocusSec,
    remainingFocusSec,
    progress: Math.min(1, completedFocusSec / target),
    weekStart: week.start,
    weekEnd: week.end,
    timezone: goal.timezone,
  };
}
