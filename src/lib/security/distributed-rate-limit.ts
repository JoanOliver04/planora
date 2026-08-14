import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "./rate-limit";

type RateLimitResult = { allowed: boolean; retryAfter: number };

export async function distributedRateLimit(
  key: string,
  limit = 10,
  windowMs = 60_000,
): Promise<RateLimitResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return rateLimit(key, limit, windowMs);

  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const keyHash = createHash("sha256").update(key).digest("hex");
  const { data, error } = await client.rpc("consume_rate_limit", {
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
  });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result || typeof result.allowed !== "boolean")
    return rateLimit(key, limit, windowMs);
  return {
    allowed: result.allowed,
    retryAfter: Number(result.retry_after) || 0,
  };
}
