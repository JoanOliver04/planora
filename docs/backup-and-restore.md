# Backup and restore

Planora exports UTF-8 JSON backups with explicit metadata (`format`, `schemaVersion`, `backupId`, `createdAt`, `exportedBy`, locale and timezone), separate CSV tables, and an RFC 5545-compatible ICS calendar. Version 2 is the current JSON contract. Genuine version 1 exports are migrated in memory, validated against the current model, and never modified on disk.

## Restore semantics

**Restore backup** is replacement, not merge. The selected file is fully parsed and validated in the browser before confirmation, including its version, field types, required values, entity limits, unique identifiers and internal relationships. Files larger than 5 MiB and future schema versions are rejected before any write.

Before restoring, Planora downloads a fresh safety copy of the currently loaded account data. The confirmed backup is normalized on the server, all entity IDs are regenerated, and references are rebuilt through old-to-new maps. Exported `user_id` values are discarded.

The database replacement runs through `public.restore_planora_backup(jsonb)`. This PostgreSQL function:

- derives ownership exclusively from `auth.uid()`;
- serializes restores for the same account with a transaction-scoped advisory lock;
- deletes dependent entities in foreign-key order;
- inserts the complete replacement in dependency order;
- disables restored reminders and alarms;
- runs as one PostgreSQL statement, so any validation, deletion or insertion error rolls back the entire replacement;
- cannot affect another user's rows because every delete and insert is bound to the authenticated user and RLS remains active.

Restoring the same file repeatedly is idempotent at the product level: every run replaces the workspace and therefore leaves one functional copy of each exported entity. `backupId` remains stable within the file and legacy v1 files receive a deterministic migrated identifier.

## Recovering from the former additive restore

Use the untouched JSON exported before the duplicates were created. Open **Your data**, select it, verify the date, format version and entity counts, then choose **Restore and replace data**. Keep both that original file and the automatically downloaded pre-restore safety copy until the result has been checked.

No automatic duplicate cleaner is provided. The previous importer did not persist a reliable import batch identifier, so deleting by matching names, dates or content could remove legitimate records.
