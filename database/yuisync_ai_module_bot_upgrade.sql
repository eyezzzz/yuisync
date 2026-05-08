-- =============================================================================
-- YuiSync - Upgrade IA Lab (Modulo/Empresa/Bot + contexto automatico)
-- =============================================================================
-- Objetivo:
-- 1) Habilitar selecao real de modulo/empresa/bot no IA Lab
-- 2) Garantir escopo por module_id nas companies
-- 3) Sincronizar module_id nos registros de treino/testes de IA
-- =============================================================================

begin;

alter table public.companies add column if not exists module_id text not null default 'petshop';

update public.companies
set module_id = 'petshop'
where module_id is null or btrim(module_id) = '';

create index if not exists idx_companies_module_id
  on public.companies(module_id);

create index if not exists idx_companies_scope_lookup
  on public.companies(tenant_id, module_id, name, bot_name);

alter table public.ai_training_documents add column if not exists module_id text not null default 'petshop';
alter table public.ai_playground_runs add column if not exists module_id text not null default 'petshop';

update public.ai_training_documents d
set module_id = c.module_id
from public.companies c
where d.company_id = c.id
  and (d.module_id is null or btrim(d.module_id) = '');

update public.ai_playground_runs r
set module_id = c.module_id
from public.companies c
where r.company_id = c.id
  and (r.module_id is null or btrim(r.module_id) = '');

do $$
declare
  v_tenant uuid;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'system_update_logs'
  ) then
    select t.id
    into v_tenant
    from public.tenants t
    where t.active = true
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
    values (
      v_tenant,
      'system',
      'infra',
      'success',
      'changelog',
      'Upgrade IA Lab: selecao modulo/empresa/bot',
      'companies passou a usar module_id e o contexto automatico de clientes/produtos foi preparado por escopo operacional.',
      'milestone-yui-ai-module-bot-upgrade-20260403',
      now()
    )
    on conflict (fingerprint) do nothing;
  end if;
end $$;

commit;
