PRAGMA foreign_keys = ON;

ALTER TABLE staging_certifications ADD COLUMN auth_rollback_bookmark TEXT;

INSERT INTO schema_meta (key, value) VALUES ('schema_version', '16')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;
