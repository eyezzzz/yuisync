PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  name TEXT NOT NULL,
  barcode TEXT,
  category TEXT,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  min_quantity_milli INTEGER NOT NULL DEFAULT 0,
  species_target TEXT,
  image_url TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  source_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, id),
  UNIQUE (tenant_id, module_id, barcode)
);
CREATE INDEX IF NOT EXISTS idx_products_scope_name ON products(tenant_id, module_id, active, name);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  service_group TEXT NOT NULL DEFAULT 'other',
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  species_rule TEXT NOT NULL DEFAULT 'all',
  commission_basis_points INTEGER,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  source_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, id),
  UNIQUE (tenant_id, module_id, code)
);
CREATE INDEX IF NOT EXISTS idx_services_scope_group ON services(tenant_id, module_id, active, service_group);

CREATE TABLE IF NOT EXISTS service_products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL DEFAULT 1000 CHECK (quantity_milli > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, service_id, product_id),
  FOREIGN KEY (tenant_id, module_id, service_id)
    REFERENCES services(tenant_id, module_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, module_id, product_id)
    REFERENCES products(tenant_id, module_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_balances (
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, module_id, product_id),
  FOREIGN KEY (tenant_id, module_id, product_id)
    REFERENCES products(tenant_id, module_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('opening','sale','purchase','adjustment','return','service_use')),
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli <> 0),
  balance_before_milli INTEGER NOT NULL,
  balance_after_milli INTEGER NOT NULL,
  unit_cost_cents INTEGER,
  reference_type TEXT,
  reference_id TEXT,
  reason TEXT,
  idempotency_key TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, idempotency_key),
  FOREIGN KEY (tenant_id, module_id, product_id)
    REFERENCES products(tenant_id, module_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(tenant_id, module_id, product_id, occurred_at);

