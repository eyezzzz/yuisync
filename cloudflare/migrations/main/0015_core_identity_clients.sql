PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO schema_meta (key, value) VALUES ('schema_version', '15')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  permissions_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, tenant_id, module_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON tenant_memberships(user_id, active);

CREATE TABLE IF NOT EXISTS legacy_identity_mappings (
  legacy_provider TEXT NOT NULL,
  legacy_user_id TEXT NOT NULL,
  auth_user_id TEXT,
  legacy_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending_reauthentication' CHECK (status IN ('pending_reauthentication','linked')),
  tenant_id TEXT,
  module_id TEXT,
  migrated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (legacy_provider, legacy_user_id)
);
CREATE INDEX IF NOT EXISTS idx_identity_auth_user ON legacy_identity_mappings(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_identity_email ON legacy_identity_mappings(legacy_email, status);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  name TEXT NOT NULL,
  document TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  neighborhood TEXT,
  city TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  source_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, id)
);
CREATE INDEX IF NOT EXISTS idx_clients_scope_name ON clients(tenant_id, module_id, active, name);

CREATE TABLE IF NOT EXISTS pets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  species TEXT NOT NULL DEFAULT 'other',
  breed TEXT,
  birth_date TEXT,
  weight_grams INTEGER,
  color TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  source_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, id),
  FOREIGN KEY (tenant_id, module_id, client_id)
    REFERENCES clients(tenant_id, module_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pets_scope_client ON pets(tenant_id, module_id, client_id, active);

