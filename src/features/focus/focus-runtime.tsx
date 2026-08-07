"use client";

import type { ReactNode } from "react";
import { FocusSessionProvider } from "./focus-session-context";
import { FocusCompactBar } from "./focus-compact-bar";
import type { FocusSession } from "./types";

/**
 * App-wide focus runtime: single engine instance + compact bar when away from /focus.
 */
export function FocusRuntime({
  children,
  initialSession = null,
}: {
  children: ReactNode;
  initialSession?: FocusSession | null;
}) {
  return (
    <FocusSessionProvider initialSession={initialSession}>
      {children}
      <FocusCompactBar />
    </FocusSessionProvider>
  );
}
