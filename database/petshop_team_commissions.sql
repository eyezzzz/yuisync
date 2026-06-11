begin;

alter table public.profiles
  add column if not exists staff_type text;

update public.profiles
set staff_type = 'funcionario'
where coalesce(staff_type, '') = '';

alter table public.profiles
  alter column staff_type set default 'funcionario';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_staff_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      drop constraint profiles_staff_type_check;
  end if;

  alter table public.profiles
    add constraint profiles_staff_type_check
    check (staff_type in ('funcionario', 'banho_tosa', 'veterinaria', 'motodog', 'vendedor_caixa', 'gerente'));
exception
  when duplicate_object then
    null;
end;
$$;

create index if not exists idx_profiles_staff_type
  on public.profiles (staff_type);

create table if not exists public.petshop_services (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references public.tenants(id),
  module_id text not null default 'petshop',
  code text not null,
  name text not null,
  group_type text not null default 'banho_tosa',
  default_price numeric(10, 2) not null default 0,
  default_duration_min integer not null default 60,
  commission_type text not null default 'percentage',
  commission_rate numeric(10, 2) not null default 0,
  active boolean not null default true,
  sort_order integer not null default 999,
  icon text default 'paw',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint petshop_services_group_check check (group_type in ('banho_tosa', 'veterinaria', 'motoboy', 'outro')),
  constraint petshop_services_commission_type_check check (commission_type in ('percentage', 'fixed')),
  constraint petshop_services_code_not_blank check (length(trim(code)) > 0),
  constraint petshop_services_name_not_blank check (length(trim(name)) > 0)
);

create unique index if not exists idx_petshop_services_tenant_module_code
  on public.petshop_services (tenant_id, module_id, code);

create index if not exists idx_petshop_services_tenant_module_active
  on public.petshop_services (tenant_id, module_id, active, sort_order);

drop trigger if exists trg_set_tenant_petshop_services on public.petshop_services;
create trigger trg_set_tenant_petshop_services before insert on public.petshop_services
for each row execute function public.set_tenant_id_from_context();

alter table public.commission_rules
  add column if not exists scope text,
  add column if not exists service_code text,
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists category text,
  add column if not exists priority integer not null default 0,
  add column if not exists active boolean not null default true,
  add column if not exists valid_from date,
  add column if not exists valid_until date;

update public.commission_rules
set scope = coalesce(nullif(scope, ''), nullif(applies_to, ''), 'all')
where scope is null or scope = '';

alter table public.commission_rules
  alter column scope set default 'all';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'commission_rules_scope_check'
      and conrelid = 'public.commission_rules'::regclass
  ) then
    alter table public.commission_rules
      drop constraint commission_rules_scope_check;
  end if;

  alter table public.commission_rules
    add constraint commission_rules_scope_check
    check (scope in ('all', 'services', 'service', 'sale', 'category', 'product', 'motoboy'));
exception
  when duplicate_object then
    null;
end;
$$;

create index if not exists idx_commission_rules_match_v2
  on public.commission_rules (tenant_id, module_id, profile_id, active, scope, service_code, category, product_id);

with seed(code, name, group_type, default_price, default_duration_min, commission_type, commission_rate, sort_order, icon) as (
  values
    ('banho', 'Banho', 'banho_tosa', 60::numeric, 60, 'percentage', 5::numeric, 10, 'droplets'),
    ('tosa', 'Tosa', 'banho_tosa', 80::numeric, 60, 'percentage', 10::numeric, 20, 'scissors'),
    ('banho_e_tosa', 'Banho e Tosa', 'banho_tosa', 120::numeric, 90, 'percentage', 10::numeric, 30, 'scissors'),
    ('escovacao', 'Escovacao', 'banho_tosa', 40::numeric, 45, 'percentage', 7::numeric, 40, 'paw'),
    ('consulta', 'Consulta Veterinaria', 'veterinaria', 120::numeric, 40, 'percentage', 0::numeric, 50, 'stethoscope'),
    ('veterinario', 'Veterinario', 'veterinaria', 150::numeric, 40, 'percentage', 0::numeric, 60, 'stethoscope'),
    ('vacina', 'Vacina', 'veterinaria', 90::numeric, 30, 'percentage', 0::numeric, 70, 'syringe'),
    ('motoboy', 'Motoboy/Transporte', 'motoboy', 20::numeric, 30, 'fixed', 5::numeric, 80, 'bike'),
    ('outro', 'Outro', 'outro', 0::numeric, 60, 'percentage', 0::numeric, 999, 'paw')
)
insert into public.petshop_services (
  tenant_id,
  module_id,
  code,
  name,
  group_type,
  default_price,
  default_duration_min,
  commission_type,
  commission_rate,
  sort_order,
  icon
)
select
  t.id,
  'petshop',
  seed.code,
  seed.name,
  seed.group_type,
  seed.default_price,
  seed.default_duration_min,
  seed.commission_type,
  seed.commission_rate,
  seed.sort_order,
  seed.icon
from public.tenants t
cross join seed
where t.active = true
on conflict (tenant_id, module_id, code) do nothing;

alter table public.petshop_services enable row level security;

drop policy if exists "Petshop services select" on public.petshop_services;
drop policy if exists "Petshop services insert" on public.petshop_services;
drop policy if exists "Petshop services update" on public.petshop_services;
drop policy if exists "Petshop services delete" on public.petshop_services;

create policy "Petshop services select"
on public.petshop_services for select
using (public.has_module_tenant_access(module_id, tenant_id));

create policy "Petshop services insert"
on public.petshop_services for insert
with check (public.is_module_tenant_admin(module_id, tenant_id));

create policy "Petshop services update"
on public.petshop_services for update
using (public.is_module_tenant_admin(module_id, tenant_id))
with check (public.is_module_tenant_admin(module_id, tenant_id));

create policy "Petshop services delete"
on public.petshop_services for delete
using (public.is_module_tenant_admin(module_id, tenant_id));

create or replace function public.calculate_petshop_commissions_v2(
  p_module_id text,
  p_start timestamptz,
  p_end timestamptz,
  p_tenant_id uuid default null
)
returns table (
  profile_id uuid,
  collaborator_name text,
  service_count bigint,
  sales_count bigint,
  motoboy_count bigint,
  service_revenue numeric,
  sales_revenue numeric,
  motoboy_revenue numeric,
  service_commission numeric,
  sales_commission numeric,
  motoboy_commission numeric,
  total_commission numeric,
  detail jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with service_rows as (
    select
      a.id,
      a.groomer_id as profile_id,
      coalesce(a.price, 0)::numeric as revenue,
      coalesce(rule.rule_type, svc.commission_type, 'percentage') as rule_type,
      coalesce(rule.rule_rate, svc.commission_rate, 0)::numeric as rule_rate,
      coalesce(rule.rule_scope, 'service_default') as rule_scope
    from public.appointments a
    left join public.petshop_services svc
      on svc.module_id = a.module_id
     and svc.code = a.service_type
     and (p_tenant_id is null or svc.tenant_id = p_tenant_id)
    left join lateral (
      select
        cr.type as rule_type,
        cr.rate as rule_rate,
        cr.scope as rule_scope
      from public.commission_rules cr
      where cr.module_id = a.module_id
        and cr.profile_id = a.groomer_id
        and cr.active = true
        and (p_tenant_id is null or cr.tenant_id = p_tenant_id)
        and (cr.valid_from is null or cr.valid_from <= a.scheduled_at::date)
        and (cr.valid_until is null or cr.valid_until >= a.scheduled_at::date)
        and (
          cr.scope = 'all'
          or cr.scope = 'services'
          or (cr.scope = 'service' and cr.service_code = a.service_type)
          or (cr.scope = 'motoboy' and coalesce(svc.group_type, '') = 'motoboy')
        )
      order by
        case
          when cr.scope = 'service' and cr.service_code = a.service_type then 100
          when cr.scope = 'motoboy' and coalesce(svc.group_type, '') = 'motoboy' then 95
          when cr.scope = 'services' then 50
          when cr.scope = 'all' then 10
          else 0
        end desc,
        cr.priority desc,
        cr.created_at desc
      limit 1
    ) rule on true
    where a.module_id = p_module_id
      and a.groomer_id is not null
      and a.status = 'concluido'
      and a.scheduled_at >= p_start
      and a.scheduled_at <= p_end
      and (p_tenant_id is null or a.tenant_id = p_tenant_id)
  ),
  service_totals as (
    select
      profile_id,
      count(*)::bigint as service_count,
      coalesce(sum(revenue), 0)::numeric as service_revenue,
      coalesce(sum(
        case
          when rule_type = 'fixed' then rule_rate
          else revenue * (rule_rate / 100)
        end
      ), 0)::numeric as service_commission
    from service_rows
    group by profile_id
  ),
  sale_lines as (
    select
      s.id as sale_id,
      s.profile_id,
      si.quantity,
      si.subtotal::numeric as revenue,
      count(*) over (partition by s.id) as line_count,
      coalesce(rule.rule_type, 'percentage') as rule_type,
      coalesce(rule.rule_rate, 0)::numeric as rule_rate,
      coalesce(rule.rule_scope, 'none') as rule_scope
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
    left join public.products pr on pr.id = si.product_id
    left join lateral (
      select
        cr.type as rule_type,
        cr.rate as rule_rate,
        cr.scope as rule_scope
      from public.commission_rules cr
      where cr.module_id = s.module_id
        and cr.profile_id = s.profile_id
        and cr.active = true
        and (p_tenant_id is null or cr.tenant_id = p_tenant_id)
        and (cr.valid_from is null or cr.valid_from <= s.created_at::date)
        and (cr.valid_until is null or cr.valid_until >= s.created_at::date)
        and (
          cr.scope = 'all'
          or cr.scope = 'sale'
          or (cr.scope = 'product' and cr.product_id = si.product_id)
          or (cr.scope = 'category' and lower(coalesce(cr.category, '')) = lower(coalesce(pr.category, '')))
        )
      order by
        case
          when cr.scope = 'product' and cr.product_id = si.product_id then 100
          when cr.scope = 'category' and lower(coalesce(cr.category, '')) = lower(coalesce(pr.category, '')) then 90
          when cr.scope = 'sale' then 50
          when cr.scope = 'all' then 10
          else 0
        end desc,
        cr.priority desc,
        cr.created_at desc
      limit 1
    ) rule on true
    where s.module_id = p_module_id
      and s.profile_id is not null
      and s.status = 'concluido'
      and s.created_at >= p_start
      and s.created_at <= p_end
      and (p_tenant_id is null or s.tenant_id = p_tenant_id)
  ),
  sale_totals as (
    select
      profile_id,
      count(distinct sale_id)::bigint as sales_count,
      coalesce(sum(revenue), 0)::numeric as sales_revenue,
      coalesce(sum(
        case
          when rule_type = 'fixed' and rule_scope in ('sale', 'all') then rule_rate / nullif(line_count, 0)
          when rule_type = 'fixed' then coalesce(quantity, 1) * rule_rate
          else revenue * (rule_rate / 100)
        end
      ), 0)::numeric as sales_commission
    from sale_lines
    group by profile_id
  ),
  motoboy_rows as (
    select
      o.assigned_to as profile_id,
      coalesce(s.total_price, 0)::numeric as revenue,
      coalesce(rule.rule_type, svc.commission_type, 'fixed') as rule_type,
      coalesce(rule.rule_rate, svc.commission_rate, 5)::numeric as rule_rate
    from public.service_delivery_orders o
    left join public.sales s on s.id = o.sale_id
    left join public.petshop_services svc
      on svc.module_id = o.module_id
     and svc.code = 'motoboy'
     and (p_tenant_id is null or svc.tenant_id = p_tenant_id)
    left join lateral (
      select
        cr.type as rule_type,
        cr.rate as rule_rate
      from public.commission_rules cr
      where cr.module_id = o.module_id
        and cr.profile_id = o.assigned_to
        and cr.active = true
        and (p_tenant_id is null or cr.tenant_id = p_tenant_id)
        and (cr.valid_from is null or cr.valid_from <= o.updated_at::date)
        and (cr.valid_until is null or cr.valid_until >= o.updated_at::date)
        and cr.scope in ('motoboy', 'all')
      order by
        case when cr.scope = 'motoboy' then 100 else 10 end desc,
        cr.priority desc,
        cr.created_at desc
      limit 1
    ) rule on true
    where o.module_id = p_module_id
      and o.assigned_to is not null
      and o.status = 'concluida'
      and coalesce(o.updated_at, o.created_at) >= p_start
      and coalesce(o.updated_at, o.created_at) <= p_end
      and (p_tenant_id is null or o.tenant_id = p_tenant_id)
  ),
  motoboy_totals as (
    select
      profile_id,
      count(*)::bigint as motoboy_count,
      coalesce(sum(revenue), 0)::numeric as motoboy_revenue,
      coalesce(sum(
        case
          when rule_type = 'percentage' then revenue * (rule_rate / 100)
          else rule_rate
        end
      ), 0)::numeric as motoboy_commission
    from motoboy_rows
    group by profile_id
  ),
  profiles_with_activity as (
    select profile_id from service_totals
    union
    select profile_id from sale_totals
    union
    select profile_id from motoboy_totals
  )
  select
    p.id as profile_id,
    coalesce(p.full_name, p.email, 'Colaborador') as collaborator_name,
    coalesce(st.service_count, 0)::bigint as service_count,
    coalesce(sa.sales_count, 0)::bigint as sales_count,
    coalesce(mt.motoboy_count, 0)::bigint as motoboy_count,
    round(coalesce(st.service_revenue, 0), 2) as service_revenue,
    round(coalesce(sa.sales_revenue, 0), 2) as sales_revenue,
    round(coalesce(mt.motoboy_revenue, 0), 2) as motoboy_revenue,
    round(coalesce(st.service_commission, 0), 2) as service_commission,
    round(coalesce(sa.sales_commission, 0), 2) as sales_commission,
    round(coalesce(mt.motoboy_commission, 0), 2) as motoboy_commission,
    round(coalesce(st.service_commission, 0) + coalesce(sa.sales_commission, 0) + coalesce(mt.motoboy_commission, 0), 2) as total_commission,
    jsonb_build_object(
      'service_revenue', coalesce(st.service_revenue, 0),
      'sales_revenue', coalesce(sa.sales_revenue, 0),
      'motoboy_revenue', coalesce(mt.motoboy_revenue, 0)
    ) as detail
  from profiles_with_activity active
  join public.profiles p on p.id = active.profile_id
  left join service_totals st on st.profile_id = p.id
  left join sale_totals sa on sa.profile_id = p.id
  left join motoboy_totals mt on mt.profile_id = p.id
  order by total_commission desc, collaborator_name asc;
$$;

grant execute on function public.calculate_petshop_commissions_v2(text, timestamptz, timestamptz, uuid)
  to authenticated, service_role;

commit;
