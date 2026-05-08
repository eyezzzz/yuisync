create or replace function public.get_petshop_portal_snapshot(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access public.petshop_growth_portal_access%rowtype;
  v_client public.clients%rowtype;
  v_next_appointments jsonb := '[]'::jsonb;
  v_balance numeric := 0;
  v_has_appointments boolean := false;
  v_has_client_id boolean := false;
  v_has_tenant_id boolean := false;
  v_has_module_id boolean := false;
begin
  select *
  into v_access
  from public.petshop_growth_portal_access
  where portal_token = p_token
  limit 1;

  if v_access is null then
    raise exception 'Portal nao encontrado.';
  end if;

  if v_access.status <> 'active' then
    raise exception 'Portal indisponivel no momento.';
  end if;

  if v_access.expires_at is not null and v_access.expires_at < now() then
    raise exception 'Portal expirado.';
  end if;

  update public.petshop_growth_portal_access
  set last_access_at = now(),
      updated_at = now()
  where id = v_access.id;

  select *
  into v_client
  from public.clients
  where id = v_access.client_id
  limit 1;

  select to_regclass('public.appointments') is not null into v_has_appointments;

  if v_has_appointments then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'appointments' and column_name = 'client_id'
    ) into v_has_client_id;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'appointments' and column_name = 'tenant_id'
    ) into v_has_tenant_id;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'appointments' and column_name = 'module_id'
    ) into v_has_module_id;

    if v_has_client_id then
      execute format(
        'select coalesce(jsonb_agg(jsonb_build_object(''scheduled_at'', q.scheduled_at, ''service_type'', q.service_type, ''status'', q.status) order by q.scheduled_at asc), ''[]''::jsonb)
           from (
             select a.scheduled_at, a.service_type, a.status
             from public.appointments a
             where a.client_id = $1
               %s
               %s
               and a.scheduled_at >= now()
             order by a.scheduled_at asc
             limit 5
           ) q',
        case when v_has_module_id then 'and a.module_id = $2' else '' end,
        case when v_has_tenant_id then 'and a.tenant_id = $3' else '' end
      )
      into v_next_appointments
      using v_access.client_id, v_access.module_id, v_access.tenant_id;
    end if;
  end if;

  if to_regclass('public.client_loyalty_balance') is not null then
    select coalesce(balance, 0)
    into v_balance
    from public.client_loyalty_balance
    where client_id = v_access.client_id
      and module_id = v_access.module_id
    limit 1;
  end if;

  return jsonb_build_object(
    'tenant_id', v_access.tenant_id,
    'module_id', v_access.module_id,
    'client_id', v_access.client_id,
    'owner_name', coalesce(v_client.name, ''),
    'pet_name', coalesce(v_client.details ->> 'pet_name', v_client.name, ''),
    'phone', coalesce(v_client.phone, ''),
    'email', coalesce(v_client.email, ''),
    'next_appointments', coalesce(v_next_appointments, '[]'::jsonb),
    'loyalty_balance', coalesce(v_balance, 0)
  );
end;
$$;

grant execute on function public.get_petshop_portal_snapshot(text) to anon, authenticated;
