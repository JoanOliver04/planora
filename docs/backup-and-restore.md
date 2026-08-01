# Backup and restore

Planora exports a UTF-8, versioned JSON backup (`planora-backup`, version 1), separate CSV tables for spreadsheet analysis, and an RFC 5545-compatible ICS calendar containing events and tasks.

Imports are parsed and size-limited before a preview is shown. Nothing is written until the user confirms. Restores add new records, preserve relationships with fresh identifiers, never trust an exported `user_id`, and do not delete existing data. Imported reminders are disabled until reviewed. Keep exports private: descriptions and completion history can contain personal information.

Only version 1 is accepted. Keep the original file unchanged for future migrations. Open **Your data**, select the JSON file, review the record counts, and confirm. If a database write fails, contact support before retrying because records written earlier in that import may remain.
