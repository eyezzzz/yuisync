-- =============================================================================
-- YuiSync Core Bootstrap (minimalo + idempotente)
-- =============================================================================
-- Use este script quando o banco ainda nao possui tables do motor central:
-- - public.niches
-- - public.companies
-- =============================================================================

begin;

create extension if not exists "uuid-ossp";

create table if not exists public.niches (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  base_prompt text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid,
  module_id text not null default 'petshop',
  niche_id uuid not null references public.niches(id) on delete restrict,
  name text not null,
  system_prompt text not null,
  bot_name text not null default 'Yui',
  temperature numeric(3,2) not null default 0.70,
  model_name text not null default 'gpt-4o-mini',
  welcome_message text,
  kb_namespace text,
  is_active boolean not null default true,
  schedule_free_status text not null default 'available',
  schedule_booked_status text not null default 'booked',
  created_at timestamptz not null default now()
);

alter table public.companies add column if not exists schedule_free_status text not null default 'available';
alter table public.companies add column if not exists schedule_booked_status text not null default 'booked';
alter table public.companies add column if not exists module_id text not null default 'petshop';

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'tenants'
  ) then
    if not exists (
      select 1
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'companies'
        and constraint_name = 'companies_tenant_id_fkey'
    ) then
      alter table public.companies
        add constraint companies_tenant_id_fkey
        foreign key (tenant_id) references public.tenants(id) on delete set null;
    end if;
  end if;
end $$;

create index if not exists idx_companies_tenant_id on public.companies(tenant_id);
create index if not exists idx_companies_module_id on public.companies(module_id);
create index if not exists idx_companies_niche_id on public.companies(niche_id);
create index if not exists idx_companies_active on public.companies(is_active);

insert into public.niches (id, name, base_prompt)
values (
  '00000000-0000-0000-0000-000000000001',
  'pet_shop',
  $$
Voce atende um pet shop com foco em banho, tosa e servicos de rotina.
Fale em portugues do Brasil com simpatia e objetividade.
Sempre confirme nome do pet, servico e horario antes de finalizar.
$$
)
on conflict (id) do update
set
  name = excluded.name,
  base_prompt = excluded.base_prompt;

do $seed_company$
declare
  v_tenant uuid;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'tenants'
  ) then
    select t.id
    into v_tenant
    from public.tenants t
    where t.active = true
    order by t.created_at asc
    limit 1;
  else
    v_tenant := null;
  end if;

  insert into public.companies (
    id,
    tenant_id,
    module_id,
    niche_id,
    name,
    system_prompt,
    bot_name,
    temperature,
    model_name,
    welcome_message,
    kb_namespace,
    is_active,
    schedule_free_status,
    schedule_booked_status
  )
  values (
    '00000000-0000-0000-0000-000000000002',
    v_tenant,
    'petshop',
    '00000000-0000-0000-0000-000000000001',
    'QuatroPatas PetVet',
    $company_prompt$
Voce e a Luma, assistente oficial da QuatroPatas PetVet.
Sempre priorize clareza, cordialidade e seguranca.
Nunca invente horarios. Use apenas os horarios disponiveis no contexto.
$company_prompt$,
    'Luma',
    0.70,
    'gpt-4o-mini',
    'Ola. Eu sou a Luma da QuatroPatas PetVet. Posso te ajudar com horarios e servicos.',
    'quatropatas-petvet',
    true,
    'available',
    'booked'
  )
  on conflict (id) do update
  set
    tenant_id = excluded.tenant_id,
    module_id = excluded.module_id,
    niche_id = excluded.niche_id,
    name = excluded.name,
    system_prompt = excluded.system_prompt,
    bot_name = excluded.bot_name,
    temperature = excluded.temperature,
    model_name = excluded.model_name,
    welcome_message = excluded.welcome_message,
    kb_namespace = excluded.kb_namespace,
    is_active = excluded.is_active,
    schedule_free_status = excluded.schedule_free_status,
    schedule_booked_status = excluded.schedule_booked_status;
end $seed_company$;

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
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'companies'
    ) then
      select c.tenant_id
      into v_tenant
      from public.companies c
      where c.id = '00000000-0000-0000-0000-000000000002';
    end if;

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
      'Bootstrap do motor central YuiSync aplicado',
      'Tabelas niches e companies com seeds iniciais foram criadas/atualizadas para habilitar o motor central.',
      'milestone-yui-core-bootstrap-20260403',
      now()
    )
    on conflict (fingerprint) do nothing;
  end if;
end $$;

commit;
