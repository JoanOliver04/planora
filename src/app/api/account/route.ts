import "server-only";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { distributedRateLimit } from "@/lib/security/distributed-rate-limit";
import { isSameOriginRequest } from "@/lib/security/request";

const noStore = { "Cache-Control": "no-store" };

export async function DELETE(request: Request) {
  if (
    !isSameOriginRequest(request) ||
    request.headers.get("x-planora-confirm") !== "delete-account"
  )
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 403, headers: noStore },
    );

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStore },
    );

  const attempt = await distributedRateLimit(
    `account-delete:${user.id}`,
    3,
    60 * 60_000,
  );
  if (!attempt.allowed)
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { ...noStore, "Retry-After": String(attempt.retryAfter) },
      },
    );

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url)
    return NextResponse.json(
      { error: "Not configured" },
      { status: 503, headers: noStore },
    );

  const admin = createAdmin(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error)
    return NextResponse.json(
      { error: "Unable to delete account" },
      { status: 500, headers: noStore },
    );
  return NextResponse.json(
    { ok: true },
    {
      headers: { ...noStore, "Clear-Site-Data": '"cache", "storage"' },
    },
  );
}
