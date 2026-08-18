import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/security/redirect";

function localeFromRequest(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)NEXT_LOCALE=(en|es)\b/);
  if (match?.[1] === "en" || match?.[1] === "es") return match[1];
  const accept = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return accept.startsWith("en") ? "en" : "es";
}

export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get("code"),
    locale = localeFromRequest(request),
    next = safeRedirectPath(url.searchParams.get("next"), `/${locale}/today`);
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
