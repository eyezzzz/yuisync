begin;

-- A legacy AFTER INSERT trigger on sales creates the delivery/service order.
-- The PetBot RPC then enriches the same logical row. Convert that second write
-- into an upsert so both integrations can coexist without violating sale_id.
do $migration$
declare
  v_definition text;
  v_conflict_pattern text := 'on[[:space:]]+conflict[[:space:]]*\(sale_id\)[[:space:]]+where[[:space:]]+sale_id[[:space:]]+is[[:space:]]+not[[:space:]]+null';
  v_return_pattern text := 'v_notes,[[:space:]]+now\(\)[[:space:]]+\)[[:space:]]+returning[[:space:]]+id[[:space:]]+into[[:space:]]+v_order_id;';
  v_replacement text := E'v_notes,\n    now()\n  )\n  on conflict (sale_id) where sale_id is not null do update\n  set tenant_id = excluded.tenant_id,\n      module_id = excluded.module_id,\n      client_id = excluded.client_id,\n      session_id = excluded.session_id,\n      source = excluded.source,\n      order_type = excluded.order_type,\n      status = excluded.status,\n      scheduled_for = excluded.scheduled_for,\n      delivery_address = excluded.delivery_address,\n      delivery_neighborhood = excluded.delivery_neighborhood,\n      delivery_city = excluded.delivery_city,\n      contact_phone = excluded.contact_phone,\n      payment_status = excluded.payment_status,\n      transport_mode = excluded.transport_mode,\n      transport_label = excluded.transport_label,\n      notes = excluded.notes,\n      updated_at = excluded.updated_at\n  returning id into v_order_id;';
begin
  select pg_get_functiondef('public.create_petbot_order_transaction(jsonb)'::regprocedure)
  into v_definition;

  if v_definition ~* v_conflict_pattern then
    return;
  end if;

  if v_definition !~* v_return_pattern then
    raise exception 'Nao foi possivel localizar a gravacao da ordem de servico na RPC do PetBot.';
  end if;

  execute regexp_replace(v_definition, v_return_pattern, v_replacement, 'i');
end
$migration$;

revoke all on function public.create_petbot_order_transaction(jsonb) from public, anon, authenticated;
grant execute on function public.create_petbot_order_transaction(jsonb) to service_role;

commit;
