-- =============================================================================
-- YuiSync Petshop Advanced Features
-- =============================================================================
-- Aplique este arquivo depois de DATABASE.sql e security_hardening.sql
-- no projeto atual.
-- =============================================================================

begin;

alter table public.appointments
  add column if not exists duration_min integer default 60,
  add column if not exists employee_id uuid references public.profiles(id) on delete set null,
  add column if not exists groomer_id uuid references public.profiles(id) on delete set null,
  add column if not exists live_status text default 'aguardando',
  add column if not exists checkin_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists subscription_id uuid,
  add column if not exists subscription_benefit_used boolean default false;

alter table public.sales
  add column if not exists fulfillment_type text default 'balcao';

create table if not exists public.subscription_plans (
  id uuid primary key default uuid_generate_v4(),
  module_id text not null,
  name text not null,
  price decimal(10, 2) not null,
  billing_cycle text default 'monthly',
  services jsonb not null default '[]'::jsonb,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.client_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  module_id text not null,
  plan_id uuid references public.subscription_plans(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  status text default 'active',
  next_billing_date date,
  services_used jsonb default '{}'::jsonb,
  started_at date default current_date,
  cancelled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.appointments
  drop constraint if exists appointments_subscription_id_fkey;

alter table public.appointments
  add constraint appointments_subscription_id_fkey
  foreign key (subscription_id) references public.client_subscriptions(id) on delete set null;

create table if not exists public.loyalty_settings (
  module_id text primary key,
  points_per_real decimal(10, 2) default 1,
  points_per_service integer default 10,
  redemption_rate decimal(10, 2) default 100,
  expiry_days integer default 365,
  updated_at timestamptz default now()
);

create table if not exists public.loyalty_points (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references public.clients(id) on delete cascade,
  module_id text not null,
  points integer not null,
  reason text,
  reference_id uuid,
  expires_at date,
  created_at timestamptz default now()
);

create or replace view public.client_loyalty_balance as
select
  client_id,
  module_id,
  coalesce(sum(points), 0) as balance
from public.loyalty_points
where expires_at is null or expires_at >= current_date
group by client_id, module_id;

create table if not exists public.commission_rules (
  id uuid primary key default uuid_generate_v4(),
  module_id text not null,
  profile_id uuid references public.profiles(id) on delete cascade,
  type text default 'percentage',
  rate decimal(10, 2) not null,
  applies_to text default 'all',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.cash_register (
  id uuid primary key default uuid_generate_v4(),
  module_id text not null,
  opened_by uuid references public.profiles(id) on delete set null,
  closed_by uuid references public.profiles(id) on delete set null,
  opening_balance decimal(10, 2) default 0,
  closing_balance decimal(10, 2),
  expected_balance decimal(10, 2),
  difference decimal(10, 2),
  opened_at timestamptz default now(),
  closed_at timestamptz,
  notes text
);

create table if not exists public.petshop_campaign_logs (
  id uuid primary key default uuid_generate_v4(),
  module_id text not null,
  client_id uuid references public.clients(id) on delete set null,
  campaign_type text not null,
  audience_name text,
  message text not null,
  status text default 'queued',
  created_at timestamptz default now(),
  sent_at timestamptz
);

create table if not exists public.service_delivery_orders (
  id uuid primary key default uuid_generate_v4(),
  module_id text not null,
  sale_id uuid references public.sales(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  session_id uuid references public.chat_sessions(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  source text default 'whatsapp',
  order_type text not null default 'entrega',
  status text default 'pendente',
  scheduled_for timestamptz,
  delivery_address text,
  delivery_neighborhood text,
  delivery_city text,
  contact_phone text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_subscription_plans_module_id on public.subscription_plans (module_id);
create index if not exists idx_client_subscriptions_module_id on public.client_subscriptions (module_id);
create index if not exists idx_client_subscriptions_client_id on public.client_subscriptions (client_id);
create index if not exists idx_loyalty_points_module_client on public.loyalty_points (module_id, client_id);
create index if not exists idx_commission_rules_module_profile on public.commission_rules (module_id, profile_id);
create index if not exists idx_cash_register_module_opened_at on public.cash_register (module_id, opened_at desc);
create index if not exists idx_petshop_campaign_logs_module_created_at on public.petshop_campaign_logs (module_id, created_at desc);
create index if not exists idx_appointments_module_live_status on public.appointments (module_id, live_status, scheduled_at);
create index if not exists idx_service_delivery_orders_module_status on public.service_delivery_orders (module_id, status, created_at desc);
create unique index if not exists idx_service_delivery_orders_sale_id_unique
  on public.service_delivery_orders (sale_id)
  where sale_id is not null;

alter table public.invoices
  add column if not exists sale_id uuid references public.sales(id) on delete set null;

create unique index if not exists idx_invoices_sale_id_unique
  on public.invoices (sale_id)
  where sale_id is not null;

insert into public.loyalty_settings (module_id)
values ('petshop')
on conflict (module_id) do nothing;

create or replace function public.award_loyalty_for_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points integer := 0;
  v_expiry_days integer := 365;
  v_points_per_real numeric := 1;
  v_points_per_service integer := 10;
begin
  if new.client_id is null or coalesce(new.status, '') <> 'concluido' then
    return new;
  end if;

  if exists (
    select 1
    from public.loyalty_points
    where module_id = new.module_id
      and reference_id = new.id
      and reason = 'compra'
  ) then
    return new;
  end if;

  select
    coalesce(points_per_real, 1),
    coalesce(points_per_service, 10),
    coalesce(expiry_days, 365)
  into
    v_points_per_real,
    v_points_per_service,
    v_expiry_days
  from public.loyalty_settings
  where module_id = new.module_id;

  v_points := floor(coalesce(new.total_price, 0) * v_points_per_real);

  if coalesce(new.source, '') = 'agenda' then
    v_points := v_points + v_points_per_service;
  end if;

  if v_points <> 0 then
    insert into public.loyalty_points (
      client_id,
      module_id,
      points,
      reason,
      reference_id,
      expires_at
    )
    values (
      new.client_id,
      new.module_id,
      v_points,
      'compra',
      new.id,
      current_date + v_expiry_days
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_award_loyalty_for_sale on public.sales;
create trigger trg_award_loyalty_for_sale
  after insert on public.sales
  for each row
  execute function public.award_loyalty_for_sale();

create or replace function public.sync_invoice_for_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.status, '') <> 'concluido' then
    return new;
  end if;

  if exists (
    select 1
    from public.invoices
    where sale_id = new.id
  ) then
    return new;
  end if;

  insert into public.invoices (
    module_id,
    sale_id,
    status,
    amount,
    due_date,
    paid_at,
    notes,
    customer_phone,
    updated_at
  )
  values (
    new.module_id,
    new.id,
    'paid',
    coalesce(new.total_price, 0),
    current_date,
    coalesce(new.created_at, now()),
    concat('Venda PDV #', left(new.id::text, 8), coalesce(' - ' || new.customer_name, '')),
    new.customer_phone,
    now()
  );

  return new;
end;
$$;

drop trigger if exists trg_sync_invoice_for_sale on public.sales;
create trigger trg_sync_invoice_for_sale
  after insert on public.sales
  for each row
  execute function public.sync_invoice_for_sale();

create or replace function public.sync_service_order_for_whatsapp_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.clients%rowtype;
  v_session_id uuid;
  v_order_type text;
  v_status text;
begin
  if coalesce(new.source, '') <> 'whatsapp' then
    return new;
  end if;

  v_order_type := case
    when coalesce(new.fulfillment_type, 'balcao') = 'servico' then 'servico'
    when coalesce(new.fulfillment_type, 'balcao') = 'entrega' then 'entrega'
    else null
  end;

  if v_order_type is null then
    return new;
  end if;

  if exists (
    select 1
    from public.service_delivery_orders
    where sale_id = new.id
  ) then
    return new;
  end if;

  if new.client_id is not null then
    select *
    into v_client
    from public.clients
    where id = new.client_id;
  end if;

  select id
  into v_session_id
  from public.chat_sessions
  where module_id = new.module_id
    and (
      (new.client_id is not null and client_id = new.client_id)
      or (new.customer_phone is not null and customer_phone = new.customer_phone)
    )
  order by last_message_at desc
  limit 1;

  v_status := case
    when v_order_type = 'servico' then 'agendado'
    else 'pendente'
  end;

  insert into public.service_delivery_orders (
    module_id,
    sale_id,
    client_id,
    session_id,
    source,
    order_type,
    status,
    delivery_address,
    delivery_neighborhood,
    delivery_city,
    contact_phone,
    notes,
    updated_at
  )
  values (
    new.module_id,
    new.id,
    new.client_id,
    v_session_id,
    'whatsapp',
    v_order_type,
    v_status,
    coalesce(v_client.address, null),
    coalesce(v_client.neighborhood, null),
    coalesce(v_client.city, null),
    coalesce(new.customer_phone, v_client.phone),
    new.notes,
    now()
  );

  return new;
end;
$$;

drop trigger if exists trg_sync_service_order_for_whatsapp_sale on public.sales;
create trigger trg_sync_service_order_for_whatsapp_sale
  after insert on public.sales
  for each row
  execute function public.sync_service_order_for_whatsapp_sale();

create or replace function public.calculate_commissions(
  p_module_id text,
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  profile_id uuid,
  groomer_name text,
  appointments_count bigint,
  revenue numeric,
  commission numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select
      a.groomer_id as profile_id,
      p.full_name as groomer_name,
      count(*)::bigint as appointments_count,
      coalesce(sum(a.price), 0)::numeric as revenue,
      coalesce(rule.type, 'percentage') as rule_type,
      coalesce(rule.rate, 0)::numeric as rule_rate
    from public.appointments a
    join public.profiles p
      on p.id = a.groomer_id
    left join lateral (
      select cr.type, cr.rate
      from public.commission_rules cr
      where cr.module_id = a.module_id
        and cr.profile_id = a.groomer_id
        and cr.applies_to in ('all', 'services')
      order by cr.created_at desc
      limit 1
    ) rule on true
    where a.module_id = p_module_id
      and a.groomer_id is not null
      and a.status = 'concluido'
      and a.scheduled_at >= p_start
      and a.scheduled_at <= p_end
    group by a.groomer_id, p.full_name, rule.type, rule.rate
  )
  select
    profile_id,
    groomer_name,
    appointments_count,
    revenue,
    case
      when rule_type = 'fixed' then round((appointments_count * rule_rate)::numeric, 2)
      else round((revenue * (rule_rate / 100))::numeric, 2)
    end as commission
  from scoped
  order by revenue desc, groomer_name asc;
$$;

alter table public.subscription_plans enable row level security;
alter table public.client_subscriptions enable row level security;
alter table public.loyalty_settings enable row level security;
alter table public.loyalty_points enable row level security;
alter table public.commission_rules enable row level security;
alter table public.cash_register enable row level security;
alter table public.petshop_campaign_logs enable row level security;
alter table public.service_delivery_orders enable row level security;

drop policy if exists "Subscription plans select" on public.subscription_plans;
drop policy if exists "Subscription plans insert" on public.subscription_plans;
drop policy if exists "Subscription plans update" on public.subscription_plans;
drop policy if exists "Subscription plans delete" on public.subscription_plans;

create policy "Subscription plans select"
on public.subscription_plans
for select
using (public.has_module_access(module_id));

create policy "Subscription plans insert"
on public.subscription_plans
for insert
with check (public.is_module_admin(module_id));

create policy "Subscription plans update"
on public.subscription_plans
for update
using (public.is_module_admin(module_id))
with check (public.is_module_admin(module_id));

create policy "Subscription plans delete"
on public.subscription_plans
for delete
using (public.is_module_admin(module_id));

drop policy if exists "Client subscriptions select" on public.client_subscriptions;
drop policy if exists "Client subscriptions insert" on public.client_subscriptions;
drop policy if exists "Client subscriptions update" on public.client_subscriptions;
drop policy if exists "Client subscriptions delete" on public.client_subscriptions;

create policy "Client subscriptions select"
on public.client_subscriptions
for select
using (public.has_module_access(module_id));

create policy "Client subscriptions insert"
on public.client_subscriptions
for insert
with check (public.is_module_admin(module_id));

create policy "Client subscriptions update"
on public.client_subscriptions
for update
using (public.is_module_admin(module_id))
with check (public.is_module_admin(module_id));

create policy "Client subscriptions delete"
on public.client_subscriptions
for delete
using (public.is_module_admin(module_id));

drop policy if exists "Loyalty settings select" on public.loyalty_settings;
drop policy if exists "Loyalty settings insert" on public.loyalty_settings;
drop policy if exists "Loyalty settings update" on public.loyalty_settings;
drop policy if exists "Loyalty settings delete" on public.loyalty_settings;

create policy "Loyalty settings select"
on public.loyalty_settings
for select
using (public.has_module_access(module_id));

create policy "Loyalty settings insert"
on public.loyalty_settings
for insert
with check (public.is_module_admin(module_id));

create policy "Loyalty settings update"
on public.loyalty_settings
for update
using (public.is_module_admin(module_id))
with check (public.is_module_admin(module_id));

create policy "Loyalty settings delete"
on public.loyalty_settings
for delete
using (public.is_module_admin(module_id));

drop policy if exists "Loyalty points select" on public.loyalty_points;
drop policy if exists "Loyalty points insert" on public.loyalty_points;
drop policy if exists "Loyalty points update" on public.loyalty_points;
drop policy if exists "Loyalty points delete" on public.loyalty_points;

create policy "Loyalty points select"
on public.loyalty_points
for select
using (public.has_module_access(module_id));

create policy "Loyalty points insert"
on public.loyalty_points
for insert
with check (public.has_module_access(module_id));

create policy "Loyalty points update"
on public.loyalty_points
for update
using (public.is_module_admin(module_id))
with check (public.is_module_admin(module_id));

create policy "Loyalty points delete"
on public.loyalty_points
for delete
using (public.is_module_admin(module_id));

drop policy if exists "Commission rules select" on public.commission_rules;
drop policy if exists "Commission rules insert" on public.commission_rules;
drop policy if exists "Commission rules update" on public.commission_rules;
drop policy if exists "Commission rules delete" on public.commission_rules;

create policy "Commission rules select"
on public.commission_rules
for select
using (public.has_module_access(module_id));

create policy "Commission rules insert"
on public.commission_rules
for insert
with check (public.is_module_admin(module_id));

create policy "Commission rules update"
on public.commission_rules
for update
using (public.is_module_admin(module_id))
with check (public.is_module_admin(module_id));

create policy "Commission rules delete"
on public.commission_rules
for delete
using (public.is_module_admin(module_id));

drop policy if exists "Cash register select" on public.cash_register;
drop policy if exists "Cash register insert" on public.cash_register;
drop policy if exists "Cash register update" on public.cash_register;
drop policy if exists "Cash register delete" on public.cash_register;

create policy "Cash register select"
on public.cash_register
for select
using (public.has_module_access(module_id));

create policy "Cash register insert"
on public.cash_register
for insert
with check (public.has_module_access(module_id));

create policy "Cash register update"
on public.cash_register
for update
using (public.has_module_access(module_id))
with check (public.has_module_access(module_id));

create policy "Cash register delete"
on public.cash_register
for delete
using (public.is_module_admin(module_id));

drop policy if exists "Petshop campaign logs select" on public.petshop_campaign_logs;
drop policy if exists "Petshop campaign logs insert" on public.petshop_campaign_logs;
drop policy if exists "Petshop campaign logs update" on public.petshop_campaign_logs;
drop policy if exists "Petshop campaign logs delete" on public.petshop_campaign_logs;

create policy "Petshop campaign logs select"
on public.petshop_campaign_logs
for select
using (public.has_module_access(module_id));

create policy "Petshop campaign logs insert"
on public.petshop_campaign_logs
for insert
with check (public.has_module_access(module_id));

create policy "Petshop campaign logs update"
on public.petshop_campaign_logs
for update
using (public.has_module_access(module_id))
with check (public.has_module_access(module_id));

create policy "Petshop campaign logs delete"
on public.petshop_campaign_logs
for delete
using (public.is_module_admin(module_id));

drop policy if exists "Service delivery orders select" on public.service_delivery_orders;
drop policy if exists "Service delivery orders insert" on public.service_delivery_orders;
drop policy if exists "Service delivery orders update" on public.service_delivery_orders;
drop policy if exists "Service delivery orders delete" on public.service_delivery_orders;

create policy "Service delivery orders select"
on public.service_delivery_orders
for select
using (public.has_module_access(module_id));

create policy "Service delivery orders insert"
on public.service_delivery_orders
for insert
with check (public.has_module_access(module_id));

create policy "Service delivery orders update"
on public.service_delivery_orders
for update
using (public.has_module_access(module_id))
with check (public.has_module_access(module_id));

create policy "Service delivery orders delete"
on public.service_delivery_orders
for delete
using (public.is_module_admin(module_id));

commit;
