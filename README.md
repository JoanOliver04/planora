<p align="center">
  <img src="public/assets/logo_modo_oscuro.webp" alt="Planora" width="240" />
</p>

<h1 align="center">Planora</h1>

<p align="center">
  <strong>Tasks, habits, schedules and events in one calm workspace.</strong><br />
  A private, bilingual and mobile-first planner built for flexible routines.
</p>

<p align="center">An app by <strong>JVOR Studios</strong>, a one-person independent studio creating apps and games.</p>

<p align="center">
  <a href="https://planora-lake-one.vercel.app">
    <img src="https://img.shields.io/badge/demo-online-52734D?style=flat-square" alt="Live demo" />
  </a>
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="Strict TypeScript" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <a href="https://github.com/JoanOliver04/planora/actions/workflows/ci.yml"><img src="https://github.com/JoanOliver04/planora/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/tests-667%20unit%20%2B%20126%20E2E%20cases-brightgreen?style=flat-square" alt="667 unit tests and 126 Playwright E2E cases; 3 deliberate browser exclusions" />
</p>

---

## About Planora

Planora turns complex routines into a clear and manageable schedule. It combines one-time tasks, recurring habits and dated events, then organises them by schedule and colour-coded category.

Each user signs in exclusively with Google and gets a private workspace synchronised across devices. The interface is designed mobile-first while providing a spacious weekly planner on desktop.

**Live application:** [planora-lake-one.vercel.app](https://planora-lake-one.vercel.app)

## Features

### Tasks and habits

- Quick capture in Today and Tasks, with a preview before saving: Spanish/English dates, weekday habits and times, literal-text mode, and an editable handoff to the full form. See the [supported quick-capture expressions](docs/quick-task-capture.md).
- One-time tasks and recurring habits.
- Recurrence every day, on selected weekdays, a target number of times per week, or at custom day, week and month intervals.
- Optional start and end dates. Habits can continue indefinitely until the user edits or archives them.
- Optional timing: anytime, morning, afternoon, night, a specific time or a time range.
- Edit, duplicate, archive and restore tasks without losing completion history.
- Confirmation before archiving to prevent accidental removals from the active schedule.
- Emoji, notes, category and colour for quick visual recognition.

### Schedules and calendar

- Multiple independent schedules for regular routines, holidays, exams or any other context.
- Fast switching between active schedules.
- Weekly agenda with previous/next controls, direct date selection and a quick return to the current week.
- The current week is always selected by default.
- Responsive day selector on mobile and full seven-day layout on desktop.
- Custom categories with a name, emoji and colour.
- Global or schedule-specific events with an optional time.

### Focus (Enfoque)

- Flexible concentration sessions: countdown, free stopwatch, work/break cycles, or a structured plan whose blocks drive the timer.
- Fully customizable Focus presets (emoji, intention, durations, cycles, behaviour, structured plan, favourites, archive and reorder) plus optional starter templates.
- Structured session plans with named blocks (timed or open), editable starter ideas for programming, English and piano, live current/next block UI, skip/advance, and planned-vs-actual summary.
- Flexible weekly Focus goals (minutes, sessions or active days; global, category or preset scope) with a primary goal on home, neutral pace hints and recent-week history — no streaks or guilt.
- Focus statistics on Focus home (compact) and in Statistics: daily bars, finish rate, category/task breakdown, goal progress and optional insights only after a minimum sample — pure client aggregates, no heavy chart libraries, no titles/notes sent to product analytics.
- Focus phase alerts via the existing notification stack (in-app toast, system notification through the service worker, soft chime, vibration), scheduled on phase start and cleared on pause/end; optional Screen Wake Lock; permission only on explicit action; honest PWA delivery limits.
- Multi-tab/device Focus continuity: BroadcastChannel (+ localStorage fallback), light server poll, optimistic revision as write authority, view-only follower mode and explicit “Continue here” takeover without creating a second session.
- Offline Focus: continue a known session with local transitions (idempotent queue, no per-second rows); sync in order on reconnect; starting a new session still requires network; remote revision wins on conflict.
- Focus accessibility: desktop keyboard shortcuts (optional), screen-reader phase/status announcements without per-second chatter, on-demand time readout, 44px targets, small-screen and landscape safe areas, reduced-motion respect.
- Focus first-visit intro (skip anytime), quick paths (25/50/stopwatch/custom preset) and editable practice suggestions, plus discrete contextual help and clearer empty states.
- Focus preferences split by scope: account-synced options (default mode/preset, review, goal visibility) and device-local options (sound volume, vibration, notifications, Wake Lock, compact bar).
- Optional link to a task or habit, including a user-owned recommended preset per Focus-enabled task; finishing a session never auto-completes work unless the user chose that explicitly.
- Quick starts from Today (continue / quick session / next task / last preset) and a secondary timer action in Week and Tasks.
- Robust timer based on timestamps (not per-second DB writes), recovery after reload, and a compact bar while browsing other views.
- Optional end-of-session reflection: private notes, concentration and energy ratings, result label, next step, and parked distractions.
- Park distractions mid-session without pausing; convert one into a Planora task or dismiss it after the session.
- Clear endings: finish and save, cancel and keep partial time, or discard the session permanently with confirmation.
- Focus data is included in portable JSON backup schema v5 (export and atomic restore): presets, sessions, intervals, flexible goals, notes and task preset recommendations; v4 remains importable; live sessions restore as cancelled; analysis CSV omits notes (optional PRIVATE notes file).
- Release readiness notes: `docs/focus-release-readiness-2026-08-07.md` (security, performance, e2e matrix, residual risks).

### Progress and history

- Complete or undo tasks for a specific occurrence date.
- Immutable history snapshots preserve the original task and category details.
- Weekly completion targets and progress percentage.
- Date calculations, weekly targets and statistics follow the user's timezone and preferred first day of the week (Sunday or Monday).

### Notifications and alarms

- Explicit, user-initiated browser permission flow with a global on/off control.
- Standalone alarms with a custom name, date, time and optional daily or weekly recurrence.
- Relative reminders for tasks and events, including 5, 15 and 30 minutes, 1 or 2 hours, and 1 day before.
- Independent per-device filters for task, event, daily-summary and custom-alarm notifications.
- Separate delivery controls for in-app popups, operating-system notifications, sound and vibration.
- Individual enable/disable, ten-minute snooze and deletion controls for every configured reminder.
- Timezone-safe scheduling, mobile-sized touch targets and responsive forms.
- Opt-in Web Push for reminders, daily summaries and custom alarms while Planora is closed, with encrypted VAPID delivery and a persistent server outbox.
- Per-device registration, a delayed test for checking reception after closing the app, bounded retries, expired-subscription cleanup and cancellation of queued alerts when an alarm changes or is disabled.
- Android: enable the device from Notifications and alarms in an up-to-date Chrome. iPhone/iPad: use the Home Screen app on iOS/iPadOS 16.4 or later.
- Web Push needs connectivity and notification permission. Sound, Do Not Disturb and battery restrictions are controlled by the operating system; web alarms do not offer native alarm-clock timing or continuous sound guarantees. In-app popups and custom audio still require an active page, and Focus phase alerts retain their own lifecycle limits. See [mobile Web Push](docs/mobile-web-push.md).

### Experience and safety

- Full Spanish and English interface.
- Light, dark and system themes with theme-aware brand assets.
- Installable PWA manifest using the product logo.
- Confirmation dialogs for permanent deletion, archiving, account deletion and sign-out.
- Accessible navigation, keyboard focus states and reduced-motion support.
- Mobile-first touch targets and responsive layouts.
- Google OAuth only; Planora stores no passwords. After sign-in the app returns to Today in the active language.
- Public no-registration demo in Spanish and English, guided onboarding and reusable schedule templates.
- Offline mutation queue that keeps the latest intent per day and will not resurrect a completion after a newer undo on another device.
- Installable PWA and a customizable notification and alarm center.
- Progress dashboard, keyboard-accessible ordering and portable JSON/CSV/ICS exports (including Focus entities in backup v5; v4 remains importable). Atomic restore cancels live Focus timers in the database.
- Archived tasks act as a recoverable trash area, with explicit permanent deletion for the task, its completion history and reminders.
- Privacy-focused Vercel Web Analytics for anonymous, aggregate page-view metrics without tracking cookies or custom product events.
- Sanitized error telemetry. Account deletion is same-origin, confirmed and fail-closed if the rate limiter is unavailable.
- Authenticated pages are `private, no-store`; login and private pages use a nonce-based script CSP. Cross-tab sign-out clears private UI and local data. Account deletion requires authentication within the last ten minutes.
- PostgreSQL enforces JSON bounds and per-user resource quotas even for direct API writes. Failed restore payloads consume their SQL admission budget without losing the original workspace.

## Product preview

<p align="center">
  <a href="docs/images/01-landing-desktop-light-en.png"><img src="docs/images/readme/01-landing-desktop-light-en.webp" alt="Planora: A calmer way to plan" width="100%" /></a>
</p>

Planora is a portfolio case study in turning irregular routines into a calm planning system. Recurrence, timezone boundaries, data isolation and offline changes are handled as domain rules rather than visual shortcuts. A public demo makes the complete product easy to evaluate while real workspaces remain private.

## Screenshots

Real product captures with a coherent synthetic workspace. Click an image for the full-resolution PNG. The [complete visual library](docs/screenshots.md) includes every area, capture settings and selections for portfolio and LinkedIn.

<table>
  <tr>
    <td width="50%" align="center"><strong>Today at a glance</strong><br/><a href="docs/images/04-today-desktop-light-es.png"><img src="docs/images/readme/04-today-desktop-light-es.webp" alt="Planora: Today at a glance" width="100%" /></a></td>
    <td width="50%" align="center"><strong>Weekly planning</strong><br/><a href="docs/images/08-week-desktop-light-es.png"><img src="docs/images/readme/08-week-desktop-light-es.webp" alt="Planora: Weekly planning" width="100%" /></a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>Tasks, filters and recurrence</strong><br/><a href="docs/images/15-tasks-desktop-light-es.png"><img src="docs/images/readme/15-tasks-desktop-light-es.webp" alt="Planora: Tasks, filters and recurrence" width="100%" /></a></td>
    <td width="50%" align="center"><strong>Progress and patterns</strong><br/><a href="docs/images/27-statistics-desktop-light-en.png"><img src="docs/images/readme/27-statistics-desktop-light-en.webp" alt="Planora: Progress and patterns" width="100%" /></a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>Reminders and alarms</strong><br/><a href="docs/images/33-reminders-desktop-light-es.png"><img src="docs/images/readme/33-reminders-desktop-light-es.webp" alt="Planora: Reminders and alarms" width="100%" /></a></td>
    <td width="50%" align="center"><strong>Focus: presets and weekly rhythm</strong><br/><a href="docs/images/43-focus-home-desktop-light-en.png"><img src="docs/images/readme/43-focus-home-desktop-light-en.webp" alt="Planora: Focus: presets and weekly rhythm" width="100%" /></a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>Deep work in progress</strong><br/><a href="docs/images/47-focus-countdown-desktop-light-es.png"><img src="docs/images/readme/47-focus-countdown-desktop-light-es.webp" alt="Planora: Deep work in progress" width="100%" /></a></td>
    <td width="50%" align="center"><strong>Structured Focus plans</strong><br/><a href="docs/images/50-focus-plan-desktop-dark-en.png"><img src="docs/images/readme/50-focus-plan-desktop-dark-en.webp" alt="Planora: Structured Focus plans" width="100%" /></a></td>
  </tr>
</table>

<details>
<summary><strong>More workspace and Focus views</strong></summary>
<br/>
<table>
  <tr>
    <td width="50%" align="center"><strong>The month ahead</strong><br/><a href="docs/images/12-month-desktop-light-es.png"><img src="docs/images/readme/12-month-desktop-light-es.webp" alt="Planora: The month ahead" width="100%" /></a></td>
    <td width="50%" align="center"><strong>Events in context</strong><br/><a href="docs/images/21-events-desktop-light-es.png"><img src="docs/images/readme/21-events-desktop-light-es.webp" alt="Planora: Events in context" width="100%" /></a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>Completion history</strong><br/><a href="docs/images/24-history-desktop-light-es.png"><img src="docs/images/readme/24-history-desktop-light-es.webp" alt="Planora: Completion history" width="100%" /></a></td>
    <td width="50%" align="center"><strong>Independent schedules</strong><br/><a href="docs/images/30-schedules-desktop-light-es.png"><img src="docs/images/readme/30-schedules-desktop-light-es.webp" alt="Planora: Independent schedules" width="100%" /></a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>Color-coded categories</strong><br/><a href="docs/images/31-categories-desktop-light-es.png"><img src="docs/images/readme/31-categories-desktop-light-es.webp" alt="Planora: Color-coded categories" width="100%" /></a></td>
    <td width="50%" align="center"><strong>Your data, your control</strong><br/><a href="docs/images/40-data-desktop-light-en.png"><img src="docs/images/readme/40-data-desktop-light-en.webp" alt="Planora: Your data, your control" width="100%" /></a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>Reusable Focus presets</strong><br/><a href="docs/images/45-focus-preset-desktop-light-en.png"><img src="docs/images/readme/45-focus-preset-desktop-light-en.webp" alt="Planora: Reusable Focus presets" width="100%" /></a></td>
    <td width="50%" align="center"><strong>A thoughtful session summary</strong><br/><a href="docs/images/52-focus-summary-desktop-light-es.png"><img src="docs/images/readme/52-focus-summary-desktop-light-es.webp" alt="Planora: A thoughtful session summary" width="100%" /></a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>Flexible weekly goals</strong><br/><a href="docs/images/53-focus-goals-desktop-light-en.png"><img src="docs/images/readme/53-focus-goals-desktop-light-en.webp" alt="Planora: Flexible weekly goals" width="100%" /></a></td>
    <td width="50%" align="center"><strong>Focus statistics</strong><br/><a href="docs/images/54-focus-statistics-desktop-dark-en.png"><img src="docs/images/readme/54-focus-statistics-desktop-dark-en.webp" alt="Planora: Focus statistics" width="100%" /></a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>Reusable planning templates</strong><br/><a href="docs/images/61-templates-desktop-light-es.png"><img src="docs/images/readme/61-templates-desktop-light-es.webp" alt="Planora: Reusable planning templates" width="100%" /></a></td>
    <td width="50%" align="center"><strong>Search the whole workspace</strong><br/><a href="docs/images/62-search-desktop-light-en.png"><img src="docs/images/readme/62-search-desktop-light-en.webp" alt="Planora: Search the whole workspace" width="100%" /></a></td>
  </tr>
</table>
</details>

### Mobile experience

<p align="center">
  <a href="docs/images/07-today-mobile-light-es.png"><img src="docs/images/readme/07-today-mobile-light-es.webp" alt="Planora: Today on mobile" width="23%" /></a>
  &nbsp;
  <a href="docs/images/11-week-mobile-dark-es.png"><img src="docs/images/readme/11-week-mobile-dark-es.webp" alt="Planora: A week in your pocket" width="23%" /></a>
  &nbsp;
  <a href="docs/images/41-settings-mobile-dark-es.png"><img src="docs/images/readme/41-settings-mobile-dark-es.webp" alt="Planora: Mobile personalization" width="23%" /></a>
  &nbsp;
  <a href="docs/images/56-focus-active-mobile-dark-es.png"><img src="docs/images/readme/56-focus-active-mobile-dark-es.webp" alt="Planora: Mobile concentration mode" width="23%" /></a>
</p>

## Architecture

```mermaid
flowchart LR
    U[User] --> UI[Next.js App Router]
    UI --> I18N[next-intl]
    UI --> SA[Server Actions]
    UI --> SC[Supabase browser client]
    UI --> NS[Notification scheduler]
    UI --> WA[Vercel Web Analytics]
    NS --> SW[Service worker and in-app alerts]
    CRON[Supabase Cron and pg_net] --> PD[Authenticated push dispatcher]
    PD --> OUTBOX[Persistent push outbox]
    OUTBOX --> DB
    PD --> PUSH[Web Push provider]
    PUSH --> SW
    SA --> SSR[Supabase SSR client]
    SC --> DB[(PostgreSQL)]
    SSR --> DB
    DB --> RLS[Row Level Security]
    AUTH[Google OAuth] --> SSR
```

Next.js App Router provides Server Components by default and Client Components only where interaction is required. Server Actions validate every mutation with Zod. Supabase manages Google sessions, PostgreSQL persistence and row-level access policies. Vercel Web Analytics is mounted once in the shared root layout and records automatic page views only on Vercel deployments.

Recurring task occurrences are calculated on demand instead of generating unlimited future database rows. The page-based reminder fallback resolves task and event copy in two batched lookups, keeping background reads lightweight.

Closed-app reminders use a separate server path: Supabase Cron and pg_net call an authenticated Next.js dispatcher every minute. A transactional outbox claims due occurrences, advances their schedules and tracks delivery per device. The dispatcher sends encrypted Web Push messages; the service worker displays them without an open page. Live tabs defer server-managed reminders to this path to avoid competing deliveries. Provider acceptance is labelled **Sent**, rather than treated as proof of physical reception.

Schedule duplication and backup restoration execute as ownership-checked PostgreSQL functions, so multi-table changes commit atomically. Calendar reads are bounded to the visible week or month, private layouts parallelise independent queries, and public routes avoid loading authenticated offline and Focus clients.

## Technology stack

| Area           | Technology                                | Purpose                                                    |
| -------------- | ----------------------------------------- | ---------------------------------------------------------- |
| Framework      | **Next.js 16**                            | App Router, Server Actions, metadata and production builds |
| UI             | **React 19 + TypeScript**                 | Strictly typed components and interactions                 |
| Styling        | **Tailwind CSS 4 + CSS**                  | Responsive design system and themes                        |
| Components     | **Radix UI + Lucide**                     | Accessible dialogs and icons                               |
| Validation     | **Zod**                                   | Runtime validation for forms and server mutations          |
| Data           | **Supabase + PostgreSQL**                 | Persistence, sessions and RLS                              |
| Authentication | **Google OAuth**                          | Passwordless identity                                      |
| Localisation   | **next-intl**                             | Spanish and English routes and messages                    |
| Dates          | **date-fns + date-fns-tz**                | Recurrence and timezone-safe calculations                  |
| Notifications  | **Web Push + Supabase Cron + pg_net**     | Encrypted mobile delivery through a durable outbox         |
| Testing        | **Vitest + Testing Library + Playwright** | Unit, component and end-to-end coverage                    |
| Analytics      | **Vercel Web Analytics**                  | Anonymous, aggregate navigation metrics without cookies    |
| Hosting        | **Vercel**                                | Automatic production deployments from `main`               |

## Project structure

```text
planora/
├── public/assets/              # Logos, PWA artwork and favicon
├── src/
│   ├── app/                    # Routes, layouts, API handlers and Server Actions
│   ├── components/             # Shared shell, navigation and dialogs
│   ├── features/
│   │   ├── auth/               # Google authentication
│   │   ├── backup/             # Portable backups and restore validation
│   │   ├── focus/              # Sessions, goals, offline state and statistics
│   │   ├── reminders/          # Alarms, device subscriptions and push delivery
│   │   └── workspace/          # Tasks, events, schedules and settings
│   ├── i18n/                   # Localised routing configuration
│   ├── lib/
│   │   ├── dates/              # Timezone utilities
│   │   ├── recurrence/         # Recurrence and progress engine
│   │   ├── security/           # Request, session, CSP and rate-limit controls
│   │   ├── supabase/           # Browser, server and proxy clients
│   │   └── validation/         # Zod schemas
│   ├── messages/               # Spanish and English translations
│   └── types/                  # Generated database types
├── supabase/migrations/        # Schema, RLS policies and invariants
├── scripts/                    # Operational setup, security checks and tooling
├── tests/                      # Vitest and Testing Library
├── e2e/                        # Playwright scenarios
└── docs/                       # Product and engineering documentation
```

## Local development

### Requirements

- Node.js 20.9 or newer; CI uses Node.js 24.
- A Supabase project.
- A Google Cloud OAuth web client.

### Installation

```bash
git clone https://github.com/JoanOliver04/planora.git
cd planora
npm ci
```

Copy `.env.example` to `.env.local` and configure:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=server-only-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It supports verified account deletion, distributed rate limiting and the authenticated Web Push dispatcher. Never expose it to browser code or use a `NEXT_PUBLIC_` prefix for it.

Apply every file in `supabase/migrations` in filename order. In Supabase Authentication, enable Google and disable Email, Phone and unused providers. Add the local and production `/auth/callback` URLs to the redirect allow-list.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Web Analytics is only mounted when Vercel provides `VERCEL_ENV`, so local development and tests do not send page views.

## Available commands

| Command                 | Description                             |
| ----------------------- | --------------------------------------- |
| `npm run dev`           | Start the Turbopack development server  |
| `npm run build`         | Create an optimised production build    |
| `npm start`             | Run the production build                |
| `npm run lint`          | Run ESLint                              |
| `npm run format`        | Format the codebase with Prettier       |
| `npm run format:check`  | Fail if Prettier formatting drifts (CI) |
| `npm run typecheck`     | Run strict TypeScript checks            |
| `npm test`              | Run unit and component tests            |
| `npm run test:coverage` | Generate a coverage report              |
| `npm run test:e2e`      | Run Playwright desktop and mobile flows |
| `npm run db:types`      | Regenerate Supabase database types      |

## Security

- RLS is enabled for every user-owned table.
- Database policies are restricted to authenticated sessions and scoped to `(select auth.uid())`.
- Composite foreign keys prevent cross-user references.
- Sensitive mutations include explicit ownership filters in addition to RLS.
- Server sessions are verified through Supabase SSR.
- Zod validates all untrusted mutation input at runtime.
- Google OAuth requests only identity, email and profile information.
- Security headers include CSP, frame denial, MIME sniffing protection, cross-origin resource isolation and a restrictive permissions policy.
- Account deletion requires a valid session, same-origin request, explicit typed confirmation and a per-user rate limit.
- Account deletion also requires recent authentication. Login and authenticated pages use per-response CSP nonces and private pages are not cacheable.
- Backup restoration is authenticated and protected by a distributed fail-closed rate limit before payload parsing.
- Schedule duplication and backup restoration are atomic, ownership-scoped database operations.
- Authenticated pages use private, no-store responses and are never written to the service-worker cache.
- Offline browser records are size-bounded, structurally validated and checked against the authenticated owner before use.
- Local workspace snapshots and pending offline changes are cleared after sign-out or account deletion.
- PostgreSQL enforces per-user resource quotas and JSON size bounds. Invalid restore attempts consume their admission budget while preserving the original workspace.
- Imported timezones are validated before use in date formatters; restored alarms are disabled and live Focus sessions are cancelled.
- Push subscriptions are bound to their owner and auth session, with a device limit and expiry. Dispatch secrets stay in a private database schema; only the server role can claim or settle outbox jobs. Both SQL and the dispatcher restrict subscription endpoints to known push providers.
- Internal telemetry accepts only small same-origin JSON payloads and sanitizes technical metadata before logging.
- User content is rendered as text and never injected as HTML.
- Web Analytics uses no custom events and receives no task, event, note, category, schedule, account or backup content.
- Valid application URLs contain only controlled locale and view names; user and Supabase identifiers are not placed in page routes.

No application can be guaranteed completely secure. See [docs/security.md](docs/security.md) for the threat model and operational guidance.

## Quality checks

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:e2e
npm run build
npm audit
```

CI runs npm audit, lint, Prettier (`format:check`), typecheck, coverage and a production build on every push to `main`. It also runs CodeQL, Lighthouse and the complete Playwright suite against an isolated Supabase instance built from the committed migrations, so authenticated scenarios cannot silently skip because credentials are missing.

Workspace views load on demand; the task editor is included with the task views so its first opening stays responsive. Public pages do not receive the private translation catalogue, and task lists do not subscribe to every Focus clock tick. Responsive regression checks cover 16 private areas, widths from 320 to 1440 CSS pixels, portrait/landscape, maximum-length names and 200% root text. CI also measures cold route loading with 60 tasks and 840 history entries; pull requests compare initial JavaScript against their base revision. See the [performance and responsive report](docs/performance-2026-10-31.md) for measured results, conditions and coverage limits.

The suite covers recurrence rules, date boundaries, month endings, timezones, bilingual formatting, Focus (timer, offline, sync and backup v5), forms, loading states, protected navigation, platform metadata and the single-instance, automatic-only Analytics integration. Authenticated journeys exercise schedule/task CRUD, history and undo, templates, alarms, preferences, offline completion sync, sign-out, export and atomic restore. Web Push checks include a service worker without open clients, permission handling, server queue leases, cancellation, retries, ownership isolation and API access controls.

The **2026-11-11 / 0.1.2** suite contains **667 unit tests in 88 Vitest files** and **126 Playwright cases**, including **3 deliberate exclusions**. Browser projects cover desktop Chromium, Android Chrome emulation and iPhone WebKit emulation. The exclusions are three WebKit integration flows exercised in Chromium: the API-backed Focus lifecycle, offline completion sync and the push outbox. The release uses Next.js **16.4.6** / React **19.3.1**; the strict dependency audit reports **0 known vulnerabilities across the complete tree**. The [quality review](docs/quality-review-2026-11-11.md) records fixes, verification and the database account-deletion regression. CI also enforces database ownership checks, public/private accessibility, legal-page returns to authenticated settings and mobile Lighthouse thresholds.

These are dated test results, not a guarantee of zero bugs or complete device coverage. A successful push-provider response does not prove that a phone displayed the notification; use the delayed test on each device. No universal physical-device or Google OAuth acceptance claim is implied by CI.

The real product screenshot library lives under docs/images/. Its [inventory and repeatable capture workflow](docs/screenshots.md) cover desktop/mobile, both languages, themes and all major Focus states. The runner creates disposable accounts in an isolated local Supabase project and keeps the application's real CSP.

```bash
npm run docs:captures
npm run docs:captures -- --only 04,08,47
```

## Deployment

Planora is configured for Vercel and Supabase:

1. Import the GitHub repository into Vercel.
2. Configure the production environment variables.
3. Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS domain.
4. Add the production callback to Supabase and Google.
5. Enable **Web Analytics** in the Vercel project dashboard.
6. Deploy and visit several public and authenticated routes.
7. In Analytics, use the environment selector to keep Production and Preview traffic separate, then verify that reported pages contain no sensitive values.
8. For closed-app reminders, configure the server-side push keys and minute scheduler using [the Web Push operations guide](docs/mobile-web-push.md#operación), then activate notifications separately on each device. The production setup script preserves existing keys and is deliberately excluded from automatic migrations and CI.

Every push to `main` creates a production deployment automatically. Vercel tracks initial loads and App Router client-side page transitions; localhost remains excluded by the environment guard. Task recurrence is calculated on demand. Closed-app Web Push requires the Supabase scheduler and dispatcher; their invocations and database usage count towards the hosting providers' limits. See the operations guide for setup, monitoring and rollback.

See [docs/deployment.md](docs/deployment.md) for the complete checklist.

## Documentation

- [Product specification](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Database model](docs/database.md)
- [Security model](docs/security.md)
- [Security hardening and verification](docs/security-production-verification-2026-10-30.md)
- [Mobile Web Push: activation, architecture and operations](docs/mobile-web-push.md)
- [Testing strategy](docs/testing.md)
- [Release quality review](docs/quality-review-2026-11-11.md)
- [Performance and responsive verification](docs/performance-2026-10-31.md)
- [Deployment guide](docs/deployment.md)
- [Backup and restore](docs/backup-and-restore.md)
- [Operations and status](docs/operations.md)
- [Implementation plan](docs/implementation-plan.md)

## Author

Built by **Joan Oliver**.

- GitHub: [@JoanOliver04](https://github.com/JoanOliver04)
