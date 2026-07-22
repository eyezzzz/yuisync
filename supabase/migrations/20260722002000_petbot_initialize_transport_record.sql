begin;

-- Repair the already-deployed PetBot RPC without duplicating its large body.
-- pg_get_functiondef returns a complete CREATE OR REPLACE statement, allowing
-- this forward migration to insert the initialization at the single canonical
-- entry point while preserving every other transactional invariant.
do $migration$
declare
  v_definition text;
  v_anchor text := E'begin\n  if v_session_id is null or v_tenant_id is null then';
  v_replacement text := E'begin\n  select null::text as id, null::text as label, 0::numeric as fee\n  into v_transport_option;\n\n  if v_session_id is null or v_tenant_id is null then';
begin
  select pg_get_functiondef('public.create_petbot_order_transaction(jsonb)'::regprocedure)
  into v_definition;

  if position('select null::text as id, null::text as label, 0::numeric as fee' in v_definition) > 0 then
    return;
  end if;

  if position(v_anchor in v_definition) = 0 then
    raise exception 'Nao foi possivel localizar o ponto de inicializacao da RPC do PetBot.';
  end if;

  execute replace(v_definition, v_anchor, v_replacement);
end
$migration$;

revoke all on function public.create_petbot_order_transaction(jsonb) from public, anon, authenticated;
grant execute on function public.create_petbot_order_transaction(jsonb) to service_role;

commit;
