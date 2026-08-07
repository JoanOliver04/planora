"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Check } from "lucide-react";
import type { FocusSession } from "./types";
import {
  buildExtraBlockStartInput,
  summarizeEndedSession,
} from "./cycles";
import { formatFocusDuration } from "./defaults";
import { startFocusSessionAction } from "./actions";
import { useOptionalFocusSessionContext } from "./focus-session-context";

/**
 * Neutral summary after a completed session.
 * Offers one extra focus block without guilt language or auto task completion.
 */
export function SessionCompleteCard({
  session,
  onDismiss,
}: {
  session: FocusSession;
  onDismiss?: () => void;
}) {
  const t = useTranslations("Focus");
  const router = useRouter();
  const shared = useOptionalFocusSessionContext();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);
  const summary = summarizeEndedSession(session);

  if (hidden || session.status !== "completed") return null;

  function dismiss() {
    setHidden(true);
    onDismiss?.();
  }

  function extraBlock() {
    if (pending) return;
    startTransition(async () => {
      const result = await startFocusSessionAction(
        buildExtraBlockStartInput(session),
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

  return (
    <section
      className="surface focus-complete-card"
      aria-labelledby="focus-complete-title"
    >
      <p className="eyebrow">{t("cycles.completeEyebrow")}</p>
      <h2 id="focus-complete-title">{t("cycles.completeTitle")}</h2>
      <p className="muted">{t("cycles.completeBody")}</p>
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
        {session.mode === "cycles" ? (
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
      {session.completeTaskOnEnd ? (
        <p className="muted focus-complete-task-note">
          {t("cycles.taskPrefNote")}
        </p>
      ) : (
        <p className="muted focus-complete-task-note">
          {t("cycles.taskNotAuto")}
        </p>
      )}
      <div className="focus-complete-actions">
        {session.mode === "cycles" ? (
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
    </section>
  );
}
