-- =============================================================================
-- YuiSync - Exemplos aprovados de conversa do bot
-- =============================================================================
-- Objetivo:
-- 1) Guardar exemplos de conversa por tenant/modulo para orientar estilo e fluxo.
-- 2) Permitir exemplos globais (tenant_id null) e exemplos especificos por cliente.
-- 3) Manter dados variaveis fora dos exemplos: preco, estoque e horario sempre vem do banco.
-- =============================================================================

begin;

create extension if not exists "uuid-ossp";

create table if not exists public.bot_conversation_examples (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  module_id text not null default 'petshop',
  intent text not null default 'geral',
  stage text not null default 'geral',
  tone text not null default 'curto',
  has_upsell boolean not null default false,
  has_price boolean not null default false,
  has_bank_placeholder boolean not null default true,
  source_key text,
  user_message text not null,
  ideal_reply text not null,
  notes text,
  tags text[] not null default '{}'::text[],
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bot_conversation_examples_intent_check
    check (intent in ('geral', 'produto', 'banho_tosa', 'veterinaria', 'desconto', 'sem_estoque', 'sem_horario', 'pagamento', 'entrega', 'confirmacao', 'avaliacao')),
  constraint bot_conversation_examples_stage_check
    check (stage in ('geral', 'triagem', 'coleta', 'oferta', 'upsell', 'resumo_parcial', 'pagamento', 'entrega', 'resumo_final', 'confirmacao', 'avaliacao'))
);

alter table public.bot_conversation_examples
  add column if not exists tone text not null default 'curto';

alter table public.bot_conversation_examples
  add column if not exists has_upsell boolean not null default false;

alter table public.bot_conversation_examples
  add column if not exists has_price boolean not null default false;

alter table public.bot_conversation_examples
  add column if not exists has_bank_placeholder boolean not null default true;

alter table public.bot_conversation_examples
  add column if not exists source_key text;

create index if not exists idx_bot_examples_scope
  on public.bot_conversation_examples(tenant_id, module_id, active, intent, stage, updated_at desc);

create index if not exists idx_bot_examples_global
  on public.bot_conversation_examples(module_id, active, intent, stage, updated_at desc)
  where tenant_id is null;

create unique index if not exists idx_bot_examples_source_global
  on public.bot_conversation_examples(module_id, source_key)
  where tenant_id is null and source_key is not null;

create unique index if not exists idx_bot_examples_source_tenant
  on public.bot_conversation_examples(tenant_id, module_id, source_key)
  where tenant_id is not null and source_key is not null;

alter table public.bot_conversation_examples enable row level security;

drop policy if exists "Bot examples select" on public.bot_conversation_examples;
create policy "Bot examples select"
on public.bot_conversation_examples
for select
using (
  auth.role() = 'service_role'
  or tenant_id is null
  or public.has_module_tenant_access(module_id, tenant_id)
);

drop policy if exists "Bot examples insert" on public.bot_conversation_examples;
create policy "Bot examples insert"
on public.bot_conversation_examples
for insert
with check (
  auth.role() = 'service_role'
  or (
    tenant_id is not null
    and public.is_module_tenant_admin(module_id, tenant_id)
  )
);

drop policy if exists "Bot examples update" on public.bot_conversation_examples;
create policy "Bot examples update"
on public.bot_conversation_examples
for update
using (
  auth.role() = 'service_role'
  or (
    tenant_id is not null
    and public.is_module_tenant_admin(module_id, tenant_id)
  )
)
with check (
  auth.role() = 'service_role'
  or (
    tenant_id is not null
    and public.is_module_tenant_admin(module_id, tenant_id)
  )
);

drop policy if exists "Bot examples delete" on public.bot_conversation_examples;
create policy "Bot examples delete"
on public.bot_conversation_examples
for delete
using (
  auth.role() = 'service_role'
  or (
    tenant_id is not null
    and public.is_module_tenant_admin(module_id, tenant_id)
  )
);

commit;
