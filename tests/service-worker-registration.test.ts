import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerPlanoraServiceWorker,
  scheduleServiceWorkerRegistration,
} from "@/lib/pwa/register-sw";

const { log } = vi.hoisted(() => ({ log: vi.fn() }));
vi.mock("@/lib/bootstrap/log", () => ({ logBootstrap: log }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("service worker registration", () => {
  it("waits for reconnection after offline startup and cancels a dismissed registration", () => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "production");
    const register = vi.fn().mockResolvedValue({ update: async () => {} });
    const network = {
      onLine: false,
      serviceWorker: { addEventListener: vi.fn(), register },
    };
    vi.stubGlobal("navigator", network);
    const cancelFirst = scheduleServiceWorkerRegistration();
    const cancelSecond = scheduleServiceWorkerRegistration();
    vi.advanceTimersByTime(2_500);
    expect(register).not.toHaveBeenCalled();
    cancelFirst();
    network.onLine = true;
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    expect(register).toHaveBeenCalledOnce();
    cancelSecond();
  });

  it("keeps the registered worker when its background update fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const registration = {
      update: vi.fn().mockRejectedValue(new TypeError("offline")),
    };
    vi.stubGlobal("navigator", {
      serviceWorker: {
        addEventListener: vi.fn(),
        register: vi.fn().mockResolvedValue(registration),
      },
    });
    await expect(registerPlanoraServiceWorker()).resolves.toBe(registration);
    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith({
        phase: "service_worker",
        errorType: "TypeError",
      }),
    );
  });

  it("returns null and records an initial registration failure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("navigator", {
      serviceWorker: {
        addEventListener: vi.fn(),
        register: vi.fn().mockRejectedValue(new Error("blocked")),
      },
    });
    await expect(registerPlanoraServiceWorker()).resolves.toBeNull();
    expect(log).toHaveBeenCalledWith({
      phase: "service_worker",
      errorType: "Error",
    });
  });

  it("updates a registered worker without reporting an error", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const registration = { update: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal("navigator", {
      serviceWorker: {
        addEventListener: vi.fn(),
        register: vi.fn().mockResolvedValue(registration),
      },
    });
    await expect(registerPlanoraServiceWorker()).resolves.toBe(registration);
    expect(registration.update).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
  });
});
