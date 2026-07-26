import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
const safeNext = (v: string | null) =>
  v && v.startsWith("/") && !v.startsWith("//") ? v : "/es/today";
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get("code"),
    next = safeNext(url.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/es/login?error=oauth", url.origin));
}
