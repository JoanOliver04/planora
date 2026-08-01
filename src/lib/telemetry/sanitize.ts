const sensitive = /email|token|password|secret|authorization|cookie|description|notes?|title|name|content/i;
export function sanitizeTelemetry(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (typeof value === "string") return value.slice(0, 200).replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]");
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeTelemetry(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [key, sensitive.test(key) ? "[redacted]" : sanitizeTelemetry(item, depth + 1)]));
  return typeof value === "number" || typeof value === "boolean" ? value : null;
}
