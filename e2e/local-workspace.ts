import { loadEnvConfig } from "@next/env";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BrowserContext } from "@playwright/test";
import type { Database } from "../src/types/database";
import { assertLocalTestEnvironment } from "../scripts/assert-local-test-env.mjs";
import { expect } from "./fixtures";

loadEnvConfig(process.cwd());

export const hasLocalCredentials = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export async function withLocalWorkspace(
  context: BrowserContext,
  baseURL: string | undefined,
  run: (client: SupabaseClient<Database>, userId: string) => Promise<void>,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  assertLocalTestEnvironment({ url, serviceRole });
  const app = new URL(baseURL ?? "");
  if (!baseURL || !["localhost", "127.0.0.1", "[::1]"].includes(app.hostname))
    throw new Error("Workspace mutation tests require a loopback app URL");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient<Database>(url!, serviceRole, options);
  const client = createClient<Database>(url!, anonKey, options);
  const email = `workspace-qa-${crypto.randomUUID()}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  expect(created.data.user?.email).toBe(email);
  const userId = created.data.user!.id;
  try {
    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    expect(link.error).toBeNull();
    const verified = await client.auth.verifyOtp({
      token_hash: link.data.properties!.hashed_token,
      type: "email",
    });
    expect(verified.error).toBeNull();
    const onboarding = await client.rpc("complete_onboarding", {
      include_starters: false,
      detected_timezone: "Europe/Madrid",
    });
    expect(onboarding.error).toBeNull();
    const profile = await client
      .from("profiles")
      .update({ locale: "en", preferences: { showCompleted: true } })
      .eq("id", userId);
    expect(profile.error).toBeNull();
    let cookieJar: Array<{ name: string; value: string }> = [];
    const ssr = createServerClient<Database>(url!, anonKey, {
      cookies: {
        getAll: () => cookieJar,
        setAll: (values) => {
          for (const value of values) {
            cookieJar = cookieJar.filter(
              (cookie) => cookie.name !== value.name,
            );
            cookieJar.push({ name: value.name, value: value.value });
          }
        },
      },
    });
    const session = await ssr.auth.setSession({
      access_token: verified.data.session!.access_token,
      refresh_token: verified.data.session!.refresh_token,
    });
    expect(session.error).toBeNull();
    await context.addCookies(
      cookieJar.map((cookie) => ({ ...cookie, url: baseURL })),
    );
    await run(client, userId);
  } finally {
    const removed = await admin.auth.admin.deleteUser(userId);
    expect(removed.error, "Synthetic account cleanup").toBeNull();
  }
}
