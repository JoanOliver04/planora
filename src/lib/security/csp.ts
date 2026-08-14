export function contentSecurityPolicy(options?: {
  development?: boolean;
  enforceHttps?: boolean;
}) {
  const scriptSource = `script-src 'self' 'unsafe-inline'${
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
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co${
      options?.development ? " ws://localhost:*" : ""
    }`,
    "manifest-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
    ...(options?.enforceHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
