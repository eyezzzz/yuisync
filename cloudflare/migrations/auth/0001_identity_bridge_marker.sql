-- Better Auth core tables are generated/applied by the Better Auth runtime migration endpoint.
-- This database-local marker lets readiness checks prove AUTH_DB is reachable before auth is enabled.
CREATE TABLE IF NOT EXISTS yuisync_auth_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO yuisync_auth_meta(key, value) VALUES ('boundary_version', '1')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;
