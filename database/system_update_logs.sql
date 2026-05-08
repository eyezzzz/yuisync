-- =============================================================================
-- YuiSync - Central de Logs de Atualizacoes
-- =============================================================================
-- Execute no SQL Editor do Supabase para ativar a aba de logs com persistencia.
-- =============================================================================

begin;

create extension if not exists "uuid-ossp";

create table if not exists public.system_update_logs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references public.tenants(id) on delete set null,
  module_id text not null default 'system',
  category text not null default 'operacao',
  status text not null default 'info',
  source text not null default 'system',
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  fingerprint text unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_system_update_logs_tenant_module_created
  on public.system_update_logs(tenant_id, module_id, created_at desc);

create index if not exists idx_system_update_logs_created
  on public.system_update_logs(created_at desc);

alter table public.system_update_logs enable row level security;

drop policy if exists "System update logs select" on public.system_update_logs;
create policy "System update logs select"
on public.system_update_logs
for select
using (
  (tenant_id is null and public.is_global_admin())
  or (tenant_id is not null and public.has_tenant_access(tenant_id))
);

drop policy if exists "System update logs insert" on public.system_update_logs;
create policy "System update logs insert"
on public.system_update_logs
for insert
with check (
  public.is_any_module_admin()
  and (tenant_id is null or public.has_tenant_access(tenant_id))
);

drop policy if exists "System update logs update" on public.system_update_logs;
create policy "System update logs update"
on public.system_update_logs
for update
using (
  public.is_any_module_admin()
  and (tenant_id is null or public.has_tenant_access(tenant_id))
)
with check (
  public.is_any_module_admin()
  and (tenant_id is null or public.has_tenant_access(tenant_id))
);

drop policy if exists "System update logs delete" on public.system_update_logs;
create policy "System update logs delete"
on public.system_update_logs
for delete
using (
  public.is_global_admin()
  or (tenant_id is not null and public.is_module_tenant_admin(module_id, tenant_id))
);

do $$
declare
  v_tenant uuid;
begin
  select t.id
  into v_tenant
  from public.tenants t
  order by t.created_at asc
  limit 1;

  insert into public.system_update_logs (
    tenant_id,
    module_id,
    category,
    status,
    source,
    title,
    description,
    fingerprint,
    created_at
  )
  values
    (
      v_tenant,
      'system',
      'infra',
      'success',
      'changelog',
      'Multi-instancia por negocio habilitada',
      'Estrutura de tenants, vinculo perfil-negocio e tenant ativo por usuario com isolamento por RLS.',
      'milestone-tenant-core-20260402',
      '2026-04-02T09:20:00Z'::timestamptz
    ),
    (
      v_tenant,
      'petshop',
      'operacao',
      'success',
      'changelog',
      'Ordens de servico e entrega no WhatsApp',
      'Fluxo operacional dedicado para vendas por chat com acompanhamento de status e historico.',
      'milestone-orders-20260402',
      '2026-04-02T10:05:00Z'::timestamptz
    ),
    (
      v_tenant,
      'petshop',
      'pdv',
      'success',
      'changelog',
      'Checkout com pagamentos mistos',
      'Finalizacao com 2 a 4 formas de pagamento (dinheiro, pix, debito, credito).',
      'milestone-checkout-20260402',
      '2026-04-02T10:40:00Z'::timestamptz
    ),
    (
      v_tenant,
      'petshop',
      'automacao',
      'success',
      'changelog',
      'Sincronizacao automatica PDV para ordens',
      'Vendas no WhatsApp agora abrem ordem automaticamente com status inicial consistente.',
      'milestone-service-order-sync-20260402',
      '2026-04-02T11:05:00Z'::timestamptz
    ),
    (
      v_tenant,
      'system',
      'admin',
      'success',
      'changelog',
      'Novo Negocio no painel de usuarios',
      'Criacao de negocio e atribuicao de acesso por login com negocio principal configuravel.',
      'milestone-admin-business-20260402',
      '2026-04-02T12:10:00Z'::timestamptz
    ),
    (
      v_tenant,
      'system',
      'seguranca',
      'info',
      'changelog',
      'Scripts de auditoria de isolamento preparados',
      'Checklist de schema e testes manuais RLS foram organizados para validar separacao entre negocios.',
      'milestone-isolation-audit-20260402',
      '2026-04-02T13:00:00Z'::timestamptz
    ),
    (
      v_tenant,
      'system',
      'comercial',
      'success',
      'changelog',
      'Fundacao comercial e onboarding por negocio',
      'Catalogo de planos SaaS, assinatura por tenant e trilha de onboarding foram preparados para cobranca automatica futura.',
      'milestone-commercial-foundation-20260403',
      '2026-04-03T18:10:00Z'::timestamptz
    ),
    (
      v_tenant,
      'system',
      'suporte',
      'success',
      'changelog',
      'Widget de suporte global + inbox central',
      'Clientes agora podem abrir chamado por um chat minimalista e a equipe responde no Hub em Suporte Central.',
      'milestone-support-center-20260403',
      '2026-04-03T18:35:00Z'::timestamptz
    )
  on conflict (fingerprint) do nothing;
end $$;

commit;
