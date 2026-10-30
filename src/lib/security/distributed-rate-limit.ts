import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { unavailableLimit } from "./rate-limit";
import { AUTH_TIMEOUT_MS, fetchWithTimeout } from "@/lib/bootstrap/timeout";

type RateLimitResult = { allowed: boolean; retryAfter: number };

export async function distributedRateLimit(
  key: string,
  limit = 10,
  windowMs = 60_000,
  options?: { fallback?: "memory" | "deny" },
): Promise<RateLimitResult> {
  const fallback = options?.fallback ?? "deny";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return unavailableLimit(fallback, key, limit, windowMs);
  }

  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) => fetchWithTimeout(input, init, AUTH_TIMEOUT_MS),
    },
  });
  const keyHash = createHash("sha256").update(key).digest("hex");
  try {
    const { data, error } = await client.rpc("consume_rate_limit", {
      p_key_hash: keyHash,
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
    });
    const result = Array.isArray(data) ? data[0] : data;
    if (error || !result || typeof result.allowed !== "boolean") {
      return unavailableLimit(fallback, key, limit, windowMs);
    }
    return {
      allowed: result.allowed,
      retryAfter: Number(result.retry_after) || 0,
    };
  } catch {
    return unavailableLimit(fallback, key, limit, windowMs);
  }
}
