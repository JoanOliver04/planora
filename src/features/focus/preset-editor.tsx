"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";
import type { FocusMode, FocusPreset, FocusSegment } from "./types";
import { saveFocusPresetAction } from "./actions";
import {
  FOCUS_MAX_CYCLES,
  FOCUS_MAX_CYCLES_BEFORE_LONG,
  FOCUS_MAX_DURATION_SEC,
  FOCUS_MAX_LONG_BREAK_SEC,
  FOCUS_MAX_SHORT_BREAK_SEC,
  FOCUS_MIN_DURATION_SEC,
} from "./validation";
import { SessionPlanEditor } from "./session-plan-editor";
import { validatePlanSegments } from "./session-plan";

type CategoryOption = { id: string; name: string; emoji: string | null };

type FormState = {
  name: string;
  emoji: string;
  intention: string;
  mode: FocusMode;
  focusMinutes: string;
  shortBreakMinutes: string;
  longBreakMinutes: string;
  cyclesBeforeLongBreak: string;
  targetCycles: string;
  indefiniteCycles: boolean;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  notifyOnPhaseEnd: boolean;
  completeTaskOnSessionEnd: boolean;
  keepScreenAwake: boolean;
  preferFullscreen: boolean;
  isFavorite: boolean;
  defaultCategoryId: string;
  segments: FocusSegment[];
};

function minutesFromSec(sec: number | null | undefined, fallback = "") {
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

function fromPreset(preset: FocusPreset | null): FormState {
  if (!preset) {
    return {
      name: "",
      emoji: "🎯",
      intention: "",
      mode: "countdown",
      focusMinutes: "25",
      shortBreakMinutes: "5",
      longBreakMinutes: "15",
      cyclesBeforeLongBreak: "4",
      targetCycles: "4",
      indefiniteCycles: false,
      autoStartBreaks: true,
      autoStartFocus: false,
      soundEnabled: true,
      vibrationEnabled: true,
      notifyOnPhaseEnd: true,
      completeTaskOnSessionEnd: false,
      keepScreenAwake: false,
      preferFullscreen: false,
      isFavorite: false,
      defaultCategoryId: "",
      segments: [],
    };
  }
  return {
    name: preset.name,
    emoji: preset.emoji ?? "",
    intention: preset.intention ?? "",
    mode: preset.mode,
    focusMinutes: minutesFromSec(preset.focusDurationSec, "25"),
    shortBreakMinutes: minutesFromSec(preset.shortBreakSec, "5"),
    longBreakMinutes: minutesFromSec(preset.longBreakSec, "15"),
    cyclesBeforeLongBreak: String(preset.cyclesBeforeLongBreak ?? 4),
    targetCycles: String(preset.targetCycles ?? 4),
    indefiniteCycles: preset.targetCycles == null && preset.mode === "cycles",
    autoStartBreaks: preset.autoStartBreaks,
    autoStartFocus: preset.autoStartFocus,
    soundEnabled: preset.soundEnabled,
    vibrationEnabled: preset.vibrationEnabled,
    notifyOnPhaseEnd: preset.notifyOnPhaseEnd,
    completeTaskOnSessionEnd: preset.completeTaskOnSessionEnd,
    keepScreenAwake: preset.keepScreenAwake,
    preferFullscreen: preset.preferFullscreen,
    isFavorite: preset.isFavorite,
    defaultCategoryId: preset.defaultCategoryId ?? "",
    segments: preset.segments.map((segment) => ({ ...segment })),
  };
}

export function PresetEditorDialog({
  open,
  onOpenChange,
  preset,
  categories = [],
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: FocusPreset | null;
  categories?: CategoryOption[];
  onSaved?: (preset: FocusPreset) => void;
}) {
  const t = useTranslations("Focus");
  const common = useTranslations("Common");
  const router = useRouter();
  const formId = useId();
  const [form, setForm] = useState(() => fromPreset(preset));
  const [formKey, setFormKey] = useState(preset?.id ?? "new");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Remount form state when the edited preset changes.
  const nextKey = preset?.id ?? "new";
  if (nextKey !== formKey) {
    setFormKey(nextKey);
    setForm(fromPreset(preset));
    setFieldError(null);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate(): string | null {
    if (!form.name.trim()) return t("presets.errors.nameRequired");
    if (form.mode === "countdown" || form.mode === "cycles") {
      const focusSec = secFromMinutes(form.focusMinutes);
      if (focusSec == null || focusSec < FOCUS_MIN_DURATION_SEC) {
        return t("presets.errors.focusDuration");
      }
      if (focusSec > FOCUS_MAX_DURATION_SEC) {
        return t("presets.errors.focusDurationMax");
      }
    }
    if (form.mode === "cycles" && form.segments.length === 0) {
      const shortSec = secFromMinutes(form.shortBreakMinutes);
      if (
        shortSec == null ||
        shortSec < 0 ||
        shortSec > FOCUS_MAX_SHORT_BREAK_SEC
      ) {
        return t("presets.errors.shortBreak");
      }
      const longSec = secFromMinutes(form.longBreakMinutes);
      if (longSec != null && (longSec < 0 || longSec > FOCUS_MAX_LONG_BREAK_SEC)) {
        return t("presets.errors.longBreak");
      }
      if (!form.indefiniteCycles) {
        const cycles = Number(form.targetCycles);
        if (
          !form.targetCycles.trim() ||
          !Number.isInteger(cycles) ||
          cycles < 1 ||
          cycles > FOCUS_MAX_CYCLES
        ) {
          return t("presets.errors.targetCycles");
        }
      }
      const beforeLong = Number(form.cyclesBeforeLongBreak);
      if (
        !Number.isInteger(beforeLong) ||
        beforeLong < 1 ||
        beforeLong > FOCUS_MAX_CYCLES_BEFORE_LONG
      ) {
        return t("presets.errors.cyclesBeforeLong");
      }
    }
    const planError = validatePlanSegments(form.segments);
    if (planError === "too_many") return t("plan.errors.tooMany");
    if (planError === "name_required") return t("plan.errors.nameRequired");
    if (planError === "duration_invalid") return t("plan.errors.durationInvalid");
    return null;
  }

  function submit() {
    if (pending) return;
    const error = validate();
    if (error) {
      setFieldError(error);
      return;
    }
    setFieldError(null);
    startTransition(async () => {
      const focusDurationSec =
        form.mode === "stopwatch" && !form.focusMinutes.trim()
          ? null
          : secFromMinutes(form.focusMinutes);
      const segments = form.segments.map((segment) => ({
        ...segment,
        name: segment.name.trim() || "Block",
        emoji: segment.emoji?.trim() || null,
        description: segment.description?.trim() || null,
      }));

      const result = await saveFocusPresetAction({
        id: preset?.id,
        name: form.name.trim(),
        emoji: form.emoji.trim() || null,
        intention: form.intention.trim() || null,
        mode: form.mode,
        focusDurationSec,
        shortBreakSec:
          form.mode === "cycles" && segments.length === 0
            ? secFromMinutes(form.shortBreakMinutes)
            : null,
        longBreakSec:
          form.mode === "cycles" && segments.length === 0
            ? secFromMinutes(form.longBreakMinutes)
            : null,
        cyclesBeforeLongBreak:
          form.mode === "cycles" && segments.length === 0
            ? Number(form.cyclesBeforeLongBreak) || 4
            : null,
        targetCycles:
          form.mode === "cycles" && segments.length === 0
            ? form.indefiniteCycles
              ? null
              : Number(form.targetCycles)
            : null,
        autoStartBreaks: form.autoStartBreaks,
        autoStartFocus: form.autoStartFocus,
        soundEnabled: form.soundEnabled,
        vibrationEnabled: form.vibrationEnabled,
        notifyOnPhaseEnd: form.notifyOnPhaseEnd,
        completeTaskOnSessionEnd: form.completeTaskOnSessionEnd,
        keepScreenAwake: form.keepScreenAwake,
        preferFullscreen: form.preferFullscreen,
        segments,
        isFavorite: form.isFavorite,
        defaultCategoryId: form.defaultCategoryId || null,
      });
      if (!result.ok) {
        setFieldError(
          result.error.fieldErrors
            ? Object.values(result.error.fieldErrors).flat()[0] ??
                t("presets.errors.generic")
            : result.error.message || t("presets.errors.generic"),
        );
        return;
      }
      toast.success(t("presets.saved"));
      onSaved?.(result.data);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content focus-preset-editor">
          <Dialog.Title>
            {preset ? t("presets.editTitle") : t("presets.createTitle")}
          </Dialog.Title>
          <Dialog.Description className="muted">
            {t("presets.editorHint")}
          </Dialog.Description>

          <form
            id={formId}
            className="form-grid focus-preset-form"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="form-row">
              <label>
                {t("presets.emoji")}
                <input
                  value={form.emoji}
                  maxLength={16}
                  onChange={(event) => update("emoji", event.target.value)}
                />
              </label>
              <label>
                {t("presets.name")}
                <input
                  required
                  value={form.name}
                  maxLength={80}
                  onChange={(event) => update("name", event.target.value)}
                />
              </label>
            </div>

            <label>
              {t("presets.intention")}
              <input
                value={form.intention}
                maxLength={140}
                placeholder={t("presets.intentionPlaceholder")}
                onChange={(event) => update("intention", event.target.value)}
              />
            </label>

            <fieldset className="focus-mode-fieldset">
              <legend>{t("config.mode")}</legend>
              <div className="focus-rating-row">
                {(["countdown", "stopwatch", "cycles"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className="focus-rating-chip"
                    data-active={form.mode === mode || undefined}
                    aria-pressed={form.mode === mode}
                    onClick={() => update("mode", mode)}
                  >
                    {t(`modes.${mode}`)}
                  </button>
                ))}
              </div>
            </fieldset>

            {form.mode !== "stopwatch" ? (
              <label>
                {t("config.focusMinutes")}
                <input
                  inputMode="numeric"
                  value={form.focusMinutes}
                  onChange={(event) => update("focusMinutes", event.target.value)}
                />
              </label>
            ) : (
              <label>
                {t("config.optionalGoalMinutes")}
                <input
                  inputMode="numeric"
                  value={form.focusMinutes}
                  placeholder={t("config.optionalPlaceholder")}
                  onChange={(event) => update("focusMinutes", event.target.value)}
                />
              </label>
            )}

            {form.mode === "cycles" ? (
              <>
                <div className="form-row">
                  <label>
                    {t("config.shortBreakMinutes")}
                    <input
                      inputMode="numeric"
                      value={form.shortBreakMinutes}
                      onChange={(event) =>
                        update("shortBreakMinutes", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    {t("config.longBreakMinutes")}
                    <input
                      inputMode="numeric"
                      value={form.longBreakMinutes}
                      onChange={(event) =>
                        update("longBreakMinutes", event.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    {t("config.cyclesBeforeLong")}
                    <input
                      inputMode="numeric"
                      value={form.cyclesBeforeLongBreak}
                      onChange={(event) =>
                        update("cyclesBeforeLongBreak", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    {t("config.targetCycles")}
                    <input
                      inputMode="numeric"
                      value={form.targetCycles}
                      disabled={form.indefiniteCycles}
                      onChange={(event) =>
                        update("targetCycles", event.target.value)
                      }
                    />
                  </label>
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={form.indefiniteCycles}
                    onChange={(event) =>
                      update("indefiniteCycles", event.target.checked)
                    }
                  />
                  {t("config.indefiniteCycles")}
                </label>
              </>
            ) : null}

            {categories.length > 0 ? (
              <label>
                {t("presets.defaultCategory")}
                <select
                  value={form.defaultCategoryId}
                  onChange={(event) =>
                    update("defaultCategoryId", event.target.value)
                  }
                >
                  <option value="">{t("presets.noCategory")}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.emoji ? `${category.emoji} ` : ""}
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <details className="focus-review-optional">
              <summary>{t("presets.advanced")}</summary>
              <div className="focus-preset-toggles">
                {(
                  [
                    ["autoStartBreaks", "config.autoStartBreaks"],
                    ["autoStartFocus", "config.autoStartFocus"],
                    ["soundEnabled", "config.sound"],
                    ["vibrationEnabled", "config.vibration"],
                    ["notifyOnPhaseEnd", "config.notify"],
                    ["completeTaskOnSessionEnd", "config.completeTask"],
                    ["keepScreenAwake", "config.keepAwake"],
                    ["preferFullscreen", "config.fullscreen"],
                    ["isFavorite", "presets.favorite"],
                  ] as const
                ).map(([key, labelKey]) => (
                  <label key={key} className="check-row">
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={(event) => update(key, event.target.checked)}
                    />
                    {t(labelKey)}
                  </label>
                ))}
              </div>

              <SessionPlanEditor
                segments={form.segments}
                onChange={(segments) => update("segments", segments)}
              />
            </details>

            {fieldError ? (
              <p className="data-feedback" data-tone="error" role="alert">
                {fieldError}
              </p>
            ) : null}

            <div className="dialog-actions">
              <Dialog.Close className="pill" type="button">
                {common("cancel")}
              </Dialog.Close>
              <button className="primary" type="submit" disabled={pending}>
                {pending ? (
                  <LoaderCircle className="spin" size={16} aria-hidden="true" />
                ) : null}
                {common("save")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
