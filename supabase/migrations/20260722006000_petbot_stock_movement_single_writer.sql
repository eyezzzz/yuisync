begin;

-- A RPC transacional e o trigger de sale_items registravam o mesmo movimento.
-- As RPCs passam a marcar a transacao como escritoras do estoque; o trigger
-- ignora somente essas transacoes e continua cobrindo o fluxo legado.
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
  if current_setting('app.yuisync_stock_writer', true) = 'transaction_rpc' then
    return new;
  end if;

  select id, tenant_id, module_id, source, payment_method
  into v_sale
  from public.sales
  where id = new.sale_id;

  if not found or v_sale.source <> 'whatsapp' then
    return new;
  end if;

  select stock_quantity, cost_price
  into v_product
  from public.products
  where id = new.product_id
    and tenant_id = v_sale.tenant_id
  for share;

  if not found then
    raise exception 'Produto do pedido PetBot nao encontrado.';
  end if;

  v_type := case
    when lower(coalesce(v_sale.payment_method, '')) = 'pix' then 'reservation'
    else 'sale'
  end;

  insert into public.stock_movements (
    tenant_id, module_id, product_id, sale_id, movement_type, quantity,
    stock_before, stock_after, unit_cost, reason
  ) values (
    v_sale.tenant_id, v_sale.module_id, new.product_id, new.sale_id, v_type, -new.quantity,
    v_product.stock_quantity, v_product.stock_quantity - new.quantity, v_product.cost_price,
    case
      when v_type = 'reservation' then 'Reserva PetBot aguardando comprovante'
      else 'Venda PetBot WhatsApp'
    end
  );

  return new;
end;
$$;

do $migration$
declare
  v_definition text;
  v_anchor_pattern text := 'begin[[:space:]]+select[[:space:]]+null::text[[:space:]]+as[[:space:]]+id,[[:space:]]+null::text[[:space:]]+as[[:space:]]+label,[[:space:]]+0::numeric[[:space:]]+as[[:space:]]+fee';
  v_replacement text := E'begin\n  perform set_config(''app.yuisync_stock_writer'', ''transaction_rpc'', true);\n\n  select null::text as id, null::text as label, 0::numeric as fee';
begin
  select pg_get_functiondef('public.create_petbot_order_transaction(jsonb)'::regprocedure)
  into v_definition;

  if v_definition !~* 'set_config\(''app\.yuisync_stock_writer'',[[:space:]]*''transaction_rpc'',[[:space:]]*true\)' then
    if v_definition !~* v_anchor_pattern then
      raise exception 'Nao foi possivel localizar o inicio da RPC transacional do PetBot.';
    end if;
    execute regexp_replace(v_definition, v_anchor_pattern, v_replacement, 'i');
  end if;
end
$migration$;

do $migration$
declare
  v_definition text;
  v_anchor_pattern text := 'begin[[:space:]]+if[[:space:]]+v_profile_id[[:space:]]+is[[:space:]]+null[[:space:]]+then';
  v_replacement text := E'begin\n  perform set_config(''app.yuisync_stock_writer'', ''transaction_rpc'', true);\n\n  if v_profile_id is null then';
begin
  select pg_get_functiondef('public.create_pdv_checkout_transaction(jsonb)'::regprocedure)
  into v_definition;

  if v_definition !~* 'set_config\(''app\.yuisync_stock_writer'',[[:space:]]*''transaction_rpc'',[[:space:]]*true\)' then
    if v_definition !~* v_anchor_pattern then
      raise exception 'Nao foi possivel localizar o inicio da RPC transacional do PDV.';
    end if;
    execute regexp_replace(v_definition, v_anchor_pattern, v_replacement, 'i');
  end if;
end
$migration$;

drop trigger if exists record_petbot_stock_movement on public.sale_items;
create trigger record_petbot_stock_movement
after insert on public.sale_items
for each row execute function public.record_petbot_stock_movement();

revoke all on function public.create_petbot_order_transaction(jsonb) from public, anon, authenticated;
grant execute on function public.create_petbot_order_transaction(jsonb) to service_role;

revoke all on function public.create_pdv_checkout_transaction(jsonb) from public, anon;
grant execute on function public.create_pdv_checkout_transaction(jsonb) to authenticated, service_role;

commit;
