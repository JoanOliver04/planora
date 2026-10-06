// Chrome only keeps a handful of hardware AudioContexts per tab. A new context
// on every click throws NotSupportedError once that pool is full, and closing
// them on a timer does not free the slot in time. One context and one voice
// serve preview, phase chimes and alarms.

export type PreviewFailure = "unavailable" | "blocked" | "missing" | "failed";

export type PreviewOutcome = "done" | "failed" | "replaced";

export type SoundPreviewHandle = {
  ok: boolean;
  reason?: PreviewFailure;
  finished: Promise<PreviewOutcome>;
  /** Generation that owns this attempt. 0 means this handle did not start audio. */
  generation: number;
};

type PreviewSoundId = "soft" | "bell" | "alarm";

type Tone = {
  frequency: number;
  duration: number;
  peak: number;
};

const TONES: Record<PreviewSoundId, Tone> = {
  soft: { frequency: 528, duration: 0.4, peak: 0.05 },
  bell: { frequency: 784, duration: 0.45, peak: 0.05 },
  alarm: { frequency: 880, duration: 0.7, peak: 0.18 },
};

export type SoundPreviewBackend = {
  start: () => Promise<void>;
  stop: () => void;
};

type Voice = {
  generation: number;
  stop: () => void;
};

let context: AudioContext | null = null;
let contextCreations = 0;
let generation = 0;
let voice: Voice | null = null;
let backend: SoundPreviewBackend | null = null;
let backendActive = false;
let finishCurrent: ((outcome: PreviewOutcome) => void) | null = null;
let removeLifecycle: (() => void) | null = null;

function isPreviewSound(value: string): value is PreviewSoundId {
  return value === "soft" || value === "bell" || value === "alarm";
}

function clampVolume(value: unknown) {
  const numeric = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.min(1, Math.max(0, numeric));
}

function browserAudioContext() {
  if (typeof window === "undefined") return null;
  const webkit = (
    window as typeof window & { webkitAudioContext?: typeof AudioContext }
  ).webkitAudioContext;
  return window.AudioContext ?? webkit ?? null;
}

function technicalSoundName(sound: string) {
  if (sound === "soft" || sound === "bell" || sound === "alarm") return sound;
  if (/^[\w./-]{1,40}$/.test(sound)) return sound.slice(0, 40);
  return "unknown";
}

function reportPreviewFailure(phase: string, sound: string, error: unknown) {
  try {
    const errorType = error instanceof Error ? error.name : "Error";
    const api = browserAudioContext() ? "AudioContext" : "unavailable";
    const soundName = technicalSoundName(sound);
    console.info("planora.sound_preview", {
      errorType: errorType.slice(0, 80),
      sound: soundName,
      phase: phase.slice(0, 40),
      api,
    });
    if (process.env.VITEST) return;
    if (typeof window === "undefined" || typeof fetch !== "function") return;
    const path =
      location.pathname.startsWith("/") && location.pathname.length <= 160
        ? location.pathname
        : "/";
    void fetch("/api/telemetry", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "error",
        path,
        message: `sound_preview:${phase}:${errorType}`.slice(0, 300),
        context: {
          phase: phase.slice(0, 40),
          sound: soundName,
          errorType: errorType.slice(0, 80),
          api,
        },
      }),
    }).catch(() => undefined);
  } catch {
    // A failed log must not surface as an application error.
  }
}

function failureReason(error: unknown): PreviewFailure {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return "blocked";
  return "failed";
}

function settle(outcome: PreviewOutcome) {
  const finish = finishCurrent;
  finishCurrent = null;
  finish?.(outcome);
}

function assignFinish() {
  let resolveFinish: (outcome: PreviewOutcome) => void = () => undefined;
  const finished = new Promise<PreviewOutcome>((resolve) => {
    resolveFinish = resolve;
  });
  finishCurrent = resolveFinish;
  return finished;
}

function halt(outcome: PreviewOutcome) {
  generation += 1;
  const current = voice;
  voice = null;
  backendActive = false;
  current?.stop();
  try {
    backend?.stop();
  } catch {
    // A custom backend must not break the next attempt.
  }
  settle(outcome);
}

function bindLifecycle() {
  if (removeLifecycle || typeof document === "undefined") return;
  const onVisibility = () => {
    if (document.visibilityState === "hidden") stopSoundPreview();
  };
  const onPageHide = () => stopSoundPreview();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  removeLifecycle = () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    removeLifecycle = null;
  };
}

function dropContext() {
  const current = context;
  context = null;
  if (!current) return;
  try {
    void current.close().catch(() => undefined);
  } catch {
    // close() throws synchronously when the context never started.
  }
}

function ensureContext():
  | { context: AudioContext; error?: undefined }
  | { context: null; error: unknown } {
  const Ctor = browserAudioContext();
  if (!Ctor) return { context: null, error: new Error("unavailable") };
  if (context && context.state === "closed") context = null;
  if (context) return { context };
  try {
    context = new Ctor();
    contextCreations += 1;
    return { context };
  } catch (error) {
    context = null;
    return { context: null, error };
  }
}

function startTone(
  ctx: AudioContext,
  tone: Tone,
  volume: number,
  token: number,
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const peak = Math.max(0.0001, Math.min(0.2, tone.peak * volume));
  const now = Number.isFinite(ctx.currentTime) ? ctx.currentTime : 0;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(tone.frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    now + Math.max(0.08, tone.duration - 0.05),
  );
  oscillator.start(now);
  oscillator.stop(now + tone.duration);
  const stop = () => {
    try {
      oscillator.stop();
    } catch {
      // stop() throws if the oscillator never started or already ended.
    }
    try {
      oscillator.disconnect();
    } catch {
      // Already disconnected.
    }
    try {
      gain.disconnect();
    } catch {
      // Already disconnected.
    }
  };
  voice = { generation: token, stop };
  oscillator.addEventListener("ended", () => {
    if (generation !== token) return;
    voice = null;
    settle("done");
  });
  if (ctx.state === "suspended") return ctx.resume();
  return Promise.resolve();
}

function rejected(reason: PreviewFailure, sound: string, error: unknown) {
  reportPreviewFailure(reason === "missing" ? "asset" : "play", sound, error);
  const finished = assignFinish();
  settle("failed");
  return { ok: false as const, reason, finished, generation };
}

/**
 * Play at most one preview. A new call stops the previous voice and reuses
 * the same AudioContext. The returned promise resolves; it never rejects.
 */
export function startSoundPreview(options?: {
  volume?: number;
  soundId?: string;
}): SoundPreviewHandle {
  bindLifecycle();
  halt("replaced");
  const sound = options?.soundId ?? "soft";
  if (!isPreviewSound(sound)) {
    return rejected("missing", sound, new Error("missing"));
  }
  const volume = clampVolume(options?.volume);
  const token = generation;
  const finished = assignFinish();

  if (backend) {
    try {
      backendActive = true;
      void Promise.resolve(backend.start()).then(
        () => undefined,
        (error: unknown) => {
          if (generation !== token) return;
          backendActive = false;
          try {
            backend?.stop();
          } catch {
            // The backend already failed to start.
          }
          reportPreviewFailure("play", sound, error);
          settle("failed");
        },
      );
      return { ok: true, finished, generation: token };
    } catch (error) {
      backendActive = false;
      reportPreviewFailure("play", sound, error);
      settle("failed");
      return {
        ok: false,
        reason: failureReason(error),
        finished,
        generation: token,
      };
    }
  }

  const ensured = ensureContext();
  if (!ensured.context) {
    reportPreviewFailure(
      ensured.error instanceof Error && ensured.error.message === "unavailable"
        ? "api"
        : "construct",
      sound,
      ensured.error,
    );
    settle("failed");
    return {
      ok: false,
      reason:
        ensured.error instanceof Error &&
        ensured.error.message === "unavailable"
          ? "unavailable"
          : "failed",
      finished,
      generation: token,
    };
  }
  const ctx = ensured.context;

  try {
    void Promise.resolve(startTone(ctx, TONES[sound], volume, token)).then(
      () => undefined,
      (error: unknown) => {
        if (generation !== token) return;
        // halt() bumps generation before stop(), so a synchronous "ended"
        // event cannot resolve this attempt as a successful "done".
        reportPreviewFailure("play", sound, error);
        halt("failed");
      },
    );
    return { ok: true, finished, generation: token };
  } catch (error) {
    reportPreviewFailure("start", sound, error);
    if (generation === token) halt("failed");
    dropContext();
    return { ok: false, reason: "failed", finished, generation: token };
  }
}

export function stopSoundPreview() {
  halt("done");
}

/** Stop only the attempt this caller started. A newer alarm or chime stays. */
export function stopSoundPreviewIfCurrent(ownedGeneration: number) {
  if (ownedGeneration === 0 || generation !== ownedGeneration) return;
  halt("done");
}

export function activeSoundPreviewCount() {
  return voice || backendActive ? 1 : 0;
}

export function sharedAudioContextCreations() {
  return contextCreations;
}

export function __setSoundPreviewBackendForTests(
  next: SoundPreviewBackend | null,
) {
  backend = next;
}

export function __resetSoundPreviewForTests() {
  halt("done");
  backend = null;
  dropContext();
  contextCreations = 0;
  generation = 0;
  removeLifecycle?.();
}
