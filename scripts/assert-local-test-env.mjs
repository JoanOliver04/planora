/**
 * Administrative integration tests must never use a hosted Supabase project.
 * Run this after loading the environment and before constructing any client.
 * @param {{ url?: string, serviceRole?: string }} environment
 */
export function assertLocalTestEnvironment({ url, serviceRole }) {
  if (!serviceRole) return;
  let target;
  try {
    target = new URL(url ?? "");
  } catch {
    throw new Error(
      "Refusing privileged E2E tests: a local Supabase URL is required",
    );
  }
  if (
    !["http:", "https:"].includes(target.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    target.username ||
    target.password
  ) {
    throw new Error(
      "Refusing privileged E2E tests: Supabase must use a loopback URL (localhost, 127.0.0.1 or [::1])",
    );
  }
}
