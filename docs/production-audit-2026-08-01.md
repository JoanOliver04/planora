# Production audit — 2026-08-01

## Results

- Lighthouse on the public Spanish landing: performance 97, accessibility 100, best practices 100, SEO 100.
- axe WCAG 2 A/AA scan: no critical violations on desktop or mobile.
- `npm audit`: 0 known vulnerabilities across production and development dependencies.
- Quality gates: ESLint, strict TypeScript, 65 unit/component tests, 16 Playwright scenarios and Next.js production build pass.
- Security review: CSP and HTTPS headers remain enabled; account deletion and telemetry are rate-limited; telemetry input is bounded, validated and redacted; authenticated data remains protected by Supabase RLS.

## Production configuration

Vercel project `planora` is linked and `NEXT_PUBLIC_SITE_URL` is configured for Production and Preview. The verified canonical endpoint is `https://planora-lake-one.vercel.app`. The Vercel account currently owns no external domains; when one is purchased, add it in Vercel, update the environment variable, and add the same OAuth callback in Supabase and Google before switching canonical URLs.

## Residual risks

The in-process limiter is deliberately lightweight and applies per serverless instance; platform/WAF rate limits should supplement it under sustained abuse. Automated accessibility does not replace keyboard and screen-reader checks. Telemetry retention depends on the hosting log policy described in `operations.md`.

## Revalidation — 2026-08-18

- ESLint, strict TypeScript, Prettier and the Next.js 16.2.12 production build pass.
- Vitest: 61 files and 351 tests pass.
- Playwright: 40 scenarios pass; the two reported skips are the authenticated Focus lifecycle intentionally limited to Chromium after passing there.
- `npm audit`, including development dependencies: 0 known vulnerabilities.
- The authenticated Supabase Focus lifecycle and atomic backup restore passed with the configured integration credentials.
- The working tree remained clean before this maintenance patch. Remote uptime, OAuth provider configuration, Vercel project settings and Supabase advisors still require the operational checks in `operations.md`; repository tests cannot prove third-party control-plane state.
