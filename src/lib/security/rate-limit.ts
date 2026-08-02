type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Entry>();
const maximumBuckets = 5_000;

function prune(now: number) {
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
  while (buckets.size >= maximumBuckets) {
    const oldest = buckets.keys().next().value;
    if (typeof oldest !== "string") break;
    buckets.delete(oldest);
  }
}

export function rateLimit(key: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    if (buckets.size >= maximumBuckets) prune(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  return {
    allowed: current.count <= limit,
    retryAfter: Math.ceil((current.resetAt - now) / 1000),
  };
}

export function requestKey(request: Request, scope: string) {
  const candidate =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const normalized = /^[0-9a-f:.]{1,64}$/i.test(candidate)
    ? candidate.toLowerCase()
    : "unknown";
  return `${scope}:${normalized}`;
}
