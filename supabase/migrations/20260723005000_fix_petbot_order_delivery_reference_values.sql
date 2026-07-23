begin;

-- The complete-address migration added delivery_reference to the target
-- columns. Functions that already declared service_transport_reference could
-- skip the matching VALUES expression, leaving an invalid INSERT.
do $migration$
declare
  v_definition text;
  v_original_definition text;
  v_order_definition text;
  v_order_position integer;
begin
  select pg_get_functiondef(
    'public.create_petbot_order_transaction(jsonb)'::regprocedure
  )
  into v_definition;
  v_original_definition := v_definition;

  v_order_position := strpos(v_definition, 'insert into public.service_delivery_orders');
  if v_order_position = 0 then
    raise exception 'Nao foi localizado o INSERT de service_delivery_orders na RPC do PetBot.';
  end if;
  v_order_definition := substring(v_definition from v_order_position);

  if v_order_definition !~ 'delivery_city,\s+delivery_reference,\s+contact_phone' then
    raise exception 'A coluna delivery_reference nao esta na posicao esperada da ordem.';
  end if;

  if v_order_definition !~ 'p_payload->>''delivery_reference''' then
    v_definition := regexp_replace(
      v_definition,
      '(when v_transport_fee > 0 then nullif\(trim\(p_payload->>''service_transport_city''\), ''''\)\s+else null\s+end,)(\s+v_customer_phone,)',
      E'\\1\n    case\n      when v_order_type = ''produto'' and p_payload->>''fulfillment_type'' = ''entrega'' then nullif(trim(p_payload->>''delivery_reference''), '''')\n      when v_transport_fee > 0 then nullif(trim(p_payload->>''service_transport_reference''), '''')\n      else null\n    end,\\2'
    );

    if v_definition = v_original_definition then
      raise exception 'Nao foi localizado o ponto de VALUES para delivery_reference.';
    end if;
  end if;

  v_order_position := strpos(v_definition, 'insert into public.service_delivery_orders');
  v_order_definition := substring(v_definition from v_order_position);
  if v_order_definition !~ 'delivery_city,\s+delivery_reference,\s+contact_phone'
    or v_order_definition !~ 'p_payload->>''delivery_reference'''
    or v_order_definition !~ 'p_payload->>''service_transport_reference'''
    or v_order_definition !~ 'delivery_reference\s*=\s*excluded\.delivery_reference'
  then
    raise exception 'A gravacao completa do endereco ainda esta inconsistente na RPC do PetBot.';
  end if;

  if v_definition <> v_original_definition then
    execute v_definition;
  end if;
end
$migration$;

revoke all on function public.create_petbot_order_transaction(jsonb)
  from public, anon, authenticated;
grant execute on function public.create_petbot_order_transaction(jsonb)
  to service_role;

notify pgrst, 'reload schema';

commit;
