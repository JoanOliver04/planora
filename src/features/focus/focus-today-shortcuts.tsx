"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Play, Timer } from "lucide-react";
import {
  buildFocusShortcuts,
  pickNextFocusTask,
  type FocusShortcutItem,
} from "./focus-deep-link";
import {
  emptyFocusRecents,
  FOCUS_RECENTS_STORAGE_KEY,
  readFocusRecents,
  type FocusRecents,
} from "./focus-recents";
import { useOptionalFocusSessionContext } from "./focus-session-context";

type TodayTask = {
  id: string;
  title: string;
  emoji: string | null;
  archived_at: string | null;
  category_id: string | null;
};

function subscribeRecents(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: StorageEvent) => {
    if (event.key === null || event.key === FOCUS_RECENTS_STORAGE_KEY) {
      onStoreChange();
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function getRecentsSnapshot(): FocusRecents {
  return readFocusRecents();
}

function getServerRecentsSnapshot(): FocusRecents {
  return emptyFocusRecents();
}

export function FocusTodayShortcuts({
  day,
  tasks,
  completedTaskIds,
}: {
  day: string;
  tasks: TodayTask[];
  completedTaskIds: Set<string>;
}) {
  const t = useTranslations("Focus");
  const ctx = useOptionalFocusSessionContext();
  const session = ctx?.engine.session ?? null;
  const hasActive =
    Boolean(session) &&
    (session?.status === "running" ||
      session?.status === "paused" ||
      session?.status === "on_break");

  const recents = useSyncExternalStore(
    subscribeRecents,
    getRecentsSnapshot,
    getServerRecentsSnapshot,
  );

  const nextTask = useMemo(
    () => pickNextFocusTask(tasks, completedTaskIds),
    [tasks, completedTaskIds],
  );

  const shortcuts = useMemo(
    () =>
      buildFocusShortcuts({
        hasActiveSession: hasActive,
        day,
        nextTask,
        lastPresetId: recents.lastPresetId,
        lastPresetName: recents.lastPresetName,
        // Deleted presets still appear until used; deep-link opens Focus quietly.
        lastPresetStillExists: true,
      }),
    [hasActive, day, nextTask, recents.lastPresetId, recents.lastPresetName],
  );

  if (shortcuts.length === 0) return null;

  return (
    <section
      className="focus-today-shortcuts surface"
      aria-label={t("shortcuts.label")}
    >
      <div className="focus-today-shortcuts-head">
        <span className="focus-today-shortcuts-icon" aria-hidden="true">
          <Timer size={16} />
        </span>
        <div>
          <p className="eyebrow">{t("shortcuts.eyebrow")}</p>
          <h2 className="focus-today-shortcuts-title">
            {t("shortcuts.title")}
          </h2>
        </div>
      </div>
      <div className="focus-today-shortcut-list">
        {shortcuts.map((item) => (
          <ShortcutLink key={`${item.kind}-${item.href}`} item={item} />
        ))}
      </div>
    </section>
  );
}

function ShortcutLink({ item }: { item: FocusShortcutItem }) {
  const t = useTranslations("Focus");
  const isContinue = item.kind === "continue";
  const label =
    item.kind === "continue"
      ? t("actions.continueSession")
      : item.kind === "quick"
        ? t("actions.quickStart")
        : item.kind === "nextTask"
          ? t("shortcuts.nextTask", {
              title: item.detail ?? t("shortcuts.untitledTask"),
            })
          : item.kind === "lastPreset"
            ? t("shortcuts.lastPreset", {
                name: item.detail ?? t("shortcuts.savedPreset"),
              })
            : t("shortcuts.openFocus");

  return (
    <Link
      href={item.href}
      className={
        isContinue
          ? "primary focus-today-shortcut focus-today-shortcut-primary"
          : "focus-today-shortcut"
      }
    >
      <Play size={16} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
