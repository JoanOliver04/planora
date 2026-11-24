import { formatInTimeZone } from "date-fns-tz";
import { nextFutureTrigger } from "@/features/reminders/schedule";
import type { NotificationPreferences } from "@/features/reminders/preferences";
import {
  canUsePrivateClientStorage,
  clientSessionEpoch,
} from "@/lib/security/client-session";

const ledgerKey = "planora-notice-ledger-v1";
const maxUnavailableAttempts = 5;
const maxOccurrenceAgeMs = 24 * 60 * 60 * 1000;
const rank = { shown: 1, dismissed: 2, opened: 3 } as const;

export type NoticeKind = "relative" | "daily_summary" | "alarm";
export type NoticeState = keyof typeof rank;
export type SystemNoticeResult =
  "shown" | "denied" | "default" | "unsupported" | "unavailable" | "failed";

export type DueNotice = {
  id: string;
  kind: NoticeKind;
  taskId: string | null;
  eventId: string | null;
  recurrence: "once" | "daily" | "weekly";
  timezone: string;
  nextTriggerAt: string;
  scheduledTriggerAt?: string;
  timeOfDay?: string | null;
  title: string;
  body: string;
  actionLabel: string;
  appPath: string;
  notificationPath: string;
};

export type PresentedNotice = DueNotice & {
  identity: string;
  tag: string;
  silent: boolean;
  requireInteraction: boolean;
  toast: {
    id: string;
    description: string;
    duration: number;
    closeButton: boolean;
    className?: string;
  };
  onOpen: () => void;
  onDismiss: () => void;
};

type LedgerEntry = {
  inApp?: NoticeState;
  system?: "shown" | "failed";
  unavailable: number;
  unavailableAt?: number;
  at: number;
};

type DeliverInput = {
  signal?: AbortSignal;
  notices: DueNotice[];
  preferences: NotificationPreferences;
  now?: Date;
  visible: boolean;
  presentInApp: (notice: PresentedNotice) => void;
  presentSystem: (notice: PresentedNotice) => Promise<SystemNoticeResult>;
  advance: (
    notice: DueNotice,
    nextTriggerAt: string | null,
    outcome: "delivered" | "expired" | "failed",
  ) => Promise<void>;
  playAlarm?: () => void;
  vibrate?: () => void;
};

let deliveryFlight: Promise<void> | null = null;
const deliveryInFlight = new Set<string>();
let memoryLedger: Record<string, LedgerEntry> = Object.create(null);
let ledgerEpoch = clientSessionEpoch();
let lastStoredLedger: string | null = null;

function emptyEntry(): LedgerEntry {
  return { unavailable: 0, at: Date.now() };
}

function dayKey(date: Date, timeZone: string) {
  const zone = timeZone || "UTC";
  try {
    return formatInTimeZone(date, zone, "yyyy-MM-dd");
  } catch {
    return formatInTimeZone(date, "UTC", "yyyy-MM-dd");
  }
}

export function noticeIdentity(notice: DueNotice, now = new Date()) {
  if (notice.kind === "daily_summary") {
    return `daily-summary:${dayKey(now, notice.timezone)}`;
  }
  const type =
    notice.kind === "alarm" ? "alarm" : notice.eventId ? "event" : "task";
  const entity =
    notice.kind === "alarm"
      ? notice.id
      : (notice.taskId ?? notice.eventId ?? notice.id);
  const occurrence = dayKey(new Date(notice.nextTriggerAt), notice.timezone);
  return `${type}:${entity}:${occurrence}:${notice.nextTriggerAt}`;
}

function readLedger(): Record<string, LedgerEntry> {
  if (ledgerEpoch !== clientSessionEpoch()) {
    memoryLedger = Object.create(null);
    lastStoredLedger = null;
    ledgerEpoch = clientSessionEpoch();
  }
  if (!canUsePrivateClientStorage()) return {};
  try {
    const raw = localStorage.getItem(ledgerKey);
    if (raw === lastStoredLedger) return memoryLedger;
    lastStoredLedger = raw;
    const stored = raw && raw.length < 128_000 ? JSON.parse(raw) : null;
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      for (const [id, entry] of Object.entries(stored) as [
        string,
        LedgerEntry,
      ][]) {
        if (
          !entry ||
          !Number.isFinite(entry.at) ||
          !Number.isInteger(entry.unavailable) ||
          (entry.inApp !== undefined && !Object.hasOwn(rank, entry.inApp)) ||
          (entry.system !== undefined &&
            entry.system !== "shown" &&
            entry.system !== "failed")
        )
          continue;
        const local = memoryLedger[id];
        if (!local) memoryLedger[id] = entry;
        else {
          if (
            entry.inApp &&
            rank[entry.inApp] > (local.inApp ? rank[local.inApp] : 0)
          )
            local.inApp = entry.inApp;
          if (entry.system === "shown" || !local.system)
            local.system = entry.system;
          local.unavailable = Math.max(local.unavailable, entry.unavailable);
          local.unavailableAt = Math.max(
            local.unavailableAt ?? 0,
            entry.unavailableAt ?? 0,
          );
          local.at = Math.max(local.at, entry.at);
        }
      }
      trimLedger(memoryLedger);
    }
  } catch {
    // The tab can still deduplicate alerts when browser storage is blocked.
  }
  return memoryLedger;
}

function trimLedger(entries: Record<string, LedgerEntry>) {
  const keys = Object.keys(entries);
  if (keys.length > 80) {
    keys.sort((left, right) => entries[left].at - entries[right].at);
    for (const key of keys.slice(0, keys.length - 80)) delete entries[key];
  }
}
function writeLedger(entries: Record<string, LedgerEntry>) {
  trimLedger(entries);
  if (!canUsePrivateClientStorage()) return;
  try {
    const raw = JSON.stringify(entries);
    localStorage.setItem(ledgerKey, raw);
    lastStoredLedger = raw;
  } catch {
    // A full or private store must not block the rest of delivery.
  }
}

export function noticeRecord(identity: string) {
  return readLedger()[identity] ?? null;
}

function saveEntry(identity: string, update: (entry: LedgerEntry) => void) {
  const entries = readLedger();
  const entry = entries[identity] ?? emptyEntry();
  update(entry);
  entry.at = Date.now();
  entries[identity] = entry;
  writeLedger(entries);
  return entry;
}

export function rememberNotice(identity: string, state: NoticeState) {
  saveEntry(identity, (entry) => {
    if (!entry.inApp || rank[state] > rank[entry.inApp]) entry.inApp = state;
  });
}

function rememberSystem(identity: string, result: "shown" | "failed") {
  saveEntry(identity, (entry) => {
    entry.system = result;
  });
}

function rememberUnavailable(identity: string) {
  return saveEntry(identity, (entry) => {
    const previous = entry.unavailableAt ?? 0;
    if (entry.unavailable > 0 && Date.now() - previous < 15_000) return;
    entry.unavailable += 1;
    entry.unavailableAt = Date.now();
  });
}

function inAppBlocked(entry: LedgerEntry | null) {
  return Boolean(entry?.inApp);
}

function systemBlocked(entry: LedgerEntry | null) {
  return entry?.system === "shown" || entry?.system === "failed";
}

function logNotice(phase: string, errorType: string) {
  console.info("planora.notification", {
    errorType,
    phase,
    channel: "system",
    api: "ServiceWorkerRegistration",
  });
}

function presentable(
  notice: DueNotice,
  preferences: NotificationPreferences,
  now: Date,
): PresentedNotice {
  const identity = noticeIdentity(notice, now);
  const summary = notice.kind === "daily_summary";
  const epoch = clientSessionEpoch();
  return {
    ...notice,
    identity,
    tag: identity,
    silent: !preferences.sound,
    requireInteraction: notice.kind === "alarm",
    toast: {
      id: identity,
      description: notice.body,
      duration: notice.kind === "alarm" ? 12_000 : summary ? 15_000 : 7_000,
      closeButton: summary,
      className: summary ? "planora-daily-summary" : undefined,
    },
    onOpen: () => {
      if (canUsePrivateClientStorage(epoch)) rememberNotice(identity, "opened");
    },
    onDismiss: () => {
      if (canUsePrivateClientStorage(epoch))
        rememberNotice(identity, "dismissed");
    },
  };
}

async function settleTrigger(
  notice: DueNotice,
  now: Date,
  advance: DeliverInput["advance"],
  outcome: "delivered" | "expired" | "failed" = "delivered",
) {
  const next = nextFutureTrigger(
    new Date(notice.scheduledTriggerAt ?? notice.nextTriggerAt),
    notice.recurrence,
    notice.timezone || "UTC",
    now,
    notice.timeOfDay?.slice(0, 5),
  );
  try {
    await advance(notice, next ? next.toISOString() : null, outcome);
  } catch (error) {
    logNotice("advance", error instanceof Error ? error.name : "Error");
  }
}

export async function deliverNotices(input: DeliverInput) {
  const now = input.now ?? new Date();
  for (const notice of input.notices) {
    if (input.signal?.aborted) return;
    const channel =
      notice.kind === "alarm"
        ? "alarms"
        : notice.kind === "daily_summary"
          ? "summaries"
          : notice.eventId
            ? "events"
            : "tasks";
    if (!input.preferences[channel]) continue;

    const identity = noticeIdentity(notice, now);
    if (deliveryInFlight.has(identity)) continue;
    deliveryInFlight.add(identity);
    let entry = noticeRecord(identity);
    try {
      if (
        now.getTime() - Date.parse(notice.nextTriggerAt) >=
        maxOccurrenceAgeMs
      ) {
        await settleTrigger(notice, now, input.advance, "expired");
        continue;
      }
      if (entry?.inApp === "dismissed" || entry?.inApp === "opened") {
        await settleTrigger(notice, now, input.advance);
        continue;
      }

      const wantInApp =
        input.preferences.inApp && input.visible && !inAppBlocked(entry);
      const wantSystem = input.preferences.system && !systemBlocked(entry);
      if (!wantInApp && !wantSystem) {
        if (entry?.inApp || entry?.system === "shown")
          await settleTrigger(notice, now, input.advance);
        else if (entry?.system === "failed" && !input.preferences.inApp)
          await settleTrigger(notice, now, input.advance, "failed");
        continue;
      }

      const presented = presentable(notice, input.preferences, now);
      if (wantInApp) {
        try {
          input.presentInApp(presented);
          rememberNotice(identity, "shown");
        } catch (error) {
          logNotice("in_app", error instanceof Error ? error.name : "Error");
        }
        entry = noticeRecord(identity);
      }

      let systemResult: SystemNoticeResult | null = null;
      if (wantSystem) {
        try {
          systemResult = await input.presentSystem(presented);
        } catch (error) {
          systemResult = "failed";
          logNotice("show", error instanceof Error ? error.name : "Error");
        }
        if (input.signal?.aborted) return;
        if (systemResult === "shown") {
          rememberSystem(identity, "shown");
          if (!input.visible) rememberNotice(identity, "shown");
        } else if (
          systemResult === "failed" ||
          systemResult === "unsupported"
        ) {
          rememberSystem(identity, "failed");
          logNotice("show", systemResult);
        } else if (systemResult === "unavailable") {
          entry = rememberUnavailable(identity);
          if (entry.unavailable >= maxUnavailableAttempts) {
            rememberSystem(identity, "failed");
            logNotice("show", "unavailable");
          }
        }
        entry = noticeRecord(identity);
      }

      const inAppFinished =
        !input.preferences.inApp || !input.visible || inAppBlocked(entry);
      const systemFinished =
        !input.preferences.system ||
        systemBlocked(entry) ||
        ((systemResult === "denied" || systemResult === "default") &&
          Boolean(entry?.inApp));
      const handedOff = Boolean(entry?.inApp) || entry?.system === "shown";
      if (inAppFinished && systemFinished && handedOff) {
        await settleTrigger(notice, now, input.advance);
        if (
          notice.kind === "alarm" &&
          !input.signal?.aborted &&
          ((wantInApp && Boolean(entry?.inApp)) || systemResult === "shown")
        ) {
          if (input.preferences.sound && input.visible) input.playAlarm?.();
          if (input.preferences.vibration) input.vibrate?.();
        }
      } else if (
        !handedOff &&
        entry?.system === "failed" &&
        !input.preferences.inApp
      ) {
        await settleTrigger(notice, now, input.advance, "failed");
      }
    } finally {
      deliveryInFlight.delete(identity);
    }
  }
}

export function deliverNoticesOnce(input: DeliverInput) {
  if (deliveryFlight) return deliveryFlight;
  deliveryFlight = (async () => {
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      await navigator.locks.request("planora-notice-delivery", () =>
        deliverNotices(input),
      );
      return;
    }
    await deliverNotices(input);
  })().finally(() => {
    deliveryFlight = null;
  });
  return deliveryFlight;
}

export function __resetNoticesForTests() {
  memoryLedger = Object.create(null);
  lastStoredLedger = null;
  deliveryFlight = null;
  deliveryInFlight.clear();
  try {
    localStorage.removeItem(ledgerKey);
  } catch {
    // The test environment can run without storage.
  }
}
