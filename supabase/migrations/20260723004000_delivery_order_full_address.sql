begin;

-- The PetBot already validates and carries the delivery reference in its
-- transaction payload. Persist it in the operational order so the address
-- shown to the delivery team is the same address confirmed by the customer.
alter table public.service_delivery_orders
  add column if not exists delivery_reference text;

comment on column public.service_delivery_orders.delivery_reference is
  'Ponto de referencia informado pelo cliente para a entrega ou transporte.';

do $migration$
declare
  v_definition text;
  v_original_definition text;
begin
  select pg_get_functiondef(
    'public.create_petbot_order_transaction(jsonb)'::regprocedure
  )
  into v_definition;
  v_original_definition := v_definition;

  if v_definition !~ 'delivery_city,\s+delivery_reference,\s+contact_phone' then
    v_definition := regexp_replace(
      v_definition,
      'status,\s+scheduled_for,\s+delivery_address,\s+delivery_neighborhood,\s+delivery_city,\s+contact_phone',
      'status, scheduled_for, delivery_address, delivery_neighborhood, delivery_city, delivery_reference, contact_phone'
    );
  end if;

  if v_definition !~ 'service_transport_reference' then
    v_definition := regexp_replace(
      v_definition,
      '(when v_transport_fee > 0 then nullif\(trim\(p_payload->>''service_transport_city''\), ''''\)\s+else null\s+end,)(\s+v_customer_phone,)',
      E'\\1\n    case\n      when v_order_type = ''produto'' and p_payload->>''fulfillment_type'' = ''entrega'' then nullif(trim(p_payload->>''delivery_reference''), '''')\n      when v_transport_fee > 0 then nullif(trim(p_payload->>''service_transport_reference''), '''')\n      else null\n    end,\\2'
    );
  end if;

  if v_definition !~ 'delivery_reference\s*=\s*excluded\.delivery_reference' then
    v_definition := regexp_replace(
      v_definition,
      'delivery_city\s*=\s*excluded\.delivery_city,\s+contact_phone',
      E'delivery_city = excluded.delivery_city,\n      delivery_reference = excluded.delivery_reference,\n      contact_phone'
    );
  end if;

  if v_definition = v_original_definition
    and v_definition !~ 'delivery_city,\s+delivery_reference,\s+contact_phone'
  then
    raise exception 'Nao foi possivel localizar a gravacao do endereco na RPC do PetBot.';
  end if;

  if v_definition !~ 'delivery_city,\s+delivery_reference,\s+contact_phone'
    or v_definition !~ 'p_payload->>''delivery_reference'''
    or v_definition !~ 'delivery_reference\s*=\s*excluded\.delivery_reference'
  then
    raise exception 'A RPC do PetBot nao recebeu todos os campos do endereco completo.';
  end if;

  if v_definition <> v_original_definition then
    execute v_definition;
  end if;
end
$migration$;

-- Recover references from the deterministic confirmation summary for orders
-- that were created before the dedicated column existed.
update public.service_delivery_orders o
set delivery_reference = (
  select substring(m.content from '(?i)Referência:\s*([^\r\n]+)')
  from public.chat_messages m
  where m.session_id = o.session_id
    and m.role = 'assistant'
    and m.content ~* 'Referência:\s*[^\r\n]+'
    and m.sent_at <= o.created_at
  order by m.sent_at desc
  limit 1
)
where nullif(trim(o.delivery_reference), '') is null
  and exists (
    select 1
    from public.chat_messages m
    where m.session_id = o.session_id
      and m.role = 'assistant'
      and m.content ~* 'Referência:\s*[^\r\n]+'
      and m.sent_at <= o.created_at
  );

revoke all on function public.create_petbot_order_transaction(jsonb)
  from public, anon, authenticated;
grant execute on function public.create_petbot_order_transaction(jsonb)
  to service_role;

notify pgrst, 'reload schema';

commit;
