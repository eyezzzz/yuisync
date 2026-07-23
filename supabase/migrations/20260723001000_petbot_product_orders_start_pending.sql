begin;

-- A confirmed PetBot sale still needs an operational acknowledgement from the
-- store. Keep the sale committed and idempotent, but place its delivery order
-- in "Pendente" until the team starts separating the items.
do $migration$
declare
  v_definition text;
  v_current_status text := 'case when v_order_type = ''produto'' then ''separacao'' else ''agendado'' end';
  v_pending_status text := 'case when v_order_type = ''produto'' then ''pendente'' else ''agendado'' end';
begin
  select pg_get_functiondef('public.create_petbot_order_transaction(jsonb)'::regprocedure)
  into v_definition;

  if position(v_pending_status in v_definition) > 0 then
    return;
  end if;

  if position(v_current_status in v_definition) = 0 then
    raise exception 'Nao foi possivel localizar o status inicial da ordem de produto na RPC do PetBot.';
  end if;

  execute replace(v_definition, v_current_status, v_pending_status);

  select pg_get_functiondef('public.create_petbot_order_transaction(jsonb)'::regprocedure)
  into v_definition;
  if position(v_pending_status in v_definition) = 0 then
    raise exception 'A RPC do PetBot nao passou a criar ordens de produto como pendentes.';
  end if;
end
$migration$;

revoke all on function public.create_petbot_order_transaction(jsonb) from public, anon, authenticated;
grant execute on function public.create_petbot_order_transaction(jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
