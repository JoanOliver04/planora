import { afterEach, describe, expect, it, vi } from "vitest";
import { createStartedSession } from "@/features/focus/state-machine";
import {
  defaultFocusDevicePreferences,
  saveFocusDevicePreferences,
} from "@/features/focus/focus-preferences";

const showPlanoraSystemNotification = vi.hoisted(() => vi.fn());

vi.mock("@/features/reminders/system-notification", () => ({
  showPlanoraSystemNotification,
}));

import { previewFocusNotification } from "@/features/focus/focus-phase-alerts";
import { playPhaseCue } from "@/features/focus/phase-cues";

function session() {
  return createStartedSession(
    {
      mode: "countdown",
      focusDurationSec: 60,
      soundEnabled: false,
      vibrationEnabled: false,
      notifyOnPhaseEnd: true,
    },
    "user",
    {
      now: Date.parse("2026-08-07T10:00:00.000Z"),
      sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
  );
}

describe("focus system notifications", () => {
  afterEach(() => {
    showPlanoraSystemNotification.mockReset();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("reports a failed preview separately from a denied permission", async () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: vi.fn(),
    });
    showPlanoraSystemNotification.mockResolvedValue("unavailable");
    await expect(previewFocusNotification("es")).resolves.toBe("failed");
    expect(showPlanoraSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: "planora-focus-preview",
        url: "/es/focus",
        silent: false,
      }),
    );

    showPlanoraSystemNotification.mockClear();
    vi.stubGlobal("Notification", {
      permission: "denied",
      requestPermission: vi.fn(),
    });
    await expect(previewFocusNotification("es")).resolves.toBe("denied");
    expect(showPlanoraSystemNotification).not.toHaveBeenCalled();
  });

  it("counts a phase notification only when the service worker shows it", async () => {
    saveFocusDevicePreferences({
      ...defaultFocusDevicePreferences,
      soundEnabled: false,
      vibrationEnabled: false,
      systemNotifyEnabled: true,
    });
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: vi.fn(),
    });
    const current = session();
    showPlanoraSystemNotification.mockResolvedValue("failed");
    await expect(
      playPhaseCue(current, "phase_change", {
        locale: "es",
        title: "Planora · Fase de enfoque",
        body: "La fase ha terminado.",
      }),
    ).resolves.toMatchObject({ notification: false });

    showPlanoraSystemNotification.mockResolvedValue("shown");
    await expect(
      playPhaseCue(current, "phase_change", {
        locale: "es",
        title: "Planora · Fase de enfoque",
        body: "La fase ha terminado.",
      }),
    ).resolves.toMatchObject({ notification: true });
    expect(showPlanoraSystemNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tag: `planora-focus-${current.id}`,
        url: "/es/focus",
        silent: true,
        title: "Planora · Fase de enfoque",
      }),
    );
  });
});
