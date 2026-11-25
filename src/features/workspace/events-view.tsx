"use client";

import { deleteEvent } from "@/app/actions/domain";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { normalizeTaskSearch } from "@/lib/workspace/task-search";
import { useHashTarget } from "@/lib/workspace/use-hash-target";
import { filterEvents, type EventVisibility } from "@/lib/workspace/visibility";
import { EventForm } from "./event-form";
import { Edit3, Plus, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useItemSearch } from "@/lib/workspace/use-item-search";
import { useState } from "react";
import { toast } from "sonner";
import type { Event, WorkspaceData } from "./types";

export function EventsView({
  data,
  reload,
}: {
  data: WorkspaceData;
  reload: () => Promise<void>;
}) {
  const t = useTranslations("Workspace"),
    {
      query: search,
      setQuery: setSearch,
      selectedId,
      fromLink,
    } = useItemSearch(data.events),
    [editor, setEditor] = useState<{
      editing?: Event;
      trigger: HTMLButtonElement;
    } | null>(null),
    [visibility, setVisibility] = useState<EventVisibility>(
      fromLink ? "all" : "active",
    ),
    [deleting, setDeleting] = useState<Event | null>(null);
  const needle = normalizeTaskSearch(search);
  const events = filterEvents(
    data.events,
    visibility,
    data.profile.timezone,
  ).filter((event) =>
    selectedId
      ? event.id === selectedId
      : normalizeTaskSearch(
          `${event.title} ${event.description ?? ""}`,
        ).includes(needle),
  );
  useHashTarget(events);
  return (
    <>
      <header className="topbar">
        <h1 className="title">{t("events")}</h1>
        <button
          className="primary"
          onClick={(event) => setEditor({ trigger: event.currentTarget })}
        >
          <Plus size={18} />
          {t("add")}
        </button>
      </header>
      <div className="filterbar surface resource-filterbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label={t("searchEvent")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchEvent")}
          />
        </label>
        <select
          className="pill"
          aria-label={t("eventStatus")}
          value={visibility}
          onChange={(event) =>
            setVisibility(event.target.value as EventVisibility)
          }
        >
          <option value="active">{t("upcoming")}</option>
          <option value="finished">{t("finished")}</option>
          <option value="all">{t("all")}</option>
        </select>
      </div>
      <div className="task-list">
        {events.map((e) => (
          <article
            className="task surface"
            id={`event-${e.id}`}
            key={e.id}
            tabIndex={-1}
          >
            <span>{e.emoji || "📅"}</span>
            <div>
              <b>{e.title}</b>
              <div className="muted">
                {e.event_date} ·{" "}
                {e.all_day ? t("allDay") : e.start_time?.slice(0, 5)} ·{" "}
                {e.schedule_id
                  ? data.schedules.find((s) => s.id === e.schedule_id)?.name
                  : t("global")}
              </div>
            </div>
            <div className="row-actions">
              <button
                className="icon-button"
                aria-label={`${t("edit")} ${e.title}`}
                onClick={(event) =>
                  setEditor({ editing: e, trigger: event.currentTarget })
                }
              >
                <Edit3 size={16} />
              </button>
              <button
                className="icon-button"
                onClick={() => setDeleting(e)}
                aria-label={`${t("delete")} ${e.title}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!events.length && (
        <div className="empty empty-compact surface">
          <span className="empty-icon">{"\u{1F4C5}"}</span>
          <h2>{t("empty")}</h2>
          <p>{t("noMatchingEvents")}</p>
          {selectedId && (
            <button
              className="pill"
              type="button"
              onClick={() => {
                setSearch("");
                setVisibility("all");
              }}
            >
              {t("showAllEvents")}
            </button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`${t("delete")} ${deleting?.title ?? ""}`}
        description={t("deleteEventWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("delete")}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteEvent(deleting.id);
            await reload();
            setDeleting(null);
          } catch {
            toast.error(t("error"));
          }
        }}
      />
      {editor && (
        <EventForm
          editing={editor.editing}
          schedules={data.schedules}
          categories={data.categories}
          trigger={editor.trigger}
          onClose={() => setEditor(null)}
          onSaved={reload}
        />
      )}
    </>
  );
}
