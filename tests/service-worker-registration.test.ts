import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPlanoraServiceWorker } from "@/lib/pwa/register-sw";

const { log } = vi.hoisted(() => ({ log: vi.fn() }));
vi.mock("@/lib/bootstrap/log", () => ({ logBootstrap: log }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("service worker registration", () => {
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
        register: vi
          .fn()
          .mockRejectedValue(new DOMException("blocked", "SecurityError")),
      },
    });
    await expect(registerPlanoraServiceWorker()).resolves.toBeNull();
    expect(log).toHaveBeenCalledWith({
      phase: "service_worker",
      errorType: "SecurityError",
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
