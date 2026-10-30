import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { FocusSession } from "./types";
import { isActiveStatus } from "./time";
import type { FocusActionResult } from "./errors";
import type { FocusTransitionInput } from "./validation";
import { z } from "zod";
import {
  focusModeSchema,
  focusPhaseKindSchema,
  focusSessionConfigSchema,
  focusStatusSchema,
  focusTransitionSchema,
  startFocusSessionSchema,
} from "./validation";
import {
  canUseClientSession,
  clientSessionGeneration,
} from "@/lib/security/client-session";

type TransitionFn = (
  input: unknown,
) => Promise<FocusActionResult<FocusSession>>;

const QUEUE_KEY = "planora-focus-offline-queue-v1";
const SESSION_KEY_PREFIX = "planora-focus-session-cache-v1:";
const PROCESSED_KEY = "planora-focus-offline-processed-v1";
const MAX_QUEUE = 100;
const MAX_PROCESSED = 200;
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_STORAGE_SIZE = 500_000;
const MAX_PROCESSED_SIZE = 10_000;
const identifier = z.string().min(1).max(100);
const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const cachedSessionSchema = z.object({
  id: z.string().uuid(),
  userId: identifier,
  status: focusStatusSchema,
  mode: focusModeSchema,
  title: z.string().max(140).nullable(),
  presetId: z.string().uuid().nullable(),
  taskId: z.string().uuid().nullable(),
  categoryId: z.string().uuid().nullable(),
  scheduleId: z.string().uuid().nullable(),
  occurrenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  plannedFocusSec: count.nullable(),
  focusSec: count,
  pausedSec: count,
  breakSec: count,
  currentPhaseKind: focusPhaseKindSchema.nullable(),
  currentCycle: count.min(1),
  config: focusSessionConfigSchema,
  linkSnapshot: z.object({
    taskTitle: z.string().max(140).optional(),
    taskEmoji: z.string().max(16).nullable().optional(),
    taskKind: z.enum(["one_time", "habit"]).optional(),
    categoryName: z.string().max(60).nullable().optional(),
    categoryColour: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .nullable()
      .optional(),
    scheduleName: z.string().max(80).nullable().optional(),
    outcome: z
      .enum(["done", "progress", "blocked", "other"])
      .nullable()
      .optional(),
    nextStep: z.string().max(280).nullable().optional(),
  }),
  startedAt: timestamp,
  endedAt: timestamp.nullable(),
  notes: z.string().max(4000).nullable(),
  distractions: z.array(z.string().max(280)).max(50),
  subjectiveFocus: z.number().int().min(1).max(5).nullable(),
  subjectiveEnergy: z.number().int().min(1).max(5).nullable(),
  completeTaskOnEnd: z.boolean(),
  taskCompletionApplied: z.boolean(),
  revision: count.min(1),
  intervals: z
    .array(
      z.object({
        id: identifier,
        kind: focusPhaseKindSchema,
        sequence: count,
        cycleIndex: count.min(1).nullable(),
        startedAt: timestamp,
        endedAt: timestamp.nullable(),
        plannedDurationSec: count.nullable(),
      }),
    )
    .max(2000),
  createdAt: timestamp,
  updatedAt: timestamp,
});

function validCachedSession(
  value: unknown,
  userId: string,
): FocusSession | null {
  const result = cachedSessionSchema.safeParse(value);
  if (!result.success) return null;
  const session = result.data;
  if (
    session.userId !== userId ||
    !isActiveStatus(session.status) ||
    session.endedAt !== null ||
    session.currentPhaseKind === null ||
    Date.parse(session.startedAt) > Date.now() + 120_000 ||
    Date.parse(session.createdAt) > Date.now() + 120_000 ||
    Date.parse(session.updatedAt) > Date.now() + 120_000 ||
    !startFocusSessionSchema.safeParse({
      ...session.config,
      mode: session.mode,
    }).success ||
    new Set(session.intervals.map((item) => item.id)).size !==
      session.intervals.length ||
    new Set(session.intervals.map((item) => item.sequence)).size !==
      session.intervals.length ||
    session.intervals.filter((item) => item.endedAt === null).length !== 1 ||
    session.intervals.find((item) => item.endedAt === null)?.kind !==
      session.currentPhaseKind ||
    session.intervals.some(
      (item) =>
        Date.parse(item.startedAt) < Date.parse(session.startedAt) ||
        Date.parse(item.startedAt) > Date.now() + 120_000 ||
        (item.endedAt !== null &&
          (Date.parse(item.endedAt) < Date.parse(item.startedAt) ||
            Date.parse(item.endedAt) > Date.now() + 120_000)),
    )
  )
    return null;
  return session;
}

function boundedJson(key: string, maximum = MAX_STORAGE_SIZE): unknown {
  const raw = window.localStorage.getItem(key);
  if (!raw || raw.length > maximum) return null;
  return JSON.parse(raw) as unknown;
}

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
    const raw = boundedJson(QUEUE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw
      .slice(-MAX_QUEUE)
      .filter(isQueuedFocusTransition)
      .filter((item) => canUseClientSession(item.userId));
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedFocusTransition[]) {
  if (typeof window === "undefined") return;
  try {
    const bounded = items
      .filter((item) => canUseClientSession(item.userId))
      .slice(-MAX_QUEUE);
    while (bounded.length && JSON.stringify(bounded).length > MAX_STORAGE_SIZE)
      bounded.shift();
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(bounded));
    notify();
  } catch {
    // Quota / private mode — best effort; UI still has in-memory session.
  }
}

function parseProcessed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = boundedJson(PROCESSED_KEY, MAX_PROCESSED_SIZE);
    return Array.isArray(raw)
      ? raw
          .slice(-MAX_PROCESSED)
          .filter(
            (item): item is string => z.string().uuid().safeParse(item).success,
          )
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
  const transition = focusTransitionSchema.safeParse(item.transition);
  return (
    transition.success &&
    Object.keys(item.transition as object).every((key) =>
      Object.prototype.hasOwnProperty.call(transition.data, key),
    ) &&
    identifier.safeParse(item.userId).success &&
    z.string().uuid().safeParse(item.actionId).success &&
    timestamp.safeParse(item.clientTimestamp).success &&
    timestamp.safeParse(item.queuedAt).success &&
    Date.parse(String(item.queuedAt)) <= Date.now() + 120_000 &&
    Date.parse(String(item.clientTimestamp)) <= Date.now() + 120_000 &&
    transition.data.sessionId === item.sessionId &&
    transition.data.expectedRevision === item.expectedRevision &&
    transition.data.actionId === item.actionId &&
    transition.data.clientAt === item.clientTimestamp
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
  if (
    !canUseClientSession(input.userId) ||
    input.session.userId !== input.userId ||
    input.transition.sessionId !== input.session.id ||
    input.transition.expectedRevision !== input.expectedRevision ||
    (input.transition.actionId !== undefined &&
      input.transition.actionId !== input.actionId)
  )
    return { ok: false, reason: "storage" };
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

  if (!isQueuedFocusTransition(entry)) return { ok: false, reason: "storage" };

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
  if (typeof window === "undefined" || !canUseClientSession(userId)) return;
  const key = SESSION_KEY_PREFIX + userId;
  try {
    if (!session || !isActiveStatus(session.status)) {
      window.localStorage.removeItem(key);
      notify();
      return;
    }
    const valid = validCachedSession(session, userId);
    if (!valid) return;
    const raw = JSON.stringify({ savedAt: Date.now(), session: valid });
    if (raw.length > MAX_STORAGE_SIZE) return;
    window.localStorage.setItem(key, raw);
    notify();
  } catch {
    // quota
  }
}

export function loadCachedFocusSession(userId: string): FocusSession | null {
  if (typeof window === "undefined" || !canUseClientSession(userId))
    return null;
  try {
    const parsed = boundedJson(SESSION_KEY_PREFIX + userId) as {
      savedAt?: number;
      session?: FocusSession;
    };
    if (
      !parsed?.session ||
      typeof parsed.savedAt !== "number" ||
      !Number.isFinite(parsed.savedAt) ||
      parsed.savedAt > Date.now() + 120_000
    )
      return null;
    if (Date.now() - parsed.savedAt > CACHE_MAX_AGE_MS) {
      window.localStorage.removeItem(SESSION_KEY_PREFIX + userId);
      return null;
    }
    return validCachedSession(parsed.session, userId);
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
  const generation = clientSessionGeneration(userId);
  const current = () => canUseClientSession(userId, generation);
  const stopped = () => ({
    synced: 0,
    conflicts: 0,
    remaining: 0,
    blocked: true,
  });
  if (!current()) return stopped();
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
    if (!current()) return stopped();
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
    if (!current()) return stopped();
    const result = await runTransition({
      ...item.transition,
      sessionId: item.sessionId,
      expectedRevision: item.expectedRevision,
      clientAt: item.clientTimestamp,
      actionId: item.actionId,
    });
    if (!current()) return stopped();

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

  if (!current()) return stopped();
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
