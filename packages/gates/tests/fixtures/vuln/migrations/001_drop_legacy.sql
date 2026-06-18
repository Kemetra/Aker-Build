-- VIOLATION (TG-G3): a destructive migration with no rollback note.
DROP TABLE legacy_accounts;
ALTER TABLE users ADD COLUMN region TEXT NOT NULL;
