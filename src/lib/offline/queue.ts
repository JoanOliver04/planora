import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { WorkspaceData } from "@/features/workspace/types";

const queueKey = "planora-offline-completions-v1";
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
  attempts?: number;
};

const MAX_FLUSH_ATTEMPTS = 8;
const PERMANENT_ERROR =
  /weekly target|invalid |not found|future occurrence|archived|check violation|23514|23505/i;
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
  const capped = ordered.slice(-MAX_OFFLINE_ITEMS);
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
  if (stored.rewrite) persistQueue(stored.items);
  return stored.items;
};
export function getQueuedCompletions(userId?: string) {
  const queue = parseQueue();
  return userId ? queue.filter((item) => item.userId === userId) : queue;
}
export function enqueueCompletion(
  item: Omit<QueuedCompletion, "id" | "queuedAt">,
) {
  const stored = readStoredQueue();
  const queue = (stored.corrupt ? [] : stored.items).filter(
    (queued) =>
      !(
        queued.userId === item.userId &&
        queued.taskId === item.taskId &&
        queued.occurrenceDate === item.occurrenceDate
      ),
  );
  queue.push({
    ...item,
    id: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  });
  persistQueue(trimQueue(queue));
}
export async function flushCompletionQueue(
  db: SupabaseClient<Database>,
  userId: string,
) {
  const stored = readStoredQueue();
  if (stored.corrupt) {
    return { synced: 0, conflicts: 0, remaining: 0 };
  }
  const all = stored.items,
    own = all.filter((item) => item.userId === userId);
  const remaining = all.filter((item) => item.userId !== userId);
  let synced = 0,
    conflicts = 0;
  for (const item of own) {
    const { data: existing, error: readError } = await db
      .from("task_completions")
      .select("id,completed_at")
      .eq("task_id", item.taskId)
      .eq("occurrence_date", item.occurrenceDate)
      .maybeSingle();
    if (readError) {
      remaining.push(item);
      continue;
    }
    if (Boolean(existing) === item.completed) {
      synced += 1;
      continue;
    }
    if (
      existing?.completed_at &&
      new Date(existing.completed_at) > new Date(item.queuedAt)
    ) {
      conflicts += 1;
      continue;
    }
    const { data: observed } = await db
      .from("task_occurrence_state")
      .select("last_action, changed_at")
      .eq("task_id", item.taskId)
      .eq("occurrence_date", item.occurrenceDate)
      .maybeSingle();
    if (
      observed?.changed_at &&
      new Date(observed.changed_at) > new Date(item.queuedAt) &&
      ((item.completed && observed.last_action === "uncomplete") ||
        (!item.completed && observed.last_action === "complete"))
    ) {
      conflicts += 1;
      continue;
    }
    const result = item.completed
      ? await db.from("task_completions").insert({
          user_id: userId,
          task_id: item.taskId,
          occurrence_date: item.occurrenceDate,
          task_snapshot: item.snapshot,
        })
      : await db
          .from("task_completions")
          .delete()
          .eq("task_id", item.taskId)
          .eq("occurrence_date", item.occurrenceDate);
    if (!result.error) {
      synced += 1;
      continue;
    }
    const message = `${result.error.code ?? ""} ${result.error.message ?? ""}`;
    const attempts = (item.attempts ?? 0) + 1;
    if (PERMANENT_ERROR.test(message) || attempts >= MAX_FLUSH_ATTEMPTS) {
      conflicts += 1;
      continue;
    }
    remaining.push({ ...item, attempts });
  }
  persistQueue(remaining);
  return {
    synced,
    conflicts,
    remaining: remaining.filter((item) => item.userId === userId).length,
  };
}
export function cacheWorkspace(scope: string, data: WorkspaceData) {
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
  const stored = readStoredQueue();
  if (stored.corrupt) localStorage.removeItem(queueKey);
  else persistQueue(stored.items.filter((item) => item.userId !== userId));

  const workspacePrefix = cachePrefix + userId + ":";
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(workspacePrefix)) localStorage.removeItem(key);
  }

  try {
    const { clearFocusOfflineData } =
      await import("@/features/focus/focus-offline");
    clearFocusOfflineData(userId);
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
