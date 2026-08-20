"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  Copy,
  ListPlus,
  Pencil,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import type { FocusPreset, FocusSession, SessionStartDraft } from "./types";
import {
  deleteFocusPresetAction,
  duplicateFocusPresetAction,
  reorderFocusPresetsAction,
  saveFocusPresetAction,
  setFocusPresetArchivedAction,
  toggleFocusPresetFavoriteAction,
} from "./actions";
import { PresetEditorDialog } from "./preset-editor";
import {
  FOCUS_PRESET_TEMPLATES,
  orderPresetsForHome,
  recentPresetIdsFromSessions,
  templateToPresetInput,
} from "./preset-templates";
import { formatFocusDuration } from "./defaults";
import { SortableResourceList } from "@/components/sortable-resource-list";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { draftFromPreset } from "./focus-deep-link";

type CategoryOption = { id: string; name: string; emoji: string | null };

export function FocusPresetManager({
  presets,
  recentSessions = [],
  categories = [],
  onStartPreset,
  maxHomeCards = 6,
  openCreateSignal = 0,
}: {
  presets: FocusPreset[];
  recentSessions?: FocusSession[];
  categories?: CategoryOption[];
  onStartPreset: (draft: SessionStartDraft) => void;
  maxHomeCards?: number;
  /** Increment to open the create-preset editor from outside (onboarding). */
  openCreateSignal?: number;
}) {
  const t = useTranslations("Focus");
  const common = useTranslations("Common");
  const locale = useLocale() as "es" | "en";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<FocusPreset | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FocusPreset | null>(null);

  const activePresets = useMemo(() => orderPresetsForHome(presets), [presets]);
  const archivedPresets = useMemo(
    () => presets.filter((preset) => Boolean(preset.archivedAt)),
    [presets],
  );
  const recentIds = useMemo(
    () => recentPresetIdsFromSessions(recentSessions, 3),
    [recentSessions],
  );
  const homeCards = activePresets.slice(0, maxHomeCards);

  useEffect(() => {
    if (!openCreateSignal) return;
    // Open create editor after the click that bumped the signal (avoid setState-in-render).
    const id = window.setTimeout(() => {
      setEditing(null);
      setEditorOpen(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [openCreateSignal]);

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(preset: FocusPreset) {
    setEditing(preset);
    setEditorOpen(true);
  }

  function createFromTemplate(
    key: (typeof FOCUS_PRESET_TEMPLATES)[number]["key"],
  ) {
    const template = FOCUS_PRESET_TEMPLATES.find((item) => item.key === key);
    if (!template || pending) return;
    startTransition(async () => {
      const input = templateToPresetInput(template, t(`templates.${key}.name`));
      if (template.mode === "structured_plan") {
        input.segments = template.segments.map((segment, index) => ({
          ...segment,
          name: t(`templates.${key}.blocks.${index + 1}`),
        }));
      }
      const result = await saveFocusPresetAction(input);
      if (!result.ok) {
        toast.error(result.error.message || t("presets.errors.generic"));
        return;
      }
      toast.success(t("presets.createdFromTemplate"));
      router.refresh();
    });
  }

  function runAction(
    action: () => Promise<{ ok: boolean; error?: { message: string } }>,
    successKey: string,
  ) {
    if (pending) return;
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error?.message || t("presets.errors.generic"));
        return;
      }
      toast.success(t(successKey));
      router.refresh();
    });
  }

  return (
    <section className="focus-section" aria-labelledby="focus-presets-title">
      <div className="focus-section-head focus-presets-head">
        <div>
          <h2 id="focus-presets-title">{t("presets.title")}</h2>
          <p className="muted">{t("presets.subtitle")}</p>
        </div>
        <div className="focus-presets-head-actions">
          <button type="button" className="pill" onClick={openCreate}>
            <ListPlus size={16} aria-hidden="true" />
            {t("actions.createPreset")}
          </button>
          <button
            type="button"
            className="pill"
            onClick={() => setManageOpen((value) => !value)}
            aria-expanded={manageOpen}
          >
            {manageOpen ? t("presets.hideManage") : t("presets.manage")}
          </button>
        </div>
      </div>

      {homeCards.length > 0 ? (
        <div className="focus-preset-grid">
          {homeCards.map((preset) => {
            const recent = recentIds.includes(preset.id);
            return (
              <article
                key={preset.id}
                className="surface focus-preset-card focus-preset-card-managed"
              >
                <button
                  type="button"
                  className="focus-preset-start"
                  onClick={() => onStartPreset(draftFromPreset(preset))}
                >
                  <span className="focus-preset-icon" aria-hidden="true">
                    {preset.emoji || "🎯"}
                  </span>
                  <strong>{preset.name}</strong>
                  <small>
                    {t(`modes.${preset.mode}`)}
                    {preset.focusDurationSec
                      ? ` · ${formatFocusDuration(preset.focusDurationSec, "compact")}`
                      : ""}
                    {preset.isFavorite
                      ? ` · ${t("presets.favoriteBadge")}`
                      : ""}
                    {recent ? ` · ${t("presets.recentBadge")}` : ""}
                  </small>
                </button>
                <div className="focus-preset-card-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t("presets.edit")}
                    onClick={() => openEdit(preset)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={
                      preset.isFavorite
                        ? t("presets.unfavorite")
                        : t("presets.favorite")
                    }
                    disabled={pending}
                    onClick={() =>
                      runAction(
                        () =>
                          toggleFocusPresetFavoriteAction({
                            presetId: preset.id,
                            isFavorite: !preset.isFavorite,
                          }),
                        "presets.favoriteUpdated",
                      )
                    }
                  >
                    <Star
                      size={15}
                      fill={preset.isFavorite ? "currentColor" : "none"}
                    />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="focus-template-grid">
          <p className="muted">{t("presets.emptyTemplates")}</p>
          {FOCUS_PRESET_TEMPLATES.map((template) => (
            <button
              key={template.key}
              type="button"
              className="surface focus-preset-card"
              disabled={pending}
              onClick={() => createFromTemplate(template.key)}
            >
              <span className="focus-preset-icon" aria-hidden="true">
                {template.emoji}
              </span>
              <strong>{t(`templates.${template.key}.name`)}</strong>
              <small>{t(`templates.${template.key}.hint`)}</small>
            </button>
          ))}
        </div>
      )}

      {manageOpen ? (
        <div className="focus-preset-manage surface">
          <div className="focus-section-head">
            <h3>{t("presets.manageTitle")}</h3>
            <p className="muted">{t("presets.manageHint")}</p>
          </div>

          {activePresets.length > 0 ? (
            <SortableResourceList
              items={activePresets}
              locale={locale}
              className="focus-preset-sort-list"
              getLabel={(item) => item.name}
              onCommit={async (ids) => {
                const result = await reorderFocusPresetsAction({
                  orderedIds: ids,
                });
                if (!result.ok) throw new Error("reorder failed");
                router.refresh();
              }}
              onError={() => toast.error(t("presets.errors.generic"))}
              renderItem={(preset) => (
                <div className="focus-preset-manage-row">
                  <button
                    type="button"
                    className="focus-preset-manage-main"
                    onClick={() => onStartPreset(draftFromPreset(preset))}
                  >
                    <span aria-hidden="true">{preset.emoji || "🎯"}</span>
                    <span>
                      <strong>{preset.name}</strong>
                      <small className="muted">
                        {t(`modes.${preset.mode}`)}
                        {preset.focusDurationSec
                          ? ` · ${formatFocusDuration(preset.focusDurationSec, "compact")}`
                          : ""}
                      </small>
                    </span>
                  </button>
                  <div className="focus-preset-card-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t("presets.edit")}
                      onClick={() => openEdit(preset)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t("presets.duplicate")}
                      disabled={pending}
                      onClick={() =>
                        runAction(
                          () =>
                            duplicateFocusPresetAction({
                              presetId: preset.id,
                            }),
                          "presets.duplicated",
                        )
                      }
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t("presets.archive")}
                      disabled={pending}
                      onClick={() =>
                        runAction(
                          () =>
                            setFocusPresetArchivedAction({
                              presetId: preset.id,
                              archived: true,
                            }),
                          "presets.archived",
                        )
                      }
                    >
                      <Archive size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t("presets.delete")}
                      onClick={() => setDeleteTarget(preset)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )}
            />
          ) : (
            <p className="muted">{t("presets.noActive")}</p>
          )}

          {archivedPresets.length > 0 ? (
            <div className="focus-archived-presets">
              <button
                type="button"
                className="pill"
                onClick={() => setShowArchived((value) => !value)}
              >
                {showArchived
                  ? t("presets.hideArchived")
                  : t("presets.showArchived", {
                      count: archivedPresets.length,
                    })}
              </button>
              {showArchived
                ? archivedPresets.map((preset) => (
                    <div className="focus-preset-manage-row" key={preset.id}>
                      <span>
                        <strong>{preset.name}</strong>
                        <small className="muted">
                          {" "}
                          {t("presets.archivedBadge")}
                        </small>
                      </span>
                      <div className="focus-preset-card-actions">
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={t("presets.restore")}
                          disabled={pending}
                          onClick={() =>
                            runAction(
                              () =>
                                setFocusPresetArchivedAction({
                                  presetId: preset.id,
                                  archived: false,
                                }),
                              "presets.restored",
                            )
                          }
                        >
                          <RotateCcw size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={t("presets.delete")}
                          onClick={() => setDeleteTarget(preset)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))
                : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <PresetEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        preset={editing}
        categories={categories}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("presets.deleteTitle")}
        description={t("presets.deleteDescription")}
        cancelLabel={common("cancel")}
        confirmLabel={t("presets.deleteConfirm")}
        variant="danger"
        onConfirm={() => {
          if (!deleteTarget) return true;
          runAction(
            () => deleteFocusPresetAction({ presetId: deleteTarget.id }),
            "presets.deleted",
          );
          setDeleteTarget(null);
          return true;
        }}
      />
    </section>
  );
}
