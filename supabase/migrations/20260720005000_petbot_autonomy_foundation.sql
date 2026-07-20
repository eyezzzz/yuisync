-- PetBot autonomy foundation: auditability, payment state and safe database access.

alter table public.sales
  add column if not exists stock_reservation_expires_at timestamptz,
  add column if not exists bot_engine_version text;

alter table public.stock_movements
  drop constraint if exists stock_movements_movement_type_check;
alter table public.stock_movements
  add constraint stock_movements_movement_type_check
  check (movement_type in ('sale', 'purchase', 'adjustment', 'return', 'reservation', 'release'));

create table if not exists public.petbot_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id),
  module_id text not null,
  session_id uuid references public.chat_sessions(id) on delete set null,
  message_id uuid references public.chat_messages(id) on delete set null,
  event_type text not null,
  engine_version text not null default 'petbot_guard_v2',
  config_version text,
  intent text,
  action text,
  outcome text not null default 'ok',
  handoff_target text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists petbot_events_tenant_created_idx
  on public.petbot_events (tenant_id, module_id, created_at desc);
create index if not exists petbot_events_session_created_idx
  on public.petbot_events (session_id, created_at desc);

alter table public.petbot_events enable row level security;
drop policy if exists petbot_events_tenant_select on public.petbot_events;
create policy petbot_events_tenant_select on public.petbot_events
  for select to authenticated using (public.has_tenant_access(tenant_id));

-- Orders from the bot reserve inventory immediately, but are not treated as paid
-- merely because the client selected Pix, cash or card in the conversation.
create or replace function public.normalize_petbot_sale_payment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source = 'whatsapp' and coalesce(new.payment_method, '') <> '' then
    if lower(new.payment_method) = 'pix' then
      new.status := 'pendente';
      new.payment_status := 'aguardando_comprovante';
      new.stock_reservation_expires_at := coalesce(new.stock_reservation_expires_at, now() + interval '30 minutes');
    elsif lower(new.payment_method) in ('dinheiro', 'cartao') then
      new.status := 'pendente';
      new.payment_status := 'a_receber';
    end if;
    new.bot_engine_version := coalesce(new.bot_engine_version, 'petbot_guard_v2');
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_petbot_sale_payment on public.sales;
create trigger normalize_petbot_sale_payment
before insert on public.sales
for each row execute function public.normalize_petbot_sale_payment();

create or replace function public.record_petbot_stock_movement()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sale record;
  v_product record;
  v_type text;
begin
  select id, tenant_id, module_id, source, payment_method
    into v_sale
  from public.sales
  where id = new.sale_id;

  if not found or v_sale.source <> 'whatsapp' then
    return new;
  end if;

  select stock_quantity, cost_price into v_product
  from public.products
  where id = new.product_id and tenant_id = v_sale.tenant_id
  for share;

  if not found then
    raise exception 'Produto do pedido PetBot nao encontrado.';
  end if;

  v_type := case when lower(coalesce(v_sale.payment_method, '')) = 'pix' then 'reservation' else 'sale' end;
  insert into public.stock_movements (
    tenant_id, module_id, product_id, sale_id, movement_type, quantity,
    stock_before, stock_after, unit_cost, reason
  ) values (
    v_sale.tenant_id, v_sale.module_id, new.product_id, new.sale_id, v_type, -new.quantity,
    v_product.stock_quantity, v_product.stock_quantity - new.quantity, v_product.cost_price,
    case when v_type = 'reservation' then 'Reserva PetBot aguardando comprovante' else 'Venda PetBot WhatsApp' end
  );
  return new;
end;
$$;

drop trigger if exists record_petbot_stock_movement on public.sale_items;
create trigger record_petbot_stock_movement
after insert on public.sale_items
for each row execute function public.record_petbot_stock_movement();

-- The transactional PetBot function is an internal backend capability. Browser
-- roles must never be able to choose another tenant through its JSON payload.
revoke all on function public.create_petbot_order_transaction(jsonb) from public;
revoke all on function public.create_petbot_order_transaction(jsonb) from anon;
revoke all on function public.create_petbot_order_transaction(jsonb) from authenticated;
grant execute on function public.create_petbot_order_transaction(jsonb) to service_role;
