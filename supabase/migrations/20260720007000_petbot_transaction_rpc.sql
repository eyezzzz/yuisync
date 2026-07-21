-- The WhatsApp bot must use the same database transaction for stock and slots.
-- This migration deliberately contains the RPC (the previous standalone SQL
-- file was not part of the Supabase migration chain).
begin;

create or replace function public.create_petbot_order_transaction(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid := nullif(p_payload->>'session_id', '')::uuid;
  v_tenant_id uuid := nullif(p_payload->>'tenant_id', '')::uuid;
  v_module_id text := coalesce(nullif(trim(p_payload->>'module_id'), ''), 'petshop');
  v_client_id uuid := nullif(p_payload->>'client_id', '')::uuid;
  v_order_type text := coalesce(nullif(trim(p_payload->>'order_type'), ''), 'produto');
  v_items jsonb := coalesce(p_payload->'items', '[]'::jsonb);
  v_item jsonb;
  v_product record;
  v_slot record;
  v_quantity numeric;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_delivery_fee numeric := coalesce(nullif(p_payload->>'delivery_fee', '')::numeric, 0);
  v_transport_fee numeric := coalesce(nullif(p_payload->>'service_transport_fee', '')::numeric, 0);
  v_sale_id uuid;
  v_order_id uuid;
  v_appointment_id uuid := nullif(p_payload->>'appointment_id', '')::uuid;
  v_pet_id uuid;
  v_scheduled_at timestamptz := nullif(p_payload->>'scheduled_at', '')::timestamptz;
  v_duration integer := greatest(15, coalesce(nullif(p_payload->>'duration_min', '')::integer, 60));
  v_service_type text := nullif(trim(p_payload->>'service_type'), '');
  v_customer_name text := coalesce(nullif(trim(p_payload->>'customer_name'), ''), 'Cliente');
  v_customer_phone text := nullif(trim(p_payload->>'customer_phone'), '');
  v_payment_method text := nullif(trim(p_payload->>'payment_method'), '');
  v_payment_status text := 'nao_aplicavel';
  v_notes text := nullif(trim(p_payload->>'notes'), '');
  v_expected_total numeric := nullif(p_payload->>'expected_total', '')::numeric;
  v_existing_sale uuid;
begin
  if v_session_id is null or v_tenant_id is null then
    raise exception 'Payload sem sessao ou tenant.';
  end if;

  -- Serialize repeated WhatsApp webhooks before checking the idempotency key.
  select nullif(context->>'last_sale_id', '')::uuid into v_existing_sale
  from public.chat_sessions
  where id = v_session_id and tenant_id = v_tenant_id and module_id = v_module_id
  for update;
  if not found then raise exception 'Sessao do PetBot nao encontrada.'; end if;
  if v_existing_sale is not null then
    return jsonb_build_object('sale_id', v_existing_sale, 'duplicated', true);
  end if;
  if v_client_id is null or not exists (
    select 1 from public.clients where id = v_client_id and tenant_id = v_tenant_id and module_id = v_module_id
  ) then raise exception 'Cliente ausente ou fora do tenant.'; end if;

  if v_order_type = 'produto' then
    if v_payment_method not in ('pix', 'dinheiro', 'cartao') then raise exception 'Forma de pagamento invalida.'; end if;
    if coalesce(p_payload->>'fulfillment_type', '') not in ('entrega', 'retirada') then raise exception 'Entrega ou retirada precisa estar definida.'; end if;
    if p_payload->>'fulfillment_type' = 'entrega' and (
      coalesce(p_payload->>'delivery_address', '') !~ '[0-9]' or nullif(trim(p_payload->>'delivery_neighborhood'), '') is null or nullif(trim(p_payload->>'delivery_reference'), '') is null
    ) then raise exception 'Endereco de entrega incompleto.'; end if;
    if jsonb_array_length(v_items) = 0 then raise exception 'Pedido sem itens.'; end if;

    for v_item in select * from jsonb_array_elements(v_items) loop
      v_quantity := coalesce(nullif(v_item->>'quantity', '')::numeric, 0);
      if v_quantity <= 0 then raise exception 'Quantidade invalida.'; end if;
      select id, name, price, stock_quantity, active into v_product
      from public.products
      where id = nullif(v_item->>'product_id', '')::uuid and tenant_id = v_tenant_id and module_id = v_module_id
      for update;
      if not found or not coalesce(v_product.active, false) then raise exception 'Produto indisponivel.'; end if;
      if coalesce(v_product.stock_quantity, 0) < v_quantity then raise exception 'Estoque insuficiente para %.', v_product.name; end if;
      if coalesce(v_product.price, 0) <= 0 then raise exception 'Produto sem preco valido.'; end if;
      v_subtotal := v_subtotal + v_product.price * v_quantity;
    end loop;
    v_total := v_subtotal + case when p_payload->>'fulfillment_type' = 'entrega' then v_delivery_fee else 0 end;
    v_payment_status := case when v_payment_method = 'pix' then 'aguardando_comprovante' else 'baixado' end;
  else
    if v_scheduled_at is null and v_appointment_id is null then raise exception 'Horario real da agenda ausente.'; end if;
    if v_appointment_id is not null then
      select id, scheduled_at, duration_min, price, service_type, status into v_slot
      from public.appointments where id = v_appointment_id and tenant_id = v_tenant_id and module_id = v_module_id for update;
      if not found or lower(coalesce(v_slot.status, '')) not in ('available', 'disponivel', 'livre', 'aberto', 'open') then raise exception 'Horario nao esta mais disponivel.'; end if;
      v_scheduled_at := v_slot.scheduled_at; v_duration := greatest(15, coalesce(v_slot.duration_min, v_duration));
      v_service_type := coalesce(v_slot.service_type, v_service_type); v_subtotal := coalesce(v_slot.price, 0);
    else
      v_subtotal := coalesce(nullif(v_items->0->>'unit_price', '')::numeric, 0);
    end if;
    if v_subtotal <= 0 or v_service_type is null then raise exception 'Servico sem preco ou tipo valido.'; end if;
    if exists (select 1 from public.appointments a where a.tenant_id = v_tenant_id and a.module_id = v_module_id and a.id is distinct from v_appointment_id and lower(coalesce(a.status, '')) in ('agendado','confirmado','em_andamento','booked','ocupado','blocked','bloqueado') and a.scheduled_at < v_scheduled_at + make_interval(mins => v_duration) and a.scheduled_at + make_interval(mins => greatest(15, coalesce(a.duration_min, 60))) > v_scheduled_at) then raise exception 'Horario nao esta mais disponivel.'; end if;
    select id into v_pet_id from public.pets where tenant_id = v_tenant_id and module_id = v_module_id and phone = coalesce(v_customer_phone, '') and lower(pet_name) = lower(coalesce(nullif(trim(p_payload->>'pet_name'), ''), 'Pet')) limit 1;
    if v_pet_id is null then
      insert into public.pets (tenant_id, module_id, owner_name, phone, pet_name, species, breed, notes, updated_at)
      values (v_tenant_id, v_module_id, v_customer_name, coalesce(v_customer_phone, 'sem telefone'), coalesce(nullif(trim(p_payload->>'pet_name'), ''), 'Pet'), coalesce(nullif(trim(p_payload->>'species'), ''), 'dog'), nullif(trim(p_payload->>'breed'), ''), 'Cadastro automatico PetBot', now()) returning id into v_pet_id;
    end if;
    v_total := v_subtotal + v_transport_fee;
  end if;

  if v_expected_total is not null and abs(v_total - v_expected_total) > 0.01 then raise exception 'Total divergente.'; end if;
  insert into public.sales (tenant_id, module_id, client_id, customer_name, customer_phone, payment_method, subtotal, discount, total_price, status, payment_status, source, fulfillment_type, notes)
  values (v_tenant_id, v_module_id, v_client_id, v_customer_name, v_customer_phone, nullif(v_payment_method, ''), v_subtotal, 0, v_total, 'concluido', v_payment_status, 'whatsapp', case when v_order_type = 'produto' and p_payload->>'fulfillment_type' = 'retirada' then 'balcao' when v_order_type = 'produto' then 'entrega' else 'servico' end, v_notes) returning id into v_sale_id;

  if v_order_type = 'produto' then
    for v_item in select * from jsonb_array_elements(v_items) loop
      v_quantity := (v_item->>'quantity')::numeric;
      select id, name, price into v_product from public.products where id = (v_item->>'product_id')::uuid and tenant_id = v_tenant_id and module_id = v_module_id for update;
      insert into public.sale_items (tenant_id, sale_id, product_id, quantity, unit_price, subtotal, upsell) values (v_tenant_id, v_sale_id, v_product.id, v_quantity, v_product.price, v_quantity * v_product.price, coalesce((v_item->>'upsell')::boolean, false));
      update public.products set stock_quantity = stock_quantity - v_quantity, updated_at = now() where id = v_product.id and stock_quantity >= v_quantity;
      if not found then raise exception 'Estoque insuficiente ao reservar produto.'; end if;
    end loop;
  elsif v_appointment_id is not null then
    update public.appointments set client_id = v_client_id, pet_id = v_pet_id, service_type = v_service_type, status = 'agendado', source = 'whatsapp', customer_name = v_customer_name, customer_phone = v_customer_phone, description = v_notes, notes = v_notes, updated_at = now() where id = v_appointment_id;
  else
    insert into public.appointments (tenant_id, module_id, client_id, pet_id, service_type, scheduled_at, service_date, start_time, end_time, duration_min, price, status, source, customer_name, customer_phone, description, notes)
    values (v_tenant_id, v_module_id, v_client_id, v_pet_id, v_service_type, v_scheduled_at, (v_scheduled_at at time zone 'America/Sao_Paulo')::date, (v_scheduled_at at time zone 'America/Sao_Paulo')::time, ((v_scheduled_at + make_interval(mins => v_duration)) at time zone 'America/Sao_Paulo')::time, v_duration, v_subtotal, 'agendado', 'whatsapp', v_customer_name, v_customer_phone, v_notes, v_notes) returning id into v_appointment_id;
  end if;

  insert into public.service_delivery_orders (tenant_id, module_id, sale_id, client_id, session_id, source, order_type, status, scheduled_for, contact_phone, payment_status, notes)
  values (v_tenant_id, v_module_id, v_sale_id, v_client_id, v_session_id, 'whatsapp', case when v_order_type = 'produto' then 'entrega' else 'servico' end, case when v_order_type = 'produto' then 'separacao' else 'agendado' end, case when v_order_type = 'produto' then null else v_scheduled_at end, v_customer_phone, v_payment_status, v_notes) returning id into v_order_id;
  update public.chat_sessions set intent = 'pedido_confirmado', context = coalesce(context, '{}'::jsonb) || jsonb_build_object('last_sale_id', v_sale_id, 'last_order_id', v_order_id, 'last_appointment_id', v_appointment_id, 'last_total', v_total, 'last_payment_status', v_payment_status), last_message_at = now() where id = v_session_id;
  return jsonb_build_object('sale_id', v_sale_id, 'order_id', v_order_id, 'appointment_id', v_appointment_id, 'total', v_total, 'payment_status', v_payment_status, 'duplicated', false);
end;
$$;

revoke all on function public.create_petbot_order_transaction(jsonb) from public, anon, authenticated;
grant execute on function public.create_petbot_order_transaction(jsonb) to service_role;

-- The bot is now backed by real transactional writes. New and existing stores
-- can therefore complete a confirmed order/booking without being silently
-- diverted to the canary handoff. Operators can still select assist/canary in
-- Settings when they need a staged rollout.
alter table public.settings alter column petbot_autonomy_mode set default 'enabled';
update public.settings
set petbot_autonomy_mode = 'enabled'
where petbot_autonomy_mode = 'canary';

commit;
