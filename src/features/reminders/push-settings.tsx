"use client";
import { useEffect, useState } from "react";
import { readyServiceWorker } from "@/lib/pwa/register-sw";
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from "./preferences";
import {
  applicationServerKey,
  disconnectPushDevice,
  updatePushDevice,
} from "./push-client";

type Configuration = {
  publicKey?: string;
  ready?: boolean;
  endpoints?: string[];
};
export function PushSettings({ locale }: { locale: string }) {
  const es = locale === "es";
  const [config, setConfig] = useState<Configuration>({});
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    async function sync() {
      const ios =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone =
        (typeof matchMedia === "function" &&
          matchMedia("(display-mode: standalone)").matches) ||
        (navigator as Navigator & { standalone?: boolean }).standalone;
      if (ios && !standalone) {
        if (active) setState("install");
        return;
      }
      if (
        !("PushManager" in window) ||
        !("serviceWorker" in navigator) ||
        !("Notification" in window)
      ) {
        if (active) setState("unsupported");
        return;
      }
      try {
        const response = await fetch("/api/push", {
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok) throw new Error("Configuration unavailable");
        const value = (await response.json()) as Configuration;
        const registration = await readyServiceWorker();
        const sub = (await registration?.pushManager.getSubscription()) ?? null;
        const registered = sub && value.endpoints?.includes(sub.endpoint);
        if (registered && Notification.permission === "granted")
          await updatePushDevice(
            "subscribe",
            sub,
            loadNotificationPreferences(),
          );
        if (!active) return;
        setConfig(value);
        setSubscription(sub);
        setState(
          Notification.permission === "denied"
            ? "denied"
            : registered
              ? "enabled"
              : "disabled",
        );
      } catch {
        if (active) setState("error");
      }
    }
    void sync();
    window.addEventListener("planora-notification-preferences", sync);
    window.addEventListener("focus", sync);
    return () => {
      active = false;
      window.removeEventListener("planora-notification-preferences", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  async function enable() {
    // Permission must be requested directly in the click gesture (especially iOS).
    const permission = Notification.requestPermission();
    setBusy(true);
    setMessage("");
    try {
      const granted = await permission;
      if (granted !== "granted") {
        setState(granted === "denied" ? "denied" : "disabled");
        return;
      }
      const registration = await readyServiceWorker();
      if (!registration || !config.publicKey)
        throw new Error("Push unavailable");
      let existing = await registration.pushManager.getSubscription();
      // A browser may have retained a previous account's subscription.
      if (existing && !config.endpoints?.includes(existing.endpoint)) {
        await existing.unsubscribe();
        existing = null;
      }
      const sub =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(config.publicKey),
        }));
      const preferences = { ...loadNotificationPreferences(), system: true };
      await updatePushDevice("subscribe", sub, preferences);
      saveNotificationPreferences(preferences);
      setSubscription(sub);
      setState("enabled");
    } catch {
      setMessage(
        es
          ? "No se pudo activar. Comprueba la conexión y vuelve a intentarlo."
          : "Could not enable push. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function act(action: "unsubscribe" | "test") {
    if (!subscription) return;
    setBusy(true);
    setMessage("");
    try {
      if (action === "unsubscribe") {
        await disconnectPushDevice();
        setSubscription(null);
        setState("disabled");
      } else {
        await updatePushDevice("test", subscription);
        setMessage(
          es
            ? "Prueba programada. Cierra Planora: debería llegar en 1–2 minutos. Si no aparece, revisa los ajustes de notificaciones y batería de Chrome en Android."
            : "Test scheduled. Close Planora: it should arrive in 1–2 minutes. If it does not, check Chrome notification and battery settings.",
        );
      }
    } catch {
      setMessage(
        es
          ? "No se pudo completar. Espera un momento y vuelve a intentarlo."
          : "Could not complete. Wait a moment and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="surface notification-preferences"
      aria-labelledby="push-title"
    >
      <h2 id="push-title">
        {es ? "Avisos con Planora cerrada" : "Alerts while Planora is closed"}
      </h2>
      <p className="muted">
        {es
          ? "Actívalos una vez en cada móvil. Se envían desde el servidor, aunque cierres la app. Necesitan conexión y permiso de notificaciones. Android decide el sonido y puede retrasarlos por ahorro de batería; no funcionan como un despertador nativo."
          : "Enable once on each phone. The server sends alerts even when the app is closed. Internet and notification permission are required. Android controls sound and may delay delivery to save battery; these are not native alarm-clock alerts."}
      </p>
      <p role="status">
        {state === "install"
          ? es
            ? "En iPhone: Safari → Compartir → Añadir a pantalla de inicio. Abre Planora desde ese icono y activa los avisos (iOS 16.4 o posterior)."
            : "On iPhone: Safari → Share → Add to Home Screen. Open that icon and enable alerts (iOS 16.4 or later)."
          : state === "unsupported"
            ? es
              ? "Este navegador no admite Web Push. En Android, utiliza Chrome actualizado."
              : "This browser does not support Web Push. On Android, use an up-to-date Chrome."
            : state === "denied"
              ? es
                ? "Permiso bloqueado. Activa las notificaciones de Planora en los ajustes del sitio y comprueba que Android permite las de Chrome."
                : "Permission blocked. Enable Planora notifications in site settings and allow Chrome notifications in Android."
              : state === "enabled"
                ? es
                  ? "Este dispositivo está registrado."
                  : "This device is registered."
                : state === "loading"
                  ? es
                    ? "Comprobando este dispositivo…"
                    : "Checking this device…"
                  : es
                    ? "Este dispositivo aún no está registrado para recibir avisos con la app cerrada."
                    : "This device is not registered for closed-app delivery."}
      </p>
      {config.publicKey && !config.ready && (
        <p className="muted" role="status">
          {es
            ? "No se ha confirmado actividad reciente del servicio de envío. La prueba permite comprobar la recepción."
            : "No recent delivery-service activity confirmed. Use the test to check reception."}
        </p>
      )}
      {state === "enabled" ? (
        <div className="row">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void act("test")}
          >
            {es ? "Probar con la app cerrada" : "Test with app closed"}
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void act("unsubscribe")}
          >
            {es ? "Desactivar en este dispositivo" : "Disable on this device"}
          </button>
        </div>
      ) : (
        state === "disabled" && (
          <button
            className="primary"
            disabled={busy || !config.publicKey}
            onClick={() => void enable()}
          >
            {es ? "Activar en este dispositivo" : "Enable on this device"}
          </button>
        )
      )}
      {state === "error" && (
        <p role="alert">
          {es
            ? "No se pudo conectar con el servicio de avisos. Recarga para volver a intentarlo."
            : "Could not connect to the notification service. Reload to retry."}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
