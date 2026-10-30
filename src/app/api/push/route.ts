import { createClient } from "@/lib/supabase/server";
import {
  isSameOriginRequest,
  hasJsonContentType,
  readBoundedText,
} from "@/lib/security/request";
import { distributedRateLimit } from "@/lib/security/distributed-rate-limit";
import { pushRequestSchema } from "@/features/reminders/push-validation";

const headers = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers });

export async function GET() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return reply({ error: "Unauthorized" }, 401);
  const { data, error } = await db.rpc("push_configuration");
  if (error) return reply({ error: "Push unavailable" }, 503);
  return reply(data ?? { ready: false, managed: false });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request) || !hasJsonContentType(request))
    return reply({ error: "Invalid request" }, 403);
  const raw = await readBoundedText(request, 8192);
  if (raw === null) return reply({ error: "Request too large" }, 413);
  let input;
  try {
    input = pushRequestSchema.safeParse(JSON.parse(raw));
  } catch {
    return reply({ error: "Invalid JSON" }, 400);
  }
  if (!input.success) return reply({ error: "Invalid subscription" }, 400);
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return reply({ error: "Unauthorized" }, 401);
  const limit = await distributedRateLimit(`push:${user.id}`, 30, 60_000);
  if (!limit.allowed) return reply({ error: "Try again later" }, 429);
  const value = input.data;
  const result =
    value.action === "subscribe"
      ? await db.rpc("register_push_subscription", {
          p_endpoint: value.subscription.endpoint,
          p_p256dh: value.subscription.keys.p256dh,
          p_auth: value.subscription.keys.auth,
          p_preferences: value.preferences,
        })
      : value.action === "test"
        ? await db.rpc("queue_push_test", { p_endpoint: value.endpoint })
        : await db.rpc("remove_push_subscription", {
            p_endpoint: value.endpoint,
          });
  if (result.error) return reply({ error: "Unable to update device" }, 409);
  return reply({ ok: true });
}
