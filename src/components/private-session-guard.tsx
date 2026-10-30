"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearPrivateOfflineData } from "@/lib/offline/queue";
import {
  activateClientSession,
  canUseClientSession,
  revokeClientSession,
  subscribeClientSession,
} from "@/lib/security/client-session";

export function PrivateSessionGuard({
  userId,
  locale,
  children,
}: {
  userId: string;
  locale: string;
  children: React.ReactNode;
}) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let mounted = true;
    let ending = false;
    activateClientSession(userId);
    const endSession = () => {
      if (ending || !mounted) return;
      ending = true;
      revokeClientSession(userId);
      setBlocked(true);
      // Supabase holds its auth lock while notifying subscribers. Defer all
      // asynchronous cleanup/navigation until that callback has returned.
      queueMicrotask(() => {
        void clearPrivateOfflineData(userId)
          .catch(() => undefined)
          .finally(() => {
            if (mounted)
              window.location.replace(
                `/${locale === "en" ? "en" : "es"}/login`,
              );
          });
      });
    };
    const unsubscribe = subscribeClientSession(() => {
      if (!canUseClientSession(userId)) endSession();
    });
    const db = createClient();
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && session.user.id !== userId))
        endSession();
      if (event === "INITIAL_SESSION" && !session) endSession();
    });
    // Covers a cross-tab change between the server render and subscription.
    void db.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!session || session.user.id !== userId) endSession();
      })
      .catch(endSession);
    return () => {
      mounted = false;
      subscription.unsubscribe();
      unsubscribe();
    };
  }, [userId, locale]);

  return blocked ? null : children;
}
