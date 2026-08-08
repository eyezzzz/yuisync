PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  client_id TEXT,
  profile_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  source TEXT NOT NULL DEFAULT 'pdv',
  fulfillment_type TEXT NOT NULL DEFAULT 'counter',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  notes TEXT,
  idempotency_key TEXT NOT NULL,
  source_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, id),
  UNIQUE (tenant_id, module_id, idempotency_key),
  FOREIGN KEY (tenant_id, module_id, client_id)
    REFERENCES clients(tenant_id, module_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(tenant_id, module_id, created_at);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('product','service')),
  product_id TEXT,
  service_id TEXT,
  description_snapshot TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  upsell INTEGER NOT NULL DEFAULT 0 CHECK (upsell IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((item_kind = 'product' AND product_id IS NOT NULL AND service_id IS NULL)
      OR (item_kind = 'service' AND service_id IS NOT NULL AND product_id IS NULL)),
  FOREIGN KEY (tenant_id, module_id, sale_id)
    REFERENCES sales(tenant_id, module_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, module_id, product_id)
    REFERENCES products(tenant_id, module_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, module_id, service_id)
    REFERENCES services(tenant_id, module_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  method TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'paid',
  external_reference TEXT,
  idempotency_key TEXT NOT NULL,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, idempotency_key),
  FOREIGN KEY (tenant_id, module_id, sale_id)
    REFERENCES sales(tenant_id, module_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_splits (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  method TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  external_reference TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS financial_effects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  effect_type TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, idempotency_key)
);

