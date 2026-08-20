"use client";

import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import type { FocusSegment } from "./types";
import {
  duplicateSegmentAt,
  emptySegment,
  moveSegment,
  SESSION_PLAN_TEMPLATES,
  calculatePlanTotals,
  type SessionPlanTemplateKey,
} from "./session-plan";
import { formatFocusDuration } from "./defaults";
import { FOCUS_MAX_SEGMENTS } from "./validation";

export function SessionPlanEditor({
  segments,
  onChange,
}: {
  segments: FocusSegment[];
  onChange: (segments: FocusSegment[]) => void;
}) {
  const t = useTranslations("Focus");
  const totals = calculatePlanTotals(segments);

  function updateAt(index: number, patch: Partial<FocusSegment>) {
    onChange(
      segments.map((segment, i) =>
        i === index ? { ...segment, ...patch } : segment,
      ),
    );
  }

  function applyTemplate(key: SessionPlanTemplateKey) {
    const template = SESSION_PLAN_TEMPLATES.find((item) => item.key === key);
    if (!template) return;
    onChange(template.segments.map((segment) => ({ ...segment })));
  }

  return (
    <div className="focus-plan-editor">
      <div className="focus-section-head">
        <h3>{t("plan.title")}</h3>
        <p className="muted">{t("plan.hint")}</p>
      </div>

      <div className="focus-plan-templates">
        <span className="muted">{t("plan.suggestions")}</span>
        {SESSION_PLAN_TEMPLATES.map((template) => (
          <button
            key={template.key}
            type="button"
            className="pill"
            onClick={() => applyTemplate(template.key)}
          >
            <span aria-hidden="true">{template.emoji}</span>
            {t(`plan.templates.${template.key}.name`)}
          </button>
        ))}
        {segments.length > 0 ? (
          <button type="button" className="pill" onClick={() => onChange([])}>
            {t("plan.clear")}
          </button>
        ) : null}
      </div>

      {segments.length === 0 ? (
        <p className="muted">{t("plan.empty")}</p>
      ) : (
        <ol className="focus-plan-list">
          {segments.map((segment, index) => (
            <li
              key={`${segment.name}-${index}`}
              className="focus-plan-item surface"
            >
              <div className="focus-plan-item-head">
                <strong>
                  {index + 1}. {segment.emoji ? `${segment.emoji} ` : ""}
                  {segment.name}
                </strong>
                <div className="focus-plan-item-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t("plan.moveUp")}
                    disabled={index === 0}
                    onClick={() =>
                      onChange(moveSegment(segments, index, index - 1))
                    }
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t("plan.moveDown")}
                    disabled={index === segments.length - 1}
                    onClick={() =>
                      onChange(moveSegment(segments, index, index + 1))
                    }
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t("plan.duplicate")}
                    disabled={segments.length >= FOCUS_MAX_SEGMENTS}
                    onClick={() =>
                      onChange(duplicateSegmentAt(segments, index))
                    }
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t("plan.remove")}
                    onClick={() =>
                      onChange(segments.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="form-row">
                <label>
                  {t("plan.emoji")}
                  <input
                    value={segment.emoji ?? ""}
                    maxLength={16}
                    onChange={(event) =>
                      updateAt(index, { emoji: event.target.value || null })
                    }
                  />
                </label>
                <label>
                  {t("plan.name")}
                  <input
                    value={segment.name}
                    maxLength={80}
                    required
                    onChange={(event) =>
                      updateAt(index, { name: event.target.value })
                    }
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  {t("plan.kind")}
                  <select
                    value={segment.kind}
                    onChange={(event) =>
                      updateAt(index, {
                        kind: event.target.value as FocusSegment["kind"],
                        ...(event.target.value === "break" &&
                        segment.durationSec == null
                          ? { durationSec: 5 * 60, autoAdvance: true }
                          : {}),
                      })
                    }
                  >
                    <option value="focus">{t("plan.kindFocus")}</option>
                    <option value="break">{t("plan.kindBreak")}</option>
                  </select>
                </label>
                <label>
                  {t("plan.minutes")}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={480}
                    step={1}
                    value={
                      segment.durationSec == null
                        ? ""
                        : String(Math.round(segment.durationSec / 60))
                    }
                    placeholder={
                      segment.kind === "break"
                        ? t("plan.breakDurationRequired")
                        : t("plan.openDuration")
                    }
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      if (!raw) {
                        if (segment.kind === "break") return;
                        updateAt(index, {
                          durationSec: null,
                          autoAdvance: false,
                        });
                        return;
                      }
                      const minutes = Number(raw);
                      if (!Number.isFinite(minutes)) return;
                      updateAt(index, {
                        durationSec: Math.round(minutes) * 60,
                      });
                    }}
                  />
                </label>
              </div>

              <label>
                {t("plan.description")}
                <input
                  value={segment.description ?? ""}
                  maxLength={280}
                  onChange={(event) =>
                    updateAt(index, {
                      description: event.target.value.trim() || null,
                    })
                  }
                />
              </label>

              <label className="check-row">
                <input
                  type="checkbox"
                  checked={segment.autoAdvance && segment.durationSec != null}
                  disabled={segment.durationSec == null}
                  onChange={(event) =>
                    updateAt(index, { autoAdvance: event.target.checked })
                  }
                />
                {t("plan.autoAdvance")}
              </label>
            </li>
          ))}
        </ol>
      )}

      <div className="focus-plan-footer">
        <button
          type="button"
          className="pill"
          disabled={segments.length >= FOCUS_MAX_SEGMENTS}
          onClick={() =>
            onChange([
              ...segments,
              emptySegment({
                name: t("plan.defaultBlockName", { n: segments.length + 1 }),
              }),
            ])
          }
        >
          <Plus size={16} aria-hidden="true" />
          {t("plan.add")}
        </button>
        <p className="muted">
          {t("plan.totals", {
            focus: formatFocusDuration(totals.focusSec, "compact"),
            rest: formatFocusDuration(totals.breakSec, "compact"),
            total: formatFocusDuration(totals.totalSec, "compact"),
          })}
          {totals.hasOpenFocus ? ` · ${t("plan.totalOpen")}` : ""}
        </p>
      </div>
    </div>
  );
}
