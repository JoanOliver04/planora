"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  Clock3,
  Code2,
  KeyboardMusic,
  Languages,
  ListPlus,
  Play,
  Timer,
  X,
} from "lucide-react";
import type { SessionStartDraft } from "./session-start-dialog";
import { SESSION_PLAN_TEMPLATES } from "./session-plan";
import {
  defaultFocusOnboardingState,
  dismissFocusOnboarding,
  loadFocusOnboardingState,
  reopenFocusOnboarding,
  shouldShowFocusIntro,
  subscribeFocusOnboarding,
  type FocusFirstPath,
} from "./focus-onboarding";

export function draftFromFirstPath(path: FocusFirstPath): SessionStartDraft | null {
  if (path === "createPreset") return null;
  if (path === "quick25") {
    return {
      mode: "countdown",
      focusDurationSec: 25 * 60,
      quickKey: "quick-25",
    };
  }
  if (path === "focus50") {
    return {
      mode: "countdown",
      focusDurationSec: 50 * 60,
      quickKey: "quick-50",
    };
  }
  if (path === "stopwatch") {
    return {
      mode: "stopwatch",
      focusDurationSec: null,
      quickKey: "stopwatch",
    };
  }
  if (path === "plan:reading") {
    return {
      mode: "countdown",
      focusDurationSec: 25 * 60,
      title: "Reading",
      quickKey: "reading-25",
    };
  }
  const key = path.replace("plan:", "") as "programming" | "english" | "piano";
  const template = SESSION_PLAN_TEMPLATES.find((item) => item.key === key);
  if (!template) return null;
  const focusDurationSec = template.segments
    .filter((segment) => segment.kind === "focus")
    .reduce((sum, segment) => sum + (segment.durationSec ?? 0), 0);
  return {
    mode: "countdown",
    focusDurationSec: focusDurationSec || 45 * 60,
    segments: template.segments.map((segment) => ({ ...segment })),
    title: template.key,
    quickKey: `plan-${template.key}`,
  };
}

export function FocusOnboardingPanel({
  hasHistory,
  onStartPath,
  onCreatePreset,
  compact = false,
}: {
  hasHistory: boolean;
  onStartPath: (draft: SessionStartDraft) => void;
  onCreatePreset: () => void;
  /** When true, only show a compact “How Focus works” reopen control. */
  compact?: boolean;
}) {
  const t = useTranslations("Focus.onboarding");
  const state = useSyncExternalStore(
    subscribeFocusOnboarding,
    loadFocusOnboardingState,
    () => defaultFocusOnboardingState,
  );
  const [showPaths, setShowPaths] = useState(false);

  const showIntro = useMemo(
    () => shouldShowFocusIntro({ hasHistory, introDismissed: state.introDismissed }),
    [hasHistory, state.introDismissed],
  );

  if (compact) {
    return (
      <button
        type="button"
        className="pill focus-onboarding-reopen"
        onClick={() => {
          reopenFocusOnboarding();
          setShowPaths(false);
        }}
      >
        {t("reopenHelp")}
      </button>
    );
  }

  if (!showIntro && !showPaths) return null;

  function pick(path: FocusFirstPath) {
    dismissFocusOnboarding();
    setShowPaths(false);
    if (path === "createPreset") {
      onCreatePreset();
      return;
    }
    const draft = draftFromFirstPath(path);
    if (draft) onStartPath(draft);
  }

  return (
    <section
      className="surface focus-onboarding"
      aria-labelledby="focus-onboarding-title"
    >
      <div className="focus-onboarding-head">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h2 id="focus-onboarding-title">{t("title")}</h2>
          <p className="muted">{t("body")}</p>
        </div>
        {!hasHistory ? (
          <button
            type="button"
            className="icon-button"
            aria-label={t("dismiss")}
            onClick={() => {
              dismissFocusOnboarding();
              setShowPaths(false);
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {!showPaths ? (
        <>
          <ul className="focus-onboarding-points">
            <li>{t("points.modes")}</li>
            <li>{t("points.tasks")}</li>
            <li>{t("points.privacy")}</li>
            <li>{t("points.recovery")}</li>
          </ul>
          <div className="focus-onboarding-actions">
            <button
              type="button"
              className="primary"
              onClick={() => setShowPaths(true)}
            >
              <Play size={18} aria-hidden="true" />
              {t("startFirst")}
            </button>
            <button
              type="button"
              className="focus-secondary-action"
              onClick={() => {
                dismissFocusOnboarding();
                setShowPaths(false);
              }}
            >
              {t("notNow")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">{t("pathsHint")}</p>
          <div className="focus-onboarding-paths" role="list">
            <PathButton
              icon={<Clock3 size={18} aria-hidden="true" />}
              label={t("paths.quick25")}
              onClick={() => pick("quick25")}
            />
            <PathButton
              icon={<Timer size={18} aria-hidden="true" />}
              label={t("paths.focus50")}
              onClick={() => pick("focus50")}
            />
            <PathButton
              icon={<Play size={18} aria-hidden="true" />}
              label={t("paths.stopwatch")}
              onClick={() => pick("stopwatch")}
            />
            <PathButton
              icon={<ListPlus size={18} aria-hidden="true" />}
              label={t("paths.createPreset")}
              onClick={() => pick("createPreset")}
            />
          </div>
          <p className="muted focus-onboarding-suggestions-label">
            {t("suggestionsHint")}
          </p>
          <div className="focus-onboarding-paths is-suggestions" role="list">
            <PathButton
              icon={<Code2 size={18} aria-hidden="true" />}
              label={t("suggestions.programming")}
              onClick={() => pick("plan:programming")}
            />
            <PathButton
              icon={<Languages size={18} aria-hidden="true" />}
              label={t("suggestions.english")}
              onClick={() => pick("plan:english")}
            />
            <PathButton
              icon={<KeyboardMusic size={18} aria-hidden="true" />}
              label={t("suggestions.piano")}
              onClick={() => pick("plan:piano")}
            />
            <PathButton
              icon={<BookOpen size={18} aria-hidden="true" />}
              label={t("suggestions.reading")}
              onClick={() => pick("plan:reading")}
            />
          </div>
          <button
            type="button"
            className="pill"
            onClick={() => setShowPaths(false)}
          >
            {t("back")}
          </button>
        </>
      )}
    </section>
  );
}

function PathButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="focus-onboarding-path"
      role="listitem"
      onClick={onClick}
    >
      <span className="focus-onboarding-path-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
