PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  external_thread_id TEXT,
  customer_phone TEXT,
  customer_name TEXT,
  client_id TEXT,
  status TEXT NOT NULL DEFAULT 'bot',
  intent TEXT,
  context_json TEXT NOT NULL DEFAULT '{}',
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  source_id TEXT,
  UNIQUE (tenant_id, module_id, id),
  UNIQUE (tenant_id, module_id, channel, external_thread_id),
  FOREIGN KEY (tenant_id, module_id, client_id)
    REFERENCES clients(tenant_id, module_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  external_message_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_id TEXT,
  UNIQUE (tenant_id, module_id, thread_id, external_message_id),
  FOREIGN KEY (tenant_id, module_id, thread_id)
    REFERENCES chat_threads(tenant_id, module_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(tenant_id, module_id, thread_id, sent_at);

CREATE TABLE IF NOT EXISTS operation_checkpoints (
  operation_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  thread_id TEXT,
  operation_type TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  last_event_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, operation_id)
);
CREATE INDEX IF NOT EXISTS idx_operation_checkpoints_thread ON operation_checkpoints(tenant_id, module_id, thread_id, updated_at);

CREATE TABLE IF NOT EXISTS operation_effects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  effect_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  request_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  error_json TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, idempotency_key),
  FOREIGN KEY (tenant_id, module_id, operation_id)
    REFERENCES operation_checkpoints(tenant_id, module_id, operation_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fiscal_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  sale_id TEXT,
  document_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  external_reference TEXT,
  access_key TEXT,
  total_cents INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  response_json TEXT,
  issued_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, idempotency_key),
  FOREIGN KEY (tenant_id, module_id, sale_id)
    REFERENCES sales(tenant_id, module_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS effect_outbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  effect_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, module_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_effect_outbox_pending ON effect_outbox(status, available_at);

