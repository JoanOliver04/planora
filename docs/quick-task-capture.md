# Quick task capture

Today and Tasks offer a compact form for creating a task in the active schedule. Type a name and optionally a supported date, weekday rule or time. The preview and interpretation options appear as you write. Review the interpreted title, first date, recurrence, time and schedule before pressing Enter or **Create task** (the plus button on narrow screens).

| Input                                      | Result                                                      |
| ------------------------------------------ | ----------------------------------------------------------- |
| `Comprar pan mañana a las 18:00`           | One task tomorrow at 18:00                                  |
| `Read tomorrow at 6 pm`                    | One task tomorrow at 18:00                                  |
| `Piano lunes y miércoles a las 18:00`      | A Monday/Wednesday habit, starting on its next matching day |
| `Walk every Monday` / `Walk Mondays`       | A weekly Monday habit                                       |
| `Leer cada día` / `Read daily`             | A daily habit starting today                                |
| `Piano entre semana` / `Piano on weekdays` | A Monday–Friday habit, starting on its next matching day    |
| `Call on 2027-01-01 at 09:00`              | One task on that calendar date                              |

Both languages are accepted in either interface language. Additional supported relative expressions are `hoy`/`today` and `pasado mañana`/`day after tomorrow`. Weekday lists accept commas and `y`/`and`, including repeated articles such as `los lunes y los miércoles`. Times follow `a las`, `a la` or `at`; an explicit `HH:MM` or `am`/`pm` time also works without that prefix. Bare numbers stay in the task name. The time may precede or follow the date expression. Calendar dates use unambiguous `YYYY-MM-DD` strings.

Only recognized suffixes are removed from the title. Other wording remains literal; this is a bounded parser, not a general-language assistant. Turn off **Detect dates and repetition** to preserve the full input as the task name for that capture. Detection returns to its default after a successful save. Impossible dates, invalid times and missing/oversized names block interpreted creation. The full task name limit remains 140 characters; the capture input allows 280 characters so scheduling expressions have room.

**More options** opens the full editor with the interpreted name, date, time, weekday selection and active schedule already filled. Cancel returns to the intact capture text. The existing Add/Edit controls remain available. Capturing a scheduled time does not create an alarm or request notification permissions; reminders retain their explicit configuration.

## Date and save behaviour

Relative expressions use the account's configured time zone. Calendar arithmetic uses date-only values, so daylight-saving transitions and a device in a different zone do not shift the intended day. A form left across midnight asks for a fresh review before saving its newly calculated relative date. A bare single weekday means the next occurrence, including today; `every`/`cada`/`los`, an English plural, or several weekdays creates a habit. Past times stay on the displayed date; there is no hidden move to tomorrow.

Creation uses the existing authenticated, ownership-checked and validated `saveTask` action. Interpretation runs on the device and adds no external service or dependency. The form prevents repeated submissions while saving, keeps its text after a failed request, and disables creation while offline. The text is an in-memory draft, not an offline creation queue or a durable draft across navigation. Once creation succeeds, a list-refresh failure is reported as a saved task requiring refresh; it does not restore the submitted text as a new creation.

## Verification

Parser tests cover bilingual syntax, 12/24-hour boundaries, invalid values, literal text, title limits, leap years and date transitions. Component tests cover the active schedule, in-flight duplicate submissions, failure handling, offline/reconnect, midnight review, advanced prefill/edit/save and cancellation. The isolated Supabase browser scenario runs in desktop Chromium, Android Chromium emulation and iPhone WebKit emulation, with the device in UTC+14 and the account in Europe/Madrid, narrow layouts and 200% root text. Production accounts are not used for mutation tests.
