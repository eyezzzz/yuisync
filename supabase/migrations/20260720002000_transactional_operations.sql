begin;

create extension if not exists "uuid-ossp";

alter table public.settings
  add column if not exists max_pdv_discount_percent numeric(5,2) not null default 10
  check (max_pdv_discount_percent >= 0 and max_pdv_discount_percent <= 100);

alter table public.sales
  add column if not exists idempotency_key text,
  add column if not exists profile_id uuid references public.profiles(id),
  add column if not exists fulfillment_type text default 'balcao';

alter table public.pets
  add column if not exists tenant_id uuid references public.tenants(id);

update public.pets pet
set tenant_id = client.tenant_id
from public.clients client
where client.id = pet.id and pet.tenant_id is null;

do $$
begin
  if exists (select 1 from public.pets where tenant_id is null) then
    raise exception 'Existem pets sem tenant_id; relacione-os a clientes antes de aplicar a migracao.';
  end if;
end $$;

alter table public.pets alter column tenant_id set not null;
create index if not exists pets_tenant_module on public.pets (tenant_id, module_id);
alter table public.pets enable row level security;
do $$
declare policy_name text;
begin
  for policy_name in select p.policyname from pg_policies p where p.schemaname = 'public' and p.tablename = 'pets'
  loop
    execute format('drop policy if exists %I on public.pets', policy_name);
  end loop;
end $$;
create policy pets_tenant_select on public.pets for select to authenticated using (public.has_tenant_access(tenant_id));
create policy pets_tenant_insert on public.pets for insert to authenticated with check (public.has_tenant_access(tenant_id));
create policy pets_tenant_update on public.pets for update to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
create policy pets_tenant_delete on public.pets for delete to authenticated using (public.has_tenant_access(tenant_id));

create unique index if not exists sales_tenant_idempotency_unique
  on public.sales (tenant_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.stock_movements (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id),
  module_id text not null,
  product_id uuid not null references public.products(id),
  sale_id uuid references public.sales(id) on delete set null,
  movement_type text not null check (movement_type in ('sale', 'purchase', 'adjustment', 'return')),
  quantity numeric(12,3) not null check (quantity <> 0),
  stock_before numeric(12,3) not null,
  stock_after numeric(12,3) not null,
  unit_cost numeric(12,2),
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_tenant_product_created
  on public.stock_movements (tenant_id, product_id, created_at desc);

create table if not exists public.fiscal_queue_failures (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id),
  module_id text not null,
  sale_id uuid not null references public.sales(id) on delete cascade,
  error_message text not null,
  retry_status text not null default 'pending' check (retry_status in ('pending', 'resolved', 'discarded')),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  unique (sale_id, retry_status)
);

alter table public.fiscal_queue_failures enable row level security;
drop policy if exists fiscal_queue_failures_tenant_select on public.fiscal_queue_failures;
create policy fiscal_queue_failures_tenant_select on public.fiscal_queue_failures
for select to authenticated using (public.has_tenant_access(tenant_id));

create or replace function public.record_fiscal_queue_failure(p_sale_id uuid, p_error_message text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale record;
  v_id uuid;
begin
  select id, tenant_id, module_id into v_sale from public.sales where id = p_sale_id;
  if not found or not public.has_tenant_access(v_sale.tenant_id) then
    raise exception 'Venda nao encontrada ou sem permissao.';
  end if;

  insert into public.fiscal_queue_failures (tenant_id, module_id, sale_id, error_message, attempts, last_attempt_at)
  values (v_sale.tenant_id, v_sale.module_id, v_sale.id, left(coalesce(p_error_message, 'Falha desconhecida'), 1000), 1, now())
  on conflict (sale_id, retry_status) do update set
    error_message = excluded.error_message,
    attempts = public.fiscal_queue_failures.attempts + 1,
    last_attempt_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_fiscal_queue_failure(uuid, text) from public;
grant execute on function public.record_fiscal_queue_failure(uuid, text) to authenticated, service_role;

alter table public.stock_movements enable row level security;
drop policy if exists stock_movements_tenant_select on public.stock_movements;
create policy stock_movements_tenant_select on public.stock_movements
for select to authenticated using (public.has_tenant_access(tenant_id));

alter table public.appointments
  add column if not exists idempotency_key text;

create unique index if not exists appointments_tenant_idempotency_unique
  on public.appointments (tenant_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.prevent_appointment_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active_statuses constant text[] := array['agendado', 'confirmado', 'em_andamento', 'booked', 'ocupado', 'blocked', 'bloqueado'];
begin
  if lower(coalesce(new.status, '')) <> all(active_statuses) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    new.tenant_id::text || ':' || new.module_id || ':' || new.scheduled_at::date::text,
    0
  ));

  if exists (
    select 1 from public.appointments current
    where current.tenant_id = new.tenant_id
      and current.module_id = new.module_id
      and current.id is distinct from new.id
      and lower(coalesce(current.status, '')) = any(active_statuses)
      and current.scheduled_at < new.scheduled_at + make_interval(mins => greatest(15, coalesce(new.duration_min, 60)))
      and current.scheduled_at + make_interval(mins => greatest(15, coalesce(current.duration_min, 60))) > new.scheduled_at
      and (
        (new.employee_id is null and new.groomer_id is null)
        or current.employee_id = new.employee_id
        or current.groomer_id = new.groomer_id
      )
  ) then
    raise exception 'Horario nao esta mais disponivel.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_appointment_overlap on public.appointments;
create trigger prevent_appointment_overlap
before insert or update of scheduled_at, duration_min, employee_id, groomer_id, status
on public.appointments
for each row execute function public.prevent_appointment_overlap();

create or replace function public.create_pdv_checkout_transaction(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := nullif(p_payload->>'tenant_id', '')::uuid;
  v_module_id text := coalesce(nullif(trim(p_payload->>'module_id'), ''), 'petshop');
  v_client_id uuid := nullif(p_payload->>'client_id', '')::uuid;
  v_profile_id uuid := auth.uid();
  v_idempotency_key text := nullif(trim(p_payload->>'idempotency_key'), '');
  v_requested_discount numeric := greatest(0, coalesce(nullif(p_payload->>'discount', '')::numeric, 0));
  v_max_discount_percent numeric := 0;
  v_items jsonb := coalesce(p_payload->'items', '[]'::jsonb);
  v_splits jsonb := coalesce(p_payload->'payment_splits', '[]'::jsonb);
  v_item jsonb;
  v_split jsonb;
  v_product record;
  v_quantity numeric;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_split_total numeric := 0;
  v_sale_id uuid;
  v_existing record;
  v_payment_method text := nullif(trim(p_payload->>'payment_method'), '');
begin
  if v_profile_id is null then raise exception 'Sessao autenticada obrigatoria.'; end if;
  if v_tenant_id is null or not public.has_tenant_access(v_tenant_id) then
    raise exception 'Tenant invalido ou sem permissao.';
  end if;
  if v_module_id <> 'petshop' then raise exception 'Checkout disponivel somente para petshop.'; end if;
  if v_idempotency_key is null or length(v_idempotency_key) > 128 then
    raise exception 'Chave de idempotencia invalida.';
  end if;
  if jsonb_array_length(v_items) = 0 then raise exception 'Carrinho vazio.'; end if;

  select id, total_price into v_existing
  from public.sales
  where tenant_id = v_tenant_id and idempotency_key = v_idempotency_key
  limit 1;
  if found then
    return jsonb_build_object('sale_id', v_existing.id, 'total', v_existing.total_price, 'duplicated', true);
  end if;

  if v_client_id is not null and not exists (
    select 1 from public.clients
    where id = v_client_id and tenant_id = v_tenant_id and module_id = v_module_id
  ) then
    raise exception 'Cliente nao pertence ao tenant ativo.';
  end if;

  select coalesce(max_pdv_discount_percent, 0) into v_max_discount_percent
  from public.settings
  where tenant_id = v_tenant_id and module_id = v_module_id
  limit 1;
  v_max_discount_percent := coalesce(v_max_discount_percent, 0);

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_quantity := coalesce(nullif(v_item->>'quantity', '')::numeric, 0);
    if v_quantity <= 0 then raise exception 'Quantidade de produto invalida.'; end if;

    select id, name, price, cost_price, stock_quantity, active
    into v_product
    from public.products
    where id = nullif(v_item->>'product_id', '')::uuid
      and tenant_id = v_tenant_id
      and module_id = v_module_id
    for update;

    if not found or not coalesce(v_product.active, false) then
      raise exception 'Produto indisponivel.';
    end if;
    if coalesce(v_product.price, 0) <= 0 then
      raise exception 'Produto sem preco valido: %.', v_product.name;
    end if;
    if coalesce(v_product.stock_quantity, 0) < v_quantity then
      raise exception 'Estoque insuficiente para %.', v_product.name;
    end if;

    v_subtotal := v_subtotal + (v_product.price * v_quantity);
  end loop;

  if v_requested_discount > round(v_subtotal * v_max_discount_percent / 100, 2) then
    raise exception 'Desconto excede o limite permitido de % por cento.', v_max_discount_percent;
  end if;
  v_total := greatest(0, round(v_subtotal - v_requested_discount, 2));

  if jsonb_array_length(v_splits) > 0 then
    for v_split in select * from jsonb_array_elements(v_splits)
    loop
      if coalesce(v_split->>'method', '') not in ('dinheiro', 'debito', 'credito', 'pix') then
        raise exception 'Forma de pagamento dividida invalida.';
      end if;
      if coalesce(nullif(v_split->>'amount', '')::numeric, 0) <= 0 then
        raise exception 'Valor de pagamento dividido invalido.';
      end if;
      v_split_total := v_split_total + (v_split->>'amount')::numeric;
    end loop;
    if abs(v_split_total - v_total) > 0.01 then
      raise exception 'Pagamentos divididos nao fecham o total da venda.';
    end if;
    v_payment_method := 'multiplo';
  elsif v_payment_method not in ('dinheiro', 'debito', 'credito', 'pix') then
    raise exception 'Forma de pagamento invalida.';
  end if;

  insert into public.sales (
    tenant_id, module_id, client_id, profile_id, customer_name, customer_phone,
    payment_method, subtotal, discount, total_price, status, source,
    fulfillment_type, notes, idempotency_key
  ) values (
    v_tenant_id, v_module_id, v_client_id, v_profile_id,
    coalesce(nullif(trim(p_payload->>'customer_name'), ''), 'Balcao'),
    nullif(trim(p_payload->>'customer_phone'), ''), v_payment_method,
    v_subtotal, v_requested_discount, v_total, 'concluido',
    coalesce(nullif(trim(p_payload->>'source'), ''), 'pdv'),
    coalesce(nullif(trim(p_payload->>'fulfillment_type'), ''), 'balcao'),
    nullif(trim(p_payload->>'notes'), ''), v_idempotency_key
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_quantity := (v_item->>'quantity')::numeric;
    select id, price, cost_price, stock_quantity into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid
      and tenant_id = v_tenant_id
      and module_id = v_module_id
    for update;

    insert into public.sale_items (
      tenant_id, sale_id, product_id, quantity, unit_price, subtotal, upsell
    ) values (
      v_tenant_id, v_sale_id, v_product.id, v_quantity, v_product.price,
      v_quantity * v_product.price, coalesce((v_item->>'upsell')::boolean, false)
    );

    update public.products
    set stock_quantity = v_product.stock_quantity - v_quantity, updated_at = now()
    where id = v_product.id and tenant_id = v_tenant_id;

    insert into public.stock_movements (
      tenant_id, module_id, product_id, sale_id, movement_type, quantity,
      stock_before, stock_after, unit_cost, reason, created_by
    ) values (
      v_tenant_id, v_module_id, v_product.id, v_sale_id, 'sale', -v_quantity,
      v_product.stock_quantity, v_product.stock_quantity - v_quantity,
      v_product.cost_price, 'Venda PDV', v_profile_id
    );
  end loop;

  for v_split in select * from jsonb_array_elements(v_splits)
  loop
    insert into public.sale_payment_splits (
      tenant_id, module_id, sale_id, payment_method, amount, position
    ) values (
      v_tenant_id, v_module_id, v_sale_id, v_split->>'method',
      (v_split->>'amount')::numeric, coalesce(nullif(v_split->>'position', '')::integer, 1)
    );
  end loop;

  return jsonb_build_object('sale_id', v_sale_id, 'subtotal', v_subtotal, 'discount', v_requested_discount, 'total', v_total, 'duplicated', false);
exception
  when unique_violation then
    select id, total_price into v_existing
    from public.sales
    where tenant_id = v_tenant_id and idempotency_key = v_idempotency_key
    limit 1;
    if found then
      return jsonb_build_object('sale_id', v_existing.id, 'total', v_existing.total_price, 'duplicated', true);
    end if;
    raise;
end;
$$;

revoke all on function public.create_pdv_checkout_transaction(jsonb) from public;
grant execute on function public.create_pdv_checkout_transaction(jsonb) to authenticated, service_role;

create or replace function public.book_petshop_appointment_transaction(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := nullif(p_payload->>'tenant_id', '')::uuid;
  v_module_id text := coalesce(nullif(trim(p_payload->>'module_id'), ''), 'petshop');
  v_client_id uuid := nullif(p_payload->>'client_id', '')::uuid;
  v_service_type text := nullif(trim(p_payload->>'service_type'), '');
  v_idempotency_key text := nullif(trim(p_payload->>'idempotency_key'), '');
  v_subscription record;
  v_services jsonb;
  v_service jsonb;
  v_usage jsonb;
  v_used integer;
  v_limit integer;
  v_benefit_used boolean := false;
  v_price numeric := greatest(0, coalesce(nullif(p_payload->>'price', '')::numeric, 0));
  v_duration integer := greatest(15, coalesce(nullif(p_payload->>'duration_min', '')::integer, 60));
  v_service_definition record;
  v_appointment_id uuid;
begin
  if v_tenant_id is null or not public.has_tenant_access(v_tenant_id) then
    raise exception 'Tenant invalido ou sem permissao.';
  end if;
  if v_client_id is null or v_service_type is null then
    raise exception 'Cliente e servico sao obrigatorios.';
  end if;
  if v_idempotency_key is null then raise exception 'Chave de idempotencia obrigatoria.'; end if;

  select id into v_appointment_id from public.appointments
  where tenant_id = v_tenant_id and idempotency_key = v_idempotency_key limit 1;
  if found then return jsonb_build_object('appointment_id', v_appointment_id, 'duplicated', true); end if;

  if not exists (
    select 1 from public.clients where id = v_client_id and tenant_id = v_tenant_id and module_id = v_module_id
  ) then raise exception 'Cliente nao pertence ao tenant ativo.'; end if;

  select default_price, default_duration_min into v_service_definition
  from public.petshop_services
  where tenant_id = v_tenant_id
    and module_id = v_module_id
    and code = v_service_type
    and active = true
  limit 1;
  if found then
    v_price := greatest(0, coalesce(v_service_definition.default_price, 0));
    v_duration := greatest(15, coalesce(v_service_definition.default_duration_min, 60));
  else
    raise exception 'Servico nao encontrado ou inativo.';
  end if;

  select subscription.*, plan.services into v_subscription
  from public.client_subscriptions subscription
  join public.subscription_plans plan on plan.id = subscription.plan_id and plan.tenant_id = subscription.tenant_id
  where subscription.tenant_id = v_tenant_id
    and subscription.module_id = v_module_id
    and subscription.client_id = v_client_id
    and subscription.status = 'active'
  order by subscription.started_at desc
  limit 1
  for update of subscription;

  if found then
    v_services := coalesce(v_subscription.services, '[]'::jsonb);
    select value into v_service from jsonb_array_elements(v_services)
    where value->>'service_type' = v_service_type limit 1;
    if v_service is not null then
      v_usage := coalesce(v_subscription.services_used, '{}'::jsonb);
      v_used := coalesce((v_usage->>v_service_type)::integer, 0);
      v_limit := coalesce((v_service->>'qty_per_cycle')::integer, 0);
      if v_limit > v_used then
        v_benefit_used := true;
        v_price := 0;
        update public.client_subscriptions
        set services_used = jsonb_set(v_usage, array[v_service_type], to_jsonb(v_used + 1), true), updated_at = now()
        where id = v_subscription.id and tenant_id = v_tenant_id;
      end if;
    end if;
  end if;

  insert into public.appointments (
    tenant_id, module_id, client_id, pet_id, service_type, scheduled_at,
    duration_min, price, status, notes, source, employee_id, groomer_id,
    subscription_id, subscription_benefit_used, idempotency_key
  ) values (
    v_tenant_id, v_module_id, v_client_id, nullif(p_payload->>'pet_id', '')::uuid,
    v_service_type, nullif(p_payload->>'scheduled_at', '')::timestamptz,
    v_duration,
    v_price, coalesce(nullif(trim(p_payload->>'status'), ''), 'agendado'),
    concat_ws(' | ', nullif(trim(p_payload->>'notes'), ''), case when v_benefit_used then 'Beneficio de plano aplicado' end),
    coalesce(nullif(trim(p_payload->>'source'), ''), 'agenda'),
    nullif(p_payload->>'employee_id', '')::uuid, nullif(p_payload->>'groomer_id', '')::uuid,
    case when v_benefit_used then v_subscription.id else null end,
    v_benefit_used, v_idempotency_key
  ) returning id into v_appointment_id;

  return jsonb_build_object('appointment_id', v_appointment_id, 'benefit_used', v_benefit_used, 'price', v_price, 'duplicated', false);
end;
$$;

revoke all on function public.book_petshop_appointment_transaction(jsonb) from public;
grant execute on function public.book_petshop_appointment_transaction(jsonb) to authenticated, service_role;

drop function if exists public.create_petshop_booking_request(text,text,text,text,text,date,text,text,boolean,numeric,text,text,text,text,text);

create or replace function public.create_petshop_booking_request(
  p_slug text,
  p_customer_name text,
  p_pet_name text default null,
  p_phone text default null,
  p_service_interest text default null,
  p_preferred_date date default null,
  p_preferred_period text default null,
  p_transport_mode text default 'dropoff',
  p_need_motodog boolean default false,
  p_pickup_address text default null,
  p_pickup_neighborhood text default null,
  p_pickup_city text default null,
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
  v_fee numeric := 0;
begin
  select booking.tenant_id, booking.module_id, booking.enabled
  into v_setting
  from public.petshop_growth_booking_settings booking
  where booking.public_slug = p_slug
  limit 1;

  if v_setting is null or not coalesce(v_setting.enabled, false) then
    raise exception 'Agendamento online indisponivel.';
  end if;
  if nullif(trim(p_customer_name), '') is null then raise exception 'Nome obrigatorio.'; end if;
  if (select count(*) from public.petshop_growth_booking_requests
      where tenant_id = v_setting.tenant_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Muitas solicitacoes. Tente novamente em instantes.';
  end if;

  if coalesce(p_need_motodog, false) then
    select coalesce(
      (select (option->>'fee')::numeric
       from jsonb_array_elements(coalesce(settings.pet_transport_options, '[]'::jsonb)) option
       where option->>'id' = 'somente_buscar' and coalesce((option->>'active')::boolean, true)
       limit 1),
      settings.pet_transport_fee,
      0
    ) into v_fee
    from public.settings settings
    where settings.tenant_id = v_setting.tenant_id and settings.module_id = v_setting.module_id
    limit 1;
  end if;

  insert into public.petshop_growth_booking_requests (
    tenant_id, module_id, channel, customer_name, pet_name, phone,
    service_interest, preferred_date, preferred_period, transport_mode,
    need_motodog, motodog_fee, pickup_address, pickup_neighborhood,
    pickup_city, status, notes
  ) values (
    v_setting.tenant_id, v_setting.module_id, coalesce(nullif(p_channel, ''), 'site'),
    trim(p_customer_name), nullif(trim(p_pet_name), ''), nullif(trim(p_phone), ''),
    nullif(trim(p_service_interest), ''), p_preferred_date, nullif(trim(p_preferred_period), ''),
    case when coalesce(p_need_motodog, false) then 'pickup' else 'dropoff' end,
    coalesce(p_need_motodog, false), v_fee,
    case when coalesce(p_need_motodog, false) then nullif(trim(p_pickup_address), '') end,
    case when coalesce(p_need_motodog, false) then nullif(trim(p_pickup_neighborhood), '') end,
    case when coalesce(p_need_motodog, false) then nullif(trim(p_pickup_city), '') end,
    'pending', nullif(trim(p_notes), '')
  ) returning id into v_request_id;

  return v_request_id;
end;
$$;

grant execute on function public.create_petshop_booking_request(text,text,text,text,text,date,text,text,boolean,text,text,text,text,text)
to anon, authenticated;

commit;
