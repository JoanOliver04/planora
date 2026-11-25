"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { isCalendarDay } from "@/lib/dates/calendar-day";
import { calendarWeek, localDate } from "@/lib/dates/timezone";
import type { createClient } from "@/lib/supabase/client";
import { formatNaturalDate } from "./presentation";
import { getHistoryRange, readWorkspaceRows } from "./workspace-data";
import { WorkspaceRangeStatus } from "./workspace-range-status";
import type { Completion, WorkspaceData } from "./types";

type HistoryRange = ReturnType<typeof getHistoryRange>;
type HistoryClient = ReturnType<typeof createClient>;
const PAGE_SIZE = 50;

function HistoryList({
  rows,
  timezone,
}: {
  rows: Completion[];
  timezone: string;
}) {
  const t = useTranslations("Workspace");
  const locale = useLocale() as "en" | "es";
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          b.occurrence_date.localeCompare(a.occurrence_date) ||
          Date.parse(b.completed_at) - Date.parse(a.completed_at) ||
          a.id.localeCompare(b.id),
      ),
    [rows],
  );
  const groups = Object.groupBy(
    sorted.slice(0, limit),
    (row) => row.occurrence_date,
  );
  const counts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows)
      counts.set(
        row.occurrence_date,
        (counts.get(row.occurrence_date) ?? 0) + 1,
      );
    return counts;
  }, [rows]);
  const clock = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    timeZone: timezone,
    timeStyle: "short",
  });
  const fullTime = new Intl.DateTimeFormat(
    locale === "es" ? "es-ES" : "en-GB",
    {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    },
  );
  if (!sorted.length)
    return (
      <div className="empty empty-compact surface">
        <span className="empty-icon" aria-hidden="true">
          ✓
        </span>
        <h2>{t("noHistoryInRange")}</h2>
      </div>
    );
  return (
    <div className="history-list">
      {Object.entries(groups).map(([day, items]) => (
        <section className="history-day" key={day}>
          <div className="history-date">
            <h2>{formatNaturalDate(day, locale, timezone, { year: true })}</h2>
            <span className="count-badge">{counts.get(day)}</span>
          </div>
          <div className="history-items surface">
            {items?.map((completion) => {
              const snapshot = completion.task_snapshot as Record<
                string,
                unknown
              >;
              const instant = new Date(completion.completed_at);
              const late = localDate(timezone, instant) !== day;
              return (
                <div
                  className="history-item"
                  key={completion.id}
                  style={
                    {
                      "--accent": String(
                        snapshot.category_colour ?? "var(--primary)",
                      ),
                    } as React.CSSProperties
                  }
                >
                  <span className="history-check" aria-hidden="true">
                    <Check size={15} />
                  </span>
                  <div>
                    <b>
                      {String(snapshot.emoji ?? "")}{" "}
                      {String(snapshot.title ?? "")}
                    </b>
                    {Boolean(snapshot.category_name) && (
                      <span className="task-metadata">
                        {String(snapshot.category_name)}
                      </span>
                    )}
                  </div>
                  <time
                    dateTime={completion.completed_at}
                    className="muted"
                    title={t("historyRecorded", {
                      when: fullTime.format(instant),
                    })}
                  >
                    <span className="sr-only">
                      {t("historyRecorded", { when: fullTime.format(instant) })}
                    </span>
                    <span aria-hidden="true">
                      {late ? fullTime.format(instant) : clock.format(instant)}
                    </span>
                  </time>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <div className="history-more">
        <span role="status" className="muted">
          {t("historyCount", {
            shown: Math.min(limit, sorted.length),
            total: sorted.length,
          })}
        </span>
        {limit < sorted.length && (
          <button
            type="button"
            className="pill"
            onClick={() => setLimit(limit + PAGE_SIZE)}
          >
            {t("historyMore")}
          </button>
        )}
      </div>
    </div>
  );
}

function ArchivedHistory({
  db,
  userId,
  range,
  timezone,
}: {
  db: HistoryClient;
  userId: string;
  range: HistoryRange;
  timezone: string;
}) {
  const [rows, setRows] = useState<Completion[] | null>(null);
  const load = useCallback(
    async (start: string, end: string, signal: AbortSignal) => {
      const result = await readWorkspaceRows(
        db
          .from("task_completions")
          .select("*")
          .eq("user_id", userId)
          .gte("occurrence_date", start)
          .lte("occurrence_date", end)
          .order("occurrence_date", { ascending: false })
          .order("completed_at", { ascending: false })
          .order("id")
          .abortSignal(signal),
      );
      if (signal.aborted || result.error || !result.data) return false;
      setRows(result.data);
      return true;
    },
    [db, userId],
  );
  return rows ? (
    <HistoryList rows={rows} timezone={timezone} />
  ) : (
    <WorkspaceRangeStatus
      resource="history"
      start={range.start}
      end={range.end}
      load={load}
    />
  );
}

export function HistoryView({
  data,
  db,
}: {
  data: WorkspaceData;
  db: HistoryClient;
}) {
  const t = useTranslations("Workspace");
  const locale = useLocale();
  const timezone = data.profile.timezone;
  const today = localDate(timezone);
  const currentMonth = today.slice(0, 7);
  const requested = useSearchParams().get("month");
  const month =
    requested && requested <= currentMonth && isCalendarDay(requested + "-01")
      ? requested
      : null;
  const range = getHistoryRange(today, month);
  const fromSnapshot =
    !month ||
    Boolean(
      data.historyRange &&
      range.start >= data.historyRange.start &&
      range.end <= data.historyRange.end,
    );
  const week = calendarWeek(today, data.profile.week_starts_on === 0 ? 0 : 1);
  const thisWeek = data.completions.filter(
    (row) => row.occurrence_date >= week.start && row.occurrence_date <= today,
  ).length;
  const rows = useMemo(
    () =>
      data.completions.filter(
        (row) =>
          row.occurrence_date >= range.start &&
          row.occurrence_date <= range.end,
      ),
    [data.completions, range.start, range.end],
  );
  const rangeLabel = month
    ? new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(range.start + "T12:00:00Z"))
    : t("historyRange");
  function selectMonth(value: string | null) {
    if (value === month) return;
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("month", value);
    else url.searchParams.delete("month");
    window.history.pushState(null, "", url);
  }
  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow" aria-live="polite">
            {rangeLabel}
          </div>
          <h1 className="title">{t("history")}</h1>
          <p className="muted">{t("historyRangeHint")}</p>
        </div>
        <div className="history-summary surface">
          <strong>{thisWeek}</strong>
          <span>{t("completedThisWeek")}</span>
        </div>
      </header>
      <form
        className="history-controls surface"
        onSubmit={(event) => {
          event.preventDefault();
          const field = event.currentTarget.elements.namedItem(
            "month",
          ) as HTMLInputElement;
          if (
            !isCalendarDay(field.value + "-01") ||
            field.value > currentMonth
          ) {
            field.setCustomValidity(t("invalidHistoryMonth"));
            field.reportValidity();
            return;
          }
          selectMonth(field.value);
        }}
      >
        <label className="week-picker">
          {t("historyMonth")}
          <input
            key={month ?? "recent"}
            className="pill"
            type="month"
            name="month"
            min="0001-01"
            max={currentMonth}
            pattern="[0-9]{4}-[0-9]{2}"
            placeholder="YYYY-MM"
            defaultValue={month ?? currentMonth}
            required
            onInput={(event) => event.currentTarget.setCustomValidity("")}
          />
        </label>
        <button type="submit" className="pill">
          {t("viewHistoryMonth")}
        </button>
        {month && (
          <button
            type="button"
            className="pill"
            onClick={() => selectMonth(null)}
          >
            {t("historyRange")}
          </button>
        )}
      </form>
      {fromSnapshot ? (
        <HistoryList key={month ?? "recent"} rows={rows} timezone={timezone} />
      ) : (
        <ArchivedHistory
          key={range.start + range.end}
          db={db}
          userId={data.user.id}
          range={range}
          timezone={timezone}
        />
      )}
    </>
  );
}
