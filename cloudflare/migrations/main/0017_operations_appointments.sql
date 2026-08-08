PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS operational_configs (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  store_name TEXT,
  store_address TEXT,
  store_neighborhood TEXT,
  store_city TEXT,
  store_phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  printer_width INTEGER NOT NULL DEFAULT 80,
  max_pdv_discount_basis_points INTEGER NOT NULL DEFAULT 1000,
  autonomy_policy_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, module_id)
);

CREATE TABLE IF NOT EXISTS operational_hours (
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at TEXT,
  closes_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  PRIMARY KEY (tenant_id, module_id, weekday),
  FOREIGN KEY (tenant_id, module_id)
    REFERENCES operational_configs(tenant_id, module_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS operational_payment_methods (
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  method TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, module_id, method),
  FOREIGN KEY (tenant_id, module_id)
    REFERENCES operational_configs(tenant_id, module_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  status TEXT NOT NULL DEFAULT 'scheduled',
  live_status TEXT,
  source TEXT,
  notes TEXT,
  employee_id TEXT,
  groomer_id TEXT,
  responsible_staff_key TEXT,
  responsible_staff_name TEXT,
  subscription_id TEXT,
  subscription_benefit_used INTEGER NOT NULL DEFAULT 0 CHECK (subscription_benefit_used IN (0,1)),
  idempotency_key TEXT,
  source_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, id),
  UNIQUE (tenant_id, module_id, idempotency_key),
  FOREIGN KEY (tenant_id, module_id, client_id)
    REFERENCES clients(tenant_id, module_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, module_id, pet_id)
    REFERENCES pets(tenant_id, module_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_appointments_schedule ON appointments(tenant_id, module_id, scheduled_at, status);

CREATE TABLE IF NOT EXISTS appointment_services (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  service_id TEXT,
  service_code_snapshot TEXT NOT NULL,
  service_name_snapshot TEXT NOT NULL,
  price_cents_snapshot INTEGER NOT NULL DEFAULT 0,
  duration_minutes_snapshot INTEGER NOT NULL DEFAULT 60,
  quantity_milli INTEGER NOT NULL DEFAULT 1000,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, appointment_id, id),
  FOREIGN KEY (tenant_id, module_id, appointment_id)
    REFERENCES appointments(tenant_id, module_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, module_id, service_id)
    REFERENCES services(tenant_id, module_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS motodog_options (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('none','pickup','dropoff','roundtrip')),
  outside_muriae INTEGER NOT NULL DEFAULT 0 CHECK (outside_muriae IN (0,1)),
  pet_weight_grams INTEGER,
  fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  address TEXT,
  neighborhood TEXT,
  city TEXT,
  reference TEXT,
  delivery_staff_key TEXT,
  delivery_staff_name TEXT,
  source_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, appointment_id),
  FOREIGN KEY (tenant_id, module_id, appointment_id)
    REFERENCES appointments(tenant_id, module_id, id) ON DELETE CASCADE
);

