"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  defaultFocusAccountPreferences,
  defaultFocusDevicePreferences,
  focusNotificationPermission,
  loadFocusDevicePreferences,
  normalizeFocusAccountPreferences,
  requestFocusNotificationPermission,
  saveFocusDevicePreferences,
  subscribeFocusDevicePreferences,
  type FocusAccountPreferences,
  type FocusDevicePreferences,
} from "./focus-preferences";
import {
  previewFocusNotification,
  previewFocusSound,
} from "./focus-phase-alerts";
import { isFocusWakeLockSupported } from "./focus-wake-lock";
import { FocusHelpTip } from "./focus-help-tip";
import { mapPresetRow } from "./mappers";
import type { FocusPreset } from "./types";
import { normalizePreferences, type UserPreferences } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";
import { useLocale } from "next-intl";

export function FocusSettingsPanel({
  profilePreferences,
  onSaveAccount,
}: {
  profilePreferences: Json | undefined;
  onSaveAccount: (preferences: UserPreferences) => Promise<void>;
}) {
  const t = useTranslations("Focus");
  const common = useTranslations("Common");
  const locale = useLocale();
  const base = normalizePreferences(profilePreferences);
  const serverFocus = base.focus;
  const serverFocusKey = JSON.stringify(serverFocus);

  const [account, setAccount] = useState<FocusAccountPreferences>(serverFocus);
  const [accountKey, setAccountKey] = useState(serverFocusKey);
  // Keep local draft aligned when the profile is reloaded after save.
  if (serverFocusKey !== accountKey) {
    setAccountKey(serverFocusKey);
    setAccount(normalizeFocusAccountPreferences(serverFocus));
  }

  const device = useSyncExternalStore(
    subscribeFocusDevicePreferences,
    loadFocusDevicePreferences,
    () => defaultFocusDevicePreferences,
  );
  const [presets, setPresets] = useState<FocusPreset[]>([]);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(() =>
    typeof window === "undefined" ? "default" : focusNotificationPermission(),
  );

  useEffect(() => {
    let cancelled = false;
    const db = createClient();
    void db
      .from("focus_presets")
      .select("*")
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (!cancelled) setPresets((data ?? []).map(mapPresetRow));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateAccount<K extends keyof FocusAccountPreferences>(
    key: K,
    value: FocusAccountPreferences[K],
  ) {
    setAccount((current) => ({ ...current, [key]: value }));
  }

  function updateDevice<K extends keyof FocusDevicePreferences>(
    key: K,
    value: FocusDevicePreferences[K],
  ) {
    const next = { ...device, [key]: value };
    saveFocusDevicePreferences(next);
  }

  async function saveAccount() {
    setSaving(true);
    try {
      const next: UserPreferences = {
        ...base,
        focus: {
          ...account,
          completeTaskOnEndDefault: account.completeTaskOnEndDefault === true,
        },
      };
      await onSaveAccount(next);
      toast.success(t("settings.accountSaved"));
    } catch {
      toast.error(t("settings.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleSystemNotify(enabled: boolean) {
    if (!enabled) {
      updateDevice("systemNotifyEnabled", false);
      return;
    }
    const result = await requestFocusNotificationPermission();
    setPermission(result === "unsupported" ? "unsupported" : result);
    if (result === "denied") {
      toast.error(t("settings.permissionDenied"));
      updateDevice("systemNotifyEnabled", false);
      return;
    }
    if (result === "unsupported") {
      toast.message(t("settings.permissionUnsupported"));
      updateDevice("systemNotifyEnabled", false);
      return;
    }
    updateDevice("systemNotifyEnabled", true);
  }

  function resetAll() {
    setAccount(defaultFocusAccountPreferences);
    saveFocusDevicePreferences(defaultFocusDevicePreferences);
    void onSaveAccount({
      ...base,
      focus: defaultFocusAccountPreferences,
    }).then(
      () => toast.success(t("settings.resetDone")),
      () => toast.error(t("settings.saveError")),
    );
  }

  return (
    <div className="settings-block focus-settings">
      <div>
        <b>{t("settings.title")}</b>
        <p className="muted">{t("settings.hint")}</p>
      </div>

      <div className="focus-settings-group">
        <h3>{t("settings.accountTitle")}</h3>
        <p className="muted">{t("settings.accountHint")}</p>

        <div className="settings-row">
          <span>{t("settings.defaultMode")}</span>
          <select
            className="pill"
            value={account.defaultMode}
            onChange={(event) =>
              updateAccount(
                "defaultMode",
                event.target.value as FocusAccountPreferences["defaultMode"],
              )
            }
          >
            <option value="countdown">{t("modes.countdown")}</option>
            <option value="stopwatch">{t("modes.stopwatch")}</option>
            <option value="cycles">{t("modes.cycles")}</option>
          </select>
        </div>

        <div className="settings-row">
          <span>{t("settings.defaultPreset")}</span>
          <select
            className="pill"
            value={account.defaultPresetId ?? ""}
            onChange={(event) =>
              updateAccount(
                "defaultPresetId",
                event.target.value ? event.target.value : null,
              )
            }
          >
            <option value="">{t("settings.noDefaultPreset")}</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.emoji ? `${preset.emoji} ` : ""}
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-row">
          <span>{t("settings.timerDisplay")}</span>
          <select
            className="pill"
            value={account.timerDisplay}
            onChange={(event) =>
              updateAccount(
                "timerDisplay",
                event.target.value as FocusAccountPreferences["timerDisplay"],
              )
            }
          >
            <option value="large">{t("settings.timerLarge")}</option>
            <option value="compact">{t("settings.timerCompact")}</option>
          </select>
        </div>

        <div className="settings-row">
          <span>{t("settings.homeLanding")}</span>
          <select
            className="pill"
            value={account.homeLanding}
            onChange={(event) =>
              updateAccount(
                "homeLanding",
                event.target.value as FocusAccountPreferences["homeLanding"],
              )
            }
          >
            <option value="start">{t("settings.landingStart")}</option>
            <option value="presets">{t("settings.landingPresets")}</option>
            <option value="history">{t("settings.landingHistory")}</option>
          </select>
        </div>

        <label className="settings-row check-row">
          <span>{t("settings.askIntention")}</span>
          <input
            type="checkbox"
            checked={account.askIntentionOnStart}
            onChange={(event) =>
              updateAccount("askIntentionOnStart", event.target.checked)
            }
          />
        </label>
        <label className="settings-row check-row">
          <span>{t("settings.askReview")}</span>
          <input
            type="checkbox"
            checked={account.askReviewOnEnd}
            onChange={(event) =>
              updateAccount("askReviewOnEnd", event.target.checked)
            }
          />
        </label>
        <label className="settings-row check-row">
          <span>{t("settings.completeTaskDefault")}</span>
          <input
            type="checkbox"
            checked={account.completeTaskOnEndDefault}
            onChange={(event) =>
              updateAccount("completeTaskOnEndDefault", event.target.checked)
            }
          />
        </label>
        <label className="settings-row check-row">
          <span>{t("settings.showWeeklyGoal")}</span>
          <input
            type="checkbox"
            checked={account.showWeeklyGoal}
            onChange={(event) =>
              updateAccount("showWeeklyGoal", event.target.checked)
            }
          />
        </label>
        <label className="settings-row check-row">
          <span>{t("settings.goalWeekdaysOnly")}</span>
          <input
            type="checkbox"
            checked={account.goalWeekdaysOnly}
            onChange={(event) =>
              updateAccount("goalWeekdaysOnly", event.target.checked)
            }
          />
        </label>

        <div className="row-actions">
          <button
            type="button"
            className="primary"
            disabled={saving}
            onClick={() => void saveAccount()}
          >
            {t("settings.saveAccount")}
          </button>
        </div>
      </div>

      <div className="focus-settings-group">
        <h3>{t("settings.deviceTitle")}</h3>
        <p className="muted">{t("settings.deviceHint")}</p>

        <label className="settings-row check-row">
          <span>{t("settings.sound")}</span>
          <input
            type="checkbox"
            checked={device.soundEnabled}
            onChange={(event) =>
              updateDevice("soundEnabled", event.target.checked)
            }
          />
        </label>
        <div className="settings-row">
          <label htmlFor="focus-sound-volume">{t("settings.volume")}</label>
          <div className="range-setting">
            <input
              id="focus-sound-volume"
              type="range"
              min={0}
              max={100}
              step={5}
              disabled={!device.soundEnabled}
              value={Math.round(device.soundVolume * 100)}
              onChange={(event) =>
                updateDevice("soundVolume", Number(event.target.value) / 100)
              }
            />
            <output htmlFor="focus-sound-volume">
              {Math.round(device.soundVolume * 100)}%
            </output>
          </div>
        </div>
        <label className="settings-row check-row">
          <span>{t("settings.vibration")}</span>
          <input
            type="checkbox"
            checked={device.vibrationEnabled}
            onChange={(event) =>
              updateDevice("vibrationEnabled", event.target.checked)
            }
          />
        </label>
        <label className="settings-row check-row">
          <span>{t("settings.systemNotify")}</span>
          <input
            type="checkbox"
            checked={device.systemNotifyEnabled}
            onChange={(event) => void toggleSystemNotify(event.target.checked)}
          />
        </label>
        {permission === "denied" ? (
          <p className="muted focus-settings-permission" role="status">
            {t("settings.permissionDeniedHint")}
          </p>
        ) : null}
        {permission === "default" ? (
          <p className="muted focus-settings-permission" role="status">
            {t("settings.permissionDefaultHint")}
          </p>
        ) : null}
        <div className="row-actions focus-settings-previews">
          <button
            type="button"
            className="pill"
            disabled={!device.soundEnabled}
            onClick={() => {
              const ok = previewFocusSound(device.soundVolume);
              if (ok) toast.message(t("settings.previewSoundPlayed"));
              else toast.message(t("settings.previewSoundBlocked"));
            }}
          >
            {t("settings.previewSound")}
          </button>
          <button
            type="button"
            className="pill"
            onClick={() => {
              void (async () => {
                let status = await previewFocusNotification(locale);
                if (status === "default") {
                  const granted = await requestFocusNotificationPermission();
                  setPermission(
                    granted === "unsupported" ? "unsupported" : granted,
                  );
                  if (granted === "granted") {
                    status = await previewFocusNotification(locale);
                  } else if (granted === "denied") {
                    status = "denied";
                  } else if (granted === "unsupported") {
                    status = "unsupported";
                  } else {
                    status = "default";
                  }
                }
                if (status === "shown") {
                  toast.success(t("settings.previewNotifyShown"));
                } else if (status === "denied") {
                  toast.error(t("settings.permissionDenied"));
                } else if (status === "unsupported") {
                  toast.message(t("settings.permissionUnsupported"));
                } else {
                  toast.message(t("settings.previewNotifyNeedPermission"));
                }
              })();
            }}
          >
            {t("settings.previewNotify")}
          </button>
        </div>
        <label className="settings-row check-row">
          <span>{t("settings.wakeLock")}</span>
          <input
            type="checkbox"
            checked={device.wakeLockPreferred}
            onChange={(event) =>
              updateDevice("wakeLockPreferred", event.target.checked)
            }
          />
        </label>
        {!isFocusWakeLockSupported() ? (
          <p className="muted focus-settings-permission" role="status">
            {t("settings.wakeLockUnsupported")}
          </p>
        ) : (
          <FocusHelpTip tipKey="wakeLock" />
        )}
        <FocusHelpTip tipKey="notifications" />
        <FocusHelpTip tipKey="sync" />
        <label className="settings-row check-row">
          <span>{t("settings.fullscreen")}</span>
          <input
            type="checkbox"
            checked={device.preferFullscreen}
            onChange={(event) =>
              updateDevice("preferFullscreen", event.target.checked)
            }
          />
        </label>
        <label className="settings-row check-row">
          <span>{t("settings.compactBar")}</span>
          <input
            type="checkbox"
            checked={device.showCompactBar}
            onChange={(event) =>
              updateDevice("showCompactBar", event.target.checked)
            }
          />
        </label>
        <label className="settings-row check-row">
          <span>{t("settings.keyboardShortcuts")}</span>
          <input
            type="checkbox"
            checked={device.keyboardShortcutsEnabled}
            onChange={(event) =>
              updateDevice("keyboardShortcutsEnabled", event.target.checked)
            }
          />
        </label>
        <p className="muted">{t("settings.keyboardShortcutsHint")}</p>
        <div className="settings-row">
          <span>{t("settings.lockScreen")}</span>
          <select
            className="pill"
            value={device.lockScreenBehavior}
            onChange={(event) =>
              updateDevice(
                "lockScreenBehavior",
                event.target
                  .value as FocusDevicePreferences["lockScreenBehavior"],
              )
            }
          >
            <option value="continue">{t("settings.lockContinue")}</option>
            <option value="pause">{t("settings.lockPause")}</option>
          </select>
        </div>
        <p className="muted">{t("settings.lockScreenHint")}</p>
        <p className="muted">{t("settings.deliveryLimits")}</p>
        <p className="muted">{t("settings.deviceSavedLocally")}</p>
      </div>

      <div className="row-actions">
        <button
          type="button"
          className="pill"
          onClick={() => setResetOpen(true)}
        >
          {t("settings.reset")}
        </button>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t("settings.resetTitle")}
        description={t("settings.resetDescription")}
        cancelLabel={common("cancel")}
        confirmLabel={t("settings.resetConfirm")}
        variant="danger"
        onConfirm={() => {
          resetAll();
          return true;
        }}
      />
    </div>
  );
}
