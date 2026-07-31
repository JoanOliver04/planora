import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/security/redirect";
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get("code"),
    next = safeRedirectPath(url.searchParams.get("next"), "/es/today");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL(next, url.origin), {
        headers: { "Cache-Control": "no-store" },
      });
  }
  return NextResponse.redirect(new URL("/es/login?error=oauth", url.origin), {
    headers: { "Cache-Control": "no-store" },
  });
}
