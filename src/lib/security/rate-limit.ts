type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Entry>();
export function rateLimit(key: string, limit = 10, windowMs = 60_000) {
  const now = Date.now(), current = buckets.get(key);
  if (!current || current.resetAt <= now) { buckets.set(key, { count: 1, resetAt: now + windowMs }); return { allowed: true, retryAfter: 0 }; }
  current.count += 1;
  return { allowed: current.count <= limit, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
}
export function requestKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return scope + ":" + (forwarded || "unknown");
}
