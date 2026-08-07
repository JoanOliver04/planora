"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useId, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  startFocusSessionAction,
  transitionFocusSessionAction,
} from "./actions";
import type { FocusMode, FocusPreset, FocusSegment, FocusSession } from "./types";
import type { QuickFocusPreset } from "./defaults";
import { recordFocusStart } from "./focus-recents";
import {
  defaultFocusAccountPreferences,
  defaultFocusDevicePreferences,
  loadFocusDevicePreferences,
  type FocusAccountPreferences,
} from "./focus-preferences";
import {
  FOCUS_MAX_CYCLES,
  FOCUS_MAX_CYCLES_BEFORE_LONG,
  FOCUS_MAX_DURATION_SEC,
  FOCUS_MAX_LONG_BREAK_SEC,
  FOCUS_MAX_SHORT_BREAK_SEC,
  FOCUS_MIN_DURATION_SEC,
} from "./validation";
import { FocusHelpTip } from "./focus-help-tip";

export type FocusTaskOption = {
  id: string;
  title: string;
  emoji: string | null;
  taskKind: "one_time" | "habit";
  categoryId: string | null;
  scheduleId: string | null;
};

export type SessionStartDraft = {
  mode?: FocusMode;
  focusDurationSec?: number | null;
  shortBreakSec?: number | null;
  longBreakSec?: number | null;
  cyclesBeforeLongBreak?: number | null;
  targetCycles?: number | null;
  title?: string | null;
  presetId?: string | null;
  quickKey?: string | null;
  taskId?: string | null;
  occurrenceDate?: string | null;
  linkSnapshot?: {
    taskTitle?: string;
    taskEmoji?: string | null;
    taskKind?: "one_time" | "habit";
    categoryName?: string | null;
    categoryColour?: string | null;
    scheduleName?: string | null;
  };
  autoStartBreaks?: boolean;
  autoStartFocus?: boolean;
  soundEnabled?: boolean;
  vibrationEnabled?: boolean;
  notifyOnPhaseEnd?: boolean;
  completeTaskOnEnd?: boolean;
  keepScreenAwake?: boolean;
  preferFullscreen?: boolean;
  segments?: FocusSegment[];
};

type FormState = {
  mode: FocusMode;
  focusMinutes: string;
  shortBreakMinutes: string;
  longBreakMinutes: string;
  cyclesBeforeLongBreak: string;
  targetCycles: string;
  indefiniteCycles: boolean;
  title: string;
  presetId: string;
  taskId: string;
  occurrenceDate: string;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  notifyOnPhaseEnd: boolean;
  completeTaskOnEnd: boolean;
  keepScreenAwake: boolean;
  preferFullscreen: boolean;
  segments: FocusSegment[];
};

function preferenceDefaults(
  accountPrefs = defaultFocusAccountPreferences,
  devicePrefs = defaultFocusDevicePreferences,
): FormState {
  return {
    mode: accountPrefs.defaultMode,
    focusMinutes: "25",
    shortBreakMinutes: "5",
    longBreakMinutes: "15",
    cyclesBeforeLongBreak: "4",
    targetCycles: "4",
    indefiniteCycles: false,
    title: "",
    presetId: accountPrefs.defaultPresetId ?? "",
    taskId: "",
    occurrenceDate: "",
    autoStartBreaks: true,
    autoStartFocus: false,
    soundEnabled: devicePrefs.soundEnabled,
    vibrationEnabled: devicePrefs.vibrationEnabled,
    notifyOnPhaseEnd: devicePrefs.systemNotifyEnabled,
    completeTaskOnEnd: accountPrefs.completeTaskOnEndDefault,
    keepScreenAwake: devicePrefs.wakeLockPreferred,
    preferFullscreen: devicePrefs.preferFullscreen,
    segments: [],
  };
}

const defaultForm = (): FormState => {
  const device =
    typeof window === "undefined"
      ? defaultFocusDevicePreferences
      : loadFocusDevicePreferences();
  return preferenceDefaults(defaultFocusAccountPreferences, device);
};

function minutesFromSec(sec: number | null | undefined, fallback: string) {
  if (sec == null) return fallback;
  return String(Math.max(0, Math.round(sec / 60)));
}

function secFromMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 60);
}

function draftToForm(
  draft: SessionStartDraft | null | undefined,
  presets: FocusPreset[],
): FormState {
  const base = defaultForm();
  if (!draft) return base;

  const preset = draft.presetId
    ? presets.find((item) => item.id === draft.presetId)
    : undefined;

  const mode = draft.mode ?? preset?.mode ?? base.mode;
  return {
    mode,
    focusMinutes: minutesFromSec(
      draft.focusDurationSec ?? preset?.focusDurationSec,
      mode === "stopwatch" ? "" : "25",
    ),
    shortBreakMinutes: minutesFromSec(
      draft.shortBreakSec ?? preset?.shortBreakSec,
      "5",
    ),
    longBreakMinutes: minutesFromSec(
      draft.longBreakSec ?? preset?.longBreakSec,
      "15",
    ),
    cyclesBeforeLongBreak: String(
      draft.cyclesBeforeLongBreak ??
        preset?.cyclesBeforeLongBreak ??
        4,
    ),
    targetCycles: (() => {
      const resolved =
        draft.targetCycles !== undefined
          ? draft.targetCycles
          : (preset?.targetCycles ?? 4);
      return String(resolved ?? 4);
    })(),
    indefiniteCycles: (() => {
      const resolved =
        draft.targetCycles !== undefined
          ? draft.targetCycles
          : preset?.targetCycles;
      return resolved === null;
    })(),
    title: draft.title ?? "",
    presetId: draft.presetId ?? "",
    taskId: draft.taskId ?? "",
    occurrenceDate: draft.occurrenceDate ?? "",
    autoStartBreaks:
      draft.autoStartBreaks ?? preset?.autoStartBreaks ?? true,
    autoStartFocus: draft.autoStartFocus ?? preset?.autoStartFocus ?? false,
    soundEnabled: draft.soundEnabled ?? preset?.soundEnabled ?? true,
    vibrationEnabled:
      draft.vibrationEnabled ?? preset?.vibrationEnabled ?? true,
    notifyOnPhaseEnd:
      draft.notifyOnPhaseEnd ?? preset?.notifyOnPhaseEnd ?? true,
    completeTaskOnEnd:
      draft.completeTaskOnEnd ?? preset?.completeTaskOnSessionEnd ?? false,
    keepScreenAwake:
      draft.keepScreenAwake ?? preset?.keepScreenAwake ?? false,
    preferFullscreen:
      draft.preferFullscreen ?? preset?.preferFullscreen ?? false,
    segments: draft.segments ?? preset?.segments ?? [],
  };
}

function applyPresetToForm(preset: FocusPreset): FormState {
  return draftToForm(
    {
      mode: preset.mode,
      focusDurationSec: preset.focusDurationSec,
      shortBreakSec: preset.shortBreakSec,
      longBreakSec: preset.longBreakSec,
      cyclesBeforeLongBreak: preset.cyclesBeforeLongBreak,
      targetCycles: preset.targetCycles,
      presetId: preset.id,
      title: preset.intention,
      autoStartBreaks: preset.autoStartBreaks,
      autoStartFocus: preset.autoStartFocus,
      soundEnabled: preset.soundEnabled,
      vibrationEnabled: preset.vibrationEnabled,
      notifyOnPhaseEnd: preset.notifyOnPhaseEnd,
      completeTaskOnEnd: preset.completeTaskOnSessionEnd,
      keepScreenAwake: preset.keepScreenAwake,
      preferFullscreen: preset.preferFullscreen,
      segments: preset.segments,
    },
    [preset],
  );
}

function applyQuickToForm(quick: QuickFocusPreset): FormState {
  const base = defaultForm();
  return {
    ...base,
    mode: quick.mode,
    focusMinutes:
      quick.focusDurationSec == null
        ? ""
        : minutesFromSec(quick.focusDurationSec, "25"),
    shortBreakMinutes: minutesFromSec(quick.shortBreakSec, "5"),
    longBreakMinutes: minutesFromSec(quick.longBreakSec, "15"),
    cyclesBeforeLongBreak: String(quick.cyclesBeforeLongBreak ?? 4),
    presetId: "",
  };
}

export function SessionStartDialog({
  open,
  onOpenChange,
  draft,
  activeSession,
  presets,
  tasks = [],
  onStarted,
  defaultOccurrenceDate = null,
  accountPreferences,
  askIntentionOnStart = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft?: SessionStartDraft | null;
  activeSession: FocusSession | null;
  presets: FocusPreset[];
  tasks?: FocusTaskOption[];
  onStarted?: (session: FocusSession) => void;
  /** Profile-local YYYY-MM-DD used when linking a task without a date. */
  defaultOccurrenceDate?: string | null;
  accountPreferences?: FocusAccountPreferences;
  askIntentionOnStart?: boolean;
}) {
  const t = useTranslations("Focus");
  const common = useTranslations("Common");
  const router = useRouter();
  const formId = useId();
  const account = accountPreferences ?? defaultFocusAccountPreferences;
  const device =
    typeof window === "undefined"
      ? defaultFocusDevicePreferences
      : loadFocusDevicePreferences();
  // Parent remounts this dialog (key) when opening with a new draft.
  const [form, setForm] = useState<FormState>(() => {
    if (draft) return draftToForm(draft, presets);
    const base = preferenceDefaults(account, device);
    if (account.defaultPresetId) {
      const preset = presets.find((item) => item.id === account.defaultPresetId);
      if (preset) return applyPresetToForm(preset);
    }
    return base;
  });
  const [draftSnapshot] = useState(() => draft?.linkSnapshot ?? null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmKind, setConfirmKind] = useState<"complete" | "cancel" | null>(
    null,
  );

  const hasConflict = Boolean(activeSession);
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === form.taskId) ?? null,
    [tasks, form.taskId],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate(): string | null {
    if (askIntentionOnStart && !form.title.trim()) {
      return t("config.errors.intentionRequired");
    }
    if (form.taskId && !form.occurrenceDate.trim()) {
      return t("config.errors.occurrenceRequired");
    }
    if (form.completeTaskOnEnd && (!form.taskId || !form.occurrenceDate.trim())) {
      return t("config.errors.completeNeedsTask");
    }
    if (
      form.segments.length === 0 &&
      (form.mode === "countdown" || form.mode === "cycles")
    ) {
      const focusSec = secFromMinutes(form.focusMinutes);
      if (focusSec == null || focusSec < FOCUS_MIN_DURATION_SEC) {
        return t("config.errors.focusDurationRequired");
      }
      if (focusSec > FOCUS_MAX_DURATION_SEC) {
        return t("config.errors.focusDurationMax");
      }
    }
    if (form.mode === "stopwatch" && form.focusMinutes.trim()) {
      const focusSec = secFromMinutes(form.focusMinutes);
      if (focusSec == null || focusSec < FOCUS_MIN_DURATION_SEC) {
        return t("config.errors.focusDurationInvalid");
      }
      if (focusSec > FOCUS_MAX_DURATION_SEC) {
        return t("config.errors.focusDurationMax");
      }
    }
    if (form.mode === "cycles") {
      const shortSec = secFromMinutes(form.shortBreakMinutes);
      if (shortSec == null || shortSec < 0 || shortSec > FOCUS_MAX_SHORT_BREAK_SEC) {
        return t("config.errors.shortBreakInvalid");
      }
      const longSec = secFromMinutes(form.longBreakMinutes);
      if (longSec != null && (longSec < 0 || longSec > FOCUS_MAX_LONG_BREAK_SEC)) {
        return t("config.errors.longBreakInvalid");
      }
      if (!form.indefiniteCycles) {
        const cycles = Number(form.targetCycles);
        if (
          !form.targetCycles.trim() ||
          !Number.isInteger(cycles) ||
          cycles < 1 ||
          cycles > FOCUS_MAX_CYCLES
        ) {
          return t("config.errors.targetCyclesInvalid");
        }
      }
      const beforeLong = Number(form.cyclesBeforeLongBreak);
      if (
        !Number.isInteger(beforeLong) ||
        beforeLong < 1 ||
        beforeLong > FOCUS_MAX_CYCLES_BEFORE_LONG
      ) {
        return t("config.errors.cyclesBeforeLongInvalid");
      }
    }
    return null;
  }

  function buildPayload() {
    const focusDurationSec =
      form.mode === "stopwatch" && !form.focusMinutes.trim()
        ? null
        : secFromMinutes(form.focusMinutes);
    return {
      mode: form.mode,
      title: form.title.trim() || null,
      presetId: form.presetId || null,
      taskId: form.taskId || null,
      categoryId: selectedTask?.categoryId ?? null,
      scheduleId: selectedTask?.scheduleId ?? null,
      occurrenceDate: form.occurrenceDate || null,
      focusDurationSec,
      shortBreakSec:
        form.mode === "cycles" ? secFromMinutes(form.shortBreakMinutes) : null,
      longBreakSec:
        form.mode === "cycles" ? secFromMinutes(form.longBreakMinutes) : null,
      cyclesBeforeLongBreak:
        form.mode === "cycles" ? Number(form.cyclesBeforeLongBreak) || 4 : null,
      targetCycles:
        form.mode === "cycles"
          ? form.indefiniteCycles
            ? null
            : Number(form.targetCycles)
          : null,
      autoStartBreaks: form.autoStartBreaks,
      autoStartFocus: form.autoStartFocus,
      soundEnabled: form.soundEnabled,
      vibrationEnabled: form.vibrationEnabled,
      notifyOnPhaseEnd: form.notifyOnPhaseEnd,
      completeTaskOnEnd: form.completeTaskOnEnd,
      keepScreenAwake: form.keepScreenAwake,
      preferFullscreen: form.preferFullscreen,
      segments: form.segments,
      linkSnapshot: selectedTask
        ? {
            taskTitle: selectedTask.title,
            taskEmoji: selectedTask.emoji,
            taskKind: selectedTask.taskKind,
            categoryName: draftSnapshot?.categoryName,
            categoryColour: draftSnapshot?.categoryColour,
            scheduleName: draftSnapshot?.scheduleName,
          }
        : draftSnapshot && form.taskId
          ? draftSnapshot
          : undefined,
    };
  }

  function submit() {
    if (pending) return;
    if (hasConflict) {
      setFieldError(t("config.conflict.blocked"));
      return;
    }
    // Policy: starting Focus requires the network (one-active DB constraint).
    // Continuing an already-known session offline is supported elsewhere.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setFieldError(t("offline.startBlocked"));
      toast.error(t("offline.startBlocked"));
      return;
    }
    const error = validate();
    if (error) {
      setFieldError(error);
      return;
    }
    setFieldError(null);
    startTransition(async () => {
      const result = await startFocusSessionAction(buildPayload());
      if (!result.ok) {
        if (result.error.code === "ACTIVE_SESSION_EXISTS") {
          setFieldError(t("config.conflict.blocked"));
          toast.error(t("config.conflict.blocked"));
          router.refresh();
          return;
        }
        if (result.error.code === "VALIDATION_ERROR") {
          setFieldError(
            result.error.fieldErrors
              ? Object.values(result.error.fieldErrors).flat()[0] ??
                  t("config.errors.generic")
              : t("config.errors.generic"),
          );
          return;
        }
        toast.error(t("config.errors.network"));
        return;
      }
      toast.success(t("config.started"));
      const preset = presets.find((item) => item.id === form.presetId);
      recordFocusStart({
        presetId: form.presetId || null,
        presetName: preset?.name ?? null,
        taskId: form.taskId || null,
        taskTitle: selectedTask?.title ?? draftSnapshot?.taskTitle ?? null,
        quickKey: draft?.quickKey ?? null,
      });
      onOpenChange(false);
      onStarted?.(result.data);
      router.refresh();
    });
  }

  async function resolveActive(kind: "complete" | "cancel") {
    if (!activeSession || pending) return false;
    const result = await transitionFocusSessionAction({
      type: kind === "complete" ? "complete" : "cancel",
      sessionId: activeSession.id,
      expectedRevision: activeSession.revision,
    });
    if (!result.ok) {
      toast.error(t("config.errors.network"));
      return false;
    }
    toast.success(
      kind === "complete"
        ? t("config.conflict.completedPrevious")
        : t("config.conflict.cancelledPrevious"),
    );
    router.refresh();
    return true;
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content focus-start-dialog"
            aria-describedby={`${formId}-description`}
          >
            <Dialog.Title>{t("config.title")}</Dialog.Title>
            <Dialog.Description id={`${formId}-description`} className="muted">
              {hasConflict
                ? t("config.conflict.description")
                : t("config.description")}
            </Dialog.Description>

            {hasConflict && activeSession ? (
              <div className="focus-conflict" role="status">
                <p>
                  <strong>
                    {activeSession.title ||
                      activeSession.linkSnapshot.taskTitle ||
                      t("active.untitled")}
                  </strong>
                </p>
                <p className="muted">{t("active.conflictHint")}</p>
                <div className="focus-conflict-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      onOpenChange(false);
                      toast.message(t("placeholders.continueSession"));
                    }}
                  >
                    {t("actions.continueSession")}
                  </button>
                  <button
                    type="button"
                    className="focus-secondary-action"
                    onClick={() => setConfirmKind("complete")}
                  >
                    {t("config.conflict.finishPrevious")}
                  </button>
                  <button
                    type="button"
                    className="focus-secondary-action"
                    onClick={() => setConfirmKind("cancel")}
                  >
                    {t("config.conflict.cancelPrevious")}
                  </button>
                  <button
                    type="button"
                    className="pill"
                    onClick={() => onOpenChange(false)}
                  >
                    {common("cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <form
                className="form-grid focus-start-form"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <fieldset className="focus-mode-fieldset">
                  <legend>{t("config.mode")}</legend>
                  <div className="focus-mode-grid" role="radiogroup">
                    {(["countdown", "stopwatch", "cycles"] as const).map(
                      (mode) => (
                        <label key={mode} className="focus-mode-option">
                          <input
                            type="radio"
                            name="mode"
                            value={mode}
                            checked={form.mode === mode}
                            onChange={() => update("mode", mode)}
                          />
                          <span>{t(`modes.${mode}`)}</span>
                        </label>
                      ),
                    )}
                  </div>
                </fieldset>

                {form.mode !== "stopwatch" ? (
                  <label>
                    {t("config.focusMinutes")}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={Math.floor(FOCUS_MAX_DURATION_SEC / 60)}
                      value={form.focusMinutes}
                      onChange={(event) =>
                        update("focusMinutes", event.target.value)
                      }
                    />
                  </label>
                ) : (
                  <label>
                    {t("config.optionalGoalMinutes")}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={Math.floor(FOCUS_MAX_DURATION_SEC / 60)}
                      value={form.focusMinutes}
                      onChange={(event) =>
                        update("focusMinutes", event.target.value)
                      }
                      placeholder={t("config.optionalPlaceholder")}
                    />
                  </label>
                )}

                {form.mode === "cycles" ? (
                  <>
                    <div className="form-row">
                      <label>
                        {t("config.shortBreakMinutes")}
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={Math.floor(FOCUS_MAX_SHORT_BREAK_SEC / 60)}
                          value={form.shortBreakMinutes}
                          onChange={(event) =>
                            update("shortBreakMinutes", event.target.value)
                          }
                        />
                        <small className="muted">{t("config.zeroBreakHint")}</small>
                      </label>
                      <label>
                        {t("config.targetCycles")}
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={FOCUS_MAX_CYCLES}
                          value={form.targetCycles}
                          disabled={form.indefiniteCycles}
                          onChange={(event) =>
                            update("targetCycles", event.target.value)
                          }
                        />
                      </label>
                    </div>
                    <label className="focus-check">
                      <input
                        type="checkbox"
                        checked={form.indefiniteCycles}
                        onChange={(event) =>
                          update("indefiniteCycles", event.target.checked)
                        }
                      />
                      <span>{t("config.indefiniteCycles")}</span>
                    </label>
                  </>
                ) : null}

                <label>
                  {t("config.intention")}
                  <input
                    type="text"
                    maxLength={140}
                    value={form.title}
                    onChange={(event) => update("title", event.target.value)}
                    placeholder={t("config.intentionPlaceholder")}
                  />
                </label>

                {tasks.length > 0 || form.taskId ? (
                  <label>
                    {t("config.task")}
                    <select
                      value={form.taskId}
                      onChange={(event) => {
                        const nextId = event.target.value;
                        update("taskId", nextId);
                        if (!nextId) {
                          update("occurrenceDate", "");
                          return;
                        }
                        if (!form.occurrenceDate && defaultOccurrenceDate) {
                          update("occurrenceDate", defaultOccurrenceDate);
                        }
                      }}
                    >
                      <option value="">{t("config.noTask")}</option>
                      {tasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.emoji ? `${task.emoji} ` : ""}
                          {task.title}
                        </option>
                      ))}
                      {form.taskId &&
                      !tasks.some((task) => task.id === form.taskId) ? (
                        <option value={form.taskId}>
                          {draftSnapshot?.taskEmoji
                            ? `${draftSnapshot.taskEmoji} `
                            : ""}
                          {draftSnapshot?.taskTitle ?? t("config.linkedTask")}
                        </option>
                      ) : null}
                    </select>
                    {form.taskId && form.occurrenceDate ? (
                      <small className="muted">
                        {t("config.occurrence", { date: form.occurrenceDate })}
                      </small>
                    ) : null}
                  </label>
                ) : null}

                {presets.length > 0 ? (
                  <label>
                    {t("config.preset")}
                    <select
                      value={form.presetId}
                      onChange={(event) => {
                        const id = event.target.value;
                        if (!id) {
                          update("presetId", "");
                          return;
                        }
                        const preset = presets.find((item) => item.id === id);
                        if (preset) setForm(applyPresetToForm(preset));
                        else update("presetId", id);
                      }}
                    >
                      <option value="">{t("config.noPreset")}</option>
                      {presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <details
                  className="focus-advanced"
                  open={advancedOpen}
                  onToggle={(event) =>
                    setAdvancedOpen((event.target as HTMLDetailsElement).open)
                  }
                >
                  <summary>{t("config.advanced")}</summary>
                  <div className="focus-advanced-grid">
                    {form.mode === "cycles" ? (
                      <>
                        <label>
                          {t("config.longBreakMinutes")}
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={Math.floor(FOCUS_MAX_LONG_BREAK_SEC / 60)}
                            value={form.longBreakMinutes}
                            onChange={(event) =>
                              update("longBreakMinutes", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          {t("config.cyclesBeforeLong")}
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={FOCUS_MAX_CYCLES_BEFORE_LONG}
                            value={form.cyclesBeforeLongBreak}
                            onChange={(event) =>
                              update(
                                "cyclesBeforeLongBreak",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <label className="focus-check">
                          <input
                            type="checkbox"
                            checked={form.autoStartBreaks}
                            onChange={(event) =>
                              update("autoStartBreaks", event.target.checked)
                            }
                          />
                          <span>{t("config.autoStartBreaks")}</span>
                        </label>
                        <label className="focus-check">
                          <input
                            type="checkbox"
                            checked={form.autoStartFocus}
                            onChange={(event) =>
                              update("autoStartFocus", event.target.checked)
                            }
                          />
                          <span>{t("config.autoStartFocus")}</span>
                        </label>
                        <FocusHelpTip tipKey="autoStart" />
                      </>
                    ) : null}
                    <label className="focus-check">
                      <input
                        type="checkbox"
                        checked={form.soundEnabled}
                        onChange={(event) =>
                          update("soundEnabled", event.target.checked)
                        }
                      />
                      <span>{t("config.sound")}</span>
                    </label>
                    <label className="focus-check">
                      <input
                        type="checkbox"
                        checked={form.vibrationEnabled}
                        onChange={(event) =>
                          update("vibrationEnabled", event.target.checked)
                        }
                      />
                      <span>{t("config.vibration")}</span>
                    </label>
                    <label className="focus-check">
                      <input
                        type="checkbox"
                        checked={form.notifyOnPhaseEnd}
                        onChange={(event) =>
                          update("notifyOnPhaseEnd", event.target.checked)
                        }
                      />
                      <span>{t("config.notify")}</span>
                    </label>
                    <FocusHelpTip tipKey="notifications" />
                    <label className="focus-check">
                      <input
                        type="checkbox"
                        checked={form.completeTaskOnEnd}
                        onChange={(event) =>
                          update("completeTaskOnEnd", event.target.checked)
                        }
                      />
                      <span>{t("config.completeTask")}</span>
                    </label>
                    <FocusHelpTip tipKey="completeTask" />
                    <label className="focus-check">
                      <input
                        type="checkbox"
                        checked={form.preferFullscreen}
                        onChange={(event) =>
                          update("preferFullscreen", event.target.checked)
                        }
                      />
                      <span>{t("config.fullscreen")}</span>
                    </label>
                    <label className="focus-check">
                      <input
                        type="checkbox"
                        checked={form.keepScreenAwake}
                        onChange={(event) =>
                          update("keepScreenAwake", event.target.checked)
                        }
                      />
                      <span>{t("config.keepAwake")}</span>
                    </label>
                    <FocusHelpTip tipKey="wakeLock" />
                    <FocusHelpTip tipKey="structuredPlan" />
                    <FocusHelpTip tipKey="sync" />
                  </div>
                </details>

                {fieldError ? (
                  <p className="focus-form-error" role="alert">
                    {fieldError}
                  </p>
                ) : null}

                <div className="dialog-actions">
                  <Dialog.Close className="pill" disabled={pending}>
                    {common("cancel")}
                  </Dialog.Close>
                  <button
                    type="submit"
                    className="primary"
                    disabled={pending}
                    aria-busy={pending}
                  >
                    {pending ? t("config.starting") : t("config.start")}
                  </button>
                </div>
              </form>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={confirmKind === "complete"}
        onOpenChange={(next) => {
          if (!next) setConfirmKind(null);
        }}
        title={t("config.conflict.finishTitle")}
        description={t("config.conflict.finishDescription")}
        cancelLabel={common("cancel")}
        confirmLabel={t("config.conflict.finishPrevious")}
        variant="primary"
        onConfirm={async () => resolveActive("complete")}
      />
      <ConfirmDialog
        open={confirmKind === "cancel"}
        onOpenChange={(next) => {
          if (!next) setConfirmKind(null);
        }}
        title={t("config.conflict.cancelTitle")}
        description={t("config.conflict.cancelDescription")}
        cancelLabel={common("cancel")}
        confirmLabel={t("config.conflict.cancelPrevious")}
        variant="danger"
        onConfirm={async () => resolveActive("cancel")}
      />
    </>
  );
}

export { applyQuickToForm, applyPresetToForm, draftToForm };
