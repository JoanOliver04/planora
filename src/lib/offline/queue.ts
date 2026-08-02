import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { WorkspaceData } from "@/features/workspace/types";

const queueKey = "planora-offline-completions-v1";
const cachePrefix = "planora-workspace-cache-v1:";
export type QueuedCompletion = {
  id: string;
  userId: string;
  taskId: string;
  occurrenceDate: string;
  completed: boolean;
  snapshot: Json;
  queuedAt: string;
};
const parseQueue = (): QueuedCompletion[] => {
  try {
    const value = JSON.parse(localStorage.getItem(queueKey) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};
const notify = () =>
  window.dispatchEvent(new CustomEvent("planora-offline-queue"));
export function getQueuedCompletions(userId?: string) {
  const queue = parseQueue();
  return userId ? queue.filter((item) => item.userId === userId) : queue;
}
export function enqueueCompletion(
  item: Omit<QueuedCompletion, "id" | "queuedAt">,
) {
  const queue = parseQueue().filter(
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
  localStorage.setItem(queueKey, JSON.stringify(queue));
  notify();
}
export async function flushCompletionQueue(
  db: SupabaseClient<Database>,
  userId: string,
) {
  const all = parseQueue(),
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
    )
      conflicts += 1;
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
    if (result.error) remaining.push(item);
    else synced += 1;
  }
  localStorage.setItem(queueKey, JSON.stringify(remaining));
  notify();
  return {
    synced,
    conflicts,
    remaining: remaining.filter((item) => item.userId === userId).length,
  };
}
export function cacheWorkspace(scope: string, data: WorkspaceData) {
  try {
    const safeData = { ...data, user: { id: data.user.id } };
    localStorage.setItem(
      cachePrefix + data.user.id + ":" + scope,
      JSON.stringify({ savedAt: Date.now(), data: safeData }),
    );
  } catch {}
}
export function loadCachedWorkspace(
  userId: string,
  scope: string,
): WorkspaceData | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(cachePrefix + userId + ":" + scope) ?? "null",
    ) as { savedAt: number; data: WorkspaceData } | null;
    if (!parsed || Date.now() - parsed.savedAt > 7 * 24 * 60 * 60 * 1000)
      return null;
    return parsed.data;
  } catch {
    return null;
  }
}
export async function clearPrivateOfflineData(userId: string) {
  const queue = parseQueue().filter((item) => item.userId !== userId);
  localStorage.setItem(queueKey, JSON.stringify(queue));

  const workspacePrefix = cachePrefix + userId + ":";
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(workspacePrefix)) localStorage.removeItem(key);
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
