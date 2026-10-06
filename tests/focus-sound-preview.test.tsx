import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FocusSettingsPanel } from "@/features/focus/focus-settings";
import {
  FOCUS_DEVICE_PREFS_KEY,
  saveFocusDevicePreferences,
  defaultFocusDevicePreferences,
} from "@/features/focus/focus-preferences";
import messages from "@/messages/es.json";
import {
  __resetSoundPreviewForTests,
  __setSoundPreviewBackendForTests,
  activeSoundPreviewCount,
  sharedAudioContextCreations,
  startSoundPreview,
  stopSoundPreview,
} from "@/lib/audio/shared-preview";

const toastMessage = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    message: (...args: unknown[]) => toastMessage(...args),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        is: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [] }),
          }),
        }),
      }),
    }),
  }),
}));

type FakeOscillator = {
  frequency: number;
  stops: Array<number | undefined>;
  ended: Array<() => void>;
  stop: (when?: number) => void;
  connect: () => FakeOscillator;
  disconnect: () => void;
  start: () => void;
  addEventListener: (type: string, listener: () => void) => void;
};

class FakeAudioContext {
  static created = 0;
  static failOnCreate = false;
  state = "running";
  currentTime = 0;
  destination = {};
  oscillators: FakeOscillator[] = [];
  resume = vi.fn(() => Promise.resolve());
  close = vi.fn(() => {
    this.state = "closed";
    return Promise.resolve();
  });

  constructor() {
    FakeAudioContext.created += 1;
    if (FakeAudioContext.failOnCreate) {
      throw new DOMException(
        "The number of hardware contexts provided (6) is greater than or equal to the maximum bound (6).",
        "NotSupportedError",
      );
    }
  }

  createOscillator() {
    const oscillator: FakeOscillator = {
      frequency: 0,
      stops: [],
      ended: [],
      stop(when?: number) {
        this.stops.push(when);
      },
      connect() {
        return this;
      },
      disconnect() {},
      start() {},
      addEventListener(type: string, listener: () => void) {
        if (type === "ended") this.ended.push(listener);
      },
    };
    const frequency = {
      setValueAtTime: (value: number) => {
        oscillator.frequency = value;
      },
    };
    return Object.assign(oscillator, {
      type: "sine",
      frequency,
    });
  }

  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {
        return this;
      },
      disconnect() {},
    };
  }
}

function installAudio() {
  FakeAudioContext.created = 0;
  FakeAudioContext.failOnCreate = false;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  delete (window as { webkitAudioContext?: unknown }).webkitAudioContext;
}

function renderSettings() {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <FocusSettingsPanel
        profilePreferences={{}}
        onSaveAccount={async () => undefined}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  toastMessage.mockClear();
  __resetSoundPreviewForTests();
  installAudio();
});

afterEach(() => {
  cleanup();
  __resetSoundPreviewForTests();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("focus sound preview", () => {
  it("plays one preview and reports success without a toast", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: "Probar sonido" }));
    expect(
      screen.getByRole("button", { name: "Reproduciendo…" }),
    ).toBeEnabled();
    expect(sharedAudioContextCreations()).toBe(1);
    expect(activeSoundPreviewCount()).toBe(1);
    expect(toastMessage).not.toHaveBeenCalled();
    expect(screen.getByText("Preferencias de Enfoque")).toBeInTheDocument();
  });

  it("keeps a single context and a single voice across 10 rapid clicks", async () => {
    const user = userEvent.setup();
    renderSettings();
    const button = screen.getByRole("button", { name: "Probar sonido" });
    for (let index = 0; index < 10; index += 1) {
      await user.click(button);
    }
    expect(sharedAudioContextCreations()).toBe(1);
    expect(activeSoundPreviewCount()).toBe(1);
    expect(FakeAudioContext.created).toBe(1);
    expect(toastMessage).not.toHaveBeenCalled();
    expect(screen.getByText("Preferencias de Enfoque")).toBeInTheDocument();
    expect(window.localStorage.getItem("planora-sound-preview")).toBeNull();
  });

  it("restarts the previous voice when preview is clicked again", async () => {
    const first = startSoundPreview({ volume: 0.4, soundId: "soft" });
    const context = FakeAudioContext;
    expect(first.ok).toBe(true);
    const second = startSoundPreview({ volume: 0.4, soundId: "soft" });
    expect(second.ok).toBe(true);
    expect(context.created).toBe(1);
    expect(activeSoundPreviewCount()).toBe(1);
    await expect(first.finished).resolves.toBe("replaced");
  });

  it("switches tones without opening another context", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: "Probar sonido" }));
    await user.selectOptions(screen.getByLabelText("Tono"), "bell");
    await user.selectOptions(screen.getByLabelText("Tono"), "soft");
    expect(sharedAudioContextCreations()).toBe(1);
    expect(activeSoundPreviewCount()).toBe(1);
    expect(screen.getByText("Preferencias de Enfoque")).toBeInTheDocument();
  });

  it("treats a rejected play() promise as a local failure", async () => {
    __setSoundPreviewBackendForTests({
      start: () =>
        Promise.reject(
          new DOMException(
            "The play() request was interrupted by a call to pause().",
            "AbortError",
          ),
        ),
      stop: vi.fn(),
    });
    const result = startSoundPreview({ soundId: "soft" });
    expect(result.ok).toBe(true);
    await expect(result.finished).resolves.toBe("failed");
    expect(activeSoundPreviewCount()).toBe(0);
    expect(sharedAudioContextCreations()).toBe(0);
  });

  it("reports a missing asset without constructing audio", () => {
    const result = startSoundPreview({ soundId: "sounds/gone.mp3" });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing");
    expect(sharedAudioContextCreations()).toBe(0);
    expect(activeSoundPreviewCount()).toBe(0);
  });

  it("fails locally when the audio API is missing", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("AudioContext", undefined);
    delete (window as { webkitAudioContext?: unknown }).webkitAudioContext;
    renderSettings();
    await user.click(screen.getByRole("button", { name: "Probar sonido" }));
    expect(
      screen.getByText("No se pudo reproducir el sonido"),
    ).toBeInTheDocument();
    expect(screen.getByText("Preferencias de Enfoque")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Probar sonido" })).toBeEnabled();
    expect(toastMessage).not.toHaveBeenCalled();
  });

  it("does not throw when AudioContext construction is rejected", () => {
    FakeAudioContext.failOnCreate = true;
    expect(() => startSoundPreview({ soundId: "bell" })).not.toThrow();
    const result = startSoundPreview({ soundId: "bell" });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("failed");
    expect(activeSoundPreviewCount()).toBe(0);
  });

  it("stops playback when the settings panel unmounts", async () => {
    const user = userEvent.setup();
    const view = renderSettings();
    await user.click(screen.getByRole("button", { name: "Probar sonido" }));
    expect(activeSoundPreviewCount()).toBe(1);
    view.unmount();
    expect(activeSoundPreviewCount()).toBe(0);
  });

  it("renders an invalid stored sound without breaking settings", () => {
    window.localStorage.setItem("planora-offline-keep", "keep");
    window.localStorage.setItem(
      FOCUS_DEVICE_PREFS_KEY,
      JSON.stringify({
        soundEnabled: true,
        soundVolume: "nope",
        soundId: "sounds/gone.mp3",
        vibrationEnabled: true,
      }),
    );
    renderSettings();
    expect(screen.getByLabelText("Tono")).toHaveValue("soft");
    expect(screen.getByText("Preferencias de Enfoque")).toBeInTheDocument();
    expect(window.localStorage.getItem("planora-offline-keep")).toBe("keep");
    expect(window.localStorage.getItem(FOCUS_DEVICE_PREFS_KEY)).toContain(
      "gone.mp3",
    );
  });

  it("stops the voice when the page is hidden and does not restart it", () => {
    startSoundPreview({ soundId: "soft" });
    expect(activeSoundPreviewCount()).toBe(1);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(activeSoundPreviewCount()).toBe(0);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(activeSoundPreviewCount()).toBe(0);
    stopSoundPreview();
  });

  it("uses one context for coarse and fine pointers", () => {
    const original = window.matchMedia;
    for (const coarse of [true, false]) {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: coarse && query.includes("coarse"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia;
      const result = startSoundPreview({
        soundId: coarse ? "bell" : "soft",
        volume: 0.5,
      });
      expect(result.ok).toBe(true);
    }
    expect(sharedAudioContextCreations()).toBe(1);
    window.matchMedia = original;
  });

  it("does not write a preview flag into device preferences", () => {
    saveFocusDevicePreferences({
      ...defaultFocusDevicePreferences,
      soundEnabled: true,
      soundVolume: 0.4,
    });
    const before = window.localStorage.getItem(FOCUS_DEVICE_PREFS_KEY);
    startSoundPreview({ volume: 0.4, soundId: "soft" });
    expect(window.localStorage.getItem(FOCUS_DEVICE_PREFS_KEY)).toBe(before);
  });
});
