"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleHelp } from "lucide-react";

/**
 * Discrete, keyboard-friendly contextual help.
 * Uses a disclosure (not hover tooltips) so critical info works on mobile.
 */
export function FocusHelpTip({
  tipKey,
  className = "",
}: {
  tipKey:
    | "autoStart"
    | "wakeLock"
    | "notifications"
    | "completeTask"
    | "structuredPlan"
    | "sync";
  className?: string;
}) {
  const t = useTranslations("Focus.help");
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className={`focus-help-tip ${className}`.trim()}>
      <button
        type="button"
        className="focus-help-tip-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <CircleHelp size={14} aria-hidden="true" />
        <span>{t(`${tipKey}.label`)}</span>
      </button>
      {open ? (
        <p id={id} className="focus-help-tip-body muted" role="note">
          {t(`${tipKey}.body`)}
        </p>
      ) : null}
    </div>
  );
}
