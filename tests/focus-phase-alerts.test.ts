import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetFocusPhaseAlertsForTests,
  cancelFocusPhaseAlert,
  deliverFocusPhaseAlert,
  focusPhaseEndsAtMs,
  getActiveFocusPhaseSchedule,
  scheduleFocusPhaseAlert,
} from "@/features/focus/focus-phase-alerts";
import {
  __resetFocusWakeLockForTests,
  isFocusWakeLockSupported,
  releaseFocusWakeLock,
  syncFocusWakeLock,
} from "@/features/focus/focus-wake-lock";
import {
  applyFocusAction,
  createStartedSession,
} from "@/features/focus/state-machine";
import {
  defaultFocusDevicePreferences,
  FOCUS_DEVICE_PREFS_KEY,
  saveFocusDevicePreferences,
} from "@/features/focus/focus-preferences";
import type { FocusSession } from "@/features/focus/types";

function idFactory(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function startCountdown(
  focusDurationSec = 60,
  now = Date.parse("2026-08-07T10:00:00.000Z"),
): FocusSession {
  return createStartedSession(
    {
      mode: "countdown",
      focusDurationSec,
      soundEnabled: true,
      vibrationEnabled: true,
      notifyOnPhaseEnd: true,
      keepScreenAwake: true,
    },
    "user",
    {
      createId: idFactory("p16"),
      now,
      sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      intervalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-07T10:00:00.000Z"));
  window.localStorage.clear();
  saveFocusDevicePreferences({
    ...defaultFocusDevicePreferences,
    soundEnabled: true,
    vibrationEnabled: true,
    systemNotifyEnabled: true,
    wakeLockPreferred: true,
  });
  __resetFocusPhaseAlertsForTests();
  __resetFocusWakeLockForTests();
});

afterEach(() => {
  cancelFocusPhaseAlert();
  void releaseFocusWakeLock();
  __resetFocusPhaseAlertsForTests();
  __resetFocusWakeLockForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.removeItem(FOCUS_DEVICE_PREFS_KEY);
});

describe("focusPhaseEndsAtMs", () => {
  it("returns the planned end for a running timed phase", () => {
    const session = startCountdown(120);
    const ends = focusPhaseEndsAtMs(
      session,
      Date.parse("2026-08-07T10:00:00.000Z"),
    );
    expect(ends).toBe(Date.parse("2026-08-07T10:02:00.000Z"));
  });

  it("returns null while paused", () => {
    const started = startCountdown(120);
    const paused = applyFocusAction(
      started,
      { type: "pause" },
      {
        expectedRevision: started.revision,
        now: Date.parse("2026-08-07T10:00:30.000Z"),
        createId: idFactory("pause"),
      },
    ).session;
    expect(
      focusPhaseEndsAtMs(paused, Date.parse("2026-08-07T10:00:30.000Z")),
    ).toBeNull();
  });
});

describe("scheduleFocusPhaseAlert", () => {
  it("schedules, cancels on pause, and reschedules after resume", () => {
    const started = startCountdown(60);
    const first = scheduleFocusPhaseAlert(started, {
      now: Date.parse("2026-08-07T10:00:00.000Z"),
    });
    expect(first?.endsAtMs).toBe(Date.parse("2026-08-07T10:01:00.000Z"));
    expect(getActiveFocusPhaseSchedule()?.sessionId).toBe(started.id);

    cancelFocusPhaseAlert();
    expect(getActiveFocusPhaseSchedule()).toBeNull();

    const paused = applyFocusAction(
      started,
      { type: "pause" },
      {
        expectedRevision: started.revision,
        now: Date.parse("2026-08-07T10:00:20.000Z"),
        createId: idFactory("p"),
      },
    ).session;
    expect(scheduleFocusPhaseAlert(paused)).toBeNull();

    const resumed = applyFocusAction(
      paused,
      { type: "resume" },
      {
        expectedRevision: paused.revision,
        now: Date.parse("2026-08-07T10:00:40.000Z"),
        createId: idFactory("r"),
      },
    ).session;
    const again = scheduleFocusPhaseAlert(resumed, {
      now: Date.parse("2026-08-07T10:00:40.000Z"),
    });
    // 40s remaining after 20s focus before pause.
    expect(again?.endsAtMs).toBe(Date.parse("2026-08-07T10:01:20.000Z"));
  });

  it("reschedules after extending a break", () => {
    let session = createStartedSession(
      {
        mode: "cycles",
        focusDurationSec: 60,
        shortBreakSec: 30,
        longBreakSec: 90,
        cyclesBeforeLongBreak: 2,
        targetCycles: 4,
        autoStartBreaks: true,
        autoStartFocus: false,
      },
      "user",
      {
        createId: idFactory("ext"),
        now: Date.parse("2026-08-07T10:00:00.000Z"),
      },
    );
    // Finish first focus → short break.
    session = applyFocusAction(
      session,
      { type: "finish_phase" },
      {
        expectedRevision: session.revision,
        now: Date.parse("2026-08-07T10:01:00.000Z"),
        createId: idFactory("f"),
      },
    ).session;
    expect(session.status).toBe("on_break");
    const before = scheduleFocusPhaseAlert(session, {
      now: Date.parse("2026-08-07T10:01:00.000Z"),
    });
    expect(before?.endsAtMs).toBe(Date.parse("2026-08-07T10:01:30.000Z"));

    session = applyFocusAction(
      session,
      { type: "extend_break", extraSec: 60 },
      {
        expectedRevision: session.revision,
        now: Date.parse("2026-08-07T10:01:05.000Z"),
        createId: idFactory("e"),
      },
    ).session;
    const after = scheduleFocusPhaseAlert(session, {
      now: Date.parse("2026-08-07T10:01:05.000Z"),
    });
    expect(after?.endsAtMs).toBeGreaterThan(before!.endsAtMs);
  });

  it("does not keep a timer after cancelFocusPhaseAlert (cleanup)", () => {
    const session = startCountdown(30);
    scheduleFocusPhaseAlert(session);
    expect(getActiveFocusPhaseSchedule()).not.toBeNull();
    cancelFocusPhaseAlert();
    expect(getActiveFocusPhaseSchedule()).toBeNull();
  });

  it("avoids duplicate schedules for the same open interval", () => {
    const session = startCountdown(90);
    const a = scheduleFocusPhaseAlert(session, {
      now: Date.parse("2026-08-07T10:00:00.000Z"),
    });
    const b = scheduleFocusPhaseAlert(session, {
      now: Date.parse("2026-08-07T10:00:00.400Z"),
    });
    expect(a?.timerId).toBe(b?.timerId);
  });
});

describe("deliverFocusPhaseAlert", () => {
  it("skips system notification when permission is denied", async () => {
    vi.stubGlobal("Notification", {
      permission: "denied",
      requestPermission: vi.fn(),
    });
    const session = startCountdown(60);
    const result = await deliverFocusPhaseAlert(session, {
      kind: "phase_change",
      locale: "en",
      silentInApp: true,
    });
    expect(result.notification).toBe(false);
    expect(result.skipped).toBe(false);
  });

  it("does not request permission during delivery (default stays quiet)", async () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission,
    });
    const session = startCountdown(60);
    const result = await deliverFocusPhaseAlert(session, {
      kind: "phase_change",
      silentInApp: true,
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(result.notification).toBe(false);
  });

  it("dedupes rapid schedule + state-change deliveries", async () => {
    vi.stubGlobal("Notification", {
      permission: "denied",
      requestPermission: vi.fn(),
    });
    const session = startCountdown(60);
    const first = await deliverFocusPhaseAlert(session, {
      kind: "phase_end",
      silentInApp: true,
    });
    const second = await deliverFocusPhaseAlert(session, {
      kind: "phase_change",
      silentInApp: true,
    });
    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
  });

  it("honours disabled device sound without throwing", async () => {
    saveFocusDevicePreferences({
      ...defaultFocusDevicePreferences,
      soundEnabled: false,
      vibrationEnabled: false,
      systemNotifyEnabled: false,
    });
    const session = startCountdown(60);
    const result = await deliverFocusPhaseAlert(session, {
      kind: "session_complete",
      silentInApp: true,
    });
    expect(result.sound).toBe(false);
    expect(result.vibration).toBe(false);
    expect(result.notification).toBe(false);
  });
});

describe("focus wake lock", () => {
  it("reports unsupported when the API is missing", async () => {
    const original = (navigator as Navigator & { wakeLock?: unknown }).wakeLock;
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: undefined,
    });
    expect(isFocusWakeLockSupported()).toBe(false);
    const session = startCountdown(60);
    await expect(syncFocusWakeLock(session)).resolves.toBe("unsupported");
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: original,
    });
  });

  it("releases when the session is paused or terminal", async () => {
    const release = vi.fn(async () => undefined);
    const request = vi.fn(async () => ({
      released: false,
      release,
      addEventListener: vi.fn(),
    }));
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request },
    });

    const running = startCountdown(60);
    await expect(syncFocusWakeLock(running)).resolves.toBe("active");
    expect(request).toHaveBeenCalledWith("screen");

    const paused = applyFocusAction(
      running,
      { type: "pause" },
      {
        expectedRevision: running.revision,
        now: Date.parse("2026-08-07T10:00:10.000Z"),
        createId: idFactory("wl"),
      },
    ).session;
    await expect(syncFocusWakeLock(paused)).resolves.toBe("released");
    expect(release).toHaveBeenCalled();

    await expect(syncFocusWakeLock(null)).resolves.toBe("released");
  });

  it("does not throw when request is denied", async () => {
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: vi.fn(async () => {
          throw new Error("NotAllowedError");
        }),
      },
    });
    const session = startCountdown(60);
    await expect(syncFocusWakeLock(session)).resolves.toBe("denied");
  });
});
