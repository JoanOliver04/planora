import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/proxy";
import { isPrivateAppPath } from "@/lib/security/routes";
import type { NextRequest } from "next/server";

const intl = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const auth = await updateSession(request);
  const localized = intl(request);
  if (auth)
    auth.cookies.getAll().forEach((cookie) => localized.cookies.set(cookie));
  if (isPrivateAppPath(request.nextUrl.pathname)) {
    localized.headers.set("Cache-Control", "private, no-store, max-age=0");
    localized.headers.set("CDN-Cache-Control", "no-store");
    localized.headers.set("Vercel-CDN-Cache-Control", "no-store");
  }
  return localized;
}

export const config = {
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
