"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { mapGoalRow, mapSessionRow } from "./mappers";
import type { FocusGoal, FocusSession } from "./types";
import {
  calculateFocusStatistics,
  FOCUS_INSIGHT_MIN_SAMPLE,
  type FocusStatsFilters,
  type FocusStatistics,
} from "./focus-analytics";
import { formatFocusDuration } from "./defaults";

type FocusIntervalRow = Database["public"]["Tables"]["focus_intervals"]["Row"];
type CategoryOption = {
  id: string;
  name: string;
  colour: string;
  emoji: string | null;
};
type PresetOption = { id: string; name: string; emoji: string | null };

export function FocusStatisticsPanel({
  timezone,
  weekStartsOn = 1,
  compact = false,
}: {
  timezone: string;
  weekStartsOn?: number;
  compact?: boolean;
}) {
  const t = useTranslations("Focus");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [goals, setGoals] = useState<FocusGoal[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [presets, setPresets] = useState<PresetOption[]>([]);
  const [filters, setFilters] = useState<FocusStatsFilters>({
    range: "30d",
    mode: "all",
    categoryId: null,
    presetId: null,
  });

  useEffect(() => {
    let cancelled = false;
    const db = createClient();
    void (async () => {
      setLoading(true);
      setError(false);
      try {
        const {
          data: { user },
        } = await db.auth.getUser();
        if (!user) {
          if (!cancelled) {
            setLoading(false);
            setError(true);
          }
          return;
        }
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - 120);
        const [
          { data: sessionRows },
          { data: goalRows },
          { data: categoryRows },
          { data: presetRows },
        ] = await Promise.all([
          db
            .from("focus_sessions")
            .select("*")
            .eq("user_id", user.id)
            .gte("started_at", since.toISOString())
            .order("started_at", { ascending: false })
            .limit(500),
          db
            .from("focus_goals")
            .select("*")
            .eq("user_id", user.id)
            .eq("period", "weekly")
            .limit(10),
          db
            .from("categories")
            .select("id,name,colour,emoji")
            .eq("user_id", user.id)
            .limit(100),
          db
            .from("focus_presets")
            .select("id,name,emoji")
            .eq("user_id", user.id)
            .is("archived_at", null)
            .limit(100),
        ]);
        if (cancelled) return;
        const rows = sessionRows ?? [];
        const sessionIds = rows.map((row) => row.id);
        const intervalsBySession = new Map<string, FocusIntervalRow[]>();
        // Batch-load intervals once (no N+1). Cap for long histories.
        if (sessionIds.length > 0) {
          const { data: intervalRows } = await db
            .from("focus_intervals")
            .select("*")
            .in("session_id", sessionIds)
            .limit(8000);
          for (const interval of intervalRows ?? []) {
            const list = intervalsBySession.get(interval.session_id) ?? [];
            list.push(interval);
            intervalsBySession.set(interval.session_id, list);
          }
        }
        setSessions(
          rows.map((row) =>
            mapSessionRow(row, intervalsBySession.get(row.id) ?? []),
          ),
        );
        setGoals((goalRows ?? []).map(mapGoalRow));
        setCategories((categoryRows ?? []) as CategoryOption[]);
        setPresets((presetRows ?? []) as PresetOption[]);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryNames = useMemo(() => {
    const map = new Map<string, { name: string; colour: string }>();
    for (const category of categories) {
      map.set(category.id, { name: category.name, colour: category.colour });
    }
    return map;
  }, [categories]);

  const stats = useMemo(
    () =>
      calculateFocusStatistics({
        sessions,
        timezone,
        weekStartsOn,
        filters,
        goals,
        categoryNames,
      }),
    [sessions, timezone, weekStartsOn, filters, goals, categoryNames],
  );

  if (loading) {
    return (
      <section className="surface focus-stats-panel" aria-busy="true">
        <h2>{t("stats.title")}</h2>
        <p className="muted">{t("stats.loading")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="surface focus-stats-panel" role="alert">
        <h2>{t("stats.title")}</h2>
        <p className="muted">{t("stats.loadError")}</p>
      </section>
    );
  }

  return (
    <section
      className="surface focus-stats-panel"
      aria-labelledby="focus-stats-title"
    >
      <div className="focus-section-head">
        <div>
          <h2 id="focus-stats-title">{t("stats.title")}</h2>
          <p className="muted">{t("stats.hint")}</p>
        </div>
      </div>

      <div
        className="focus-stats-filters"
        role="group"
        aria-label={t("stats.filters")}
      >
        <label>
          {t("stats.range")}
          <select
            className="pill"
            value={filters.range}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                range: event.target.value as FocusStatsFilters["range"],
              }))
            }
          >
            <option value="7d">{t("stats.range7")}</option>
            <option value="30d">{t("stats.range30")}</option>
            <option value="custom">{t("stats.rangeCustom")}</option>
          </select>
        </label>
        {filters.range === "custom" ? (
          <>
            <label>
              {t("stats.from")}
              <input
                type="date"
                className="pill"
                value={filters.from ?? stats.from}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    from: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              {t("stats.to")}
              <input
                type="date"
                className="pill"
                value={filters.to ?? stats.to}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    to: event.target.value,
                  }))
                }
              />
            </label>
          </>
        ) : null}
        <label>
          {t("stats.mode")}
          <select
            className="pill"
            value={filters.mode ?? "all"}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                mode: event.target.value as FocusStatsFilters["mode"],
              }))
            }
          >
            <option value="all">{t("stats.allModes")}</option>
            <option value="countdown">{t("modes.countdown")}</option>
            <option value="stopwatch">{t("modes.stopwatch")}</option>
            <option value="cycles">{t("modes.cycles")}</option>
            <option value="structured_plan">
              {t("modes.structured_plan")}
            </option>
          </select>
        </label>
        <label>
          {t("stats.category")}
          <select
            className="pill"
            value={filters.categoryId ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                categoryId: event.target.value || null,
              }))
            }
          >
            <option value="">{t("stats.allCategories")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.emoji ? `${category.emoji} ` : ""}
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("stats.preset")}
          <select
            className="pill"
            value={filters.presetId ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                presetId: event.target.value || null,
              }))
            }
          >
            <option value="">{t("stats.allPresets")}</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.emoji ? `${preset.emoji} ` : ""}
                {preset.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {stats.empty ? (
        <div className="empty empty-compact" role="status">
          <h3>{t("stats.emptyTitle")}</h3>
          <p>{t("stats.emptyBody")}</p>
          <p className="muted">{t("stats.emptyHint")}</p>
        </div>
      ) : (
        <FocusStatisticsBody stats={stats} compact={compact} />
      )}
    </section>
  );
}

function FocusStatisticsBody({
  stats,
  compact,
}: {
  stats: FocusStatistics;
  compact: boolean;
}) {
  const t = useTranslations("Focus");
  const maxDay = Math.max(1, ...stats.daily.map((day) => day.focusSec));

  return (
    <>
      <section
        className="statistics-kpis focus-stats-kpis"
        aria-label={t("stats.summary")}
      >
        <article className="surface statistic-kpi">
          <span>{t("stats.focusTime")}</span>
          <strong>{formatFocusDuration(stats.totalFocusSec, "compact")}</strong>
          <small>
            {stats.from} – {stats.to}
          </small>
        </article>
        <article className="surface statistic-kpi">
          <span>{t("stats.completedSessions")}</span>
          <strong>{stats.completedSessions}</strong>
          <small>
            {t("stats.cancelledSessions", { count: stats.cancelledSessions })}
          </small>
        </article>
        <article className="surface statistic-kpi">
          <span>{t("stats.finishRate")}</span>
          <strong>
            {stats.completionRate == null
              ? "—"
              : `${Math.round(stats.completionRate * 100)}%`}
          </strong>
          <small>{t("stats.finishRateHint")}</small>
        </article>
        {!compact ? (
          <>
            <article className="surface statistic-kpi">
              <span>{t("stats.meanDuration")}</span>
              <strong>
                {stats.meanDurationSec == null
                  ? "—"
                  : formatFocusDuration(stats.meanDurationSec, "compact")}
              </strong>
              <small>
                {t("stats.medianDuration")}:{" "}
                {stats.medianDurationSec == null
                  ? "—"
                  : formatFocusDuration(stats.medianDurationSec, "compact")}
              </small>
            </article>
            <article className="surface statistic-kpi">
              <span>{t("stats.pausedTime")}</span>
              <strong>
                {formatFocusDuration(stats.totalPausedSec, "compact")}
              </strong>
              <small>
                {t("stats.blocks", { count: stats.completedBlocks })}
              </small>
            </article>
          </>
        ) : null}
      </section>

      <section
        className="surface statistics-panel focus-stats-daily"
        aria-labelledby="focus-daily-title"
      >
        <h3 id="focus-daily-title">{t("stats.dailyTitle")}</h3>
        <div
          className="focus-stats-bars"
          role="img"
          aria-label={t("stats.dailyAria")}
        >
          {stats.daily.map((day) => (
            <div className="focus-stats-bar" key={day.date}>
              <div
                className="focus-stats-bar-fill"
                style={{
                  height: `${Math.max(4, Math.round((day.focusSec / maxDay) * 100))}%`,
                }}
                title={`${day.date}: ${formatFocusDuration(day.focusSec, "compact")}`}
              />
              <span className="focus-stats-bar-label">{day.date.slice(8)}</span>
            </div>
          ))}
        </div>
        <ul className="visually-hidden">
          {stats.daily.map((day) => (
            <li key={`a11y-${day.date}`}>
              {day.date}: {formatFocusDuration(day.focusSec, "compact")},{" "}
              {day.sessions} {t("stats.sessionsWord")}
            </li>
          ))}
        </ul>
      </section>

      {!compact ? (
        <div className="statistics-split">
          <section className="surface statistics-panel">
            <h3>{t("stats.byCategory")}</h3>
            {stats.categories.length ? (
              stats.categories.map((bucket) => (
                <div className="stat-bar" key={bucket.key}>
                  <div>
                    <span>
                      <i
                        style={{
                          background: bucket.colour ?? "var(--primary)",
                        }}
                      />
                      {bucket.label}
                    </span>
                    <b>
                      {formatFocusDuration(bucket.focusSec, "compact")} ·{" "}
                      {bucket.percentage}%
                    </b>
                  </div>
                  <progress
                    max={100}
                    value={bucket.percentage}
                    aria-label={`${bucket.label} ${bucket.percentage}%`}
                  />
                </div>
              ))
            ) : (
              <p className="muted">{t("stats.noCategories")}</p>
            )}
          </section>
          <section className="surface statistics-panel">
            <h3>{t("stats.byTask")}</h3>
            {stats.tasks.length ? (
              <ul className="focus-stats-list">
                {stats.tasks.map((bucket) => (
                  <li key={bucket.key}>
                    <span>{bucket.label}</span>
                    <strong>
                      {formatFocusDuration(bucket.focusSec, "compact")} ·{" "}
                      {bucket.sessions}
                    </strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t("stats.noTasks")}</p>
            )}
          </section>
        </div>
      ) : null}

      {stats.goalProgress ? (
        <section className="surface statistics-panel">
          <h3>{t("stats.goalTitle")}</h3>
          <div className="focus-goal-meter" aria-hidden="true">
            <span
              style={{
                width: `${Math.round(stats.goalProgress.progress * 100)}%`,
              }}
            />
          </div>
          <p>
            {stats.goalProgress.metric === "focus_seconds"
              ? t("goals.progressLine", {
                  done: formatFocusDuration(
                    stats.goalProgress.completedValue,
                    "compact",
                  ),
                  target: formatFocusDuration(
                    stats.goalProgress.targetValue,
                    "compact",
                  ),
                })
              : t("goals.progressLine", {
                  done: String(stats.goalProgress.completedValue),
                  target: String(stats.goalProgress.targetValue),
                })}
          </p>
        </section>
      ) : null}

      <section
        className="surface statistics-panel"
        aria-labelledby="focus-insights-title"
      >
        <h3 id="focus-insights-title">{t("stats.insightsTitle")}</h3>
        <ul className="focus-stats-insights">
          {stats.insights.map((insight, index) => (
            <li key={`${insight.kind}-${index}`}>
              {insight.kind === "insufficient"
                ? t("stats.insights.insufficient", {
                    min: FOCUS_INSIGHT_MIN_SAMPLE,
                  })
                : insight.kind === "dayPart"
                  ? t("stats.insights.dayPart", {
                      part: t(`stats.dayParts.${insight.dayPart}`),
                      time: formatFocusDuration(insight.focusSec, "compact"),
                    })
                  : insight.kind === "typicalDuration"
                    ? t("stats.insights.typicalDuration", {
                        time: formatFocusDuration(insight.medianSec, "compact"),
                      })
                    : insight.kind === "category"
                      ? t("stats.insights.category", {
                          name: insight.label,
                          count: insight.sessions,
                        })
                      : t("stats.insights.weekCompare", {
                          current: formatFocusDuration(
                            insight.currentSec,
                            "compact",
                          ),
                          previous: formatFocusDuration(
                            insight.previousSec,
                            "compact",
                          ),
                          change:
                            insight.changePct == null
                              ? "—"
                              : `${insight.changePct > 0 ? "+" : ""}${insight.changePct}%`,
                        })}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
