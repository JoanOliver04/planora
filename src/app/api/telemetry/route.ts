import { NextResponse } from "next/server";
import { z } from "zod";
import { requestKey } from "@/lib/security/rate-limit";
import { distributedRateLimit } from "@/lib/security/distributed-rate-limit";
import {
  exceedsContentLength,
  hasJsonContentType,
  isSameOriginRequest,
} from "@/lib/security/request";
import { sanitizeTelemetry } from "@/lib/telemetry/sanitize";

const noStore = { "Cache-Control": "no-store" };
const payload = z.object({
  type: z.literal("error"),
  path: z.string().startsWith("/").max(160),
  message: z.string().max(300).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json(
      { error: "Invalid origin" },
      { status: 403, headers: noStore },
    );
  if (!hasJsonContentType(request))
    return NextResponse.json(
      { error: "Unsupported media type" },
      { status: 415, headers: noStore },
    );
  if (exceedsContentLength(request, 4_096))
    return NextResponse.json(
      { error: "Payload too large" },
      { status: 413, headers: noStore },
    );

  const result = await distributedRateLimit(
    requestKey(request, "telemetry"),
    30,
  );
  if (!result.allowed)
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { ...noStore, "Retry-After": String(result.retryAfter) },
      },
    );

  const parsed = payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid event" },
      { status: 400, headers: noStore },
    );
  console.info("planora.telemetry", sanitizeTelemetry(parsed.data));
  return new NextResponse(null, { status: 204, headers: noStore });
}
