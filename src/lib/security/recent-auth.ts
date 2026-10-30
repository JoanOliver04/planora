const RECENT_AUTH_SECONDS = 10 * 60;

/** Call only with verified JWT claims. Refreshing a JWT must not reset auth age. */
export function hasRecentAuthentication(
  claims: { sub?: unknown; amr?: unknown } | null | undefined,
  userId: string,
  now = Date.now(),
) {
  if (claims?.sub !== userId || !Array.isArray(claims.amr)) return false;
  const seconds = Math.floor(now / 1000);
  return claims.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const method = entry as { method?: unknown; timestamp?: unknown };
    return (
      typeof method.method === "string" &&
      ["oauth", "password", "otp", "totp", "webauthn"].includes(
        method.method,
      ) &&
      typeof method.timestamp === "number" &&
      Number.isSafeInteger(method.timestamp) &&
      method.timestamp >= seconds - RECENT_AUTH_SECONDS &&
      method.timestamp <= seconds + 60
    );
  });
}
