# Operations and status

## Health

`GET /api/health` is the public liveness check and returns `200 {"status":"ok"}` with `no-store`. Configure an external monitor at a five-minute interval. A failure, elevated 5xx rate, or authentication outage is an incident.

## Telemetry and privacy

Client errors go to `POST /api/telemetry`. The endpoint bounds streamed bytes before parsing, validates the payload, keeps only known technical metadata and canonical routes, and rate-limits callers. Raw error messages, arbitrary context and URL parameters are omitted. Automatic aggregate page views use the separate Vercel Web Analytics integration when `VERCEL_ENV` is set; no custom product events are emitted. Logs contain no application-added stable visitor identifier. Respect deletion requests and configure platform logs to retain no longer than 30 days; retention is an operator setting.

## Incident response

1. Confirm `/api/health`, Vercel deployment status, and Supabase status.
2. Pause the affected deployment or roll back to the last healthy Vercel deployment.
3. Check sanitized logs and database health without copying user content.
4. Publish a concise incident note and resolution time.
5. Document cause, impact and prevention in a postmortem.

## Release checks

CI must pass lint, strict types, unit/component tests, E2E and production build. Before a portfolio release also run `npm audit`, Lighthouse on desktop/mobile, keyboard navigation, reduced-motion, high zoom, and Supabase security/performance advisors. Verify the custom domain, HTTPS, OAuth callback and `NEXT_PUBLIC_SITE_URL` together.
