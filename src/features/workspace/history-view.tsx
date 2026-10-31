"use client";

import { localWeek } from "@/lib/dates/timezone";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatNaturalDate } from "./presentation";
import type { WorkspaceData } from "./types";

export function HistoryView({ data }: { data: WorkspaceData }) {
  const t = useTranslations("Workspace"),
    locale = useLocale() as "es" | "en",
    groups = Object.groupBy(data.completions, (item) => item.occurrence_date),
    week = localWeek(
      data.profile.timezone,
      new Date(),
      data.profile.week_starts_on === 0 ? 0 : 1,
    ),
    thisWeek = data.completions.filter(
      (item) =>
        item.occurrence_date >= week.start && item.occurrence_date <= week.end,
    ).length;
  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">{t("historyRange")}</div>
          <h1 className="title">{t("history")}</h1>
          <p className="muted">{t("historyRangeHint")}</p>
        </div>
        <div className="history-summary surface">
          <strong>{thisWeek}</strong>
          <span>{t("completedThisWeek")}</span>
        </div>
      </header>
      <div className="history-list">
        {Object.entries(groups).map(([day, items]) => (
          <section className="history-day" key={day}>
            <div className="history-date">
              <h2>
                {formatNaturalDate(day, locale, data.profile.timezone, {
                  year: true,
                })}
              </h2>
              <span className="count-badge">{items?.length}</span>
            </div>
            <div className="history-items surface">
              {items?.map((completion) => {
                const snapshot = completion.task_snapshot as Record<
                    string,
                    unknown
                  >,
                  colour = String(snapshot.category_colour ?? "var(--primary)"),
                  categoryName = String(snapshot.category_name ?? "");
                return (
                  <div
                    className="history-item"
                    key={completion.id}
                    style={{ "--accent": colour } as React.CSSProperties}
                  >
                    <span className="history-check">
                      <Check size={15} />
                    </span>
                    <div>
                      <b>
                        {String(snapshot.emoji ?? "")}{" "}
                        {String(snapshot.title ?? "")}
                      </b>
                      {categoryName && (
                        <span className="task-metadata">{categoryName}</span>
                      )}
                    </div>
                    <time className="muted">
                      {new Date(completion.completed_at).toLocaleTimeString(
                        locale === "es" ? "es-ES" : "en-GB",
                        { hour: "2-digit", minute: "2-digit" },
                      )}
                    </time>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {!data.completions.length && (
          <div className="empty empty-compact surface">
            <span className="empty-icon">✓</span>
            <h2>{t("noHistory")}</h2>
            <p>{t("historyHint")}</p>
          </div>
        )}
      </div>
    </>
  );
}
