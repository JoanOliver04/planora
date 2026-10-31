# Client dependency scan - performance baseline

Base c7a984e; snapshot `before-41196478524` (35 routes). This is a traceability appendix, not a separate security certification. Group bytes below are deduplicated emitted source attribution, not per-function transfer. A generated candidate group does not establish an exact function-to-stub mapping.

| Server Action                                                     | Client importer                                | Candidate group | Disposition                                                        |
| ----------------------------------------------------------------- | ---------------------------------------------- | --------------- | ------------------------------------------------------------------ |
| `src/app/actions/domain.ts#setActiveSchedule`                     | `src/components/workspace-page.tsx`            | G1              | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#restoreBackup`                         | `src/features/backup/data-tools.tsx`           | G2              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#discardFocusSessionAction`         | `src/features/focus/active-session-view.tsx`   | G3              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#updateFocusSessionMetadataAction`  | `src/features/focus/active-session-view.tsx`   | G3              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#deleteFocusGoalAction`             | `src/features/focus/focus-goals-panel.tsx`     | G4              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#saveFocusGoalAction`               | `src/features/focus/focus-goals-panel.tsx`     | G4              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#setFocusGoalPrimaryAction`         | `src/features/focus/focus-goals-panel.tsx`     | G4              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#saveFocusPresetAction`             | `src/features/focus/preset-editor.tsx`         | G5              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#deleteFocusPresetAction`           | `src/features/focus/preset-manager.tsx`        | G6              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#duplicateFocusPresetAction`        | `src/features/focus/preset-manager.tsx`        | G6              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#reorderFocusPresetsAction`         | `src/features/focus/preset-manager.tsx`        | G6              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#saveFocusPresetAction`             | `src/features/focus/preset-manager.tsx`        | G6              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#setFocusPresetArchivedAction`      | `src/features/focus/preset-manager.tsx`        | G6              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#toggleFocusPresetFavoriteAction`   | `src/features/focus/preset-manager.tsx`        | G6              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#completeLinkedTaskFromFocusAction` | `src/features/focus/session-complete-card.tsx` | G7              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#discardFocusSessionAction`         | `src/features/focus/session-complete-card.tsx` | G7              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#startFocusSessionAction`           | `src/features/focus/session-complete-card.tsx` | G7              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#updateFocusSessionMetadataAction`  | `src/features/focus/session-complete-card.tsx` | G7              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#startFocusSessionAction`           | `src/features/focus/session-start-dialog.tsx`  | G8              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#transitionFocusSessionAction`      | `src/features/focus/session-start-dialog.tsx`  | G8              | Unverified per-function generated mapping; indexed references only |
| `src/features/focus/actions.ts#transitionFocusSessionAction`      | `src/features/focus/use-focus-session.ts`      | G9              | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#completeGuidedOnboarding`              | `src/features/onboarding/onboarding.tsx`       | G10             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#deleteReminder`                        | `src/features/reminders/reminder-center.tsx`   | G11             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#saveReminder`                          | `src/features/reminders/reminder-center.tsx`   | G11             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#setReminderEnabled`                    | `src/features/reminders/reminder-center.tsx`   | G11             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#setRemindersEnabled`                   | `src/features/reminders/reminder-center.tsx`   | G11             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#snoozeReminder`                        | `src/features/reminders/reminder-center.tsx`   | G11             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#updateReminderTimezone`                | `src/features/reminders/reminder-center.tsx`   | G11             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#importTemplate`                        | `src/features/templates/template-gallery.tsx`  | G12             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#savePersonalTemplate`                  | `src/features/templates/template-gallery.tsx`  | G12             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#deleteCategory`                        | `src/features/workspace/resource-views.tsx`    | G13             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#deleteEmptySchedule`                   | `src/features/workspace/resource-views.tsx`    | G13             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#deleteEvent`                           | `src/features/workspace/resource-views.tsx`    | G13             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#duplicateSchedule`                     | `src/features/workspace/resource-views.tsx`    | G13             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#saveCategory`                          | `src/features/workspace/resource-views.tsx`    | G13             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#saveEvent`                             | `src/features/workspace/resource-views.tsx`    | G13             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#saveSchedule`                          | `src/features/workspace/resource-views.tsx`    | G13             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#setActiveSchedule`                     | `src/features/workspace/resource-views.tsx`    | G13             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#setScheduleArchived`                   | `src/features/workspace/resource-views.tsx`    | G13             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#updateProfile`                         | `src/features/workspace/resource-views.tsx`    | G13             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#reorderResources`                      | `src/features/workspace/resource-views.tsx`    | G13             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#saveTask`                              | `src/features/workspace/task-form.tsx`         | G14             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#deleteArchivedTask`                    | `src/features/workspace/task-views.tsx`        | G15             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#duplicateTask`                         | `src/features/workspace/task-views.tsx`        | G15             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#reorderResources`                      | `src/features/workspace/task-views.tsx`        | G15             | Unverified per-function generated mapping; indexed references only |
| `src/app/actions/domain.ts#setTaskArchived`                       | `src/features/workspace/task-views.tsx`        | G15             | Unverified per-function generated mapping; indexed references only |

## Indexed candidate groups

### G1

**Routes:** `/[locale]/categories`, `/[locale]/events`, `/[locale]/history`, `/[locale]/month`, `/[locale]/schedules`, `/[locale]/search`, `/[locale]/settings`, `/[locale]/statistics`, `/[locale]/summary`, `/[locale]/tasks`, `/[locale]/today`, `/[locale]/week`

**Compressed attribution:** No exact per-function part attribution available.

- `[project]/src/app/actions/data:aff1f2 [app-client] (ecmascript) <text/javascript>`

### G2

**Routes:** No exact membership join available.

**Compressed attribution:** No exact per-function part attribution available.

- `[project]/src/app/actions/data:fdf231 [app-client] (ecmascript) <text/javascript>`

### G3

**Routes:** No exact membership join available.

**Compressed attribution:** No exact per-function part attribution available.

- `[project]/src/features/focus/data:b9c9a0 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/features/focus/data:cbe504 [app-client] (ecmascript) <text/javascript>`

### G4

**Routes:** No exact membership join available.

**Compressed attribution:** No exact per-function part attribution available.

- `[project]/src/features/focus/data:10c578 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/features/focus/data:a6e83d [app-client] (ecmascript) <text/javascript>`
- `[project]/src/features/focus/data:f0cfd6 [app-client] (ecmascript) <text/javascript>`

### G5

**Routes:** No exact membership join available.

**Compressed attribution:** No exact per-function part attribution available.

- `[project]/src/features/focus/data:1e950f [app-client] (ecmascript) <text/javascript>`

### G6

**Routes:** No exact membership join available.

**Compressed attribution:** No exact per-function part attribution available.

- `[project]/src/features/focus/data:1e950f [app-client] (ecmascript) <text/javascript>`
- `[project]/src/features/focus/data:4de805 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/features/focus/data:9455f8 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/features/focus/data:997580 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/features/focus/data:a8557e [app-client] (ecmascript) <text/javascript>`
- `[project]/src/features/focus/data:c42aa0 [app-client] (ecmascript) <text/javascript>`

### G7

**Routes:** No exact membership join available.

**Compressed attribution:** No exact per-function part attribution available.

- `[project]/src/features/focus/data:adece3 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/features/focus/data:b9c9a0 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/features/focus/data:c43897 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/features/focus/data:cbe504 [app-client] (ecmascript) <text/javascript>`

### G8

**Routes:** `/[locale]/categories`, `/[locale]/data`, `/[locale]/events`, `/[locale]/focus`, `/[locale]/history`, `/[locale]/month`, `/[locale]/more`, `/[locale]/reminders`, `/[locale]/schedules`, `/[locale]/search`, `/[locale]/settings`, `/[locale]/statistics`, `/[locale]/summary`, `/[locale]/tasks`, `/[locale]/templates`, `/[locale]/today`, `/[locale]/week`

**Compressed attribution:** No exact per-function part attribution available.

- `[project]/src/features/focus/data:c43897 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/features/focus/data:d574ed [app-client] (ecmascript) <text/javascript>`

### G9

**Routes:** `/[locale]/categories`, `/[locale]/data`, `/[locale]/events`, `/[locale]/focus`, `/[locale]/history`, `/[locale]/month`, `/[locale]/more`, `/[locale]/reminders`, `/[locale]/schedules`, `/[locale]/search`, `/[locale]/settings`, `/[locale]/statistics`, `/[locale]/summary`, `/[locale]/tasks`, `/[locale]/templates`, `/[locale]/today`, `/[locale]/week`

**Compressed attribution:** No exact per-function part attribution available.

- `[project]/src/features/focus/data:d574ed [app-client] (ecmascript) <text/javascript>`

### G10

**Routes:** No exact membership join available.

**Compressed attribution:** No exact per-function part attribution available.

- `[project]/src/app/actions/data:a4ca47 [app-client] (ecmascript) <text/javascript>`

### G11

**Routes:** No exact membership join available.

**Compressed attribution:** No exact per-function part attribution available.

- `[project]/src/app/actions/data:413a5f [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:41f9fd [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:471988 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:4deb17 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:c4f111 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:e95c2c [app-client] (ecmascript) <text/javascript>`

### G12

**Routes:** No exact membership join available.

**Compressed attribution:** No exact per-function part attribution available.

- `[project]/src/app/actions/data:eea6fa [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:f0755b [app-client] (ecmascript) <text/javascript>`

### G13

**Routes:** `/[locale]/categories`, `/[locale]/events`, `/[locale]/history`, `/[locale]/month`, `/[locale]/schedules`, `/[locale]/search`, `/[locale]/settings`, `/[locale]/statistics`, `/[locale]/summary`, `/[locale]/tasks`, `/[locale]/today`, `/[locale]/week`

**Compressed attribution:** No exact per-function part attribution available.

- `[project]/src/app/actions/data:47d356 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:50e167 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:56b2dd [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:6fb086 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:7ae8c0 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:9815fd [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:a006e0 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:aff1f2 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:c73cf3 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:f3aefe [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:fbab42 [app-client] (ecmascript) <text/javascript>`

### G14

**Routes:** No exact membership join available.

**Compressed attribution:** No exact per-function part attribution available.

- `[project]/src/app/actions/data:d929f9 [app-client] (ecmascript) <text/javascript>`

### G15

**Routes:** `/[locale]/categories`, `/[locale]/events`, `/[locale]/history`, `/[locale]/month`, `/[locale]/schedules`, `/[locale]/search`, `/[locale]/settings`, `/[locale]/statistics`, `/[locale]/summary`, `/[locale]/tasks`, `/[locale]/today`, `/[locale]/week`

**Compressed attribution:** No exact per-function part attribution available.

- `[project]/src/app/actions/data:054452 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:12f880 [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:1d850e [app-client] (ecmascript) <text/javascript>`
- `[project]/src/app/actions/data:6fb086 [app-client] (ecmascript) <text/javascript>`

## Suppressed matches and evidence gaps

Intentional browser content: public Supabase clients and anon configuration, public Zod form schemas, backup parsing, UI/session state and Next Server Action reference plumbing. Generated indexed leaves import the action-client-wrapper, not the private implementation dependencies. Emitted implementation contents and ambiguous function mappings were not independently verified in this optimization. Concatenated locals with source attribution but no matching emitted member identity prevent definitive whole-output reachability claims. No server-only implementation leak was confirmed in the covered subgraph.
