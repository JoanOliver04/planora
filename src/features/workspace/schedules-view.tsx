"use client";

import {
  deleteEmptySchedule,
  duplicateSchedule,
  reorderResources,
  saveSchedule,
  setActiveSchedule,
  setScheduleArchived,
} from "@/app/actions/domain";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SortableResourceList } from "@/components/sortable-resource-list";
import { useHashTarget } from "@/lib/workspace/use-hash-target";
import * as Dialog from "@radix-ui/react-dialog";
import { Archive, Copy, Edit3, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import type { Schedule, WorkspaceData } from "./types";

const fail = (e: unknown, fallback: string) =>
  toast.error(e instanceof Error ? e.message : fallback);

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
  useHashTarget(data.schedules.length);
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
          <article
            className="surface resource-card"
            id={`schedule-${s.id}`}
            key={s.id}
            tabIndex={-1}
          >
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
