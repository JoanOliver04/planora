import type { FocusSession, FocusSessionStatus } from "./types";
import { isActiveStatus } from "./time";

/** Channel name shared by all Planora tabs on this origin. */
export const FOCUS_SYNC_CHANNEL = "planora-focus-sync-v1";
/** localStorage fallback key (fires in other tabs only). */
export const FOCUS_SYNC_STORAGE_KEY = "planora-focus-sync-v1";
/** Per-tab client id (sessionStorage so each tab is distinct). */
export const FOCUS_CLIENT_ID_KEY = "planora-focus-client-id-v1";

export type FocusSyncEventType =
  | "session_started"
  | "session_updated"
  | "session_ended"
  | "takeover"
  | "request_sync";

/**
 * Cross-tab message. Database remains the authority; this only accelerates UI.
 * Payload may include a session snapshot (same user, same origin).
 */
export type FocusSyncEvent = {
  type: FocusSyncEventType;
  clientId: string;
  sessionId: string | null;
  revision: number | null;
  status: FocusSessionStatus | null;
  at: number;
  /** Optional full snapshot for same-origin speed; always re-validated by revision. */
  session?: FocusSession | null;
};

export type FocusControlMode = "controller" | "follower";

export type RemoteSessionDecision = "apply" | "ignore" | "clear";

export function getFocusClientId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.sessionStorage.getItem(FOCUS_CLIENT_ID_KEY);
    if (existing && existing.length >= 8) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(FOCUS_CLIENT_ID_KEY, id);
    return id;
  } catch {
    return `tab-${Date.now()}`;
  }
}

export function isFocusSyncEvent(value: unknown): value is FocusSyncEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  const types: FocusSyncEventType[] = [
    "session_started",
    "session_updated",
    "session_ended",
    "takeover",
    "request_sync",
  ];
  if (
    typeof event.type !== "string" ||
    !types.includes(event.type as FocusSyncEventType)
  ) {
    return false;
  }
  if (typeof event.clientId !== "string" || !event.clientId) return false;
  if (event.sessionId != null && typeof event.sessionId !== "string")
    return false;
  if (event.revision != null && typeof event.revision !== "number")
    return false;
  if (typeof event.at !== "number") return false;
  return true;
}

/**
 * Decide whether a remote session snapshot should replace local UI state.
 * Never applies an older revision of the same session (stale tab protection).
 */
export function decideRemoteSession(
  local: FocusSession | null,
  remote: FocusSession | null,
): RemoteSessionDecision {
  if (!remote) {
    if (local && isActiveStatus(local.status)) return "clear";
    return "ignore";
  }

  if (!local) {
    return isActiveStatus(remote.status) ||
      remote.status === "completed" ||
      remote.status === "cancelled"
      ? "apply"
      : "ignore";
  }

  if (remote.id !== local.id) {
    // Another active session won at the DB (one-active constraint).
    if (isActiveStatus(remote.status)) return "apply";
    if (
      isActiveStatus(local.status) &&
      (remote.status === "completed" || remote.status === "cancelled")
    ) {
      // Unrelated history row — ignore.
      return "ignore";
    }
    return "ignore";
  }

  if (remote.revision > local.revision) return "apply";
  if (remote.revision < local.revision) return "ignore";

  // Same revision: still apply terminal/status drift (rare clock skew paths).
  if (remote.status !== local.status) return "apply";
  if (remote.updatedAt > local.updatedAt) return "apply";
  return "ignore";
}

/** Lightweight poll row vs local — true when the UI should re-fetch. */
export function shouldRefetchFromPoll(input: {
  local: FocusSession | null;
  remoteId: string | null;
  remoteRevision: number | null;
  remoteStatus: FocusSessionStatus | null;
}): boolean {
  const { local, remoteId, remoteRevision, remoteStatus } = input;
  if (!remoteId) {
    return Boolean(local && isActiveStatus(local.status));
  }
  if (!local) return true;
  if (local.id !== remoteId) return true;
  if (remoteRevision != null && remoteRevision !== local.revision) return true;
  if (remoteStatus != null && remoteStatus !== local.status) return true;
  return false;
}

export function eventTypeForSession(
  session: FocusSession | null,
  kind: "start" | "update" | "end" | "takeover" = "update",
): FocusSyncEventType {
  if (kind === "start") return "session_started";
  if (kind === "takeover") return "takeover";
  if (kind === "end" || !session || !isActiveStatus(session.status)) {
    return "session_ended";
  }
  return "session_updated";
}

export function buildFocusSyncEvent(
  clientId: string,
  session: FocusSession | null,
  type: FocusSyncEventType,
): FocusSyncEvent {
  return {
    type,
    clientId,
    sessionId: session?.id ?? null,
    revision: session?.revision ?? null,
    status: session?.status ?? null,
    at: Date.now(),
    session,
  };
}

export type FocusSyncBus = {
  clientId: string;
  publish: (event: FocusSyncEvent) => void;
  publishSession: (
    session: FocusSession | null,
    type?: FocusSyncEventType,
  ) => void;
  requestSync: () => void;
  close: () => void;
};

/**
 * BroadcastChannel with localStorage fallback for older browsers.
 * Ignores own clientId echoes. Never throws.
 */
export function createFocusSyncBus(
  onEvent: (event: FocusSyncEvent) => void,
): FocusSyncBus {
  const clientId = getFocusClientId();
  let channel: BroadcastChannel | null = null;

  const deliver = (event: FocusSyncEvent) => {
    if (event.clientId === clientId) return;
    onEvent(event);
  };

  if (
    typeof window !== "undefined" &&
    typeof BroadcastChannel !== "undefined"
  ) {
    try {
      channel = new BroadcastChannel(FOCUS_SYNC_CHANNEL);
      channel.onmessage = (message) => {
        if (isFocusSyncEvent(message.data)) deliver(message.data);
      };
    } catch {
      channel = null;
    }
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== FOCUS_SYNC_STORAGE_KEY || !event.newValue) return;
    try {
      const parsed: unknown = JSON.parse(event.newValue);
      if (isFocusSyncEvent(parsed)) deliver(parsed);
    } catch {
      // ignore malformed
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  const publish = (event: FocusSyncEvent) => {
    try {
      channel?.postMessage(event);
    } catch {
      // channel closed
    }
    if (typeof window === "undefined") return;
    try {
      // Storage events notify *other* tabs; value must change to re-fire.
      window.localStorage.setItem(
        FOCUS_SYNC_STORAGE_KEY,
        JSON.stringify({ ...event, _n: Math.random() }),
      );
    } catch {
      // private mode / quota
    }
  };

  return {
    clientId,
    publish,
    publishSession(session, type) {
      const resolved =
        type ??
        eventTypeForSession(
          session,
          session && isActiveStatus(session.status) ? "update" : "end",
        );
      publish(buildFocusSyncEvent(clientId, session, resolved));
    },
    requestSync() {
      publish({
        type: "request_sync",
        clientId,
        sessionId: null,
        revision: null,
        status: null,
        at: Date.now(),
      });
    },
    close() {
      try {
        channel?.close();
      } catch {
        // ignore
      }
      channel = null;
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", onStorage);
      }
    },
  };
}

/** How long a poll interval waits while an active session is open (ms). */
export const FOCUS_SYNC_POLL_MS = 12_000;

/**
 * After a successful local write we are the controller.
 * After a remote higher revision / conflict we become follower until takeover.
 */
export function controlModeAfterRemoteEvent(
  event: FocusSyncEvent,
  localClientId: string,
): FocusControlMode | null {
  if (event.clientId === localClientId) return null;
  if (
    event.type === "session_updated" ||
    event.type === "session_started" ||
    event.type === "takeover" ||
    event.type === "session_ended"
  ) {
    return event.type === "session_ended" ? "controller" : "follower";
  }
  return null;
}
