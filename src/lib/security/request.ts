export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function hasJsonContentType(request: Request) {
  return request.headers
    .get("content-type")
    ?.toLowerCase()
    .startsWith("application/json");
}

export function exceedsContentLength(request: Request, maximumBytes: number) {
  const header = request.headers.get("content-length");
  if (!header) return false;
  const length = Number(header);
  return !Number.isSafeInteger(length) || length < 0 || length > maximumBytes;
}
