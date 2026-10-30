export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site")
    return false;
  try {
    const supplied = new URL(origin);
    return (
      origin === supplied.origin &&
      supplied.origin === new URL(request.url).origin
    );
  } catch {
    return false;
  }
}

export function hasJsonContentType(request: Request) {
  return (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() === "application/json"
  );
}

export function exceedsContentLength(request: Request, maximumBytes: number) {
  const header = request.headers.get("content-length");
  if (!header) return false;
  if (!/^\d+$/.test(header)) return true;
  const length = Number(header);
  return !Number.isSafeInteger(length) || length < 0 || length > maximumBytes;
}

/** Enforce bytes while reading, including chunked or dishonest-length requests. */
export async function readBoundedText(request: Request, maximumBytes: number) {
  if (exceedsContentLength(request, maximumBytes)) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return text + decoder.decode();
      bytes += chunk.value.byteLength;
      if (bytes > maximumBytes) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } catch {
    void reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }
}
