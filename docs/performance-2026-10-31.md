# Performance and responsive verification — 2026-10-31

Verdict: **SHIP for the measured frontend workload and browser scenarios**. Scope: frontend loading and responsive behaviour across Planora. Base revision: `c7a984e4673b47e020b34c0048431b9f35f42854`; verified application revision: `a903c6c5ecb48e5950e5d859112379b18a57d1a6`. Measurements below are separate from build attribution.

## Changes

- Split Today, Week, Tasks, History, Events, Schedules, Categories and Settings into independently imported client modules. Opening a workspace view no longer imports every sibling view. The task editor is included with Today/Tasks and mounted when opened; loading, saving, cancellation and focus restoration retain executable coverage.
- Removed the unconditional resource-view preload on unrelated workspace modes. Disabled automatic prefetch for the month's 42 day links and the Today Focus shortcuts. Tests check that destinations are requested on navigation and still open the expected date or Focus dialog.
- Separated the Focus session subscription from its second-by-second clock. Today, Week and shortcuts subscribe to session identity/status; the compact timer continues receiving ticks.
- Limited public translation messages to Auth, Common, Errors and Nav. The authenticated provider receives the full catalogue and the user's time zone. The notification toaster now mounts in the private workspace and login, where it is used.
- Matched landing image `sizes` to the responsive CSS and gave the visible hero eager loading and high fetch priority.
- Made grid and flex children shrink without forcing the document wider. Fixed long task/category/schedule names, filter selects, the weekly picker, monthly toolbar, Focus presets, settings actions and task-dialog fields. Day tabs retain a deliberate local horizontal scroller with 44 px targets.
- Anchored demo calendars to the server-provided date during hydration, then adopted the device date. Calendar labels use an explicit locale. This fixes reproduced React hydration errors when browser and server date/locale differ.

## Runtime measurements

The benchmark creates a disposable account in loopback Supabase, with 60 daily tasks and 840 prior completions. Before and after use identical data and the same benchmark code on separate production builds. Each route has three fresh Chromium contexts, a 390 × 844 viewport, disabled cache/service workers and 4× CPU throttling. Readiness time is recorded after DOM content loaded and the expected route heading becomes visible. Initial JavaScript is then measured after the route's pending script requests settle, including the rendered lazy view. It sums encoded script response bodies. Unrelated background requests are recorded rather than mistaken for UI loading.

| Private route | Initial JS before, encoded bytes |   After | Reduction | Heading ready before / after, median ms |
| ------------- | -------------------------------: | ------: | --------: | --------------------------------------: |
| Today         |                          383,949 | 380,028 |      1.0% |                           1,812 / 1,810 |
| Week          |                          383,949 | 358,496 |      6.6% |                           1,724 / 1,794 |
| Settings      |                          393,067 | 357,868 |      9.0% |                           1,763 / 1,728 |
| History       |                          383,949 | 354,030 |      7.8% |                           2,205 / 2,291 |

| Public document  | Encoded HTML before, bytes | After | Reduction |
| ---------------- | -------------------------: | ----: | --------: |
| `/es`            |                     20,657 | 6,473 |     68.7% |
| `/es/demo/today` |                     21,810 | 7,549 |     65.4% |
| `/es/login`      |                     20,765 | 6,427 |     69.0% |

The measured improvement is smaller initial payloads. Readiness timing has mixed per-route changes and does not demonstrate a uniform speedup. The final task editor's median first-open time is 342 ms before and 330 ms after in this run. The initial-JavaScript budget passes on all four measured private routes. Today also stops making the two speculative Focus requests observed in the baseline.

Timing medians from three CI samples are diagnostic, not p75 field Core Web Vitals, p95/p99 latency or a universal device guarantee. The loopback network is not a mobile radio network. Opening the task editor is measured separately.

An intermediate candidate deferred the form until the first click. Its median first-open time rose from 308 to 644 ms under 4× CPU throttling, while Today saved only 5,648 initial JavaScript bytes overall. That boundary was rejected: the final implementation includes the editor with its task view. The other view boundaries remain independent.

The Focus subscription test advances 60 clock values with an unchanged session: the full clock consumer renders 60 additional times, the session-only consumer renders zero additional times. Pausing and clearing the session still update that consumer.

## Responsive and functional verification

The baseline weekly demo expanded the document to 890 px at viewport widths of 768 and 844 px. Week, Month and Statistics also produced hydration errors under mismatched date/locale conditions. A reproduced 140-character unbroken task title overflowed its layout at several desktop/tablet widths. These cases now have regression checks.

The responsive suite covers 16 private areas: Today, Week, Month, Tasks, Events, History, Search, Statistics, Focus, Reminders, Schedules, Categories, Templates, Settings, Data and More. It uses eight viewport sizes from 320 to 1440 CSS pixels wide, portrait and landscape, maximum-length unbroken task/category/schedule names, 200% root text, and task dialogs in portrait/landscape. It checks document overflow, controls escaping the viewport, editing inputs, cancellation and focus restoration. Calendar scrollers are checked as intentional local scrolling regions.

Projects cover desktop Chromium, Pixel 7 Chromium emulation and iPhone 13 WebKit emulation. Public demos run in Spanish and English with a device date different from the server build date. These are browser emulations; root text scaling is not native browser zoom or a physical keyboard test.

Application revision [`a903c6c`](https://github.com/JoanOliver04/planora/commit/a903c6c5ecb48e5950e5d859112379b18a57d1a6): 602 passing unit tests in 83 files, 99 passing Playwright scenarios and three deliberate WebKit exclusions out of 102 cases. Those three API/offline integration flows also run in Chromium. Types, lint, formatting, production build, CodeQL and public Lighthouse checks pass. [CI evidence](https://github.com/JoanOliver04/planora/actions/runs/41206267552); [35-route graph capture](https://github.com/JoanOliver04/planora/actions/runs/41206267635).

The CI workflows retain `workspace-performance` JSON, `responsive-previews` PNG and `bundle-graphs` gzip JSONL artifacts for 14 days. The initial-JavaScript check compares per-route medians and rejects increases above 2% plus 2,048 bytes. It does not use noisy CI timing as an automatic speed guarantee. Run the benchmark through the isolated CI workflow; it refuses non-loopback integration credentials. No production-account data is used.

## Build graph analysis

Full-app Turbopack captures export all 35 routes. Local raw evidence is under the ignored `test-results/performance-20261031` directory. Source attribution is deduplicated by emitted filename plus source path, separately per route. Attributed gzip bytes are not network transfer.

The indexed synchronous graph was clustered with NetworkX 3.5 Louvain, unweighted undirected edges, resolution 1, seeds 0 and 1. The largest app-owned region contained workspace views, forms and Sonner. Directed importer-to-imported minimum cuts use capacity 1 for project edges and 1,000,000 for dependency/runtime and root edges. Today roots include the typed bootstrap and all indexed client references. Source validation found the workspace barrel as the entry for all four task views; task forms also have a Focus review importer. Drag-and-drop remains required on Today, so that proposed cut was rejected there. Resource modules were separated to avoid loading sorting and settings dependencies in unrelated rendered resource views.

Coverage: client output occurrences in the initial snapshot have 658 exact memberships and 312 non-chunk assets. Some concatenated locals have source attribution without matching emitted identity membership. Those cuts are provisional cuts of the indexed graph. Non-chunk fonts, polyfills and runtime assets do not establish initial browser requests. Build groups do not establish request order. Browser measurements above are the acceptance check for initial payload changes.

| Build attribution, compressed bytes                 |  Before |   After |
| --------------------------------------------------- | ------: | ------: |
| Public landing, indexed synchronous client graph    | 224,393 | 214,903 |
| Shared workspace, indexed synchronous client graph  | 453,895 | 419,660 |
| Workspace including attributed asynchronous modules | 690,496 | 717,716 |

The after capture is `after-41206267635`, at application revision `a903c6c`. Total asynchronous attribution increases with the new boundaries. This is a tradeoff, not a claim that the whole application or every navigation downloads fewer bytes. The measured cold-route payloads account for the modules actually rendered.

## Client dependency scan

Before size edits, all 46 source Action imports were reconciled against generated indexed client references. The [traceability appendix](performance-client-dependencies.md) records importer, action, exact candidate generated identities, routes, attributed compressed bytes and disposition. Exact per-function mappings remain unverified when several imports share one generated group. Indexed generated leaves depend only on Next's action-client wrapper; private server implementation dependencies do not survive in that indexed subgraph. Emitted implementation contents were not independently captured, so this is not a new security certification.

Intentional browser dependencies include the public Supabase client/anon configuration, public form schemas, backup parsing, navigation/session controls and framework Action plumbing. No server-only implementation leak was confirmed in the covered subgraph. Missing per-function mappings and concatenated-local membership remain evidence gaps.

## Limits

This work verifies frontend loading, layouts, representative interactions and existing integration/security suites. Field Core Web Vitals, production p95/p99, production load/concurrency, long-session heap behaviour, every physical device/keyboard/browser extension and arbitrarily large workspaces are not assessed. No score is assigned to those unmeasured areas. Public Lighthouse runs are lab checks whose timing and scores vary between CI runners; they are not field measurements.

The dated dependency audit reports zero production vulnerabilities and no high/critical vulnerabilities overall. The full audit has 16 moderate package entries propagated from one development-tool advisory, [minimatch glob-pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249). The installed override is 10.2.5; the advisory identifies 11.0.1 as patched. Migrating the lint dependency tree across that major version is separate maintenance and is not represented as fixed here. No dependency versions were changed in this optimization.

Private caching, database policies, CSP, logout isolation, alarms and push permissions retain their existing boundaries. The testing account is created and removed only in isolated Supabase. The user's production accounts are not used.

References: [Next.js bundle analysis](https://nextjs.org/docs/app/guides/package-bundling), [lazy loading](https://nextjs.org/docs/app/guides/lazy-loading), [scoped next-intl messages](https://next-intl.dev/docs/environments/server-client-components).
