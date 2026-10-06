import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultNotificationPreferences } from "@/features/reminders/preferences";
import {
  __resetNoticesForTests,
  deliverNotices,
  noticeIdentity,
  noticeRecord,
  type DueNotice,
  type PresentedNotice,
  type SystemNoticeResult,
} from "@/features/reminders/notices";
import { nextFutureTrigger } from "@/features/reminders/schedule";
import { readyServiceWorker } from "@/lib/pwa/register-sw";
import { showPlanoraSystemNotification } from "@/features/reminders/system-notification";

vi.mock("@/lib/pwa/register-sw", () => ({
  readyServiceWorker: vi.fn(),
}));

const now = new Date("2026-10-06T21:00:00.000Z");
const nextDay = new Date("2026-10-07T21:00:00.000Z");

function preferences(
  overrides: Partial<typeof defaultNotificationPreferences> = {},
) {
  return { ...defaultNotificationPreferences, ...overrides };
}

function summary(id = "summary-1"): DueNotice {
  return {
    id,
    kind: "daily_summary",
    taskId: null,
    eventId: null,
    recurrence: "daily",
    timezone: "UTC",
    nextTriggerAt: "2026-10-01T20:00:00.000Z",
    title: "Tu resumen diario",
    body: "Consulta lo que has completado, lo pendiente y tus eventos de hoy.",
    actionLabel: "Ver resumen",
    appPath: "/summary",
    notificationPath: "/es/summary",
  };
}

function taskReminder(): DueNotice {
  return {
    ...summary("task-reminder"),
    kind: "relative",
    taskId: "task-1",
    recurrence: "once",
    nextTriggerAt: "2026-10-06T20:00:00.000Z",
    title: "Recordatorio de Planora",
    body: "Regar",
    actionLabel: "Abrir",
    appPath: "/reminders",
    notificationPath: "/es/reminders",
  };
}

function alarm(id = "alarm-1"): DueNotice {
  return {
    ...summary(id),
    kind: "alarm",
    recurrence: "once",
    nextTriggerAt: "2026-10-06T20:30:00.000Z",
    title: "Alarma de Planora",
    body: "Beber agua",
    actionLabel: "Abrir",
    appPath: "/reminders",
    notificationPath: "/es/reminders",
  };
}

async function deliver(
  notices: DueNotice[],
  options: {
    prefs?: Partial<typeof defaultNotificationPreferences>;
    at?: Date;
    visible?: boolean;
    system?: () => Promise<SystemNoticeResult> | SystemNoticeResult;
    playAlarm?: () => void;
    vibrate?: () => void;
  } = {},
) {
  const inApp: PresentedNotice[] = [];
  const system: PresentedNotice[] = [];
  const advanced: Array<string | null> = [];
  await deliverNotices({
    notices,
    preferences: preferences(options.prefs),
    now: options.at ?? now,
    visible: options.visible ?? true,
    presentInApp: (notice) => inApp.push(notice),
    presentSystem: async (notice) => {
      system.push(notice);
      return options.system ? await options.system() : "shown";
    },
    advance: async (_notice, next) => {
      advanced.push(next);
    },
    playAlarm: options.playAlarm,
    vibrate: options.vibrate,
  });
  return { inApp, system, advanced };
}

afterEach(() => {
  __resetNoticesForTests();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("daily summary delivery", () => {
  it("shows one daily summary", async () => {
    const first = await deliver([summary(), summary("summary-2")]);
    expect(first.inApp).toHaveLength(1);
    expect(first.inApp[0]?.toast.id).toBe("daily-summary:2026-10-06");
    expect(first.inApp[0]?.toast.closeButton).toBe(true);
    expect(first.inApp[0]?.toast.className).toBe("planora-daily-summary");
    expect(first.system).toHaveLength(1);
    expect(first.system[0]?.tag).toBe(first.inApp[0]?.identity);
  });

  it("does not duplicate a summary across scheduler runs, reload or navigation", async () => {
    const seen: string[] = [];
    for (let run = 0; run < 3; run += 1) {
      const result = await deliver([summary()]);
      seen.push(...result.inApp.map((notice) => notice.identity));
    }
    expect(seen).toEqual(["daily-summary:2026-10-06"]);
  });

  it("closes the summary when it is opened and does not show it again", async () => {
    const first = await deliver([summary()]);
    const dismiss = vi.fn();
    first.inApp[0]?.onOpen();
    dismiss(first.inApp[0]?.toast.id);
    expect(noticeRecord("daily-summary:2026-10-06")?.inApp).toBe("opened");
    expect(dismiss).toHaveBeenCalledWith("daily-summary:2026-10-06");
    const second = await deliver([summary()]);
    expect(second.inApp).toHaveLength(0);
    expect(second.system).toHaveLength(0);
  });

  it("keeps a dismissed summary hidden for the rest of the local day", async () => {
    const first = await deliver([summary()]);
    first.inApp[0]?.onDismiss();
    expect(noticeRecord("daily-summary:2026-10-06")?.inApp).toBe("dismissed");
    const second = await deliver([summary()]);
    expect(second.inApp).toHaveLength(0);
  });

  it("can show the summary again on the next local day", async () => {
    await deliver([summary()]);
    const tomorrow = await deliver([summary()], { at: nextDay });
    expect(tomorrow.inApp.map((notice) => notice.identity)).toEqual([
      "daily-summary:2026-10-07",
    ]);
  });

  it("lets one tab claim the summary before another tab presents it", async () => {
    const [first, second] = await Promise.all([
      deliver([summary()]),
      deliver([summary("summary-2")]),
    ]);
    expect(first.inApp.length + second.inApp.length).toBe(1);
    expect(first.system.length + second.system.length).toBe(1);
  });

  it("advances a missed summary to the next future occurrence", async () => {
    const result = await deliver([summary()]);
    expect(result.advanced).toEqual(["2026-10-07T20:00:00.000Z"]);
    expect(
      nextFutureTrigger(
        new Date("2026-10-01T20:00:00.000Z"),
        "daily",
        "UTC",
        now,
      )?.toISOString(),
    ).toBe("2026-10-07T20:00:00.000Z");
  });
});

describe("reminder and alarm channels", () => {
  it("shows an in-app task reminder", async () => {
    const result = await deliver([taskReminder()], {
      prefs: { system: false },
    });
    expect(result.inApp).toHaveLength(1);
    expect(result.system).toHaveLength(0);
    expect(result.inApp[0]?.body).toBe("Regar");
  });

  it("shows a system notification when that channel is permitted", async () => {
    const result = await deliver([taskReminder()], { prefs: { inApp: false } });
    expect(result.system).toHaveLength(1);
    expect(result.inApp).toHaveLength(0);
    expect(result.system[0]?.tag).toBe(noticeIdentity(taskReminder(), now));
  });

  it("keeps system off and in-app on independent", async () => {
    const result = await deliver([taskReminder()], {
      prefs: { system: false },
    });
    expect(result.inApp).toHaveLength(1);
    expect(result.system).toHaveLength(0);
  });

  it("keeps system on and in-app off independent", async () => {
    const result = await deliver([taskReminder()], { prefs: { inApp: false } });
    expect(result.system).toHaveLength(1);
    expect(result.inApp).toHaveLength(0);
  });

  it("uses both channels once when both are on", async () => {
    const result = await deliver([taskReminder()]);
    expect(result.inApp).toHaveLength(1);
    expect(result.system).toHaveLength(1);
    const again = await deliver([taskReminder()]);
    expect(again.inApp).toHaveLength(0);
    expect(again.system).toHaveLength(0);
  });

  it("stays quiet when both channels are off", async () => {
    const result = await deliver([taskReminder()], {
      prefs: { inApp: false, system: false },
    });
    expect(result.inApp).toHaveLength(0);
    expect(result.system).toHaveLength(0);
    expect(result.advanced).toHaveLength(0);
  });

  it("survives a denied permission and a rejected system notification", async () => {
    const denied = await deliver([taskReminder()], {
      system: () => "denied",
    });
    expect(denied.inApp).toHaveLength(1);
    expect(denied.system).toHaveLength(1);
    __resetNoticesForTests();
    await expect(
      deliver([taskReminder()], {
        system: () => Promise.reject(new Error("blocked")),
      }),
    ).resolves.toMatchObject({
      inApp: [expect.objectContaining({ body: "Regar" })],
    });
  });

  it("does not ask for permission while it is still pending", async () => {
    const result = await deliver([alarm()], {
      prefs: { inApp: false },
      system: () => "default",
    });
    expect(result.system).toHaveLength(1);
    expect(result.inApp).toHaveLength(0);
    expect(result.advanced).toHaveLength(0);
  });

  it("does not repeat a notice when the app returns from the background", async () => {
    const hidden = await deliver([taskReminder()], { visible: false });
    const visible = await deliver([taskReminder()], { visible: true });
    expect(hidden.system).toHaveLength(1);
    expect(hidden.inApp).toHaveLength(0);
    expect(visible.system).toHaveLength(0);
    expect(visible.inApp).toHaveLength(0);
  });

  it("dedupes by stable tag rather than by the visible text", async () => {
    const first = taskReminder();
    const renamed = { ...first, body: "Otro texto" };
    const result = await deliver([first, renamed]);
    expect(result.system.map((notice) => notice.tag)).toEqual([
      noticeIdentity(first, now),
    ]);
    const otherDay = {
      ...first,
      id: "task-reminder-2",
      nextTriggerAt: "2026-10-07T20:00:00.000Z",
    };
    expect(noticeIdentity(otherDay, now)).not.toBe(noticeIdentity(first, now));
  });

  it("plays one alarm through the configured channels", async () => {
    const playAlarm = vi.fn();
    const vibrate = vi.fn();
    const first = await deliver([alarm()], { playAlarm, vibrate });
    await deliver([alarm()], { playAlarm, vibrate });
    expect(first.inApp).toHaveLength(1);
    expect(first.system).toHaveLength(1);
    expect(playAlarm).toHaveBeenCalledOnce();
    expect(vibrate).toHaveBeenCalledOnce();

    __resetNoticesForTests();
    const quiet = vi.fn();
    await deliver([alarm("alarm-2")], {
      prefs: { sound: false, vibration: false },
      playAlarm: quiet,
      vibrate: quiet,
    });
    expect(quiet).not.toHaveBeenCalled();
  });
});

describe("system notification adapter", () => {
  const input = {
    title: "Recordatorio de Planora",
    body: "Regar",
    tag: "task:task-1:2026-10-06:2026-10-06T20:00:00.000Z",
    url: "/es/reminders",
    silent: false,
    requireInteraction: false,
  };

  it("does not construct a page notification when permission is pending or denied", async () => {
    const requestPermission = vi.fn();
    const NotificationMock = vi.fn();
    Object.assign(NotificationMock, {
      permission: "default",
      requestPermission,
    });
    vi.stubGlobal("Notification", NotificationMock);
    await expect(showPlanoraSystemNotification(input)).resolves.toBe("default");
    Object.assign(NotificationMock, { permission: "denied" });
    await expect(showPlanoraSystemNotification(input)).resolves.toBe("denied");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(NotificationMock).not.toHaveBeenCalled();
    expect(readyServiceWorker).not.toHaveBeenCalled();
  });

  it("asks the service worker to show one tagged notification", async () => {
    const NotificationMock = vi.fn();
    Object.assign(NotificationMock, { permission: "granted" });
    vi.stubGlobal("Notification", NotificationMock);
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const worker = {
      postMessage: (_message: unknown, ports: MessagePort[]) => {
        ports[0]?.postMessage({ ok: true });
      },
    };
    vi.mocked(readyServiceWorker).mockResolvedValue({
      active: worker,
      showNotification,
    } as unknown as ServiceWorkerRegistration);
    await expect(showPlanoraSystemNotification(input)).resolves.toBe("shown");
    expect(showNotification).not.toHaveBeenCalled();
    expect(NotificationMock).not.toHaveBeenCalled();
  });

  it("keeps a rejected showNotification inside the channel", async () => {
    const NotificationMock = vi.fn();
    Object.assign(NotificationMock, { permission: "granted" });
    vi.stubGlobal("Notification", NotificationMock);
    const showNotification = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("nope"), { name: "NotAllowedError" }),
      );
    vi.mocked(readyServiceWorker).mockResolvedValue({
      active: null,
      showNotification,
    } as unknown as ServiceWorkerRegistration);
    await expect(showPlanoraSystemNotification(input)).resolves.toBe("failed");
    expect(sessionStorage.getItem("planora-system-notification-status")).toBe(
      "failed",
    );
  });
});

describe("service worker notification tags", () => {
  it("accepts an offset timestamp and rejects a script tag", () => {
    const worker = readFileSync("public/sw.js", "utf8");
    const literal = "/^[A-Za-z0-9:._+-]{8,180}$/";
    expect(worker).toContain(literal);
    const pattern = new RegExp(literal.slice(1, -1));
    expect(
      pattern.test("task:task-1:2026-10-06:2026-10-06T20:00:00.000+00:00"),
    ).toBe(true);
    expect(pattern.test("daily-summary:2026-10-06")).toBe(true);
    expect(pattern.test("<script>")).toBe(false);
  });
});

describe("daily summary mobile placement", () => {
  it("stays in the top safe area and clear of the bottom navigation", () => {
    const providers = readFileSync("src/components/providers.tsx", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");
    expect(providers).toContain('position="top-center"');
    expect(providers).toContain("safe-area-inset-top");
    expect(providers).toContain("safe-area-inset-left");
    expect(providers).not.toContain('position="bottom-center"');
    expect(styles).toContain(".planora-daily-summary");
    expect(styles).toContain("max-width: 412px");
    expect(styles).toContain("100vw - 1.5rem");
    expect(styles).toContain("safe-area-inset-bottom");
    expect(styles).toMatch(/\.mobile-nav\s*\{[\s\S]*bottom:\s*0;/);
  });
});
