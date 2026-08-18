export function contentSecurityPolicy(options?: {
  development?: boolean;
  enforceHttps?: boolean;
  nonce?: string;
}) {
  const nonceSource = options?.nonce ? ` 'nonce-${options.nonce}'` : "";
  const scriptSource = options?.nonce
    ? `script-src 'self'${nonceSource} https://va.vercel-scripts.com${
        options.development ? " 'unsafe-eval'" : ""
      }`
    : `script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${
        options?.development ? " 'unsafe-eval'" : ""
      }`;
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
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://va.vercel-scripts.com${
      options?.development ? " ws://localhost:*" : ""
    }`,
    "manifest-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
    ...(options?.enforceHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
