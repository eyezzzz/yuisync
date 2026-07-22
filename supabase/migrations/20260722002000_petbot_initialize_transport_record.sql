begin;

-- Repair the already-deployed PetBot RPC without duplicating its large body.
-- pg_get_functiondef returns a complete CREATE OR REPLACE statement, allowing
-- this forward migration to insert the initialization at the single canonical
-- entry point while preserving every other transactional invariant.
do $migration$
declare
  v_definition text;
  v_anchor_pattern text := 'begin[[:space:]]+if[[:space:]]+v_session_id[[:space:]]+is[[:space:]]+null[[:space:]]+or[[:space:]]+v_tenant_id[[:space:]]+is[[:space:]]+null[[:space:]]+then';
  v_replacement text := E'begin\n  select null::text as id, null::text as label, 0::numeric as fee\n  into v_transport_option;\n\n  if v_session_id is null or v_tenant_id is null then';
begin
  select pg_get_functiondef('public.create_petbot_order_transaction(jsonb)'::regprocedure)
  into v_definition;

  if v_definition ~* 'select[[:space:]]+null::text[[:space:]]+as[[:space:]]+id,[[:space:]]+null::text[[:space:]]+as[[:space:]]+label,[[:space:]]+0::numeric[[:space:]]+as[[:space:]]+fee' then
    return;
  end if;

  if v_definition !~* v_anchor_pattern then
    raise exception 'Nao foi possivel localizar o ponto de inicializacao da RPC do PetBot.';
  end if;

  execute regexp_replace(v_definition, v_anchor_pattern, v_replacement, 'i');
end
$migration$;

revoke all on function public.create_petbot_order_transaction(jsonb) from public, anon, authenticated;
grant execute on function public.create_petbot_order_transaction(jsonb) to service_role;

commit;
