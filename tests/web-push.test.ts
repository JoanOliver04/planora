import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, it, expect, vi } from "vitest";
import {
  deliverPushJobs,
  type PushJob,
} from "@/features/reminders/push-dispatch";
import {
  isPushEndpoint,
  pushRequestSchema,
} from "@/features/reminders/push-validation";
import { defaultNotificationPreferences } from "@/features/reminders/preferences";

function worker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const self = {
    location: { href: "https://planora.test/sw.js" },
    registration: { showNotification },
    clients: { matchAll: vi.fn().mockResolvedValue([]) },
    addEventListener: (name: string, handler: (event: unknown) => void) => {
      handlers[name] = handler;
    },
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self,
    URL,
    Set,
    console,
  });
  return { handlers, showNotification };
}

describe("closed-app Web Push", () => {
  it("shows a push without any open page, timer, window or localStorage", async () => {
    const { handlers, showNotification } = worker();
    const waits: Promise<unknown>[] = [];
    expect(handlers.push).toBeTypeOf("function");
    handlers.push({
      data: {
        json: () => ({
          title: "Alarm",
          body: "Read",
          tag: "planora-alarm:123",
          url: "/en/reminders",
        }),
      },
      waitUntil: (value: Promise<unknown>) => waits.push(value),
    });
    await Promise.all(waits);
    expect(showNotification).toHaveBeenCalledWith(
      "Alarm",
      expect.objectContaining({ body: "Read", data: { url: "/en/reminders" } }),
    );
  });
  it("keeps pushes visible even for malformed payloads", async () => {
    const { handlers, showNotification } = worker();
    let done: Promise<unknown> = Promise.resolve();
    handlers.push({
      data: {
        json: () => {
          throw new Error("Malformed");
        },
      },
      waitUntil: (promise: Promise<unknown>) => {
        done = promise;
      },
    });
    await done;
    expect(showNotification).toHaveBeenCalledWith(
      "Planora",
      expect.objectContaining({ tag: "planora-push-fallback" }),
    );
  });
  it("does not allow a push to navigate outside Planora", async () => {
    const { handlers, showNotification } = worker();
    let done: Promise<unknown> = Promise.resolve();
    handlers.push({
      data: {
        json: () => ({
          title: "Alarm",
          tag: "planora:test",
          url: "https://evil.test",
        }),
      },
      waitUntil: (value: Promise<unknown>) => {
        done = value;
      },
    });
    await done;
    expect(showNotification).toHaveBeenCalledWith(
      "Alarm",
      expect.objectContaining({ data: { url: "/es/reminders" } }),
    );
  });
});

describe("push endpoint validation", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/test",
    "https://web.push.apple.com/Qtest",
    "https://updates.push.services.mozilla.com/wpush/v2/test",
    "https://wns2-db5p.notify.windows.com/test",
  ])("accepts %s", (value) => expect(isPushEndpoint(value)).toBe(true));
  it.each([
    "http://fcm.googleapis.com/test",
    "https://fcm.googleapis.com.evil.test/test",
    "https://fcm.googleapis.com@127.0.0.1/test",
    "https://fcm.googleapis.com:444/test",
    "https://127.0.0.1/test",
    "https://169.254.169.254/metadata",
    "https://evil.test/test",
    "https://fcm.googleapis.com/test#fragment",
  ])("blocks SSRF target %s", (value) =>
    expect(isPushEndpoint(value)).toBe(false),
  );
  it("rejects unexpected ownership fields and non-boolean preferences", () => {
    const input = {
      action: "subscribe",
      subscription: {
        endpoint: "https://fcm.googleapis.com/test",
        keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
      },
      preferences: defaultNotificationPreferences,
    };
    expect(pushRequestSchema.safeParse(input).success).toBe(true);
    expect(
      pushRequestSchema.safeParse({ ...input, userId: "other" }).success,
    ).toBe(false);
    expect(
      pushRequestSchema.safeParse({
        ...input,
        preferences: { ...input.preferences, system: "true" },
      }).success,
    ).toBe(false);
  });
});

describe("push dispatcher", () => {
  const job: PushJob = {
    id: "job",
    lease: "lease",
    endpoint: "https://fcm.googleapis.com/test",
    keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
    payload: { title: "Alarm" },
  };
  it("settles accepted, expired, retryable and untrusted deliveries independently", async () => {
    const jobs = [
      job,
      { ...job, id: "expired" },
      { ...job, id: "retry" },
      { ...job, id: "ssrf", endpoint: "https://127.0.0.1/" },
    ];
    const send = vi.fn(async (item: PushJob) => {
      if (item.id === "expired") throw { statusCode: 410 };
      if (item.id === "retry") throw new Error("timeout");
      return 201;
    });
    const finish = vi.fn().mockResolvedValue(undefined);
    expect(await deliverPushJobs(jobs, send, finish)).toEqual({
      sent: 1,
      failed: 3,
    });
    expect(send).toHaveBeenCalledTimes(3);
    expect(finish.mock.calls.map(([j, code]) => [j.id, code]).sort()).toEqual(
      [
        ["job", 201],
        ["expired", 410],
        ["retry", 503],
        ["ssrf", 400],
      ].sort(),
    );
  });
  it("does not report completion when persisting a provider result fails", async () => {
    await expect(
      deliverPushJobs(
        [job],
        async () => 201,
        async () => {
          throw new Error("offline");
        },
      ),
    ).rejects.toThrow("offline");
  });
});
