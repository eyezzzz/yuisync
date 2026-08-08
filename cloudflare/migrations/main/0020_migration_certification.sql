PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS migration_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  migration_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','completed','failed','reconciliation_failed')),
  source_count INTEGER NOT NULL DEFAULT 0,
  normalized_count INTEGER NOT NULL DEFAULT 0,
  written_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_migration_runs_scope ON migration_runs(tenant_id, module_id, domain, started_at);

CREATE TABLE IF NOT EXISTS migration_identity_map (
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  source_system TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id TEXT NOT NULL,
  migration_version INTEGER NOT NULL,
  normalized_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, module_id, domain, source_system, source_id, target_table)
);
CREATE INDEX IF NOT EXISTS idx_migration_map_target ON migration_identity_map(tenant_id, module_id, target_table, target_id);

CREATE TABLE IF NOT EXISTS migration_failures (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES migration_runs(id) ON DELETE CASCADE,
  source_id TEXT,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reconciliation_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES migration_runs(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass','fail')),
  source_fingerprint TEXT NOT NULL,
  target_fingerprint TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staging_certifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  git_sha TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass','fail')),
  checks_json TEXT NOT NULL,
  rollback_bookmark TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
