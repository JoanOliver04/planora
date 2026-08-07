import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { FocusSession } from "./types";
import { isActiveStatus } from "./time";
import type { FocusActionResult } from "./errors";
import type { FocusTransitionInput } from "./validation";

type TransitionFn = (
  input: unknown,
) => Promise<FocusActionResult<FocusSession>>;

const QUEUE_KEY = "planora-focus-offline-queue-v1";
const SESSION_KEY_PREFIX = "planora-focus-session-cache-v1:";
const PROCESSED_KEY = "planora-focus-offline-processed-v1";
const MAX_QUEUE = 100;
const MAX_PROCESSED = 200;
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type QueuedFocusTransition = {
  actionId: string;
  userId: string;
  sessionId: string;
  expectedRevision: number;
  clientTimestamp: string;
  queuedAt: string;
  /** Validated transition payload (without actionId/clientAt duplication). */
  transition: FocusTransitionInput;
};

export type FocusOfflineFlushResult = {
  synced: number;
  conflicts: number;
  remaining: number;
  /** True when a revision conflict stopped the chain for a session. */
  blocked: boolean;
};

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("planora-offline-queue"));
  window.dispatchEvent(new CustomEvent("planora-focus-offline"));
}

function parseQueue(): QueuedFocusTransition[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(isQueuedFocusTransition);
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedFocusTransition[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify(items.slice(-MAX_QUEUE)),
    );
    notify();
  } catch {
    // Quota / private mode — best effort; UI still has in-memory session.
  }
}

function parseProcessed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(PROCESSED_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function markProcessed(actionId: string) {
  if (typeof window === "undefined") return;
  try {
    const next = [
      ...parseProcessed().filter((id) => id !== actionId),
      actionId,
    ];
    window.localStorage.setItem(
      PROCESSED_KEY,
      JSON.stringify(next.slice(-MAX_PROCESSED)),
    );
  } catch {
    // ignore
  }
}

function wasProcessed(actionId: string): boolean {
  return parseProcessed().includes(actionId);
}

export function isQueuedFocusTransition(
  value: unknown,
): value is QueuedFocusTransition {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.actionId === "string" &&
    typeof item.userId === "string" &&
    typeof item.sessionId === "string" &&
    typeof item.expectedRevision === "number" &&
    typeof item.clientTimestamp === "string" &&
    typeof item.queuedAt === "string" &&
    item.transition != null &&
    typeof item.transition === "object"
  );
}

export function getQueuedFocusTransitions(
  userId?: string,
): QueuedFocusTransition[] {
  const queue = parseQueue();
  return userId ? queue.filter((item) => item.userId === userId) : queue;
}

export function getFocusOfflinePendingCount(userId?: string): number {
  return getQueuedFocusTransitions(userId).length;
}

/**
 * Enqueue a Focus transition for later sync.
 * Dedupes by actionId. Does not create per-second rows — one entry per user action.
 */
export function enqueueFocusTransition(input: {
  userId: string;
  actionId: string;
  session: FocusSession;
  expectedRevision: number;
  clientTimestamp?: string | number | Date;
  transition: FocusTransitionInput;
}): { ok: true } | { ok: false; reason: "duplicate" | "storage" } {
  if (wasProcessed(input.actionId)) {
    return { ok: false, reason: "duplicate" };
  }
  const queue = parseQueue();
  if (queue.some((item) => item.actionId === input.actionId)) {
    return { ok: false, reason: "duplicate" };
  }

  const clientTimestamp = toIso(input.clientTimestamp ?? Date.now());
  const entry: QueuedFocusTransition = {
    actionId: input.actionId,
    userId: input.userId,
    sessionId: input.session.id,
    expectedRevision: input.expectedRevision,
    clientTimestamp,
    queuedAt: new Date().toISOString(),
    transition: {
      ...input.transition,
      sessionId: input.session.id,
      expectedRevision: input.expectedRevision,
      clientAt: clientTimestamp,
      actionId: input.actionId,
    },
  };

  try {
    writeQueue([...queue, entry]);
    cacheFocusSession(input.userId, input.session);
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage" };
  }
}

function toIso(value: string | number | Date): string {
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms)
      ? new Date(ms).toISOString()
      : new Date().toISOString();
  }
  return new Date(value).toISOString();
}

export function cacheFocusSession(
  userId: string,
  session: FocusSession | null,
) {
  if (typeof window === "undefined") return;
  const key = SESSION_KEY_PREFIX + userId;
  try {
    if (!session || !isActiveStatus(session.status)) {
      window.localStorage.removeItem(key);
      notify();
      return;
    }
    window.localStorage.setItem(
      key,
      JSON.stringify({ savedAt: Date.now(), session }),
    );
    notify();
  } catch {
    // quota
  }
}

export function loadCachedFocusSession(userId: string): FocusSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      savedAt?: number;
      session?: FocusSession;
    };
    if (!parsed?.session || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > CACHE_MAX_AGE_MS) {
      window.localStorage.removeItem(SESSION_KEY_PREFIX + userId);
      return null;
    }
    if (!isActiveStatus(parsed.session.status)) return null;
    return parsed.session;
  } catch {
    return null;
  }
}

export function clearFocusOfflineQueue(userId?: string) {
  if (!userId) {
    writeQueue([]);
    return;
  }
  writeQueue(parseQueue().filter((item) => item.userId !== userId));
}

export function clearFocusOfflineData(userId: string) {
  clearFocusOfflineQueue(userId);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_KEY_PREFIX + userId);
    // Drop processed ids — they are not sensitive but keep storage lean.
    const processed = parseProcessed();
    if (processed.length) {
      // Keep global processed set; actionIds are UUIDs without user prefix.
      // Safe to leave — bounded list.
    }
  } catch {
    // ignore
  }
  notify();
}

/**
 * Flush Focus offline actions in order. Stops a session chain on hard conflict.
 * Duplicate actionIds already processed are dropped as synced.
 */
export async function flushFocusOfflineQueue(
  _db: SupabaseClient<Database>,
  userId: string,
  deps?: {
    transition?: TransitionFn;
  },
): Promise<FocusOfflineFlushResult> {
  const all = parseQueue();
  const own = all.filter((item) => item.userId === userId);
  const others = all.filter((item) => item.userId !== userId);

  let synced = 0;
  let conflicts = 0;
  let blocked = false;
  const remaining: QueuedFocusTransition[] = [...others];
  const failed: QueuedFocusTransition[] = [];

  // Resolve transition only when we actually need the network.
  let transition: TransitionFn | null = deps?.transition ?? null;
  const getTransition = async (): Promise<TransitionFn> => {
    if (transition) return transition;
    // Dynamic import keeps this module client-safe for Vitest / browser bundles.
    transition = (await import("./actions")).transitionFocusSessionAction;
    return transition;
  };

  for (let index = 0; index < own.length; index += 1) {
    const item = own[index]!;
    if (wasProcessed(item.actionId)) {
      synced += 1;
      continue;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      failed.push(item);
      remaining.push(...own.slice(index + 1));
      break;
    }

    const runTransition = await getTransition();
    const result = await runTransition({
      ...item.transition,
      sessionId: item.sessionId,
      expectedRevision: item.expectedRevision,
      clientAt: item.clientTimestamp,
      actionId: item.actionId,
    });

    if (result.ok) {
      markProcessed(item.actionId);
      synced += 1;
      if (isActiveStatus(result.data.status)) {
        cacheFocusSession(userId, result.data);
      } else {
        cacheFocusSession(userId, null);
      }
      continue;
    }

    const code = result.error.code;
    if (code === "REVISION_CONFLICT" || code === "INVALID_TRANSITION") {
      conflicts += 1;
      blocked = true;
      // Drop this action and later ones for same session — remote is authority.
      const restOther = own
        .slice(index + 1)
        .filter((entry) => entry.sessionId !== item.sessionId);
      remaining.push(...restOther);
      markProcessed(item.actionId);
      break;
    }

    // Transient / network — stop and keep remaining including this one.
    failed.push(item);
    remaining.push(...own.slice(index + 1));
    break;
  }

  writeQueue([...remaining, ...failed]);
  return {
    synced,
    conflicts,
    remaining: getQueuedFocusTransitions(userId).length,
    blocked,
  };
}

/** Policy: Focus sessions cannot be *started* offline. */
export function canStartFocusOffline(): false {
  return false;
}

export function __resetFocusOfflineForTests() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(QUEUE_KEY);
  window.localStorage.removeItem(PROCESSED_KEY);
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(SESSION_KEY_PREFIX)) keys.push(key);
  }
  for (const key of keys) window.localStorage.removeItem(key);
}
