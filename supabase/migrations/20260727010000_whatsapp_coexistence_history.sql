begin;

create table if not exists public.whatsapp_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  meta_business_id text,
  waba_id text,
  phone_number_id text not null,
  display_phone_number text,
  connection_mode text not null default 'cloud_api'
    check (connection_mode in ('cloud_api', 'coexistence')),
  coexistence_status text not null default 'not_requested'
    check (coexistence_status in ('not_requested', 'pending', 'active', 'paused', 'disconnected', 'ineligible')),
  history_sync_status text not null default 'not_requested'
    check (history_sync_status in ('not_requested', 'pending', 'receiving', 'completed', 'partial', 'failed', 'expired')),
  token_reference text,
  active boolean not null default true,
  connected_at timestamptz,
  history_sync_started_at timestamptz,
  history_sync_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone_number_id)
);

create index if not exists whatsapp_integrations_tenant_idx
  on public.whatsapp_integrations (tenant_id, active);

create table if not exists public.whatsapp_coexistence_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  integration_id uuid references public.whatsapp_integrations(id) on delete set null,
  phone_number_id text,
  fields text[] not null default '{}',
  payload jsonb not null,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'stored', 'failed')),
  normalized_messages integer not null default 0,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists whatsapp_coexistence_events_tenant_received_idx
  on public.whatsapp_coexistence_events (tenant_id, received_at desc);

create index if not exists whatsapp_coexistence_events_phone_idx
  on public.whatsapp_coexistence_events (phone_number_id, received_at desc);

create table if not exists public.whatsapp_history_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  integration_id uuid references public.whatsapp_integrations(id) on delete set null,
  coexistence_event_id uuid references public.whatsapp_coexistence_events(id) on delete set null,
  external_message_id text not null,
  phone_number_id text,
  contact_wa_id text,
  direction text not null default 'unknown'
    check (direction in ('inbound', 'outbound', 'unknown')),
  message_type text not null default 'unknown',
  content text,
  occurred_at timestamptz not null,
  historical boolean not null default true,
  should_reply boolean not null default false,
  luna_status text not null default 'pending_anonymization'
    check (luna_status in ('pending_anonymization', 'ready_for_review', 'approved_for_dataset', 'rejected', 'processed')),
  anonymized_content text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, external_message_id)
);

create index if not exists whatsapp_history_messages_tenant_time_idx
  on public.whatsapp_history_messages (tenant_id, occurred_at desc);

create index if not exists whatsapp_history_messages_luna_queue_idx
  on public.whatsapp_history_messages (tenant_id, luna_status, occurred_at)
  where historical = true and should_reply = false;

alter table public.whatsapp_integrations enable row level security;
alter table public.whatsapp_coexistence_events enable row level security;
alter table public.whatsapp_history_messages enable row level security;

-- O webhook usa service_role. A interface do produto só poderá ler estes dados
-- depois que políticas tenant-scoped explícitas forem adicionadas junto do painel.
revoke all on public.whatsapp_integrations from anon, authenticated;
revoke all on public.whatsapp_coexistence_events from anon, authenticated;
revoke all on public.whatsapp_history_messages from anon, authenticated;

grant all on public.whatsapp_integrations to service_role;
grant all on public.whatsapp_coexistence_events to service_role;
grant all on public.whatsapp_history_messages to service_role;

commit;
