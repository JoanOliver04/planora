import { isPrivateAppPath } from "@/lib/security/routes";

const INTERNAL_ORIGIN = "https://internal.invalid";

export function safeRedirectPath(value: string | null, fallback: string) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes(String.fromCharCode(92)) ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return fallback;

  try {
    const target = new URL(value, INTERNAL_ORIGIN);
    if (target.origin !== INTERNAL_ORIGIN) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

export function safePostAuthPath(value: string | null, locale: string) {
  const fallback = `/${locale === "en" ? "en" : "es"}/today`;
  const path = safeRedirectPath(value, fallback);
  const pathname = path.split("?")[0]?.split("#")[0] ?? fallback;
  return isPrivateAppPath(pathname) ? path : fallback;
}
