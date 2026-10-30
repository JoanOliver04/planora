import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/proxy";
import { isPrivateAppPath } from "@/lib/security/routes";
import { contentSecurityPolicy } from "@/lib/security/csp";
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

const intl = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const privatePath = isPrivateAppPath(request.nextUrl.pathname);
  const sensitivePath =
    privatePath || request.nextUrl.pathname.includes("/login");
  const nonce = sensitivePath ? randomBytes(24).toString("base64") : undefined;
  const policy = contentSecurityPolicy({
    nonce,
    development: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    enforceHttps:
      process.env.VERCEL === "1" || process.env.PLANORA_FORCE_HTTPS === "true",
  });
  // Next reads the REQUEST policy while rendering dynamic pages. next-intl
  // forwards these headers along with its locale header and refreshed cookies.
  request.headers.set("Content-Security-Policy", policy);
  request.headers.delete("x-nonce");
  if (nonce) request.headers.set("x-nonce", nonce);
  const auth = await updateSession(request);
  const localized = intl(request);
  if (auth)
    auth.cookies.getAll().forEach((cookie) => localized.cookies.set(cookie));
  if (sensitivePath) {
    localized.headers.set("Cache-Control", "private, no-store, max-age=0");
    localized.headers.set("CDN-Cache-Control", "no-store");
    localized.headers.set("Vercel-CDN-Cache-Control", "no-store");
  }
  localized.headers.set("Content-Security-Policy", policy);
  return localized;
}

export const config = {
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
