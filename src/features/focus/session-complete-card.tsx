"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Check, ListChecks } from "lucide-react";
import type { FocusSession } from "./types";
import {
  buildExtraBlockStartInput,
  summarizeEndedSession,
} from "./cycles";
import { formatFocusDuration } from "./defaults";
import {
  completeLinkedTaskFromFocusAction,
  startFocusSessionAction,
} from "./actions";
import { useOptionalFocusSessionContext } from "./focus-session-context";
import { ConfirmDialog } from "@/components/confirm-dialog";

/**
 * Neutral summary after a completed session.
 * Offers extra block and optional linked-task completion without surprise side effects.
 */
export function SessionCompleteCard({
  session,
  onDismiss,
}: {
  session: FocusSession;
  onDismiss?: () => void;
}) {
  const t = useTranslations("Focus");
  const common = useTranslations("Common");
  const router = useRouter();
  const shared = useOptionalFocusSessionContext();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [localSession, setLocalSession] = useState(session);
  const summary = summarizeEndedSession(localSession);
  const linked =
    Boolean(localSession.taskId) && Boolean(localSession.occurrenceDate);
  const applied = localSession.taskCompletionApplied;

  if (hidden || localSession.status !== "completed") return null;

  function dismiss() {
    setHidden(true);
    onDismiss?.();
  }

  function extraBlock() {
    if (pending) return;
    startTransition(async () => {
      const result = await startFocusSessionAction(
        buildExtraBlockStartInput(localSession),
      );
      if (!result.ok) {
        toast.error(t("config.errors.network"));
        return;
      }
      toast.success(t("cycles.extraStarted"));
      void shared?.reloadActiveSession();
      void shared?.hydrateSession(result.data);
      router.refresh();
      dismiss();
    });
  }

  function completeTask(force = false) {
    if (pending || !localSession.taskId || !localSession.occurrenceDate) return;
    startTransition(async () => {
      const result = await completeLinkedTaskFromFocusAction({
        sessionId: localSession.id,
        expectedRevision: localSession.revision,
        taskId: localSession.taskId,
        occurrenceDate: localSession.occurrenceDate,
        force,
      });
      if (!result.ok) {
        if (
          result.error.code === "VALIDATION_ERROR" &&
          /not expected/i.test(result.error.message)
        ) {
          setForceOpen(true);
          return;
        }
        toast.error(result.error.message || t("config.errors.network"));
        return;
      }
      setLocalSession(result.data);
      toast.success(t("link.taskCompleted"));
      router.refresh();
    });
  }

  return (
    <section
      className="surface focus-complete-card"
      aria-labelledby="focus-complete-title"
    >
      <p className="eyebrow">{t("cycles.completeEyebrow")}</p>
      <h2 id="focus-complete-title">{t("cycles.completeTitle")}</h2>
      <p className="muted">{t("cycles.completeBody")}</p>
      {linked ? (
        <p className="focus-linked-task">
          <ListChecks size={16} aria-hidden="true" />
          <span>
            {localSession.linkSnapshot.taskTitle || t("config.linkedTask")}
            {localSession.occurrenceDate
              ? ` · ${localSession.occurrenceDate}`
              : ""}
          </span>
        </p>
      ) : null}
      <ul className="focus-complete-stats">
        <li>
          <span>{t("cycles.statFocus")}</span>
          <strong>
            {formatFocusDuration(summary.focusSec, "compact")}
          </strong>
        </li>
        <li>
          <span>{t("cycles.statBreak")}</span>
          <strong>
            {formatFocusDuration(summary.breakSec, "compact")}
          </strong>
        </li>
        {localSession.mode === "cycles" ? (
          <li>
            <span>{t("cycles.statBlocks")}</span>
            <strong>
              {summary.completedFocusBlocks}
              {summary.targetCycles != null
                ? ` / ${summary.targetCycles}`
                : ""}
            </strong>
          </li>
        ) : null}
      </ul>

      {linked ? (
        <div className="focus-link-complete-options" role="group" aria-label={t("link.optionsLabel")}>
          {applied ? (
            <p className="muted focus-complete-task-note">
              {t("link.alreadyApplied")}
            </p>
          ) : (
            <>
              <p className="muted focus-complete-task-note">
                {t("link.chooseOutcome")}
              </p>
              <div className="focus-complete-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={pending}
                  onClick={() => completeTask(false)}
                >
                  {t("link.completeOccurrence")}
                </button>
                <button
                  type="button"
                  className="focus-secondary-action"
                  disabled={pending}
                  onClick={dismiss}
                >
                  {t("link.saveOnly")}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="muted focus-complete-task-note">
          {t("cycles.taskNotAuto")}
        </p>
      )}

      <div className="focus-complete-actions">
        {localSession.mode === "cycles" ? (
          <button
            type="button"
            className="primary"
            disabled={pending}
            onClick={extraBlock}
          >
            <Play size={18} aria-hidden="true" />
            {t("cycles.extraBlock")}
          </button>
        ) : null}
        <button
          type="button"
          className="focus-secondary-action"
          onClick={dismiss}
        >
          <Check size={16} aria-hidden="true" />
          {t("cycles.done")}
        </button>
      </div>

      <ConfirmDialog
        open={forceOpen}
        onOpenChange={setForceOpen}
        title={t("link.forceTitle")}
        description={t("link.forceDescription")}
        cancelLabel={common("cancel")}
        confirmLabel={t("link.forceConfirm")}
        variant="primary"
        onConfirm={() => {
          completeTask(true);
          return true;
        }}
      />
    </section>
  );
}
