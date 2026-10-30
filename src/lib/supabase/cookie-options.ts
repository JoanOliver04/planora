import { siteConfig } from "@/config/site";

// Browser access is required by the Supabase SSR design. Keep host-only cookies;
// HttpOnly would break the existing client-side refresh/REST flows.
export function sessionCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure:
      typeof window !== "undefined"
        ? window.location.protocol === "https:"
        : process.env.NODE_ENV === "production" &&
          new URL(siteConfig.url).protocol === "https:",
  };
}
