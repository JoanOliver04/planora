"use client";

import { updateProfile } from "@/app/actions/domain";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useTheme } from "@/components/theme-provider";
import { FocusSettingsPanel } from "@/features/focus/focus-settings";
import { useRouter } from "@/i18n/routing";
import { clearPrivateOfflineData } from "@/lib/offline/queue";
import {
  applyPreferences,
  defaultPreferences,
  normalizePreferences,
  type UserPreferences,
} from "@/lib/preferences";
import * as Alert from "@radix-ui/react-alert-dialog";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { WorkspaceData } from "./types";

const fail = (e: unknown, fallback: string) =>
  toast.error(e instanceof Error ? e.message : fallback);

const accentPresets = [
  "#4f6b45",
  "#2563eb",
  "#7c3aed",
  "#be185d",
  "#c2410c",
  "#0f766e",
  "#475569",
  "#111827",
];

function DayPartsSettings({
  data,
  reload,
}: {
  data: WorkspaceData;
  reload: () => Promise<void>;
}) {
  const t = useTranslations("Workspace"),
    raw = data.profile.day_part_settings as Record<
      string,
      { start?: string; end?: string }
    >,
    [values, setValues] = useState({
      morning: {
        start: raw.morning?.start ?? "05:00",
        end: raw.morning?.end ?? "12:00",
      },
      afternoon: {
        start: raw.afternoon?.start ?? "12:00",
        end: raw.afternoon?.end ?? "18:00",
      },
      night: {
        start: raw.night?.start ?? "18:00",
        end: raw.night?.end ?? "05:00",
      },
    });
  async function save() {
    try {
      await updateProfile({ day_part_settings: values });
      await reload();
      toast.success(t("success"));
    } catch (e) {
      fail(e, t("error"));
    }
  }
  return (
    <div className="settings-block">
      <b>{t("dayParts")}</b>
      {(["morning", "afternoon", "night"] as const).map((part) => (
        <div className="settings-row" key={part}>
          <span>{t(part)}</span>
          <div className="row-actions">
            <input
              type="time"
              value={values[part].start}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  [part]: { ...v[part], start: e.target.value },
                }))
              }
            />
            <span>–</span>
            <input
              type="time"
              value={values[part].end}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  [part]: { ...v[part], end: e.target.value },
                }))
              }
            />
          </div>
        </div>
      ))}
      <button className="pill" onClick={() => void save()}>
        {t("save")}
      </button>
    </div>
  );
}

function PersonalizationSettings({
  data,
  save,
}: {
  data: WorkspaceData;
  save: (value: Record<string, unknown>) => Promise<void>;
}) {
  const t = useTranslations("Workspace"),
    [preferences, setPreferences] = useState(() =>
      normalizePreferences(data.profile.preferences),
    );
  useEffect(() => {
    applyPreferences(preferences);
  }, [preferences]);
  function update<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }
  return (
    <div className="settings-block personalization">
      <div>
        <b>{t("personalization")}</b>
        <p className="muted">{t("personalizationHint")}</p>
      </div>
      <div className="settings-row">
        <span>{t("accentColor")}</span>
        <div className="accent-picker">
          {accentPresets.map((accent) => (
            <button
              key={accent}
              type="button"
              className="accent-swatch"
              data-selected={preferences.accent === accent}
              style={{ background: accent }}
              aria-label={accent}
              aria-pressed={preferences.accent === accent}
              onClick={() => update("accent", accent)}
            />
          ))}
          <input
            type="color"
            value={preferences.accent}
            aria-label={t("customColor")}
            onChange={(event) => update("accent", event.target.value)}
          />
        </div>
      </div>
      <div className="settings-row">
        <span>{t("density")}</span>
        <select
          className="pill"
          value={preferences.density}
          onChange={(event) =>
            update("density", event.target.value as UserPreferences["density"])
          }
        >
          <option value="compact">{t("compact")}</option>
          <option value="comfortable">{t("comfortable")}</option>
          <option value="spacious">{t("spacious")}</option>
        </select>
      </div>
      <div className="settings-row">
        <label htmlFor="font-scale">{t("textSize")}</label>
        <div className="range-setting">
          <input
            id="font-scale"
            type="range"
            min="85"
            max="125"
            step="5"
            value={preferences.fontScale}
            onChange={(event) =>
              update("fontScale", Number(event.target.value))
            }
          />
          <output htmlFor="font-scale">{preferences.fontScale}%</output>
        </div>
      </div>
      <div className="settings-row">
        <span>{t("corners")}</span>
        <select
          className="pill"
          value={preferences.radius}
          onChange={(event) =>
            update("radius", event.target.value as UserPreferences["radius"])
          }
        >
          <option value="square">{t("square")}</option>
          <option value="soft">{t("soft")}</option>
          <option value="rounded">{t("rounded")}</option>
        </select>
      </div>
      <label className="settings-row check-row">
        <span>{t("reduceMotion")}</span>
        <input
          type="checkbox"
          checked={preferences.reduceMotion}
          onChange={(event) => update("reduceMotion", event.target.checked)}
        />
      </label>
      <label className="settings-row check-row">
        <span>{t("showCompleted")}</span>
        <input
          type="checkbox"
          checked={preferences.showCompleted}
          onChange={(event) => update("showCompleted", event.target.checked)}
        />
      </label>
      <div className="row-actions">
        <button
          className="pill"
          onClick={() =>
            setPreferences((current) => ({
              ...defaultPreferences,
              focus: current.focus,
            }))
          }
        >
          {t("reset")}
        </button>
        <button className="primary" onClick={() => void save({ preferences })}>
          {t("save")}
        </button>
      </div>
    </div>
  );
}

export function SettingsView({
  data,
  db,
  reload,
}: {
  data: WorkspaceData;
  db: ReturnType<typeof import("@/lib/supabase/client").createClient>;
  reload: () => Promise<void>;
}) {
  const t = useTranslations("Workspace"),
    locale = useLocale() as "es" | "en",
    router = useRouter(),
    { theme, setTheme } = useTheme(),
    [danger, setDanger] = useState(false),
    [confirmSignOut, setConfirmSignOut] = useState(false),
    [confirm, setConfirm] = useState("");
  async function profile(p: Record<string, unknown>) {
    try {
      await updateProfile(p);
      await reload();
      toast.success(t("success"));
    } catch (e) {
      fail(e, t("error"));
    }
  }
  return (
    <>
      <h1 className="title">{t("settings")}</h1>
      <section className="surface">
        <div className="settings-row">
          <span>{t("theme")}</span>
          <select
            className="pill"
            value={theme ?? data.profile.theme}
            onChange={(e) => {
              setTheme(e.target.value as "light" | "dark" | "system");
              void profile({ theme: e.target.value });
            }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="settings-row">
          <span>{t("language")}</span>
          <select
            className="pill"
            value={locale}
            onChange={(e) => {
              const next = e.target.value as "es" | "en";
              void profile({ locale: next });
              router.replace("/settings", { locale: next });
            }}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="settings-row">
          <span>{t("timezone")}</span>
          <input
            className="pill"
            defaultValue={data.profile.timezone}
            onBlur={(e) => void profile({ timezone: e.target.value })}
          />
        </div>
        <div className="settings-row">
          <span>{t("weekStart")}</span>
          <select
            className="pill"
            value={data.profile.week_starts_on}
            onChange={(e) =>
              void profile({ week_starts_on: Number(e.target.value) })
            }
          >
            <option value="1">Monday</option>
            <option value="0">Sunday</option>
          </select>
        </div>
        <PersonalizationSettings data={data} save={profile} />
        <FocusSettingsPanel
          profilePreferences={data.profile.preferences}
          onSaveAccount={async (preferences) => {
            await profile({ preferences });
          }}
        />
        <DayPartsSettings data={data} reload={reload} />
        {Intl.DateTimeFormat().resolvedOptions().timeZone !==
          data.profile.timezone && (
          <div className="settings-row">
            <span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
            <button
              className="pill"
              onClick={() =>
                void profile({
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                })
              }
            >
              {t("save")}
            </button>
          </div>
        )}
        <div className="settings-row">
          <span>{data.user.email}</span>
          <button className="pill" onClick={() => setConfirmSignOut(true)}>
            {t("signOut")}
          </button>
        </div>
        <div className="settings-row danger">
          <div>
            <b>{t("deleteAccount")}</b>
            <div className="muted">{t("deleteWarning")}</div>
          </div>
          <button className="primary" onClick={() => setDanger(true)}>
            {t("delete")}
          </button>
        </div>
      </section>
      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title={t("signOut")}
        description={t("signOutWarning")}
        cancelLabel={t("cancel")}
        confirmLabel={t("signOut")}
        onConfirm={async () => {
          const { disconnectPushDevice } =
            await import("@/features/reminders/push-client");
          try {
            await disconnectPushDevice();
          } catch {
            // Browser unsubscribe still runs if the network is unavailable.
            // Server subscriptions also reference the revoked auth session.
          }
          const { error } = await db.auth.signOut();
          if (error) {
            fail(error, t("error"));
            return;
          }
          await clearPrivateOfflineData(data.user.id);
          window.location.replace(`/${locale}/login`);
        }}
      />
      <Alert.Root open={danger} onOpenChange={setDanger}>
        <Alert.Portal>
          <Alert.Overlay className="dialog-overlay" />
          <Alert.Content className="dialog-content">
            <Alert.Title>{t("deleteAccount")}</Alert.Title>
            <Alert.Description>{t("deleteWarning")}</Alert.Description>
            <label>
              {t("deleteConfirm")}
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <Alert.Cancel className="pill">{t("cancel")}</Alert.Cancel>
              <Alert.Action
                className="primary"
                disabled={confirm !== t("deleteConfirm")}
                onClick={async () => {
                  const r = await fetch("/api/account", {
                    method: "DELETE",
                    credentials: "same-origin",
                    headers: { "x-planora-confirm": "delete-account" },
                  });
                  if (r.ok) {
                    await clearPrivateOfflineData(data.user.id);
                    window.location.replace(`/${locale}/login`);
                  } else if (r.status === 401) {
                    toast.info(
                      locale === "es"
                        ? "Vuelve a identificarte con Google antes de eliminar tu cuenta."
                        : "Sign in with Google again before deleting your account.",
                    );
                    const { error } = await db.auth.signInWithOAuth({
                      provider: "google",
                      options: {
                        scopes: "openid email",
                        redirectTo: `${window.location.origin}/auth/callback?next=/${locale}/settings`,
                        queryParams: { prompt: "select_account" },
                      },
                    });
                    if (error) toast.error(t("error"));
                  } else toast.error(t("error"));
                }}
              >
                {t("delete")}
              </Alert.Action>
            </div>
          </Alert.Content>
        </Alert.Portal>
      </Alert.Root>
    </>
  );
}
