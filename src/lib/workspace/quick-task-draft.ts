import { isCalendarDay } from "@/lib/dates/calendar-day";
import { withOfflineLock } from "@/lib/offline/lock";
import {
  canUseClientSession,
  clientSessionGeneration,
} from "@/lib/security/client-session";

export type QuickTaskDraft = {
  text: string;
  detect: boolean;
  referenceDate: string;
  revision: string;
};

export const quickTaskDraftPrefix = (userId: string) =>
  "planora-quick-task-draft-v1:" + encodeURIComponent(userId) + ":";

export function quickTaskDraftKey(userId: string, scheduleId: string | null) {
  return quickTaskDraftPrefix(userId) + encodeURIComponent(scheduleId ?? "");
}

export function readQuickTaskDraft(key: string): QuickTaskDraft | null {
  const raw = localStorage.getItem(key);
  if (!raw || raw.length > 3000) return null;
  try {
    const value = JSON.parse(raw) as Partial<QuickTaskDraft> | null;
    if (
      value &&
      typeof value.text === "string" &&
      value.text.length <= 280 &&
      typeof value.detect === "boolean" &&
      typeof value.referenceDate === "string" &&
      isCalendarDay(value.referenceDate) &&
      typeof value.revision === "string" &&
      value.revision.length > 0 &&
      value.revision.length <= 100
    ) {
      return value as QuickTaskDraft;
    }
  } catch {
    /* Older or malformed drafts can be replaced on the next edit. */
  }
  return null;
}

export function writeQuickTaskDraft(
  key: string,
  userId: string,
  draft: QuickTaskDraft,
) {
  const generation = clientSessionGeneration(userId);
  return withOfflineLock(key, () => {
    if (!canUseClientSession(userId, generation)) return;
    if (draft.text) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  });
}

export function finishQuickTaskDraft(
  key: string,
  userId: string,
  revision: string,
) {
  const generation = clientSessionGeneration(userId);
  return withOfflineLock(key, () => {
    if (!canUseClientSession(userId, generation)) return null;
    const saved = readQuickTaskDraft(key);
    if (saved?.revision !== revision) return saved;
    localStorage.removeItem(key);
    return null;
  });
}
