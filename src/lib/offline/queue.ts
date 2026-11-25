import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { Completion, WorkspaceData } from "@/features/workspace/types";
import { quickTaskDraftPrefix } from "@/lib/workspace/quick-task-draft";
import { withOfflineLock } from "./lock";
import {
  canUseClientSession,
  clientSessionGeneration,
  revokeClientSession,
  privateGlobalStorageKeys,
  focusSessionCachePrefix,
} from "@/lib/security/client-session";

export const completionQueueKey = "planora-offline-completions-v1";
export const completionSyncKey = (userId: string) =>
  "planora-completions-synced:" + userId;

export function notifyOtherCompletionViews(userId: string) {
  try {
    // A transient storage event wakes other tabs without storing task data.
    const key = completionSyncKey(userId);
    localStorage.setItem(key, crypto.randomUUID());
    localStorage.removeItem(key);
  } catch {
    // The originating tab can still reload the confirmed change.
  }
}
const queueKey = completionQueueKey;
const cachePrefix = "planora-workspace-cache-v1:";
const MAX_OFFLINE_STORAGE_BYTES = 500_000;
const MAX_OFFLINE_ITEMS = 2_000;
export type QueuedCompletion = {
  id: string;
  userId: string;
  taskId: string;
  occurrenceDate: string;
  completed: boolean;
  snapshot: Json;
  queuedAt: string;
  afterSyncAt?: string;
  attempts?: number;
};

const MAX_FLUSH_ATTEMPTS = 8;
const PERMANENT_ERROR =
  /weekly target|invalid (one-time |weekday |interval )?occurrence|occurrence outside task dates|task not found|future occurrence|task is archived|check violation|23514|23503/i;
function isQueuedCompletion(value: unknown): value is QueuedCompletion {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id.length <= 100 &&
    typeof item.userId === "string" &&
    item.userId.length <= 100 &&
    typeof item.taskId === "string" &&
    item.taskId.length <= 100 &&
    typeof item.occurrenceDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.occurrenceDate) &&
    typeof item.completed === "boolean" &&
    typeof item.queuedAt === "string" &&
    !Number.isNaN(Date.parse(item.queuedAt)) &&
    (item.afterSyncAt === undefined ||
      (typeof item.afterSyncAt === "string" &&
        Number.isFinite(Date.parse(item.afterSyncAt)))) &&
    (item.attempts === undefined ||
      (Number.isInteger(item.attempts) &&
        Number(item.attempts) >= 0 &&
        Number(item.attempts) <= MAX_FLUSH_ATTEMPTS))
  );
}
type StoredQueue = {
  items: QueuedCompletion[];
  /** JSON that cannot be read. Callers must not replace it with an empty queue. */
  corrupt: boolean;
  /** Valid items were trimmed or invalid rows were dropped. */
  rewrite: boolean;
};

function trimQueue(items: QueuedCompletion[]): QueuedCompletion[] {
  const ordered = [...items].sort((left, right) => {
    if (left.queuedAt === right.queuedAt) return left.id < right.id ? -1 : 1;
    return left.queuedAt < right.queuedAt ? -1 : 1;
  });
  const latest = new Map<string, QueuedCompletion>();
  for (const item of ordered) {
    const key = JSON.stringify([item.userId, item.taskId, item.occurrenceDate]);
    latest.delete(key);
    latest.set(key, item);
  }
  const capped = Array.from(latest.values()).slice(-MAX_OFFLINE_ITEMS);
  if (JSON.stringify(capped).length <= MAX_OFFLINE_STORAGE_BYTES) return capped;
  let low = 0;
  let high = capped.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const size = JSON.stringify(capped.slice(mid)).length;
    if (size <= MAX_OFFLINE_STORAGE_BYTES) high = mid;
    else low = mid + 1;
  }
  return capped.slice(low);
}

function readStoredQueue(): StoredQueue {
  try {
    const raw = localStorage.getItem(queueKey);
    if (!raw) return { items: [], corrupt: false, rewrite: false };
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value))
      return { items: [], corrupt: true, rewrite: false };
    const valid = value.filter(isQueuedCompletion);
    const items = trimQueue(valid);
    return {
      items,
      corrupt: false,
      rewrite:
        raw.length > MAX_OFFLINE_STORAGE_BYTES || items.length !== value.length,
    };
  } catch {
    return { items: [], corrupt: true, rewrite: false };
  }
}

const notify = () =>
  window.dispatchEvent(new CustomEvent("planora-offline-queue"));

function persistQueue(items: QueuedCompletion[]) {
  localStorage.setItem(queueKey, JSON.stringify(items));
  notify();
}

const parseQueue = (): QueuedCompletion[] => {
  const stored = readStoredQueue();
  if (stored.corrupt) return [];
  if (stored.rewrite) {
    try {
      persistQueue(stored.items);
    } catch {
      // A full or read-only store can still supply its valid pending changes.
    }
  }
  return stored.items;
};
export function getQueuedCompletions(userId?: string) {
  const queue = parseQueue();
  return userId ? queue.filter((item) => item.userId === userId) : queue;
}
export function projectQueuedCompletions(
  remote: Completion[],
  queued: QueuedCompletion[],
): Completion[] {
  if (!queued.length) return remote;
  const key = (taskId: string, day: string) => JSON.stringify([taskId, day]);
  const rows = new Map(
    remote.map((row) => [key(row.task_id, row.occurrence_date), row]),
  );
  for (const item of queued) {
    const occurrence = key(item.taskId, item.occurrenceDate);
    if (!item.completed) rows.delete(occurrence);
    else if (!rows.has(occurrence))
      rows.set(occurrence, {
        id: item.id,
        user_id: item.userId,
        task_id: item.taskId,
        occurrence_date: item.occurrenceDate,
        completed_at: item.queuedAt,
        task_snapshot: item.snapshot ?? {},
      });
  }
  return [...rows.values()];
}

export async function enqueueCompletion(
  item: Pick<
    QueuedCompletion,
    "userId" | "taskId" | "occurrenceDate" | "completed" | "snapshot"
  >,
  queuedAt = new Date().toISOString(),
) {
  const generation = clientSessionGeneration(item.userId);
  try {
    return await withOfflineLock(queueKey, () => {
      if (!canUseClientSession(item.userId, generation)) return false;
      const stored = readStoredQueue();
      const previous = stored.items.find(
        (queued) =>
          queued.userId === item.userId &&
          queued.taskId === item.taskId &&
          queued.occurrenceDate === item.occurrenceDate,
      );
      // A delayed network failure can arrive after a newer edit in another tab.
      if (previous && previous.queuedAt > queuedAt) return true;
      const queue = stored.items.filter((queued) => queued !== previous);
      queue.push({
        ...item,
        id: crypto.randomUUID(),
        queuedAt,
        afterSyncAt: previous?.afterSyncAt,
      });
      if (
        queue.length > MAX_OFFLINE_ITEMS ||
        JSON.stringify(queue).length > MAX_OFFLINE_STORAGE_BYTES
      )
        return false;
      persistQueue(queue);
      return true;
    });
  } catch {
    return false;
  }
}
export async function flushCompletionQueue(
  db: SupabaseClient<Database>,
  userId: string,
) {
  const generation = clientSessionGeneration(userId);
  const current = () => canUseClientSession(userId, generation);
  const stopped = () => ({ synced: 0, conflicts: 0, remaining: 0 });
  if (!current()) return stopped();
  const stored = readStoredQueue();
  if (stored.corrupt) {
    return { synced: 0, conflicts: 0, remaining: 0 };
  }
  const own = stored.items.filter((item) => item.userId === userId);
  const settled = new Set<string>();
  // A new toggle can be queued while its predecessor is writing to the server.
  const acknowledged = new Map<string, string>();
  let synced = 0,
    conflicts = 0;
  for (const item of own) {
    const conflictCutoff = Math.max(
      Date.parse(item.queuedAt),
      Date.parse(item.afterSyncAt ?? item.queuedAt),
    );
    if (!current()) return stopped();
    const { data: existing, error: readError } = await db
      .from("task_completions")
      .select("id,completed_at")
      .eq("user_id", userId)
      .eq("task_id", item.taskId)
      .eq("occurrence_date", item.occurrenceDate)
      .maybeSingle();
    if (!current()) return stopped();
    if (readError) {
      continue;
    }
    if (Boolean(existing) === item.completed) {
      settled.add(item.id);
      synced += 1;
      continue;
    }
    if (
      existing?.completed_at &&
      Date.parse(existing.completed_at) > conflictCutoff
    ) {
      settled.add(item.id);
      conflicts += 1;
      continue;
    }
    const { data: observed, error: stateError } = await db
      .from("task_occurrence_state")
      .select("last_action, changed_at")
      .eq("user_id", userId)
      .eq("task_id", item.taskId)
      .eq("occurrence_date", item.occurrenceDate)
      .maybeSingle();
    if (!current()) return stopped();
    if (stateError) continue;
    if (
      observed?.changed_at &&
      Date.parse(observed.changed_at) > conflictCutoff &&
      ((item.completed && observed.last_action === "uncomplete") ||
        (!item.completed && observed.last_action === "complete"))
    ) {
      settled.add(item.id);
      conflicts += 1;
      continue;
    }
    const result = item.completed
      ? await db.from("task_completions").insert({
          user_id: userId,
          task_id: item.taskId,
          occurrence_date: item.occurrenceDate,
          completed_at: item.queuedAt,
          task_snapshot: item.snapshot,
        })
      : await db
          .from("task_completions")
          .delete()
          .eq("user_id", userId)
          .eq("id", existing!.id)
          .eq("task_id", item.taskId)
          .eq("occurrence_date", item.occurrenceDate);
    if (!current()) return stopped();
    if (!result.error) {
      acknowledged.set(
        JSON.stringify([item.taskId, item.occurrenceDate]),
        new Date().toISOString(),
      );
      settled.add(item.id);
      synced += 1;
      continue;
    }
    const message = `${result.error.code ?? ""} ${result.error.message ?? ""}`;
    if (PERMANENT_ERROR.test(message)) {
      settled.add(item.id);
      conflicts += 1;
      continue;
    }
  }
  if (!current()) return stopped();
  const remaining = await withOfflineLock(queueKey, () => {
    if (!current()) return 0;
    const latest = readStoredQueue();
    let changed = false;
    const kept = latest.items
      .filter((item) => !settled.has(item.id))
      .map((item) => {
        const ack =
          item.userId === userId
            ? acknowledged.get(
                JSON.stringify([item.taskId, item.occurrenceDate]),
              )
            : undefined;
        if (!ack || ack <= (item.afterSyncAt ?? item.queuedAt)) return item;
        // Order this later local intent after the write that just completed.
        changed = true;
        return { ...item, afterSyncAt: ack };
      });
    if (!latest.corrupt && (changed || kept.length !== latest.items.length))
      persistQueue(kept);
    return kept.filter((item) => item.userId === userId).length;
  });
  return {
    synced,
    conflicts,
    remaining,
  };
}
export function cacheWorkspace(scope: string, data: WorkspaceData) {
  if (!canUseClientSession(data.user.id)) return;
  try {
    const safeData = { ...data, user: { id: data.user.id } };
    const serialized = JSON.stringify({ savedAt: Date.now(), data: safeData });
    if (serialized.length <= MAX_OFFLINE_STORAGE_BYTES)
      localStorage.setItem(
        cachePrefix + data.user.id + ":" + scope,
        serialized,
      );
  } catch {}
}
export function loadCachedWorkspace(
  userId: string,
  scope: string,
): WorkspaceData | null {
  if (!canUseClientSession(userId)) return null;
  try {
    const raw =
      localStorage.getItem(cachePrefix + userId + ":" + scope) ?? "null";
    if (raw.length > MAX_OFFLINE_STORAGE_BYTES) return null;
    const parsed = JSON.parse(raw) as {
      savedAt?: unknown;
      data?: unknown;
    } | null;
    if (
      !parsed ||
      typeof parsed.savedAt !== "number" ||
      !Number.isFinite(parsed.savedAt) ||
      parsed.savedAt > Date.now() + 120_000 ||
      Date.now() - parsed.savedAt > 7 * 24 * 60 * 60 * 1000 ||
      !parsed.data ||
      typeof parsed.data !== "object"
    )
      return null;
    const data = parsed.data as Partial<WorkspaceData>;
    if (
      data.user?.id !== userId ||
      !Array.isArray(data.schedules) ||
      !Array.isArray(data.categories) ||
      !Array.isArray(data.tasks) ||
      !Array.isArray(data.events) ||
      !Array.isArray(data.completions)
    )
      return null;
    return data as WorkspaceData;
  } catch {
    return null;
  }
}
export async function clearPrivateOfflineData(userId: string) {
  revokeClientSession(userId);
  try {
    // These legacy global stores contain titles, schedule drafts or complete
    // Focus snapshots. They cannot safely carry over to another account.
    for (const key of privateGlobalStorageKeys) localStorage.removeItem(key);
    localStorage.removeItem(focusSessionCachePrefix + userId);
    const draftPrefix = quickTaskDraftPrefix(userId);
    const workspacePrefix = cachePrefix + userId + ":";
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(workspacePrefix) || key?.startsWith(draftPrefix))
        localStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable; still clear the other private stores below.
  }
  try {
    sessionStorage.removeItem("planora-focus-client-id-v1");
    sessionStorage.removeItem("planora-system-notification-status");
  } catch {
    // Session storage availability is independent of local storage.
  }

  try {
    await withOfflineLock(queueKey, () => {
      const stored = readStoredQueue();
      if (stored.corrupt) localStorage.removeItem(queueKey);
      else {
        try {
          persistQueue(stored.items.filter((item) => item.userId !== userId));
        } catch {
          localStorage.removeItem(queueKey);
        }
      }
    });
  } catch {
    // Individual browser stores may be unavailable during sign-out.
  }
  try {
    const { clearFocusOfflineData } =
      await import("@/features/focus/focus-offline");
    await clearFocusOfflineData(userId);
  } catch {
    // Focus module optional during early boot
  }

  if ("caches" in globalThis) {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("planora-"))
        .map((key) => caches.delete(key)),
    );
  }
  notify();
}
