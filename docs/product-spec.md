# Product specification

Planora lets each user maintain independent schedules, reusable categories, one-time tasks, recurring habits, informational events and immutable completion history. Spanish and English routes preserve user-authored content. The primary mobile experience groups today's work by local day part; desktop adds a seven-day agenda.

## Planning a day

Open a date in Month to see its Week agenda. Month shows up to five entries per date on desktop and the total on small screens. Week places all-day events first, orders appointments and timed tasks together, positions flexible morning, afternoon and night tasks at the start of the configured day part, and leaves anytime tasks at the end. Select a title to open its details or choose Add within a day to create a task for that date in the active schedule. The selected date survives reloads and the browser Back action.

Today and Daily summary use the account's start of week when deciding whether a weekly habit still needs attention. Completing the weekly target removes the habit from subsequent daily to-do lists. Its completed occurrence stays in the summary on the day it was recorded. Weekly progress takes into account how many days a habit is actually available in its first and last weeks.

## Focus (Enfoque)

Optional concentration sessions with countdown, free stopwatch, or work/break cycles. Users may attach a task or habit, use fully custom presets and structured plans, set gentle weekly goals, and review private notes after a session. Finishing Focus never completes a task unless the user opted in for that session. One active session per account is enforced in the database. Portable backups (JSON schema v4) include Focus entities; live sessions restore as cancelled so timers and system alerts are not reactivated unexpectedly.
