-- =============================================================================
-- YuiSync PetShop Growth Suite (6 frentes)
-- =============================================================================
-- 1) Agendamento online
-- 2) Protecao no-show
-- 3) Report card de atendimento
-- 4) Leads e abandono de agendamento
-- 5) Portal do cliente
-- 6) Dashboard executivo
--
-- Execute apos:
-- - DATABASE.sql
-- - security_hardening.sql
-- - multi_tenant_instances.sql
-- =============================================================================

begin;

create extension if not exists pgcrypto;

create or replace function public.yui_growth_has_access(check_module_id text, check_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if to_regprocedure('public.has_module_tenant_access(text,uuid)') is not null then
    return public.has_module_tenant_access(check_module_id, check_tenant_id);
  end if;

  if to_regprocedure('public.has_module_access(text)') is not null then
    return public.has_module_access(check_module_id);
  end if;

  return false;
end;
$$;

create or replace function public.yui_growth_is_admin(check_module_id text, check_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if to_regprocedure('public.is_module_tenant_admin(text,uuid)') is not null then
    return public.is_module_tenant_admin(check_module_id, check_tenant_id);
  end if;

  if to_regprocedure('public.is_module_admin(text)') is not null then
    return public.is_module_admin(check_module_id);
  end if;

  return false;
end;
$$;

create table if not exists public.petshop_growth_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null default 'petshop',
  client_id uuid references public.clients(id) on delete set null,
  source text not null default 'manual',
  stage text not null default 'new' check (stage in ('new', 'contacted', 'proposal', 'won', 'lost')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  owner_name text not null,
  pet_name text,
  phone text,
  interest text,
  notes text,
  next_followup_at timestamptz,
  last_contact_at timestamptz,
  converted_sale_id uuid references public.sales(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.petshop_growth_booking_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null default 'petshop',
  enabled boolean not null default true,
  public_slug text not null,
  allow_whatsapp_fallback boolean not null default true,
  lead_expiration_hours integer not null default 6,
  intake_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, module_id),
  unique (public_slug)
);

create table if not exists public.petshop_growth_booking_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null default 'petshop',
  client_id uuid references public.clients(id) on delete set null,
  lead_id uuid references public.petshop_growth_leads(id) on delete set null,
  channel text not null default 'manual',
  customer_name text not null,
  pet_name text,
  phone text,
  service_interest text,
  preferred_date date,
  preferred_period text,
  status text not null default 'pending' check (status in ('pending', 'contacted', 'scheduled', 'cancelled', 'lost')),
  notes text,
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.petshop_growth_no_show_policy (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null default 'petshop',
  require_prepayment boolean not null default false,
  prepayment_amount numeric(10, 2) not null default 0,
  grace_minutes integer not null default 15,
  max_strikes integer not null default 2,
  auto_block_days integer not null default 30,
  reminder_minutes_before integer not null default 90,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, module_id)
);

create table if not exists public.petshop_growth_no_show_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null default 'petshop',
  appointment_id uuid references public.appointments(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  event_type text not null check (event_type in ('no_show', 'late_cancel', 'recovered', 'fee_paid')),
  fee_amount numeric(10, 2) not null default 0,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.petshop_growth_report_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null default 'petshop',
  appointment_id uuid references public.appointments(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  pet_name text,
  summary text not null,
  care_tips text,
  recommended_services jsonb not null default '[]'::jsonb,
  next_visit_date date,
  delivery_channel text not null default 'whatsapp',
  delivered boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.petshop_growth_portal_access (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null default 'petshop',
  client_id uuid not null references public.clients(id) on delete cascade,
  portal_token text not null unique,
  status text not null default 'active' check (status in ('active', 'paused', 'revoked')),
  invited_at timestamptz,
  last_access_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, module_id, client_id)
);

create or replace function public.create_petshop_booking_request(
  p_slug text,
  p_customer_name text,
  p_pet_name text default null,
  p_phone text default null,
  p_service_interest text default null,
  p_preferred_date date default null,
  p_preferred_period text default null,
  p_notes text default null,
  p_channel text default 'site'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_setting record;
  v_request_id uuid;
begin
  select tenant_id, module_id, enabled
  into v_setting
  from public.petshop_growth_booking_settings
  where public_slug = p_slug
  limit 1;

  if v_setting is null then
    raise exception 'Link de agendamento nao encontrado.';
  end if;

  if coalesce(v_setting.enabled, false) = false then
    raise exception 'Agendamento online indisponivel no momento.';
  end if;

  insert into public.petshop_growth_booking_requests (
    tenant_id,
    module_id,
    channel,
    customer_name,
    pet_name,
    phone,
    service_interest,
    preferred_date,
    preferred_period,
    status,
    notes
  )
  values (
    v_setting.tenant_id,
    v_setting.module_id,
    coalesce(nullif(p_channel, ''), 'site'),
    p_customer_name,
    nullif(p_pet_name, ''),
    nullif(p_phone, ''),
    nullif(p_service_interest, ''),
    p_preferred_date,
    nullif(p_preferred_period, ''),
    'pending',
    nullif(p_notes, '')
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

grant execute on function public.create_petshop_booking_request(
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text
) to anon, authenticated;

create or replace function public.get_petshop_portal_snapshot(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access public.petshop_growth_portal_access%rowtype;
  v_client public.clients%rowtype;
  v_next_appointments jsonb := '[]'::jsonb;
  v_balance numeric := 0;
begin
  select *
  into v_access
  from public.petshop_growth_portal_access
  where portal_token = p_token
  limit 1;

  if v_access is null then
    raise exception 'Portal nao encontrado.';
  end if;

  if v_access.status <> 'active' then
    raise exception 'Portal indisponivel no momento.';
  end if;

  if v_access.expires_at is not null and v_access.expires_at < now() then
    raise exception 'Portal expirado.';
  end if;

  update public.petshop_growth_portal_access
  set last_access_at = now(),
      updated_at = now()
  where id = v_access.id;

  select *
  into v_client
  from public.clients
  where id = v_access.client_id
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'scheduled_at', a.scheduled_at,
        'service_type', a.service_type,
        'status', a.status
      )
      order by a.scheduled_at asc
    ),
    '[]'::jsonb
  )
  into v_next_appointments
  from (
    select a.scheduled_at, a.service_type, a.status
    from public.appointments a
    where a.client_id = v_access.client_id
      and a.module_id = v_access.module_id
      and a.tenant_id = v_access.tenant_id
      and a.scheduled_at >= now()
    order by a.scheduled_at asc
    limit 5
  ) a;

  if to_regclass('public.client_loyalty_balance') is not null then
    select coalesce(balance, 0)
    into v_balance
    from public.client_loyalty_balance
    where client_id = v_access.client_id
      and module_id = v_access.module_id
    limit 1;
  end if;

  return jsonb_build_object(
    'tenant_id', v_access.tenant_id,
    'module_id', v_access.module_id,
    'client_id', v_access.client_id,
    'owner_name', coalesce(v_client.name, ''),
    'pet_name', coalesce(v_client.details ->> 'pet_name', v_client.name, ''),
    'phone', coalesce(v_client.phone, ''),
    'email', coalesce(v_client.email, ''),
    'next_appointments', v_next_appointments,
    'loyalty_balance', coalesce(v_balance, 0)
  );
end;
$$;

grant execute on function public.get_petshop_portal_snapshot(text) to anon, authenticated;

create index if not exists idx_pg_leads_tenant_module_stage
  on public.petshop_growth_leads (tenant_id, module_id, stage, created_at desc);

create index if not exists idx_pg_booking_requests_tenant_module_status
  on public.petshop_growth_booking_requests (tenant_id, module_id, status, created_at desc);

create index if not exists idx_pg_no_show_events_tenant_module_created
  on public.petshop_growth_no_show_events (tenant_id, module_id, created_at desc);

create index if not exists idx_pg_report_cards_tenant_module_created
  on public.petshop_growth_report_cards (tenant_id, module_id, created_at desc);

create index if not exists idx_pg_portal_access_tenant_module_status
  on public.petshop_growth_portal_access (tenant_id, module_id, status, updated_at desc);

create or replace view public.petshop_growth_exec_daily as
with sales_daily as (
  select
    s.tenant_id,
    s.module_id,
    ((s.created_at at time zone 'America/Sao_Paulo')::date) as ref_date,
    count(*)::int as total_sales,
    coalesce(sum(s.total_price), 0)::numeric(12, 2) as total_revenue
  from public.sales s
  where coalesce(s.status, '') = 'concluido'
  group by s.tenant_id, s.module_id, ((s.created_at at time zone 'America/Sao_Paulo')::date)
),
leads_daily as (
  select
    l.tenant_id,
    l.module_id,
    ((l.created_at at time zone 'America/Sao_Paulo')::date) as ref_date,
    count(*)::int as new_leads,
    count(*) filter (where l.stage = 'won')::int as leads_won
  from public.petshop_growth_leads l
  group by l.tenant_id, l.module_id, ((l.created_at at time zone 'America/Sao_Paulo')::date)
),
bookings_daily as (
  select
    b.tenant_id,
    b.module_id,
    ((b.created_at at time zone 'America/Sao_Paulo')::date) as ref_date,
    count(*)::int as bookings_created,
    count(*) filter (where b.status = 'scheduled')::int as bookings_scheduled
  from public.petshop_growth_booking_requests b
  group by b.tenant_id, b.module_id, ((b.created_at at time zone 'America/Sao_Paulo')::date)
),
noshow_daily as (
  select
    e.tenant_id,
    e.module_id,
    ((e.created_at at time zone 'America/Sao_Paulo')::date) as ref_date,
    count(*) filter (where e.event_type in ('no_show', 'late_cancel'))::int as no_show_count
  from public.petshop_growth_no_show_events e
  group by e.tenant_id, e.module_id, ((e.created_at at time zone 'America/Sao_Paulo')::date)
),
report_daily as (
  select
    r.tenant_id,
    r.module_id,
    ((r.created_at at time zone 'America/Sao_Paulo')::date) as ref_date,
    count(*) filter (where r.delivered = true)::int as report_cards_sent
  from public.petshop_growth_report_cards r
  group by r.tenant_id, r.module_id, ((r.created_at at time zone 'America/Sao_Paulo')::date)
),
all_dates as (
  select tenant_id, module_id, ref_date from sales_daily
  union
  select tenant_id, module_id, ref_date from leads_daily
  union
  select tenant_id, module_id, ref_date from bookings_daily
  union
  select tenant_id, module_id, ref_date from noshow_daily
  union
  select tenant_id, module_id, ref_date from report_daily
)
select
  d.tenant_id,
  d.module_id,
  d.ref_date,
  coalesce(s.total_sales, 0) as total_sales,
  coalesce(s.total_revenue, 0)::numeric(12, 2) as total_revenue,
  coalesce(l.new_leads, 0) as new_leads,
  coalesce(l.leads_won, 0) as leads_won,
  coalesce(b.bookings_created, 0) as bookings_created,
  coalesce(b.bookings_scheduled, 0) as bookings_scheduled,
  coalesce(n.no_show_count, 0) as no_show_count,
  coalesce(r.report_cards_sent, 0) as report_cards_sent
from all_dates d
left join sales_daily s on s.tenant_id = d.tenant_id and s.module_id = d.module_id and s.ref_date = d.ref_date
left join leads_daily l on l.tenant_id = d.tenant_id and l.module_id = d.module_id and l.ref_date = d.ref_date
left join bookings_daily b on b.tenant_id = d.tenant_id and b.module_id = d.module_id and b.ref_date = d.ref_date
left join noshow_daily n on n.tenant_id = d.tenant_id and n.module_id = d.module_id and n.ref_date = d.ref_date
left join report_daily r on r.tenant_id = d.tenant_id and r.module_id = d.module_id and r.ref_date = d.ref_date;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'petshop_growth_leads',
    'petshop_growth_booking_settings',
    'petshop_growth_booking_requests',
    'petshop_growth_no_show_policy',
    'petshop_growth_no_show_events',
    'petshop_growth_report_cards',
    'petshop_growth_portal_access'
  ]
  loop
    execute format('alter table public.%I enable row level security;', table_name);
  end loop;
end;
$$;

do $$
begin
  if to_regprocedure('public.set_tenant_id_from_context()') is not null then
    drop trigger if exists trg_set_tenant_petshop_growth_leads on public.petshop_growth_leads;
    create trigger trg_set_tenant_petshop_growth_leads
      before insert on public.petshop_growth_leads
      for each row execute function public.set_tenant_id_from_context();

    drop trigger if exists trg_set_tenant_petshop_growth_booking_settings on public.petshop_growth_booking_settings;
    create trigger trg_set_tenant_petshop_growth_booking_settings
      before insert on public.petshop_growth_booking_settings
      for each row execute function public.set_tenant_id_from_context();

    drop trigger if exists trg_set_tenant_petshop_growth_booking_requests on public.petshop_growth_booking_requests;
    create trigger trg_set_tenant_petshop_growth_booking_requests
      before insert on public.petshop_growth_booking_requests
      for each row execute function public.set_tenant_id_from_context();

    drop trigger if exists trg_set_tenant_petshop_growth_no_show_policy on public.petshop_growth_no_show_policy;
    create trigger trg_set_tenant_petshop_growth_no_show_policy
      before insert on public.petshop_growth_no_show_policy
      for each row execute function public.set_tenant_id_from_context();

    drop trigger if exists trg_set_tenant_petshop_growth_no_show_events on public.petshop_growth_no_show_events;
    create trigger trg_set_tenant_petshop_growth_no_show_events
      before insert on public.petshop_growth_no_show_events
      for each row execute function public.set_tenant_id_from_context();

    drop trigger if exists trg_set_tenant_petshop_growth_report_cards on public.petshop_growth_report_cards;
    create trigger trg_set_tenant_petshop_growth_report_cards
      before insert on public.petshop_growth_report_cards
      for each row execute function public.set_tenant_id_from_context();

    drop trigger if exists trg_set_tenant_petshop_growth_portal_access on public.petshop_growth_portal_access;
    create trigger trg_set_tenant_petshop_growth_portal_access
      before insert on public.petshop_growth_portal_access
      for each row execute function public.set_tenant_id_from_context();
  end if;
end;
$$;

drop policy if exists "Petshop growth leads select" on public.petshop_growth_leads;
drop policy if exists "Petshop growth leads insert" on public.petshop_growth_leads;
drop policy if exists "Petshop growth leads update" on public.petshop_growth_leads;
drop policy if exists "Petshop growth leads delete" on public.petshop_growth_leads;
create policy "Petshop growth leads select"
on public.petshop_growth_leads for select
using (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth leads insert"
on public.petshop_growth_leads for insert
with check (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth leads update"
on public.petshop_growth_leads for update
using (public.yui_growth_has_access(module_id, tenant_id))
with check (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth leads delete"
on public.petshop_growth_leads for delete
using (public.yui_growth_is_admin(module_id, tenant_id));

drop policy if exists "Petshop growth booking settings select" on public.petshop_growth_booking_settings;
drop policy if exists "Petshop growth booking settings insert" on public.petshop_growth_booking_settings;
drop policy if exists "Petshop growth booking settings update" on public.petshop_growth_booking_settings;
drop policy if exists "Petshop growth booking settings delete" on public.petshop_growth_booking_settings;
create policy "Petshop growth booking settings select"
on public.petshop_growth_booking_settings for select
using (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth booking settings insert"
on public.petshop_growth_booking_settings for insert
with check (public.yui_growth_is_admin(module_id, tenant_id));
create policy "Petshop growth booking settings update"
on public.petshop_growth_booking_settings for update
using (public.yui_growth_is_admin(module_id, tenant_id))
with check (public.yui_growth_is_admin(module_id, tenant_id));
create policy "Petshop growth booking settings delete"
on public.petshop_growth_booking_settings for delete
using (public.yui_growth_is_admin(module_id, tenant_id));

drop policy if exists "Petshop growth booking requests select" on public.petshop_growth_booking_requests;
drop policy if exists "Petshop growth booking requests insert" on public.petshop_growth_booking_requests;
drop policy if exists "Petshop growth booking requests update" on public.petshop_growth_booking_requests;
drop policy if exists "Petshop growth booking requests delete" on public.petshop_growth_booking_requests;
create policy "Petshop growth booking requests select"
on public.petshop_growth_booking_requests for select
using (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth booking requests insert"
on public.petshop_growth_booking_requests for insert
with check (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth booking requests update"
on public.petshop_growth_booking_requests for update
using (public.yui_growth_has_access(module_id, tenant_id))
with check (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth booking requests delete"
on public.petshop_growth_booking_requests for delete
using (public.yui_growth_is_admin(module_id, tenant_id));

drop policy if exists "Petshop growth no-show policy select" on public.petshop_growth_no_show_policy;
drop policy if exists "Petshop growth no-show policy insert" on public.petshop_growth_no_show_policy;
drop policy if exists "Petshop growth no-show policy update" on public.petshop_growth_no_show_policy;
drop policy if exists "Petshop growth no-show policy delete" on public.petshop_growth_no_show_policy;
create policy "Petshop growth no-show policy select"
on public.petshop_growth_no_show_policy for select
using (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth no-show policy insert"
on public.petshop_growth_no_show_policy for insert
with check (public.yui_growth_is_admin(module_id, tenant_id));
create policy "Petshop growth no-show policy update"
on public.petshop_growth_no_show_policy for update
using (public.yui_growth_is_admin(module_id, tenant_id))
with check (public.yui_growth_is_admin(module_id, tenant_id));
create policy "Petshop growth no-show policy delete"
on public.petshop_growth_no_show_policy for delete
using (public.yui_growth_is_admin(module_id, tenant_id));

drop policy if exists "Petshop growth no-show events select" on public.petshop_growth_no_show_events;
drop policy if exists "Petshop growth no-show events insert" on public.petshop_growth_no_show_events;
drop policy if exists "Petshop growth no-show events update" on public.petshop_growth_no_show_events;
drop policy if exists "Petshop growth no-show events delete" on public.petshop_growth_no_show_events;
create policy "Petshop growth no-show events select"
on public.petshop_growth_no_show_events for select
using (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth no-show events insert"
on public.petshop_growth_no_show_events for insert
with check (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth no-show events update"
on public.petshop_growth_no_show_events for update
using (public.yui_growth_has_access(module_id, tenant_id))
with check (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth no-show events delete"
on public.petshop_growth_no_show_events for delete
using (public.yui_growth_is_admin(module_id, tenant_id));

drop policy if exists "Petshop growth report cards select" on public.petshop_growth_report_cards;
drop policy if exists "Petshop growth report cards insert" on public.petshop_growth_report_cards;
drop policy if exists "Petshop growth report cards update" on public.petshop_growth_report_cards;
drop policy if exists "Petshop growth report cards delete" on public.petshop_growth_report_cards;
create policy "Petshop growth report cards select"
on public.petshop_growth_report_cards for select
using (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth report cards insert"
on public.petshop_growth_report_cards for insert
with check (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth report cards update"
on public.petshop_growth_report_cards for update
using (public.yui_growth_has_access(module_id, tenant_id))
with check (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth report cards delete"
on public.petshop_growth_report_cards for delete
using (public.yui_growth_is_admin(module_id, tenant_id));

drop policy if exists "Petshop growth portal access select" on public.petshop_growth_portal_access;
drop policy if exists "Petshop growth portal access insert" on public.petshop_growth_portal_access;
drop policy if exists "Petshop growth portal access update" on public.petshop_growth_portal_access;
drop policy if exists "Petshop growth portal access delete" on public.petshop_growth_portal_access;
create policy "Petshop growth portal access select"
on public.petshop_growth_portal_access for select
using (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth portal access insert"
on public.petshop_growth_portal_access for insert
with check (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth portal access update"
on public.petshop_growth_portal_access for update
using (public.yui_growth_has_access(module_id, tenant_id))
with check (public.yui_growth_has_access(module_id, tenant_id));
create policy "Petshop growth portal access delete"
on public.petshop_growth_portal_access for delete
using (public.yui_growth_is_admin(module_id, tenant_id));

insert into public.petshop_growth_booking_settings (
  tenant_id,
  module_id,
  enabled,
  public_slug,
  allow_whatsapp_fallback,
  lead_expiration_hours,
  intake_message
)
select
  t.id,
  'petshop',
  true,
  concat('agenda-', left(replace(t.id::text, '-', ''), 8)),
  true,
  6,
  'Compartilhe nome do tutor, pet e servico desejado para reservarmos seu horario.'
from public.tenants t
on conflict (tenant_id, module_id) do nothing;

insert into public.petshop_growth_no_show_policy (
  tenant_id,
  module_id,
  require_prepayment,
  prepayment_amount,
  grace_minutes,
  max_strikes,
  auto_block_days,
  reminder_minutes_before
)
select
  t.id,
  'petshop',
  false,
  0,
  15,
  2,
  30,
  90
from public.tenants t
on conflict (tenant_id, module_id) do nothing;

do $$
declare
  v_tenant uuid;
begin
  if to_regclass('public.system_update_logs') is not null then
    select id into v_tenant from public.tenants order by created_at asc limit 1;

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
      'petshop',
      'operacao',
      'success',
      'changelog',
      'Growth Suite PetShop com 6 frentes',
      'Crescimento CRM agora inclui agendamento online, no-show, report card, leads, portal do cliente e dashboard executivo.',
      'milestone-petshop-growth-suite-20260404',
      now()
    )
    on conflict (fingerprint) do nothing;
  end if;
end;
$$;

commit;
