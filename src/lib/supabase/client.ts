import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { QUERY_TIMEOUT_MS, fetchWithTimeout } from "@/lib/bootstrap/timeout";
import { sessionCookieOptions } from "./cookie-options";
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: sessionCookieOptions(),
      global: {
        fetch: (url, init) => fetchWithTimeout(url, init, QUERY_TIMEOUT_MS),
      },
    },
  );
}
