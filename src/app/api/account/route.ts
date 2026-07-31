import "server-only";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
const noStore = { "Cache-Control": "no-store" };

export async function DELETE(request: Request) {
  const origin = request.headers.get("origin"),
    expected = new URL(request.url).origin;
  if (
    origin !== expected ||
    request.headers.get("x-planora-confirm") !== "delete-account"
  )
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 403, headers: noStore },
    );
  const db = await createClient(),
    {
      data: { user },
    } = await db.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStore },
    );
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key)
    return NextResponse.json(
      { error: "Not configured" },
      { status: 503, headers: noStore },
    );
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    { error } = await admin.auth.admin.deleteUser(user.id);
  if (error)
    return NextResponse.json(
      { error: "Unable to delete account" },
      { status: 500, headers: noStore },
    );
  return NextResponse.json({ ok: true }, { headers: noStore });
}
