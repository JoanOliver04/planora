"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import {
  canUsePrivateClientStorage,
  clientSessionEpoch,
} from "@/lib/security/client-session";
import { normalizeTaskSearch } from "@/lib/workspace/task-search";
import {
  buildSearchIndex,
  findSearchResults,
  searchResultHref,
  type SearchFilter,
} from "./search-index";
import type { WorkspaceData } from "./types";

const PAGE_SIZE = 50;
type SearchPosition = {
  userId: string;
  query: string;
  filter: SearchFilter;
  page: number;
};
const visits = new Map<string, SearchPosition>();
let visitsEpoch = clientSessionEpoch();

function currentVisits() {
  if (visitsEpoch !== clientSessionEpoch()) {
    visits.clear();
    visitsEpoch = clientSessionEpoch();
  }
  return visits;
}

function previousSearch(userId: string): Omit<SearchPosition, "userId"> {
  const saved =
    typeof window !== "undefined"
      ? currentVisits().get(window.history.state?.planoraSearchKey)
      : undefined;
  if (
    saved?.userId === userId &&
    canUsePrivateClientStorage(visitsEpoch, userId)
  )
    return { query: saved.query, filter: saved.filter, page: saved.page };
  return { query: "", filter: "all", page: 1 };
}

export function GlobalSearchView({ data }: { data: WorkspaceData }) {
  const t = useTranslations("Planning");
  const nav = useTranslations("Nav");
  const common = useTranslations("Common");
  const locale = useLocale();
  const input = useRef<HTMLInputElement>(null);
  const [{ query, filter, page }, setSearch] = useState(() =>
    previousSearch(data.user.id),
  );
  const index = useMemo(() => buildSearchIndex(data, locale), [data, locale]);
  const results = useMemo(
    () => findSearchResults(index, query, filter),
    [index, query, filter],
  );
  const pageCount = Math.ceil(results.length / PAGE_SIZE);
  const current = Math.min(page, pageCount || 1);
  const start = (current - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, results.length);
  const searching = filter !== "all" || normalizeTaskSearch(query).length >= 2;
  const filterLabels: Record<SearchFilter, string> = {
    all: common("all"),
    task: nav("tasks"),
    event: nav("events"),
    category: nav("categories"),
    schedule: nav("schedules"),
  };

  function rememberSearch() {
    // Keep private search terms in tab memory. History only needs the lookup key.
    try {
      const entries = currentVisits();
      if (!canUsePrivateClientStorage(visitsEpoch, data.user.id)) return;
      const key: string =
        window.history.state?.planoraSearchKey ?? crypto.randomUUID();
      window.history.replaceState(
        { ...window.history.state, planoraSearchKey: key },
        "",
      );
      entries.delete(key);
      entries.set(key, { userId: data.user.id, query, filter, page: current });
      if (entries.size > 32) entries.delete(entries.keys().next().value!);
    } catch {
      /* Navigation can continue when browser history is restricted. */
    }
  }

  return (
    <section className="global-search-page" aria-labelledby="search-title">
      <header className="topbar">
        <div>
          <div className="eyebrow">{t("searchEyebrow")}</div>
          <h1 className="title" id="search-title">
            {t("searchTitle")}
          </h1>
        </div>
      </header>
      <div className="global-search-input surface">
        <Search size={21} aria-hidden="true" />
        <input
          autoFocus
          ref={input}
          id="workspace-search-query"
          value={query}
          onChange={(event) =>
            setSearch({ query: event.target.value, filter, page: 1 })
          }
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchTitle")}
        />
        {query && (
          <button
            type="button"
            className="icon-button"
            aria-label={t("clearQuery")}
            onClick={() => {
              setSearch({ query: "", filter, page: 1 });
              input.current?.focus();
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <fieldset className="search-filters">
        <legend className="sr-only">{t("resultType")}</legend>
        {(["all", "task", "event", "category", "schedule"] as const).map(
          (kind) => (
            <label key={kind} className="pill">
              <input
                type="radio"
                name="search-type"
                value={kind}
                checked={filter === kind}
                onChange={() => setSearch({ query, filter: kind, page: 1 })}
              />
              {filterLabels[kind]}
            </label>
          ),
        )}
      </fieldset>
      <div className={results.length ? "search-results-toolbar" : "sr-only"}>
        <span role="status" className="muted">
          {results.length
            ? t("searchResultRange", {
                start: start + 1,
                end,
                total: results.length,
              })
            : searching
              ? t("noResults")
              : ""}
        </span>
        {pageCount > 1 && (
          <nav aria-label={t("searchPages")}>
            <button
              className="icon-button"
              type="button"
              aria-label={t("previousResults")}
              disabled={current === 1}
              onClick={() => setSearch({ query, filter, page: current - 1 })}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={t("nextResults")}
              disabled={current === pageCount}
              onClick={() => setSearch({ query, filter, page: current + 1 })}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </nav>
        )}
      </div>
      {!searching ? (
        <div className="empty surface">
          <Search size={28} aria-hidden="true" />
          <h2>{t("searchHintTitle")}</h2>
          <p>{t("searchHint")}</p>
        </div>
      ) : results.length ? (
        <div className="search-results">
          {results.slice(start, end).map((item) => (
            <Link
              className="search-result surface"
              key={`${item.kind}-${item.id}`}
              href={searchResultHref(item)}
              prefetch={false}
              onNavigate={rememberSearch}
            >
              <span className="search-result-type">{t(item.kind)}</span>
              <strong>{item.title}</strong>
              {item.context && <small>{item.context}</small>}
              {item.description && <small>{item.description}</small>}
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty surface">
          <h2>{t("noResults")}</h2>
          <p>{t("noResultsHint")}</p>
        </div>
      )}
    </section>
  );
}
