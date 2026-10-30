import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PushSettings } from "@/features/reminders/push-settings";

const mocks = vi.hoisted(() => ({
  ready: vi.fn(),
  disconnect: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/pwa/register-sw", () => ({ readyServiceWorker: mocks.ready }));
vi.mock("@/features/reminders/push-client", () => ({
  applicationServerKey: () => new Uint8Array(65),
  disconnectPushDevice: mocks.disconnect,
  updatePushDevice: mocks.update,
}));

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", {
    permission: "default",
    requestPermission: vi.fn().mockResolvedValue("granted"),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        publicKey: "test-key",
        ready: true,
        endpoints: [],
      }),
    }),
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("navigator", {
    userAgent: "Android",
    platform: "Linux",
    maxTouchPoints: 1,
    serviceWorker: {},
  });
  mocks.ready.mockResolvedValue({
    pushManager: {
      getSubscription: async () => null,
      subscribe: async () => ({ endpoint: "https://fcm.googleapis.com/test" }),
    },
  });
  mocks.update.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("mobile push activation", () => {
  it("never requests permission automatically; a click registers this device", async () => {
    render(<PushSettings locale="es" />);
    const button = await screen.findByRole("button", {
      name: "Activar en este dispositivo",
    });
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        "subscribe",
        expect.objectContaining({
          endpoint: "https://fcm.googleapis.com/test",
        }),
        expect.objectContaining({ system: true }),
      ),
    );
    expect(Notification.requestPermission).toHaveBeenCalledOnce();
  });
  it("guides an iPhone browser tab to installation before requesting permission", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "iPhone",
      platform: "iPhone",
      maxTouchPoints: 1,
      serviceWorker: {},
    });
    render(<PushSettings locale="es" />);
    expect(
      await screen.findByText(/Safari → Compartir → Añadir/),
    ).toBeInTheDocument();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("explains blocked Android permission instead of prompting repeatedly", async () => {
    vi.stubGlobal("Notification", {
      permission: "denied",
      requestPermission: vi.fn(),
    });
    render(<PushSettings locale="es" />);
    expect(
      await screen.findByText(/Activa las notificaciones de Planora/),
    ).toBeInTheDocument();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Activar en este dispositivo" }),
    ).not.toBeInTheDocument();
  });
  it("does not advertise a successful setup when the server is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<PushSettings locale="es" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo conectar",
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
