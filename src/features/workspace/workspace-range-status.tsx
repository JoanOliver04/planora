"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { QUERY_TIMEOUT_MS } from "@/lib/bootstrap/timeout";

export type LoadWorkspaceRange = (
  start: string,
  end: string,
  signal: AbortSignal,
) => Promise<boolean>;

// Mounted only while the workspace snapshot is missing the visible range.
export function WorkspaceRangeStatus({
  start,
  end,
  load,
  resource,
}: {
  start: string;
  end: string;
  load: LoadWorkspaceRange;
  resource: "events" | "history";
}) {
  const t = useTranslations("Workspace");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
    void load(start, end, controller.signal)
      .then((ok) => {
        if (mounted && !ok) setFailed(true);
      })
      .catch(() => {
        if (mounted) setFailed(true);
      })
      .finally(() => clearTimeout(timer));
    return () => {
      mounted = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [attempt, end, load, start]);
  return (
    <div className="calendar-events-status">
      <span role="status">
        {resource === "history"
          ? t(failed ? "historyLoadError" : "historyLoading")
          : t(failed ? "calendarEventsError" : "calendarEventsLoading")}
      </span>
      {failed && (
        <button
          type="button"
          className="pill"
          onClick={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        >
          {t("retry")}
        </button>
      )}
    </div>
  );
}
