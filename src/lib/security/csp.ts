export function contentSecurityPolicy(options?: {
  development?: boolean;
  enforceHttps?: boolean;
  nonce?: string;
  supabaseUrl?: string;
}) {
  const nonceSource = options?.nonce ? ` 'nonce-${options.nonce}'` : "";
  const scriptSource = options?.nonce
    ? `script-src 'self'${nonceSource} https://va.vercel-scripts.com${
        options.development ? " 'unsafe-eval'" : ""
      }`
    : `script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${
        options?.development ? " 'unsafe-eval'" : ""
      }`;
  const configuredSupabaseSources = getSupabaseConnectSources(
    options?.supabaseUrl,
  );
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "script-src-attr 'none'",
    "form-action 'self'",
    scriptSource,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${configuredSupabaseSources.join(" ")} https://vitals.vercel-insights.com https://va.vercel-scripts.com${
      options?.development ? " ws://localhost:*" : ""
    }`,
    "manifest-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
    ...(options?.enforceHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function getSupabaseConnectSources(value?: string) {
  if (!value) return [];
  try {
    const url = new URL(value);
    const loopback =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
      return [];
    const websocketProtocol = url.protocol === "https:" ? "wss:" : "ws:";
    return [url.origin, `${websocketProtocol}//${url.host}`];
  } catch {
    return [];
  }
}
