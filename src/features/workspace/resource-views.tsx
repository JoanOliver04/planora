"use client";
import * as Dialog from "@radix-ui/react-dialog";
import * as Alert from "@radix-ui/react-alert-dialog";
import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "@/components/theme-provider";
import { clearPrivateOfflineData } from "@/lib/offline/queue";
import { useRouter } from "@/i18n/routing";
import { Archive, Copy, Edit3, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  deleteCategory,
  deleteEmptySchedule,
  deleteEvent,
  duplicateSchedule,
  saveCategory,
  saveEvent,
  saveSchedule,
  setActiveSchedule,
  setScheduleArchived,
  updateProfile,
  reorderResources,
} from "@/app/actions/domain";
import { SortableResourceList } from "@/components/sortable-resource-list";
import type { Category, Event, Schedule, WorkspaceData } from "./types";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  applyPreferences,
  defaultPreferences,
  normalizePreferences,
  type UserPreferences,
} from "@/lib/preferences";
import { filterEvents, type EventVisibility } from "@/lib/workspace/visibility";
import { categoriesForSchedule } from "./categories";
import { FocusSettingsPanel } from "@/features/focus/focus-settings";
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
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Event | null>(null),
    [allDay, setAllDay] = useState(true),
    [eventSchedule, setEventSchedule] = useState(""),
    [visibility, setVisibility] = useState<EventVisibility>("active"),
    [deleting, setDeleting] = useState<Event | null>(null),
    [pending, start] = useTransition();
  const events = filterEvents(data.events, visibility, data.profile.timezone);
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
          <article className="task surface" key={e.id}>
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
export function SchedulesView({
  data,
  reload,
}: {
  data: WorkspaceData;
  reload: () => Promise<void>;
}) {
  const t = useTranslations("Workspace"),
    locale = useLocale() as "es" | "en",
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Schedule | null>(null),
    [confirming, setConfirming] = useState<{
      action: "delete" | "archive";
      schedule: Schedule;
    } | null>(null);
  async function submit(fd: FormData) {
    try {
      await saveSchedule({
        id: editing?.id,
        name: String(fd.get("name")),
        description: String(fd.get("description") || "") || null,
        emoji: String(fd.get("emoji") || "") || null,
      });
      await reload();
      setOpen(false);
    } catch (e) {
      fail(e, t("error"));
    }
  }
  return (
    <>
      <header className="topbar">
        <h1 className="title">{t("schedules")}</h1>
        <button
          className="primary"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus size={18} />
          {t("add")}
        </button>
      </header>
      <SortableResourceList
        key={data.schedules.map((item) => item.id).join()}
        items={data.schedules}
        className="grid-cards"
        locale={locale}
        getLabel={(item) => item.name}
        onCommit={(ids) => reorderResources({ type: "schedules", ids })}
        onError={() => toast.error(t("error"))}
        renderItem={(s) => (
          <article className="surface resource-card" key={s.id}>
            <div>
              <span className="resource-emoji">{s.emoji || "🌿"}</span>
              <h2>{s.name}</h2>
              <p className="muted">{s.description}</p>
              {data.profile.active_schedule_id === s.id && (
                <span className="status">{t("activeSchedule")}</span>
              )}
            </div>
            <div className="row-actions">
              <button
                className="pill"
                disabled={s.is_archived}
                aria-label={`${t("active")} ${s.name}`}
                onClick={() => void setActiveSchedule(s.id).then(reload)}
              >
                {t("active")}
              </button>
              <button
                className="icon-button"
                aria-label={`${t("edit")} ${s.name}`}
                onClick={() => {
                  setEditing(s);
                  setOpen(true);
                }}
              >
                <Edit3 size={16} />
              </button>
              <button
                className="icon-button"
                aria-label={`${t("duplicate")} ${s.name}`}
                onClick={() =>
                  void duplicateSchedule(s.id, true)
                    .then(reload)
                    .catch((x) => fail(x, t("error")))
                }
              >
                <Copy size={16} />
              </button>
              <button
                className="icon-button"
                aria-label={`${t("delete")} ${s.name}`}
                disabled={false}
                onClick={() => setConfirming({ action: "delete", schedule: s })}
              >
                <Trash2 size={16} />
              </button>
              <button
                className="icon-button"
                aria-label={`${s.is_archived ? t("restore") : t("archive")} ${s.name}`}
                disabled={data.profile.active_schedule_id === s.id}
                onClick={() =>
                  s.is_archived
                    ? void setScheduleArchived(s.id, false).then(reload)
                    : setConfirming({ action: "archive", schedule: s })
                }
              >
                {s.is_archived ? (
                  <RotateCcw size={16} />
                ) : (
                  <Archive size={16} />
                )}
              </button>
            </div>
          </article>
        )}
      />
      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={
          confirming
            ? `${t(confirming.action)} ${confirming.schedule.name}`
            : ""
        }
        description={
          confirming?.action === "delete"
            ? t("deleteScheduleWarning")
            : t("archiveScheduleWarning")
        }
        cancelLabel={t("cancel")}
        confirmLabel={t(confirming?.action ?? "archive")}
        onConfirm={async () => {
          if (!confirming) return;
          try {
            if (confirming.action === "delete")
              await deleteEmptySchedule(confirming.schedule.id);
            else await setScheduleArchived(confirming.schedule.id, true);
            await reload();
            setConfirming(null);
          } catch (error) {
            fail(error, t("error"));
          }
        }}
      />
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>{t("schedule")}</Dialog.Title>
            <form action={submit} className="form-grid">
              <label>
                {t("name")}
                <input name="name" required defaultValue={editing?.name} />
              </label>
              <label>
                {t("emoji")}
                <input name="emoji" defaultValue={editing?.emoji ?? ""} />
              </label>
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
                <button className="primary">{t("save")}</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
export function CategoriesView({
  data,
  reload,
}: {
  data: WorkspaceData;
  reload: () => Promise<void>;
}) {
  const t = useTranslations("Workspace"),
    locale = useLocale() as "es" | "en",
    [editing, setEditing] = useState<Category | null>(null),
    [open, setOpen] = useState(false),
    [deleting, setDeleting] = useState<Category | null>(null);
  async function submit(fd: FormData) {
    try {
      await saveCategory({
        id: editing?.id,
        name: String(fd.get("name")),
        emoji: String(fd.get("emoji") || "") || null,
        colour: String(fd.get("colour")),
        scheduleId: String(fd.get("scheduleId") || "") || null,
      });
      await reload();
      setOpen(false);
    } catch (e) {
      fail(e, t("error"));
    }
  }
  return (
    <>
      <header className="topbar">
        <h1 className="title">{t("categories")}</h1>
        <button
          className="primary"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus size={18} />
          {t("add")}
        </button>
      </header>
      <section className="surface">
        <SortableResourceList
          key={data.categories.map((item) => item.id).join()}
          items={data.categories}
          locale={locale}
          getLabel={(item) => item.name}
          onCommit={(ids) => reorderResources({ type: "categories", ids })}
          onError={() => toast.error(t("error"))}
          renderItem={(c) => (
            <div className="settings-row" key={c.id}>
              <span className="category-name">
                <i style={{ background: c.colour }} />
                {c.emoji} <b>{c.name}</b>
                <small className="muted">
                  {c.schedule_id
                    ? data.schedules.find((item) => item.id === c.schedule_id)
                        ?.name
                    : t("global")}
                </small>
              </span>
              <div className="row-actions">
                <button
                  className="icon-button"
                  aria-label={`${t("edit")} ${c.name}`}
                  onClick={() => {
                    setEditing(c);
                    setOpen(true);
                  }}
                >
                  <Edit3 size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`${t("delete")} ${c.name}`}
                  onClick={() => setDeleting(c)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )}
        />
      </section>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>{t("category")}</Dialog.Title>
            <form action={submit} className="form-grid">
              <label>
                {t("name")}
                <input name="name" required defaultValue={editing?.name} />
              </label>
              <label>
                {t("emoji")}
                <input name="emoji" defaultValue={editing?.emoji ?? ""} />
              </label>
              <label>
                {t("category")}
                <input
                  name="colour"
                  type="color"
                  defaultValue={editing?.colour ?? "#7D9D74"}
                />
              </label>
              <label>
                {t("categoryScope")}
                <select
                  name="scheduleId"
                  defaultValue={editing?.schedule_id ?? ""}
                >
                  <option value="">{t("global")}</option>
                  {data.schedules
                    .filter((item) => !item.is_archived)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.emoji} {item.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="dialog-actions">
                <Dialog.Close className="pill" type="button">
                  {t("cancel")}
                </Dialog.Close>
                <button className="primary">{t("save")}</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={!!deleting}
        onOpenChange={(value) => !value && setDeleting(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>
              {t("delete")} {deleting?.name}
            </Dialog.Title>
            <Dialog.Description className="muted">
              {t("deleteCategoryWarning")}
            </Dialog.Description>
            <form
              className="form-grid"
              action={async (fd) => {
                try {
                  await deleteCategory(
                    deleting!.id,
                    String(fd.get("target") || "") || null,
                  );
                  await reload();
                  setDeleting(null);
                } catch (e) {
                  fail(e, t("error"));
                }
              }}
            >
              <label>
                {t("reassign")}
                <select name="target">
                  <option value="">—</option>
                  {data.categories
                    .filter((item) => item.id !== deleting?.id)
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="dialog-actions">
                <Dialog.Close className="pill" type="button">
                  {t("cancel")}
                </Dialog.Close>
                <button className="primary">{t("delete")}</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
function DayPartsSettings({
  data,
  reload,
}: {
  data: WorkspaceData;
  reload: () => Promise<void>;
}) {
  const t = useTranslations("Workspace"),
    raw = data.profile.day_part_settings as Record<
      string,
      { start?: string; end?: string }
    >,
    [values, setValues] = useState({
      morning: {
        start: raw.morning?.start ?? "05:00",
        end: raw.morning?.end ?? "12:00",
      },
      afternoon: {
        start: raw.afternoon?.start ?? "12:00",
        end: raw.afternoon?.end ?? "18:00",
      },
      night: {
        start: raw.night?.start ?? "18:00",
        end: raw.night?.end ?? "05:00",
      },
    });
  async function save() {
    try {
      await updateProfile({ day_part_settings: values });
      await reload();
      toast.success(t("success"));
    } catch (e) {
      fail(e, t("error"));
    }
  }
  return (
    <div className="settings-block">
      <b>{t("dayParts")}</b>
      {(["morning", "afternoon", "night"] as const).map((part) => (
        <div className="settings-row" key={part}>
          <span>{t(part)}</span>
          <div className="row-actions">
            <input
              type="time"
              value={values[part].start}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  [part]: { ...v[part], start: e.target.value },
                }))
              }
            />
            <span>–</span>
            <input
              type="time"
              value={values[part].end}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  [part]: { ...v[part], end: e.target.value },
                }))
              }
            />
          </div>
        </div>
      ))}
      <button className="pill" onClick={() => void save()}>
        {t("save")}
      </button>
    </div>
  );
}

const accentPresets = [
  "#4f6b45",
  "#2563eb",
  "#7c3aed",
  "#be185d",
  "#c2410c",
  "#0f766e",
  "#475569",
  "#111827",
];

function PersonalizationSettings({
  data,
  save,
}: {
  data: WorkspaceData;
  save: (value: Record<string, unknown>) => Promise<void>;
}) {
  const t = useTranslations("Workspace"),
    [preferences, setPreferences] = useState(() =>
      normalizePreferences(data.profile.preferences),
    );
  useEffect(() => {
    applyPreferences(preferences);
  }, [preferences]);
  function update<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }
  return (
    <div className="settings-block personalization">
      <div>
        <b>{t("personalization")}</b>
        <p className="muted">{t("personalizationHint")}</p>
      </div>
      <div className="settings-row">
        <span>{t("accentColor")}</span>
        <div className="accent-picker">
          {accentPresets.map((accent) => (
            <button
              key={accent}
              type="button"
              className="accent-swatch"
              data-selected={preferences.accent === accent}
              style={{ background: accent }}
              aria-label={accent}
              aria-pressed={preferences.accent === accent}
              onClick={() => update("accent", accent)}
            />
          ))}
          <input
            type="color"
            value={preferences.accent}
            aria-label={t("customColor")}
            onChange={(event) => update("accent", event.target.value)}
          />
        </div>
      </div>
      <div className="settings-row">
        <span>{t("density")}</span>
        <select
          className="pill"
          value={preferences.density}
          onChange={(event) =>
            update("density", event.target.value as UserPreferences["density"])
          }
        >
          <option value="compact">{t("compact")}</option>
          <option value="comfortable">{t("comfortable")}</option>
          <option value="spacious">{t("spacious")}</option>
        </select>
      </div>
      <div className="settings-row">
        <label htmlFor="font-scale">{t("textSize")}</label>
        <div className="range-setting">
          <input
            id="font-scale"
            type="range"
            min="85"
            max="125"
            step="5"
            value={preferences.fontScale}
            onChange={(event) =>
              update("fontScale", Number(event.target.value))
            }
          />
          <output htmlFor="font-scale">{preferences.fontScale}%</output>
        </div>
      </div>
      <div className="settings-row">
        <span>{t("corners")}</span>
        <select
          className="pill"
          value={preferences.radius}
          onChange={(event) =>
            update("radius", event.target.value as UserPreferences["radius"])
          }
        >
          <option value="square">{t("square")}</option>
          <option value="soft">{t("soft")}</option>
          <option value="rounded">{t("rounded")}</option>
        </select>
      </div>
      <label className="settings-row check-row">
        <span>{t("reduceMotion")}</span>
        <input
          type="checkbox"
          checked={preferences.reduceMotion}
          onChange={(event) => update("reduceMotion", event.target.checked)}
        />
      </label>
      <label className="settings-row check-row">
        <span>{t("showCompleted")}</span>
        <input
          type="checkbox"
          checked={preferences.showCompleted}
          onChange={(event) => update("showCompleted", event.target.checked)}
        />
      </label>
      <div className="row-actions">
        <button
          className="pill"
          onClick={() =>
            setPreferences((current) => ({
              ...defaultPreferences,
              focus: current.focus,
            }))
          }
        >
          {t("reset")}
        </button>
        <button className="primary" onClick={() => void save({ preferences })}>
          {t("save")}
        </button>
      </div>
    </div>
  );
}

export function SettingsView({
  data,
  db,
  reload,
}: {
  data: WorkspaceData;
  db: ReturnType<typeof import("@/lib/supabase/client").createClient>;
  reload: () => Promise<void>;
}) {
  const t = useTranslations("Workspace"),
    locale = useLocale() as "es" | "en",
    router = useRouter(),
    { theme, setTheme } = useTheme(),
    [danger, setDanger] = useState(false),
    [confirmSignOut, setConfirmSignOut] = useState(false),
    [confirm, setConfirm] = useState("");
  async function profile(p: Record<string, unknown>) {
    try {
      await updateProfile(p);
      await reload();
      toast.success(t("success"));
    } catch (e) {
      fail(e, t("error"));
    }
  }
  return (
    <>
      <h1 className="title">{t("settings")}</h1>
      <section className="surface">
        <div className="settings-row">
          <span>{t("theme")}</span>
          <select
            className="pill"
            value={theme ?? data.profile.theme}
            onChange={(e) => {
              setTheme(e.target.value as "light" | "dark" | "system");
              void profile({ theme: e.target.value });
            }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="settings-row">
          <span>{t("language")}</span>
          <select
            className="pill"
            value={locale}
            onChange={(e) => {
              const next = e.target.value as "es" | "en";
              void profile({ locale: next });
              router.replace("/settings", { locale: next });
            }}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="settings-row">
          <span>{t("timezone")}</span>
          <input
            className="pill"
            defaultValue={data.profile.timezone}
            onBlur={(e) => void profile({ timezone: e.target.value })}
          />
        </div>
        <div className="settings-row">
          <span>{t("weekStart")}</span>
          <select
            className="pill"
            value={data.profile.week_starts_on}
            onChange={(e) =>
              void profile({ week_starts_on: Number(e.target.value) })
            }
          >
            <option value="1">Monday</option>
            <option value="0">Sunday</option>
          </select>
        </div>
        <PersonalizationSettings data={data} save={profile} />
        <FocusSettingsPanel
          profilePreferences={data.profile.preferences}
          onSaveAccount={async (preferences) => {
            await profile({ preferences });
          }}
        />
        <DayPartsSettings data={data} reload={reload} />
        {Intl.DateTimeFormat().resolvedOptions().timeZone !==
          data.profile.timezone && (
          <div className="settings-row">
            <span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
            <button
              className="pill"
              onClick={() =>
                void profile({
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                })
              }
            >
              {t("save")}
            </button>
          </div>
        )}
        <div className="settings-row">
          <span>{data.user.email}</span>
          <button className="pill" onClick={() => setConfirmSignOut(true)}>
            {t("signOut")}
          </button>
        </div>
        <div className="settings-row danger">
          <div>
            <b>{t("deleteAccount")}</b>
            <div className="muted">{t("deleteWarning")}</div>
          </div>
          <button className="primary" onClick={() => setDanger(true)}>
            {t("delete")}
          </button>
        </div>
      </section>
      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title={t("signOut")}
        description={t("signOutWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("signOut")}
        onConfirm={async () => {
          const { error } = await db.auth.signOut();
          if (error) {
            fail(error, t("error"));
            return;
          }
          await clearPrivateOfflineData(data.user.id);
          location.href = `/${locale}/login`;
        }}
      />
      <Alert.Root open={danger} onOpenChange={setDanger}>
        <Alert.Portal>
          <Alert.Overlay className="dialog-overlay" />
          <Alert.Content className="dialog-content">
            <Alert.Title>{t("deleteAccount")}</Alert.Title>
            <Alert.Description>{t("deleteWarning")}</Alert.Description>
            <label>
              {t("deleteConfirm")}
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <Alert.Cancel className="pill">{t("cancel")}</Alert.Cancel>
              <Alert.Action
                className="primary"
                disabled={confirm !== t("deleteConfirm")}
                onClick={async () => {
                  const r = await fetch("/api/account", {
                    method: "DELETE",
                    headers: { "x-planora-confirm": "delete-account" },
                  });
                  if (r.ok) {
                    await clearPrivateOfflineData(data.user.id);
                    location.href = `/${locale}/login`;
                  } else toast.error(t("error"));
                }}
              >
                {t("delete")}
              </Alert.Action>
            </div>
          </Alert.Content>
        </Alert.Portal>
      </Alert.Root>
    </>
  );
}
