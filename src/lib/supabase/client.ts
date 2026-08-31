import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { QUERY_TIMEOUT_MS, fetchWithTimeout } from "@/lib/bootstrap/timeout";
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        fetch: (url, init) => fetchWithTimeout(url, init, QUERY_TIMEOUT_MS),
      },
    },
  );
}
