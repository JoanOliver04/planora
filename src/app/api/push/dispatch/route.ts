import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { Database, Json } from "@/types/database";
import {
  deliverPushJobs,
  type PushJob,
} from "@/features/reminders/push-dispatch";

export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers });

export async function POST(request: Request) {
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (supplied.length !== 64) return reply({ error: "Unauthorized" }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return reply({ error: "Unavailable" }, 503);
  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("push_dispatch_configuration");
  const config = data as {
    dispatch_token?: string;
    public_key?: string;
    private_key?: string;
  } | null;
  if (
    error ||
    !config?.dispatch_token ||
    !config.public_key ||
    !config.private_key
  )
    return reply({ error: "Unavailable" }, 503);
  const expected = Buffer.from(config.dispatch_token),
    provided = Buffer.from(supplied);
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  )
    return reply({ error: "Unauthorized" }, 401);
  const claimed = await db.rpc("claim_push_jobs");
  if (claimed.error) return reply({ error: "Queue unavailable" }, 503);
  try {
    const result = await deliverPushJobs(
      (claimed.data ?? []) as unknown as PushJob[],
      async (job) => {
        const response = await webpush.sendNotification(
          { endpoint: job.endpoint, keys: job.keys },
          JSON.stringify(job.payload),
          {
            vapidDetails: {
              subject: "https://planora-lake-one.vercel.app",
              publicKey: config.public_key!,
              privateKey: config.private_key!,
            },
            TTL: 3600,
            urgency: "high",
            timeout: 8000,
          },
        );
        return response.statusCode;
      },
      async (job, code) => {
        const result = await db.rpc("finish_push_job", {
          p_id: job.id,
          p_lease: job.lease,
          p_code: code,
        });
        if (result.error) throw new Error("Queue update failed");
      },
    );
    return reply(result as Json);
  } catch {
    return reply({ error: "Dispatch incomplete" }, 503);
  }
}
