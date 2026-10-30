const sensitive =
  /email|token|password|secret|authorization|cookie|description|notes?|title|name|content/i;
export function sanitizeTelemetry(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (typeof value === "string")
    return value
      .slice(0, 200)
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]");
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => sanitizeTelemetry(item, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 30)
        .map(([key, item]) => [
          key,
          sensitive.test(key)
            ? "[redacted]"
            : sanitizeTelemetry(item, depth + 1),
        ]),
    );
  return typeof value === "number" || typeof value === "boolean" ? value : null;
}

const technicalValues: Record<string, ReadonlySet<string>> = {
  phase: new Set([
    "loading",
    "authenticated",
    "offline",
    "recoverable_error",
    "fatal_error",
    "unauthenticated",
    "service_worker",
    "auth",
    "assets",
    "hydrate",
    "api",
    "asset",
    "construct",
    "play",
    "show",
  ]),
  errorType: new Set([
    "Error",
    "TypeError",
    "RangeError",
    "AbortError",
    "TimeoutError",
    "NotAllowedError",
    "NotSupportedError",
    "InvalidStateError",
    "SecurityError",
    "timeout",
    "auth_error",
    "profile_error",
    "register_failed",
    "stale_assets",
  ]),
  code: new Set([
    "timeout",
    "auth",
    "profile",
    "session",
    "request",
    "network",
    "chunk_or_css_404",
    "offline",
    "recoverable_error",
    "unauthenticated",
  ]),
  sw: new Set([
    "unsupported",
    "no-controller",
    "installing",
    "installed",
    "activating",
    "activated",
    "redundant",
  ]),
  api: new Set([
    "AudioContext",
    "unavailable",
    "ServiceWorkerRegistration",
    "Notification",
  ]),
  sound: new Set(["soft", "bell", "alarm", "unknown"]),
};

/** Error telemetry is metadata, never a channel for raw error or URL content. */
export function sanitizeErrorEvent(value: {
  path: string;
  context?: Record<string, unknown>;
}) {
  const pathname = value.path.split(/[?#]/, 1)[0];
  const segments = pathname.split("/").filter(Boolean);
  const known = new Set([
    "today",
    "week",
    "month",
    "search",
    "summary",
    "tasks",
    "focus",
    "events",
    "history",
    "statistics",
    "reminders",
    "schedules",
    "categories",
    "templates",
    "settings",
    "data",
    "more",
    "login",
    "privacy",
    "terms",
    "demo",
  ]);
  const locale =
    segments[0] === "es" || segments[0] === "en" ? segments[0] : null;
  const path =
    pathname === "/"
      ? "/"
      : locale && (!segments[1] || known.has(segments[1]))
        ? `/${locale}${segments[1] ? `/${segments[1]}` : ""}`
        : "/other";
  const context: Record<string, string | boolean> = {};
  for (const [key, item] of Object.entries(value.context ?? {})) {
    if (key === "online" && typeof item === "boolean") context[key] = item;
    else if (typeof item === "string" && technicalValues[key]?.has(item))
      context[key] = item;
    else if (
      key === "digest" &&
      typeof item === "string" &&
      /^\d{1,20}$/.test(item)
    )
      context[key] = item;
    else if (
      key === "build" &&
      typeof item === "string" &&
      /^(?:[a-f0-9]{7,40}|\d{1,4}\.\d{1,4}\.\d{1,4})$/.test(item)
    )
      context[key] = item;
  }
  return { type: "error" as const, path, context };
}
