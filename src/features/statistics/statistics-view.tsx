"use client";
import { useLocale } from "next-intl";
import type { WorkspaceData } from "@/features/workspace/types";
import { calculateStatistics } from "./analytics";

export function StatisticsView({ data }: { data: WorkspaceData }) {
  const locale = useLocale() as "es" | "en";
  const es = locale === "es";
  const stats = calculateStatistics(data);
  const label = {
    morning: es ? "Mañana" : "Morning",
    afternoon: es ? "Tarde" : "Afternoon",
    night: es ? "Noche" : "Night",
  };
  const empty = data.completions.length === 0;
  return (
    <div className="statistics">
      <header className="topbar">
        <div>
          <p className="eyebrow">{es ? "Tu progreso" : "Your progress"}</p>
          <h1 className="title">{es ? "Estadísticas" : "Statistics"}</h1>
          <p className="muted">
            {es
              ? "Últimos 90 días, en tu zona horaria."
              : "Last 90 days, in your timezone."}
          </p>
        </div>
      </header>
      {empty ? (
        <div className="empty surface statistics-empty">
          <span className="empty-icon">↗</span>
          <h2>
            {es
              ? "Tu progreso aparecerá aquí"
              : "Your progress will appear here"}
          </h2>
          <p>
            {es
              ? "Completa tu primera tarea para empezar a ver tendencias, rachas y patrones."
              : "Complete your first task to start seeing trends, streaks and patterns."}
          </p>
        </div>
      ) : (
        <>
          <section
            className="statistics-kpis"
            aria-label={es ? "Resumen" : "Summary"}
          >
            <article className="surface statistic-kpi">
              <span>{es ? "Esta semana" : "This week"}</span>
              <strong>{stats.week.current}</strong>
              <small data-positive={stats.week.change >= 0}>
                {stats.week.change >= 0 ? "↑" : "↓"}{" "}
                {Math.abs(stats.week.change)}%{" "}
                {es ? "vs. anterior" : "vs previous"}
              </small>
            </article>
            <article className="surface statistic-kpi">
              <span>{es ? "Este mes" : "This month"}</span>
              <strong>{stats.month.current}</strong>
              <small data-positive={stats.month.change >= 0}>
                {stats.month.change >= 0 ? "↑" : "↓"}{" "}
                {Math.abs(stats.month.change)}%{" "}
                {es ? "vs. anterior" : "vs previous"}
              </small>
            </article>
            <article className="surface statistic-kpi">
              <span>{es ? "Racha actual" : "Current streak"}</span>
              <strong>
                {stats.streak} <em>{es ? "días" : "days"}</em>
              </strong>
              <small>
                {es ? "Mejor:" : "Best:"} {stats.bestStreak}
              </small>
            </article>
          </section>
          <section
            className="surface statistics-heatmap"
            aria-labelledby="activity-title"
          >
            <div>
              <h2 id="activity-title">{es ? "Actividad" : "Activity"}</h2>
              <p className="muted">
                {es
                  ? "Cada celda representa un día."
                  : "Each cell represents one day."}
              </p>
            </div>
            <div
              className="heatmap-grid"
              role="img"
              aria-label={
                es
                  ? "Mapa de tareas completadas durante los últimos 90 días"
                  : "Completed tasks heatmap for the last 90 days"
              }
            >
              {stats.heatmap.map((day) => (
                <span
                  key={day.date}
                  data-level={day.level}
                  title={day.date + ": " + day.count}
                  aria-label={
                    day.date +
                    ": " +
                    day.count +
                    (es ? " completadas" : " completed")
                  }
                />
              ))}
            </div>
            <div className="heatmap-legend">
              <span>{es ? "Menos" : "Less"}</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <i key={level} data-level={level} />
              ))}
              <span>{es ? "Más" : "More"}</span>
            </div>
          </section>
          <div className="statistics-split">
            <section className="surface statistics-panel">
              <h2>{es ? "Por categoría" : "By category"}</h2>
              {stats.categories.length ? (
                stats.categories.map((category) => (
                  <div className="stat-bar" key={category.name}>
                    <div>
                      <span>
                        <i style={{ background: category.colour }} />
                        {category.name}
                      </span>
                      <b>
                        {category.completed} · {category.rate}%
                      </b>
                    </div>
                    <progress
                      max={100}
                      value={category.rate}
                      aria-label={category.name + " " + category.rate + "%"}
                    />
                  </div>
                ))
              ) : (
                <p className="muted">
                  {es
                    ? "Las tareas sin categoría todavía cuentan en el total."
                    : "Uncategorized tasks still count towards totals."}
                </p>
              )}
            </section>
            <section className="surface statistics-panel">
              <h2>{es ? "Momento más productivo" : "Most productive time"}</h2>
              {stats.dayParts.map((part) => (
                <div className="stat-bar" key={part.key}>
                  <div>
                    <span>{label[part.key]}</span>
                    <b>
                      {part.count} · {part.percentage}%
                    </b>
                  </div>
                  <progress
                    max={100}
                    value={part.percentage}
                    aria-label={label[part.key] + " " + part.percentage + "%"}
                  />
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
