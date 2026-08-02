import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, requestKey } from "@/lib/security/rate-limit";
import { sanitizeTelemetry } from "@/lib/telemetry/sanitize";
const payload = z.object({
  type: z.literal("error"),
  path: z.string().startsWith("/").max(160),
  message: z.string().max(300).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});
export async function POST(request: Request) {
  const result = rateLimit(requestKey(request, "telemetry"), 30);
  if (!result.allowed)
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(result.retryAfter) } },
    );
  const parsed = payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  console.info("planora.telemetry", sanitizeTelemetry(parsed.data));
  return new NextResponse(null, { status: 204 });
}
