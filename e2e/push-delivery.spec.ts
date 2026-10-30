import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { expect, test } from "./fixtures";
import { hasLocalCredentials, withLocalWorkspace } from "./local-workspace";
import { defaultNotificationPreferences } from "../src/features/reminders/preferences";
import type { Database } from "../src/types/database";

test("push outbox survives closed pages, retries and isolates devices", async ({
  context,
  baseURL,
  browserName,
}) => {
  test.skip(
    !hasLocalCredentials || browserName !== "chromium",
    "One isolated backend integration run",
  );
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const endpoint =
      "https://fcm.googleapis.com/fcm/send/qa-" + crypto.randomUUID();
    const registered = await db.rpc("register_push_subscription", {
      p_endpoint: endpoint,
      p_p256dh: randomBytes(65).toString("base64url"),
      p_auth: randomBytes(16).toString("base64url"),
      p_preferences: defaultNotificationPreferences,
    });
    expect(registered.error).toBeNull();
    expect((await db.rpc("claim_push_jobs")).error).not.toBeNull();
    expect((await db.rpc("push_dispatch_configuration")).error).not.toBeNull();
    const inserted = await db
      .from("reminders")
      .insert({
        user_id: userId,
        kind: "alarm",
        title: "QA closed app alarm",
        recurrence: "once",
        timezone: "Europe/Madrid",
        next_trigger_at: new Date(Date.now() - 2000).toISOString(),
        enabled: true,
      })
      .select("id")
      .single();
    expect(inserted.error).toBeNull();
    // No page ever opens. Only the server claims and advances this alarm.
    const batch = await admin.rpc("claim_push_jobs");
    expect(batch.error).toBeNull();
    type Job = {
      id: string;
      lease: string;
      endpoint: string;
      payload: { body: string; tag: string };
    };
    const jobs = batch.data as unknown as Job[];
    const job = jobs.find((item) => item.endpoint === endpoint)!;
    expect(job).toBeTruthy();
    expect(job.payload.body).toBe("QA closed app alarm");
    const again = await admin.rpc("claim_push_jobs");
    expect(again.error).toBeNull();
    expect(
      (again.data as unknown as Job[]).filter(
        (item) => item.endpoint === endpoint,
      ),
    ).toHaveLength(0);
    expect(
      (
        await admin.rpc("finish_push_job", {
          p_id: job.id,
          p_lease: crypto.randomUUID(),
          p_code: 201,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await db
          .from("reminders")
          .select("delivery_status")
          .eq("id", inserted.data!.id)
          .single()
      ).data?.delivery_status,
    ).toBe("pending");
    expect(
      (
        await admin.rpc("finish_push_job", {
          p_id: job.id,
          p_lease: job.lease,
          p_code: 201,
        })
      ).error,
    ).toBeNull();
    const row = await db
      .from("reminders")
      .select("enabled,delivery_status,last_delivered_at")
      .eq("id", inserted.data!.id)
      .single();
    expect(row.data?.enabled).toBe(false);
    expect(row.data?.delivery_status).toBe("delivered");
    expect(row.data?.last_delivered_at).toBeTruthy();
    // A second user cannot register/remove the first user's endpoint.
    await withLocalWorkspace(context, baseURL, async (other) => {
      expect(
        (
          await other.rpc("register_push_subscription", {
            p_endpoint: endpoint,
            p_p256dh: randomBytes(65).toString("base64url"),
            p_auth: randomBytes(16).toString("base64url"),
            p_preferences: defaultNotificationPreferences,
          })
        ).error,
      ).not.toBeNull();
      expect(
        (await other.rpc("remove_push_subscription", { p_endpoint: endpoint }))
          .error,
      ).toBeNull();
    });
    expect(
      (await db.rpc("queue_push_test", { p_endpoint: endpoint })).error,
    ).toBeNull();
    expect(
      (await db.rpc("queue_push_test", { p_endpoint: endpoint })).error,
    ).not.toBeNull();
    expect(
      (await db.rpc("remove_push_subscription", { p_endpoint: endpoint }))
        .error,
    ).toBeNull();
    expect(
      (await db.rpc("queue_push_test", { p_endpoint: endpoint })).error,
    ).not.toBeNull();
  });
});
