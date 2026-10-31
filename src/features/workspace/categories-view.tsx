"use client";

import {
  deleteCategory,
  reorderResources,
  saveCategory,
} from "@/app/actions/domain";
import { SortableResourceList } from "@/components/sortable-resource-list";
import { useHashTarget } from "@/lib/workspace/use-hash-target";
import * as Dialog from "@radix-ui/react-dialog";
import { Edit3, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import type { Category, WorkspaceData } from "./types";

const fail = (e: unknown, fallback: string) =>
  toast.error(e instanceof Error ? e.message : fallback);

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
  useHashTarget(data.categories.length);
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
            <div
              className="settings-row"
              id={`category-${c.id}`}
              key={c.id}
              tabIndex={-1}
            >
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
