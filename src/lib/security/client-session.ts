// In-memory generations invalidate async work started before a session ended.
// A fresh authenticated mount can activate the user again without reviving it.
type SessionState = { generation: number; active: boolean };
const sessions = new Map<string, SessionState>();
const listeners = new Set<() => void>();
const revocationKey = "planora-private-session-revoked-v1";
let listening = false;
let activeUserId: string | undefined;
let privateStorageEpoch = 0;
export const privateGlobalStorageKeys = [
  "planora-focus-recents",
  "planora-onboarding-v1",
  "planora-focus-sync-v1",
  "planora-focus-offline-processed-v1",
  "planora-notice-ledger-v1",
  "planora-focus-onboarding-v1",
] as const;
const privateStorageOwnerKey = "planora-private-storage-owner-v1";

export function clientSessionEpoch() {
  return privateStorageEpoch;
}

export function canUsePrivateClientStorage(
  epoch = privateStorageEpoch,
  userId?: string,
) {
  return (
    epoch === privateStorageEpoch &&
    (userId === undefined ||
      activeUserId === undefined ||
      userId === activeUserId) &&
    (activeUserId === undefined || canUseClientSession(activeUserId))
  );
}

function listenForRevocation() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== null && event.storageArea !== window.localStorage)
      return;
    if (event.key === null) {
      sessions.forEach((_, userId) => revokeClientSession(userId, false));
      return;
    }
    if (
      event.key !== revocationKey ||
      !event.newValue ||
      event.newValue.length > 512
    )
      return;
    try {
      const value: unknown = JSON.parse(event.newValue);
      if (
        value &&
        typeof value === "object" &&
        "userId" in value &&
        typeof value.userId === "string" &&
        value.userId.length > 0 &&
        value.userId.length <= 100
      )
        revokeClientSession(value.userId, false);
    } catch {
      /* A malformed notification cannot affect a session. */
    }
  });
}

export function clientSessionGeneration(userId: string) {
  return sessions.get(userId)?.generation ?? 0;
}

export function canUseClientSession(userId: string, generation?: number) {
  const state = sessions.get(userId);
  return (
    state?.active !== false &&
    (generation === undefined || generation === (state?.generation ?? 0))
  );
}

export function activateClientSession(userId: string) {
  listenForRevocation();
  // A different account may enter after the previous tab closed without an
  // explicit logout. Keep same-account refreshes, discard unowned legacy hints.
  if (typeof window !== "undefined") {
    try {
      if (window.localStorage.getItem(privateStorageOwnerKey) !== userId) {
        privateGlobalStorageKeys.forEach((key) =>
          window.localStorage.removeItem(key),
        );
        window.localStorage.setItem(privateStorageOwnerKey, userId);
      }
    } catch {
      /* Storage can be disabled. */
    }
  }
  if (activeUserId !== undefined && activeUserId !== userId)
    privateStorageEpoch += 1;
  activeUserId = userId;
  const state = sessions.get(userId);
  if (state?.active) return;
  sessions.set(userId, {
    generation: (state?.generation ?? 0) + 1,
    active: true,
  });
}

export function revokeClientSession(userId: string, broadcast = true) {
  const state = sessions.get(userId);
  if (state?.active === false) return;
  privateStorageEpoch += 1;
  sessions.set(userId, {
    generation: (state?.generation ?? 0) + 1,
    active: false,
  });
  listeners.forEach((listener) => listener());
  if (broadcast && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        revocationKey,
        JSON.stringify({ userId, nonce: crypto.randomUUID() }),
      );
    } catch {
      /* Supabase's auth channel still propagates normal sign-outs. */
    }
  }
}

export function subscribeClientSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
