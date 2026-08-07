"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, Plus, Star, Target, Trash2 } from "lucide-react";
import type { FocusGoal, FocusSession } from "./types";
import {
  calculateGoalWeekHistory,
  calculateWeeklyGoalProgress,
  pickPrimaryGoal,
} from "./goals";
import {
  deleteFocusGoalAction,
  saveFocusGoalAction,
  setFocusGoalPrimaryAction,
} from "./actions";
import { formatFocusDuration } from "./defaults";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { localDate } from "@/lib/dates/timezone";

type CategoryOption = { id: string; name: string; emoji: string | null };
type PresetOption = { id: string; name: string; emoji: string | null };

const WEEKDAY_KEYS = [1, 2, 3, 4, 5, 6, 0] as const; // Mon…Sun display order

function formatGoalValue(
  metric: FocusGoal["metric"],
  value: number,
  t: ReturnType<typeof useTranslations<"Focus">>,
) {
  if (metric === "focus_seconds") {
    return formatFocusDuration(value, "compact");
  }
  if (metric === "sessions") {
    return t("goals.sessionsCount", { count: value });
  }
  return t("goals.daysCount", { count: value });
}

export function FocusGoalsPanel({
  goals,
  sessions,
  timezone,
  weekStartsOn,
  categories = [],
  presets = [],
  compact = false,
}: {
  goals: FocusGoal[];
  sessions: FocusSession[];
  timezone: string;
  weekStartsOn: number;
  categories?: CategoryOption[];
  presets?: PresetOption[];
  compact?: boolean;
}) {
  const t = useTranslations("Focus");
  const common = useTranslations("Common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [manageOpen, setManageOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<FocusGoal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FocusGoal | null>(null);

  const primary = useMemo(() => pickPrimaryGoal(goals), [goals]);
  const now = useMemo(() => new Date(), []);
  const primaryProgress = useMemo(
    () =>
      primary
        ? calculateWeeklyGoalProgress(primary, sessions, now)
        : null,
    [primary, sessions, now],
  );
  const history = useMemo(
    () =>
      primary
        ? calculateGoalWeekHistory(primary, sessions, now, 4)
        : [],
    [primary, sessions, now],
  );

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(goal: FocusGoal) {
    setEditing(goal);
    setEditorOpen(true);
  }

  function run(
    action: () => Promise<{ ok: boolean; error?: { message: string } }>,
    successKey: string,
  ) {
    if (pending) return;
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error?.message || t("goals.errors.generic"));
        return;
      }
      toast.success(t(successKey));
      router.refresh();
    });
  }

  return (
    <section
      className="surface focus-goal-card"
      aria-labelledby="focus-goal-title"
    >
      <div className="focus-section-head focus-goals-head">
        <div>
          <h2 id="focus-goal-title">
            <Target size={18} aria-hidden="true" /> {t("goals.title")}
          </h2>
          <p className="muted">{t("goals.hint")}</p>
        </div>
        <div className="focus-presets-head-actions">
          <button type="button" className="pill" onClick={openCreate}>
            <Plus size={16} aria-hidden="true" />
            {t("goals.add")}
          </button>
          {goals.length > 0 ? (
            <button
              type="button"
              className="pill"
              onClick={() => setManageOpen((value) => !value)}
              aria-expanded={manageOpen}
            >
              {manageOpen ? t("goals.hideManage") : t("goals.manage")}
            </button>
          ) : null}
        </div>
      </div>

      {primary && primaryProgress ? (
        <div className="focus-goal-primary">
          <p className="focus-goal-primary-label">
            {primary.isPrimary ? t("goals.primaryBadge") : t("goals.activeBadge")}
            {" · "}
            {t(`goals.metrics.${primary.metric}`)}
            {primary.scope !== "global"
              ? ` · ${t(`goals.scopes.${primary.scope}`)}`
              : ""}
          </p>
          <div className="focus-goal-meter" aria-hidden="true">
            <span
              style={{ width: `${Math.round(primaryProgress.progress * 100)}%` }}
            />
          </div>
          <p>
            {t("goals.progressLine", {
              done: formatGoalValue(
                primary.metric,
                primaryProgress.completedValue,
                t,
              ),
              target: formatGoalValue(
                primary.metric,
                primaryProgress.targetValue,
                t,
              ),
            })}
          </p>
          <p className="muted">
            {primaryProgress.completed
              ? t("goals.statusComplete")
              : t("goals.remainingLine", {
                  remaining: formatGoalValue(
                    primary.metric,
                    primaryProgress.remainingValue,
                    t,
                  ),
                })}
          </p>
          {primaryProgress.suggestedPerRemainingDay != null &&
          !primaryProgress.completed ? (
            <p className="muted">
              {t("goals.paceLine", {
                value: formatGoalValue(
                  primary.metric,
                  Math.ceil(primaryProgress.suggestedPerRemainingDay),
                  t,
                ),
                days: primaryProgress.remainingConsideredDays,
              })}
            </p>
          ) : null}
          <p className="muted">
            {t("goal.range", {
              start: primaryProgress.weekStart,
              end: primaryProgress.weekEnd,
            })}
          </p>

          {!compact && history.length > 1 ? (
            <div className="focus-goal-history">
              <h3>{t("goals.historyTitle")}</h3>
              <ul>
                {history.map((week) => (
                  <li key={week.weekStart}>
                    <span>
                      {week.weekStart} – {week.weekEnd}
                      {week.completed ? ` · ${t("goals.statusComplete")}` : ""}
                    </span>
                    <strong>
                      {formatGoalValue(primary.metric, week.completedValue, t)}
                      {" / "}
                      {formatGoalValue(primary.metric, week.targetValue, t)}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="muted">{t("goals.empty")}</p>
      )}

      {manageOpen ? (
        <div className="focus-goal-manage">
          <p className="muted">{t("goals.manageHint")}</p>
          <ul className="focus-goal-manage-list">
            {goals.map((goal) => {
              const progress = calculateWeeklyGoalProgress(goal, sessions, now);
              return (
                <li key={goal.id} className="focus-goal-manage-row">
                  <button
                    type="button"
                    className="focus-preset-manage-main"
                    onClick={() => openEdit(goal)}
                  >
                    <span>
                      <strong>
                        {goal.isPrimary ? "★ " : ""}
                        {t(`goals.metrics.${goal.metric}`)}
                      </strong>
                      <small className="muted">
                        {" "}
                        {formatGoalValue(goal.metric, progress.completedValue, t)}
                        {" / "}
                        {formatGoalValue(goal.metric, goal.targetValue, t)}
                        {goal.active ? "" : ` · ${t("goals.inactive")}`}
                      </small>
                    </span>
                  </button>
                  <div className="focus-preset-card-actions">
                    {!goal.isPrimary && goal.active ? (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t("goals.makePrimary")}
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              setFocusGoalPrimaryAction({ goalId: goal.id }),
                            "goals.primaryUpdated",
                          )
                        }
                      >
                        <Star size={15} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t("goals.delete")}
                      onClick={() => setDeleteTarget(goal)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {editorOpen ? (
        <GoalEditor
          goal={editing}
          timezone={timezone}
          weekStartsOn={weekStartsOn}
          categories={categories}
          presets={presets}
          pending={pending}
          onClose={() => setEditorOpen(false)}
          onSave={(payload) => {
            run(async () => {
              const result = await saveFocusGoalAction(payload);
              if (result.ok) setEditorOpen(false);
              return result;
            }, "goals.saved");
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("goals.deleteTitle")}
        description={t("goals.deleteDescription")}
        cancelLabel={common("cancel")}
        confirmLabel={t("goals.deleteConfirm")}
        variant="danger"
        onConfirm={() => {
          if (!deleteTarget) return true;
          run(
            () => deleteFocusGoalAction({ goalId: deleteTarget.id }),
            "goals.deleted",
          );
          setDeleteTarget(null);
          return true;
        }}
      />
    </section>
  );
}

function GoalEditor({
  goal,
  timezone,
  weekStartsOn,
  categories,
  presets,
  pending,
  onClose,
  onSave,
}: {
  goal: FocusGoal | null;
  timezone: string;
  weekStartsOn: number;
  categories: CategoryOption[];
  presets: PresetOption[];
  pending: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const t = useTranslations("Focus");
  const common = useTranslations("Common");
  const [metric, setMetric] = useState<FocusGoal["metric"]>(
    goal?.metric ?? "focus_seconds",
  );
  const [targetInput, setTargetInput] = useState(() => {
    if (!goal) return metric === "focus_seconds" ? "300" : "3";
    if (goal.metric === "focus_seconds") {
      return String(Math.round(goal.targetValue / 60));
    }
    return String(goal.targetValue);
  });
  const [scope, setScope] = useState<FocusGoal["scope"]>(goal?.scope ?? "global");
  const [categoryId, setCategoryId] = useState(goal?.categoryId ?? "");
  const [presetId, setPresetId] = useState(goal?.presetId ?? "");
  const [active, setActive] = useState(goal?.active ?? true);
  const [isPrimary, setIsPrimary] = useState(goal?.isPrimary ?? !goal);
  const [consideredDays, setConsideredDays] = useState<number[]>(
    goal?.consideredDays ?? [0, 1, 2, 3, 4, 5, 6],
  );
  const [startDate, setStartDate] = useState(
    goal?.startDate ?? localDate(timezone),
  );
  const [error, setError] = useState<string | null>(null);

  function toggleDay(day: number) {
    setConsideredDays((current) => {
      if (current.includes(day)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== day);
      }
      return [...current, day].sort((a, b) => a - b);
    });
  }

  function submit() {
    const raw = Number(targetInput);
    if (!Number.isFinite(raw) || raw <= 0) {
      setError(t("goals.errors.target"));
      return;
    }
    const targetValue =
      metric === "focus_seconds" ? Math.round(raw * 60) : Math.round(raw);
    if (scope === "category" && !categoryId) {
      setError(t("goals.errors.category"));
      return;
    }
    if (scope === "preset" && !presetId) {
      setError(t("goals.errors.preset"));
      return;
    }
    setError(null);
    onSave({
      id: goal?.id,
      metric,
      targetValue,
      targetFocusSec: metric === "focus_seconds" ? targetValue : targetValue,
      scope,
      categoryId: scope === "category" ? categoryId : null,
      presetId: scope === "preset" ? presetId : null,
      startDate,
      consideredDays,
      isPrimary,
      timezone,
      weekStartsOn,
      active,
    });
  }

  return (
    <div className="focus-goal-editor surface">
      <h3>{goal ? t("goals.editTitle") : t("goals.createTitle")}</h3>
      <p className="muted">{t("goals.editorHint")}</p>

      <label>
        {t("goals.metric")}
        <select
          value={metric}
          onChange={(event) => {
            const next = event.target.value as FocusGoal["metric"];
            setMetric(next);
            setTargetInput(next === "focus_seconds" ? "300" : "3");
          }}
        >
          <option value="focus_seconds">{t("goals.metrics.focus_seconds")}</option>
          <option value="sessions">{t("goals.metrics.sessions")}</option>
          <option value="active_days">{t("goals.metrics.active_days")}</option>
        </select>
      </label>

      <label>
        {metric === "focus_seconds"
          ? t("goals.targetMinutes")
          : t("goals.targetCount")}
        <input
          inputMode="numeric"
          value={targetInput}
          onChange={(event) => setTargetInput(event.target.value)}
        />
      </label>

      <label>
        {t("goals.scope")}
        <select
          value={scope}
          onChange={(event) =>
            setScope(event.target.value as FocusGoal["scope"])
          }
        >
          <option value="global">{t("goals.scopes.global")}</option>
          <option value="category">{t("goals.scopes.category")}</option>
          <option value="preset">{t("goals.scopes.preset")}</option>
        </select>
      </label>

      {scope === "category" ? (
        <label>
          {t("goals.category")}
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">{t("goals.chooseCategory")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.emoji ? `${category.emoji} ` : ""}
                {category.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {scope === "preset" ? (
        <label>
          {t("goals.preset")}
          <select
            value={presetId}
            onChange={(event) => setPresetId(event.target.value)}
          >
            <option value="">{t("goals.choosePreset")}</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.emoji ? `${preset.emoji} ` : ""}
                {preset.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label>
        {t("goals.startDate")}
        <input
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
      </label>

      <fieldset className="focus-goal-days">
        <legend>{t("goals.consideredDays")}</legend>
        <div className="focus-rating-row">
          {WEEKDAY_KEYS.map((day) => (
            <button
              key={day}
              type="button"
              className="focus-rating-chip"
              data-active={consideredDays.includes(day) || undefined}
              aria-pressed={consideredDays.includes(day)}
              onClick={() => toggleDay(day)}
            >
              {t(`goals.weekdays.${day}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="check-row">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        {t("goals.active")}
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={isPrimary}
          onChange={(event) => setIsPrimary(event.target.checked)}
        />
        {t("goals.primary")}
      </label>

      <p className="muted">{t("goals.midWeekRule")}</p>
      {error ? (
        <p className="data-feedback" data-tone="error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="dialog-actions">
        <button type="button" className="pill" onClick={onClose}>
          {common("cancel")}
        </button>
        <button
          type="button"
          className="primary"
          disabled={pending}
          onClick={submit}
        >
          {pending ? (
            <LoaderCircle className="spin" size={16} aria-hidden="true" />
          ) : null}
          {common("save")}
        </button>
      </div>
    </div>
  );
}
