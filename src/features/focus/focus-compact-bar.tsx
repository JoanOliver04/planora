"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "@/i18n/routing";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Pause, Play } from "lucide-react";
import { formatFocusDuration } from "./defaults";
import { useOptionalFocusSessionContext } from "./focus-session-context";
import { matchesNavigationPath } from "@/config/navigation";
import {
  defaultFocusDevicePreferences,
  loadFocusDevicePreferences,
  subscribeFocusDevicePreferences,
} from "./focus-preferences";

/**
 * Persistent compact session card while browsing the rest of Planora.
 * Hidden on the Focus route where the full active view is shown.
 */
export function FocusCompactBar() {
  const ctx = useOptionalFocusSessionContext();
  const t = useTranslations("Focus");
  const pathname = usePathname();
  const device = useSyncExternalStore(
    subscribeFocusDevicePreferences,
    loadFocusDevicePreferences,
    () => defaultFocusDevicePreferences,
  );

  if (!ctx) return null;
  const { engine, immersive } = ctx;
  const session = engine.session;
  const clock = engine.snapshot?.clock;

  if (!session || !clock) return null;
  if (
    session.status !== "running" &&
    session.status !== "paused" &&
    session.status !== "on_break"
  )
    return null;

  // Full view owns the experience on /focus or immersive mode.
  if (matchesNavigationPath(pathname, "/focus") || immersive) return null;
  if (!device.showCompactBar) return null;

  const title =
    session.title ||
    session.linkSnapshot.taskTitle ||
    t("active.untitled");
  const time =
    clock.remainingSec != null
      ? formatFocusDuration(clock.remainingSec)
      : formatFocusDuration(clock.focusElapsedSec);

  return (
    <div className="focus-compact-bar" role="region" aria-label={t("active.badge")}>
      <div className="focus-compact-copy">
        <span className="focus-compact-badge">{t("active.badge")}</span>
        <strong className="focus-compact-title">{title}</strong>
        <span className="focus-compact-time" aria-hidden="true">
          {time}
        </span>
      </div>
      <div className="focus-compact-actions">
        {session.status === "paused" ? (
          <button
            type="button"
            className="icon-button"
            aria-label={t("engine.resume")}
            disabled={engine.pending}
            onClick={() => void engine.resume()}
          >
            <Play size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="icon-button"
            aria-label={t("engine.pause")}
            disabled={engine.pending}
            onClick={() => void engine.pause()}
          >
            <Pause size={18} />
          </button>
        )}
        <Link className="primary focus-compact-return" href="/focus">
          {t("activeView.return")}
        </Link>
      </div>
    </div>
  );
}
