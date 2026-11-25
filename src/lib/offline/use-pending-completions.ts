"use client";

import { useEffect, useState } from "react";
import {
  canUseClientSession,
  subscribeClientSession,
} from "@/lib/security/client-session";
import {
  completionQueueKey,
  getQueuedCompletions,
  type QueuedCompletion,
} from "./queue";

const empty: QueuedCompletion[] = [];

export function usePendingCompletions(userId: string | undefined) {
  const [snapshot, setSnapshot] = useState<{
    userId: string;
    items: QueuedCompletion[];
  } | null>(null);
  useEffect(() => {
    if (!userId) return;
    const update = () => {
      const items = canUseClientSession(userId)
        ? getQueuedCompletions(userId)
        : empty;
      setSnapshot(items.length ? { userId, items } : null);
    };
    const storage = (event: StorageEvent) => {
      if (event.key === completionQueueKey || event.key === null) update();
    };
    const unsubscribe = subscribeClientSession(update);
    window.addEventListener("planora-offline-queue", update);
    window.addEventListener("storage", storage);
    update();
    return () => {
      unsubscribe();
      window.removeEventListener("planora-offline-queue", update);
      window.removeEventListener("storage", storage);
    };
  }, [userId]);
  return snapshot && snapshot.userId === userId ? snapshot.items : empty;
}
