import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_TIMEOUT_MS,
  fetchWithTimeout,
  withTimeout,
} from "@/lib/bootstrap/timeout";
import { isPrivateAppPath } from "@/lib/security/routes";

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!isPrivateAppPath(path) && !path.includes("/login")) return null;
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return null;
  let response = NextResponse.next({ request });
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        fetch: (url, init) => fetchWithTimeout(url, init, AUTH_TIMEOUT_MS),
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  try {
    await withTimeout(client.auth.getClaims(), AUTH_TIMEOUT_MS);
  } catch {
    return response;
  }
  return response;
}
