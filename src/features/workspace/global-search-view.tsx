"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useTranslations } from "next-intl";
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
} from "./search-index";
import type { WorkspaceData } from "./types";

const PAGE_SIZE = 50;
type SearchPosition = { userId: string; query: string; page: number };
const visits = new Map<string, SearchPosition>();
let visitsEpoch = clientSessionEpoch();

function currentVisits() {
  if (visitsEpoch !== clientSessionEpoch()) {
    visits.clear();
    visitsEpoch = clientSessionEpoch();
  }
  return visits;
}

function previousSearch(userId: string) {
  const saved =
    typeof window !== "undefined"
      ? currentVisits().get(window.history.state?.planoraSearchKey)
      : undefined;
  if (
    saved?.userId === userId &&
    canUsePrivateClientStorage(visitsEpoch, userId)
  )
    return { query: saved.query, page: saved.page };
  return { query: "", page: 1 };
}

export function GlobalSearchView({ data }: { data: WorkspaceData }) {
  const t = useTranslations("Planning");
  const [{ query, page }, setSearch] = useState(() =>
    previousSearch(data.user.id),
  );
  const index = useMemo(() => buildSearchIndex(data), [data]);
  const results = useMemo(
    () => findSearchResults(index, query),
    [index, query],
  );
  const pageCount = Math.ceil(results.length / PAGE_SIZE);
  const current = Math.min(page, pageCount || 1);
  const start = (current - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, results.length);
  const searching = normalizeTaskSearch(query).length >= 2;

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
      entries.set(key, { userId: data.user.id, query, page: current });
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
      <label className="global-search-input surface">
        <Search size={21} aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(event) =>
            setSearch({ query: event.target.value, page: 1 })
          }
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchTitle")}
        />
      </label>
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
              onClick={() => setSearch({ query, page: current - 1 })}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={t("nextResults")}
              disabled={current === pageCount}
              onClick={() => setSearch({ query, page: current + 1 })}
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
