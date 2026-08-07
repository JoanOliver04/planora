"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Play,
  Check,
  ListChecks,
  Trash2,
  Plus,
  LoaderCircle,
} from "lucide-react";
import type { FocusSession } from "./types";
import { buildExtraBlockStartInput } from "./cycles";
import { formatFocusDuration } from "./defaults";
import {
  completeLinkedTaskFromFocusAction,
  discardFocusSessionAction,
  startFocusSessionAction,
  updateFocusSessionMetadataAction,
} from "./actions";
import { useOptionalFocusSessionContext } from "./focus-session-context";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  buildSessionReviewSummary,
  emptyReviewDraft,
  FOCUS_OUTCOMES,
  type FocusOutcome,
  type FocusReviewInput,
  removeDistractionAt,
} from "./focus-review";
import {
  FOCUS_MAX_DISTRACTION_LENGTH,
  FOCUS_MAX_NOTES_LENGTH,
} from "./validation";
import { TaskForm } from "@/features/workspace/task-form";
import type { Category, Schedule } from "@/features/workspace/types";
import { createClient } from "@/lib/supabase/client";
import { hasStructuredPlan, summarizePlanRuntime } from "./session-plan";

/**
 * Neutral end-of-session review: summary first, optional reflection, no forced fields.
 * Notes and distractions stay private (never logged or sent to analytics).
 */
export function SessionCompleteCard({
  session,
  onDismiss,
  weeklyGoalLabel,
  openReviewByDefault = true,
}: {
  session: FocusSession;
  onDismiss?: () => void;
  /** Optional preformatted weekly goal progress line. */
  weeklyGoalLabel?: string | null;
  /** When true, the optional reflection panel starts expanded. */
  openReviewByDefault?: boolean;
}) {
  const t = useTranslations("Focus");
  const common = useTranslations("Common");
  const router = useRouter();
  const shared = useOptionalFocusSessionContext();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [localSession, setLocalSession] = useState(session);
  const [review, setReview] = useState<FocusReviewInput>(() =>
    emptyReviewDraft(session),
  );
  const [saved, setSaved] = useState(false);
  const [taskTitle, setTaskTitle] = useState<string | null>(null);
  const [taskResources, setTaskResources] = useState<{
    schedules: Schedule[];
    categories: Category[];
    timezone: string;
  } | null>(null);
  const [loadingTaskForm, setLoadingTaskForm] = useState(false);

  const summary = buildSessionReviewSummary(localSession);
  const planRows = hasStructuredPlan(localSession)
    ? summarizePlanRuntime(localSession)
    : [];
  const linked =
    Boolean(localSession.taskId) && Boolean(localSession.occurrenceDate);
  const applied = localSession.taskCompletionApplied;
  const isCancelled = localSession.status === "cancelled";
  const isCompleted = localSession.status === "completed";

  if (hidden || (!isCompleted && !isCancelled)) return null;

  function dismiss() {
    setHidden(true);
    onDismiss?.();
  }

  function updateReview<K extends keyof FocusReviewInput>(
    key: K,
    value: FocusReviewInput[K],
  ) {
    setReview((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function saveReview() {
    if (pending) return;
    startTransition(async () => {
      const notes = review.notes?.trim() || null;
      if (notes && notes.length > FOCUS_MAX_NOTES_LENGTH) {
        toast.error(t("review.noteTooLong"));
        return;
      }
      const result = await updateFocusSessionMetadataAction({
        sessionId: localSession.id,
        expectedRevision: localSession.revision,
        notes,
        subjectiveFocus: review.subjectiveFocus,
        subjectiveEnergy: review.subjectiveEnergy,
        distractions: review.distractions,
        outcome: review.outcome,
        nextStep: review.nextStep?.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.error.message || t("config.errors.network"));
        return;
      }
      setLocalSession(result.data);
      setReview(emptyReviewDraft(result.data));
      setSaved(true);
      toast.success(t("review.saved"));
      router.refresh();
    });
  }

  function extraBlock() {
    if (pending || isCancelled) return;
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

  function discardSession() {
    if (pending) return;
    startTransition(async () => {
      const result = await discardFocusSessionAction({
        sessionId: localSession.id,
        expectedRevision: localSession.revision,
      });
      if (!result.ok) {
        toast.error(result.error.message || t("config.errors.network"));
        return;
      }
      toast.success(t("review.discarded"));
      void shared?.hydrateSession(null);
      void shared?.clearLastCompleted();
      router.refresh();
      dismiss();
    });
  }

  async function openConvertToTask(text: string) {
    setLoadingTaskForm(true);
    try {
      const db = createClient();
      const {
        data: { user },
      } = await db.auth.getUser();
      if (!user) {
        toast.error(t("config.errors.network"));
        return;
      }
      const [{ data: schedules }, { data: categories }, { data: profile }] =
        await Promise.all([
          db.from("schedules").select("*").eq("user_id", user.id),
          db.from("categories").select("*").eq("user_id", user.id),
          db
            .from("profiles")
            .select("timezone")
            .eq("id", user.id)
            .maybeSingle(),
        ]);
      setTaskResources({
        schedules: (schedules ?? []) as Schedule[],
        categories: (categories ?? []) as Category[],
        timezone: profile?.timezone ?? "Europe/Madrid",
      });
      setTaskTitle(text.slice(0, 140));
    } catch {
      toast.error(t("config.errors.network"));
    } finally {
      setLoadingTaskForm(false);
    }
  }

  const intention =
    summary.taskTitle || summary.intention || t("active.untitled");

  return (
    <section
      className="surface focus-complete-card"
      aria-labelledby="focus-complete-title"
    >
      <p className="eyebrow">
        {isCancelled
          ? t("review.cancelledEyebrow")
          : t("cycles.completeEyebrow")}
      </p>
      <h2 id="focus-complete-title">
        {isCancelled ? t("review.cancelledTitle") : t("cycles.completeTitle")}
      </h2>
      <p className="muted">
        {isCancelled ? t("review.cancelledBody") : t("cycles.completeBody")}
      </p>

      <p className="focus-linked-task">
        <ListChecks size={16} aria-hidden="true" />
        <span>{intention}</span>
      </p>

      <ul className="focus-complete-stats">
        <li>
          <span>{t("cycles.statFocus")}</span>
          <strong>{formatFocusDuration(summary.focusSec, "compact")}</strong>
        </li>
        <li>
          <span>{t("cycles.statBreak")}</span>
          <strong>{formatFocusDuration(summary.breakSec, "compact")}</strong>
        </li>
        <li>
          <span>{t("review.statPaused")}</span>
          <strong>{formatFocusDuration(summary.pausedSec, "compact")}</strong>
        </li>
        {localSession.mode === "cycles" ? (
          <li>
            <span>{t("cycles.statBlocks")}</span>
            <strong>
              {summary.completedFocusBlocks}
              {summary.targetCycles != null ? ` / ${summary.targetCycles}` : ""}
            </strong>
          </li>
        ) : null}
        {summary.plannedFocusSec != null ? (
          <li>
            <span>{t("review.statPlanned")}</span>
            <strong>
              {formatFocusDuration(summary.plannedFocusSec, "compact")}
              {summary.plannedVsActualSec != null
                ? ` → ${formatFocusDuration(summary.focusSec, "compact")}`
                : ""}
            </strong>
          </li>
        ) : null}
      </ul>

      {weeklyGoalLabel ? (
        <p className="muted focus-complete-task-note">{weeklyGoalLabel}</p>
      ) : null}

      {planRows.length > 0 ? (
        <div className="focus-plan-summary">
          <h3>{t("plan.summaryTitle")}</h3>
          <p className="muted">{t("plan.summaryHint")}</p>
          <ul>
            {planRows.map((row) => (
              <li key={row.index}>
                <span>
                  {row.segment.emoji ? `${row.segment.emoji} ` : ""}
                  {row.segment.name}
                  {row.skippedEarly ? ` · ${t("plan.skippedEarly")}` : ""}
                </span>
                <strong>
                  {row.plannedSec == null
                    ? formatFocusDuration(row.actualSec, "compact")
                    : `${formatFocusDuration(row.plannedSec, "compact")} → ${formatFocusDuration(row.actualSec, "compact")}`}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {review.distractions.length > 0 ? (
        <div className="focus-review-distractions">
          <h3>{t("review.distractionsTitle")}</h3>
          <p className="muted">{t("review.distractionsHint")}</p>
          <ul>
            {review.distractions.map((item, index) => (
              <li key={`${item}-${index}`}>
                <span>{item}</span>
                <div className="focus-review-distraction-actions">
                  <button
                    type="button"
                    className="pill"
                    disabled={pending || loadingTaskForm}
                    onClick={() => void openConvertToTask(item)}
                  >
                    <Plus size={14} aria-hidden="true" />
                    {t("review.convertToTask")}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={pending}
                    aria-label={t("review.dismissDistraction")}
                    onClick={() =>
                      updateReview(
                        "distractions",
                        removeDistractionAt(review.distractions, index),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="focus-review-optional" open={openReviewByDefault}>
        <summary>{t("review.optionalTitle")}</summary>
        <p className="muted">{t("review.optionalHint")}</p>

        <label className="focus-review-field">
          {t("review.finalNote")}
          <textarea
            value={review.notes ?? ""}
            maxLength={FOCUS_MAX_NOTES_LENGTH}
            rows={3}
            onChange={(event) => updateReview("notes", event.target.value)}
            placeholder={t("review.finalNotePlaceholder")}
          />
        </label>

        <fieldset className="focus-review-rating">
          <legend>{t("review.focusRating")}</legend>
          <div className="focus-rating-row">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={`focus-${value}`}
                type="button"
                className="focus-rating-chip"
                data-active={review.subjectiveFocus === value || undefined}
                aria-pressed={review.subjectiveFocus === value}
                onClick={() =>
                  updateReview(
                    "subjectiveFocus",
                    review.subjectiveFocus === value ? null : value,
                  )
                }
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="focus-review-rating">
          <legend>{t("review.energyRating")}</legend>
          <div className="focus-rating-row">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={`energy-${value}`}
                type="button"
                className="focus-rating-chip"
                data-active={review.subjectiveEnergy === value || undefined}
                aria-pressed={review.subjectiveEnergy === value}
                onClick={() =>
                  updateReview(
                    "subjectiveEnergy",
                    review.subjectiveEnergy === value ? null : value,
                  )
                }
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="focus-review-rating">
          <legend>{t("review.outcome")}</legend>
          <div className="focus-rating-row focus-outcome-row">
            {FOCUS_OUTCOMES.map((value) => (
              <button
                key={value}
                type="button"
                className="focus-rating-chip"
                data-active={review.outcome === value || undefined}
                aria-pressed={review.outcome === value}
                onClick={() =>
                  updateReview(
                    "outcome",
                    review.outcome === value ? null : (value as FocusOutcome),
                  )
                }
              >
                {t(`review.outcomes.${value}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="focus-review-field">
          {t("review.nextStep")}
          <input
            type="text"
            value={review.nextStep ?? ""}
            maxLength={FOCUS_MAX_DISTRACTION_LENGTH}
            onChange={(event) => updateReview("nextStep", event.target.value)}
            placeholder={t("review.nextStepPlaceholder")}
          />
        </label>

        <div className="focus-complete-actions">
          <button
            type="button"
            className="primary"
            disabled={pending}
            onClick={saveReview}
          >
            {pending ? (
              <LoaderCircle className="spin" size={16} aria-hidden="true" />
            ) : null}
            {saved ? t("review.saved") : t("review.saveReflection")}
          </button>
        </div>
      </details>

      {linked && isCompleted ? (
        <div
          className="focus-link-complete-options"
          role="group"
          aria-label={t("link.optionsLabel")}
        >
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
      ) : isCompleted ? (
        <p className="muted focus-complete-task-note">
          {t("cycles.taskNotAuto")}
        </p>
      ) : null}

      <div className="focus-complete-actions">
        {localSession.mode === "cycles" && isCompleted ? (
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
        <button
          type="button"
          className="focus-secondary-action is-danger"
          disabled={pending}
          onClick={() => setDiscardOpen(true)}
        >
          <Trash2 size={16} aria-hidden="true" />
          {t("review.discard")}
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

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={t("review.discardTitle")}
        description={t("review.discardDescription")}
        cancelLabel={common("cancel")}
        confirmLabel={t("review.discardConfirm")}
        variant="danger"
        onConfirm={() => {
          discardSession();
          return true;
        }}
      />

      {taskResources && taskTitle ? (
        <TaskForm
          open={Boolean(taskTitle)}
          onOpenChange={(open) => {
            if (!open) setTaskTitle(null);
          }}
          schedules={taskResources.schedules}
          categories={taskResources.categories}
          timezone={taskResources.timezone}
          defaultTitle={taskTitle}
          onSaved={async () => {
            setTaskTitle(null);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}
