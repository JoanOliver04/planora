"use client";

import { deleteEvent, saveEvent } from "@/app/actions/domain";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { normalizeTaskSearch } from "@/lib/workspace/task-search";
import { useHashTarget } from "@/lib/workspace/use-hash-target";
import { filterEvents, type EventVisibility } from "@/lib/workspace/visibility";
import * as Dialog from "@radix-ui/react-dialog";
import { Edit3, Plus, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { categoriesForSchedule } from "./categories";
import type { Event, WorkspaceData } from "./types";

const fail = (e: unknown, fallback: string) =>
  toast.error(e instanceof Error ? e.message : fallback);

export function EventsView({
  data,
  reload,
}: {
  data: WorkspaceData;
  reload: () => Promise<void>;
}) {
  const t = useTranslations("Workspace"),
    searchParams = useSearchParams(),
    initialSearch = searchParams.get("q") ?? "",
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Event | null>(null),
    [allDay, setAllDay] = useState(true),
    [eventSchedule, setEventSchedule] = useState(""),
    [visibility, setVisibility] = useState<EventVisibility>(
      initialSearch ? "all" : "active",
    ),
    [search, setSearch] = useState(initialSearch),
    [deleting, setDeleting] = useState<Event | null>(null),
    [pending, start] = useTransition();
  const events = filterEvents(
    data.events,
    visibility,
    data.profile.timezone,
  ).filter((event) =>
    normalizeTaskSearch(`${event.title} ${event.description ?? ""}`).includes(
      normalizeTaskSearch(search),
    ),
  );
  useHashTarget(events.length);
  function submit(fd: FormData) {
    start(async () => {
      try {
        await saveEvent({
          id: editing?.id,
          title: String(fd.get("title")),
          description: String(fd.get("description") || "") || null,
          emoji: String(fd.get("emoji") || "") || null,
          categoryId: String(fd.get("categoryId") || "") || null,
          scheduleId: String(fd.get("scheduleId") || "") || null,
          eventDate: String(fd.get("eventDate")),
          allDay,
          startTime: allDay ? null : String(fd.get("startTime")),
          endTime: allDay ? null : String(fd.get("endTime") || "") || null,
        });
        await reload();
        setOpen(false);
        toast.success(t("success"));
      } catch (e) {
        fail(e, t("error"));
      }
    });
  }
  return (
    <>
      <header className="topbar">
        <h1 className="title">{t("events")}</h1>
        <button
          className="primary"
          onClick={() => {
            setEditing(null);
            setAllDay(true);
            setEventSchedule("");
            setOpen(true);
          }}
        >
          <Plus size={18} />
          {t("add")}
        </button>
      </header>
      <div className="filterbar surface resource-filterbar">
        <label className="search-field">
          <Search size={17} />
          <input
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
                onClick={() => {
                  setEditing(e);
                  setAllDay(e.all_day);
                  setEventSchedule(e.schedule_id ?? "");
                  setOpen(true);
                }}
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
          } catch (error) {
            fail(error, t("error"));
          }
        }}
      />
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>
              {editing ? t("edit") : t("add")} {t("date")}
            </Dialog.Title>
            <form action={submit} className="form-grid">
              <label>
                {t("title")}
                <input
                  name="title"
                  required
                  maxLength={140}
                  defaultValue={editing?.title}
                />
              </label>
              <div className="form-row">
                <label>
                  {t("emoji")}
                  <input name="emoji" defaultValue={editing?.emoji ?? ""} />
                </label>
                <label>
                  {t("date")}
                  <input
                    name="eventDate"
                    type="date"
                    required
                    defaultValue={editing?.event_date}
                  />
                </label>
              </div>
              <label>
                {t("schedule")}
                <select
                  name="scheduleId"
                  value={eventSchedule}
                  onChange={(event) => setEventSchedule(event.target.value)}
                >
                  <option value="">{t("global")}</option>
                  {data.schedules.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("category")}
                <select
                  name="categoryId"
                  defaultValue={editing?.category_id ?? ""}
                >
                  <option value="">—</option>
                  {categoriesForSchedule(data.categories, eventSchedule).map(
                    (c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                />
                {t("allDay")}
              </label>
              {!allDay && (
                <div className="form-row">
                  <label>
                    {t("startTime")}
                    <input
                      name="startTime"
                      type="time"
                      required
                      defaultValue={editing?.start_time?.slice(0, 5)}
                    />
                  </label>
                  <label>
                    {t("endTime")}
                    <input
                      name="endTime"
                      type="time"
                      defaultValue={editing?.end_time?.slice(0, 5)}
                    />
                  </label>
                </div>
              )}
              <label>
                {t("description")}
                <textarea
                  name="description"
                  defaultValue={editing?.description ?? ""}
                />
              </label>
              <div className="dialog-actions">
                <Dialog.Close className="pill" type="button">
                  {t("cancel")}
                </Dialog.Close>
                <button className="primary" disabled={pending}>
                  {t("save")}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
