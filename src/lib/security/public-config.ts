/** Build-time checks: never interpolate a supplied credential into an error. */
export function validatePublicConfiguration(
  env: Record<string, string | undefined>,
) {
  for (const name of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    const value = env[name];
    if (!value) continue;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`${name} must be an absolute HTTP(S) origin`);
    }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error(
        `${name} must be an HTTPS origin (HTTP is allowed only on loopback)`,
      );
  }
  const rawPublicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const publicKey = rawPublicKey.trim();
  if (rawPublicKey !== publicKey)
    throw new Error(
      "Public Supabase keys must not contain surrounding whitespace",
    );
  let privileged = publicKey.startsWith("sb_secret_");
  try {
    const claims = JSON.parse(
      Buffer.from(publicKey.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { role?: string };
    privileged ||= claims.role === "service_role";
  } catch {
    // Opaque publishable keys and documented build placeholders are supported.
  }
  if (
    privileged ||
    (publicKey && publicKey === env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  )
    throw new Error(
      "A privileged Supabase key must never be exposed as NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
}
