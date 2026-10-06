import { formatInTimeZone } from "date-fns-tz";
import { nextFutureTrigger } from "@/features/reminders/schedule";
import type { NotificationPreferences } from "@/features/reminders/preferences";

const ledgerKey = "planora-notice-ledger-v1";
const maxUnavailableAttempts = 5;
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
  notices: DueNotice[];
  preferences: NotificationPreferences;
  now?: Date;
  visible: boolean;
  presentInApp: (notice: PresentedNotice) => void;
  presentSystem: (notice: PresentedNotice) => Promise<SystemNoticeResult>;
  advance: (notice: DueNotice, nextTriggerAt: string | null) => Promise<void>;
  playAlarm?: () => void;
  vibrate?: () => void;
};

let deliveryFlight: Promise<void> | null = null;
const deliveryInFlight = new Set<string>();

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
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(
      localStorage.getItem(ledgerKey) ?? "{}",
    ) as Record<string, LedgerEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLedger(entries: Record<string, LedgerEntry>) {
  const keys = Object.keys(entries);
  if (keys.length > 80) {
    keys.sort((left, right) => entries[left].at - entries[right].at);
    for (const key of keys.slice(0, keys.length - 80)) delete entries[key];
  }
  try {
    localStorage.setItem(ledgerKey, JSON.stringify(entries));
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
    onOpen: () => rememberNotice(identity, "opened"),
    onDismiss: () => rememberNotice(identity, "dismissed"),
  };
}

async function settleTrigger(
  notice: DueNotice,
  now: Date,
  advance: DeliverInput["advance"],
) {
  const next = nextFutureTrigger(
    new Date(notice.nextTriggerAt),
    notice.recurrence,
    notice.timezone || "UTC",
    now,
  );
  try {
    await advance(notice, next ? next.toISOString() : null);
  } catch (error) {
    logNotice("advance", error instanceof Error ? error.name : "Error");
  }
}

export async function deliverNotices(input: DeliverInput) {
  const now = input.now ?? new Date();
  for (const notice of input.notices) {
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
      if (entry?.inApp === "dismissed" || entry?.inApp === "opened") {
        await settleTrigger(notice, now, input.advance);
        continue;
      }

      const wantInApp =
        input.preferences.inApp && input.visible && !inAppBlocked(entry);
      const wantSystem = input.preferences.system && !systemBlocked(entry);
      if (!wantInApp && !wantSystem) {
        if (entry?.inApp || entry?.system)
          await settleTrigger(notice, now, input.advance);
        continue;
      }

      const presented = presentable(notice, input.preferences, now);
      if (wantInApp) {
        rememberNotice(identity, "shown");
        try {
          input.presentInApp(presented);
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
      const handedOff =
        Boolean(entry?.inApp) ||
        systemResult === "shown" ||
        systemBlocked(entry);
      if (inAppFinished && systemFinished && handedOff) {
        await settleTrigger(notice, now, input.advance);
        if (
          notice.kind === "alarm" &&
          (wantInApp || systemResult === "shown")
        ) {
          if (input.preferences.sound && input.visible) input.playAlarm?.();
          if (input.preferences.vibration) input.vibrate?.();
        }
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
  deliveryFlight = null;
  deliveryInFlight.clear();
  try {
    localStorage.removeItem(ledgerKey);
  } catch {
    // The test environment can run without storage.
  }
}
