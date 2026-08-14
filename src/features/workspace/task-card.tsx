"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useLocale, useTranslations } from "next-intl";
import { Check, Edit3, StickyNote, Timer } from "lucide-react";
import { formatRecurrenceDescription } from "@/lib/recurrence";
import type { Category, Completion, Task } from "./types";
import { recurrenceFromJson } from "./types";
import { formatCategoryMetadata, uniqueMetadata } from "./presentation";

export function TaskCard({
  task,
  categories,
  completion,
  occurrenceDate,
  onToggle,
  onEdit,
  onStartFocus,
  focusActionLabel,
  progress,
}: {
  task: Task;
  categories: Category[];
  completion?: Completion;
  occurrenceDate?: string;
  onToggle?: (completed: boolean) => Promise<boolean>;
  onEdit?: () => void;
  onStartFocus?: () => void;
  focusActionLabel?: string;
  progress?: string;
}) {
  const t = useTranslations("Workspace"),
    locale = useLocale() as "es" | "en",
    category = categories.find((item) => item.id === task.category_id),
    [optimisticCompletion, setOptimisticCompletion] = useState<{
      occurrenceDate?: string;
      done: boolean;
    } | null>(null),
    [noteOpen, setNoteOpen] = useState(false),
    [togglePending, setTogglePending] = useState(false),
    done =
      optimisticCompletion &&
      optimisticCompletion.occurrenceDate === occurrenceDate
        ? optimisticCompletion.done
        : Boolean(completion),
    focusLabel = focusActionLabel ?? t("startFocus"),
    timing =
      task.start_time?.slice(0, 5) ??
      (task.time_mode === "day_part"
        ? t(task.day_part ?? "anytime")
        : t("anytime")),
    metadata = uniqueMetadata([
      category ? formatCategoryMetadata(category.name, category.emoji) : null,
      timing,
      formatRecurrenceDescription(
        recurrenceFromJson(task.recurrence_config, task.recurrence_type),
        locale,
      ),
      progress,
      task.scope === "global" ? t("global") : null,
    ]);

  return (
    <article
      className="task surface"
      data-completed={done}
      style={
        {
          "--accent": category?.colour ?? "var(--primary)",
        } as React.CSSProperties
      }
    >
      {onToggle ? (
        <button
          className="task-check"
          data-done={done}
          aria-pressed={done}
          aria-busy={togglePending}
          disabled={togglePending}
          aria-label={`${done ? t("completed") : t("markComplete")}: ${task.title}`}
          onClick={async () => {
            const previous = done;
            setOptimisticCompletion({ occurrenceDate, done: !previous });
            setTogglePending(true);
            try {
              const success = await onToggle(!previous);
              setOptimisticCompletion({
                occurrenceDate,
                done: success ? !previous : previous,
              });
            } finally {
              setTogglePending(false);
            }
          }}
        >
          {done && <Check size={19} />}
        </button>
      ) : (
        <span className="task-emoji">{task.emoji || "?"}</span>
      )}
      <div className="task-body">
        <div className="task-title" data-done={done}>
          <span className="task-emoji-inline">{task.emoji}</span>
          {task.title}
        </div>
        <div className="task-metadata">
          {metadata.map((item, index) => (
            <span
              className={index === 0 && category ? "category-badge" : ""}
              key={item}
            >
              {item}
            </span>
          ))}
        </div>
      </div>
      {onStartFocus && !task.archived_at ? (
        <button
          className="icon-button"
          type="button"
          onClick={onStartFocus}
          aria-label={`${focusLabel}: ${task.title}`}
          title={focusLabel}
        >
          <Timer size={17} />
        </button>
      ) : null}
      {onEdit && (
        <button
          className="icon-button"
          onClick={onEdit}
          aria-label={`${t("edit")} ${task.title}`}
        >
          <Edit3 size={17} />
        </button>
      )}
      {task.description && (
        <>
          <button
            className="pill note-button"
            type="button"
            onClick={() => setNoteOpen(true)}
          >
            <StickyNote size={16} /> {t("viewNote")}
          </button>
          <Dialog.Root open={noteOpen} onOpenChange={setNoteOpen}>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="dialog-content note-dialog">
                <Dialog.Title>
                  {t("note")} · {task.title}
                </Dialog.Title>
                <p className="task-note">{task.description}</p>
                <div className="dialog-actions">
                  <Dialog.Close className="pill">{t("close")}</Dialog.Close>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </>
      )}
    </article>
  );
}
