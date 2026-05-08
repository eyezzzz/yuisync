-- =============================================================================
-- YuiSync Core Engine - Seed fix for real Supabase schemas
-- =============================================================================
-- Resolve falha de seed quando appointments.pet_id/client_id sao obrigatorios.
-- Pode rodar isolado no SQL Editor do Supabase.
-- =============================================================================

begin;

do $$
declare
  v_company_id uuid := '00000000-0000-0000-0000-000000000002';
  v_tenant_id uuid;
  v_has_companies_table boolean := false;
  v_has_appointments_company_id boolean := false;
  v_tomorrow date := ((now() at time zone 'America/Sao_Paulo')::date + 1);
  v_hour int;
  v_start time;
  v_end time;
  v_status text;
  v_service_type_value text;
  v_customer_name_value text;
  v_customer_phone_value text;
  v_status_constraint text;
  v_status_value text;
  v_allowed_statuses text[] := '{}';
  v_seed_free_status text;
  v_seed_booked_status text;
  v_company_free_status text;
  v_company_booked_status text;
  v_has_company_free_status boolean := false;
  v_has_company_booked_status boolean := false;

  v_has_clients_table boolean := false;
  v_has_pets_table boolean := false;
  v_has_client_id boolean := false;
  v_has_pet_id boolean := false;
  v_client_required boolean := false;
  v_pet_required boolean := false;
  v_clients_has_tenant boolean := false;
  v_pets_has_tenant boolean := false;
  v_pets_has_module boolean := false;
  v_service_type_required boolean := false;
  v_customer_name_required boolean := false;
  v_customer_phone_required boolean := false;
  v_pet_fk_table text;

  v_seed_client_id uuid;
  v_seed_pet_id uuid;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'companies'
  ) into v_has_companies_table;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'company_id'
  ) into v_has_appointments_company_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies' and column_name = 'schedule_free_status'
  ) into v_has_company_free_status;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies' and column_name = 'schedule_booked_status'
  ) into v_has_company_booked_status;

  if not v_has_appointments_company_id then
    raise notice 'Seed ignorado: coluna appointments.company_id nao existe no schema atual.';
    return;
  end if;

  if v_has_companies_table then
    select c.tenant_id
    into v_tenant_id
    from public.companies c
    where c.id = v_company_id;

    if v_has_company_free_status and v_has_company_booked_status then
      select c.schedule_free_status, c.schedule_booked_status
      into v_company_free_status, v_company_booked_status
      from public.companies c
      where c.id = v_company_id;
    end if;
  end if;

  if v_tenant_id is null and exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tenants'
  ) then
    select t.id
    into v_tenant_id
    from public.tenants t
    where t.active = true
    order by t.created_at asc
    limit 1;
  end if;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'clients'
  ) into v_has_clients_table;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'pets'
  ) into v_has_pets_table;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'client_id'
  ) into v_has_client_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'pet_id'
  ) into v_has_pet_id;

  select coalesce((
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'client_id'
  ), false) into v_client_required;

  select coalesce((
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'pet_id'
  ), false) into v_pet_required;

  select coalesce((
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'service_type'
  ), false) into v_service_type_required;

  select coalesce((
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'customer_name'
  ), false) into v_customer_name_required;

  select coalesce((
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'customer_phone'
  ), false) into v_customer_phone_required;

  if v_has_clients_table then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'clients' and column_name = 'tenant_id'
    ) into v_clients_has_tenant;
  end if;

  if v_has_pets_table then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pets' and column_name = 'tenant_id'
    ) into v_pets_has_tenant;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pets' and column_name = 'module_id'
    ) into v_pets_has_module;
  end if;

  if v_has_client_id then
    select a.client_id
    into v_seed_client_id
    from public.appointments a
    where a.company_id = v_company_id
      and a.client_id is not null
    order by a.created_at asc
    limit 1;
  end if;

  if v_seed_client_id is null and v_has_clients_table then
    if v_clients_has_tenant and v_tenant_id is not null then
      select c.id
      into v_seed_client_id
      from public.clients c
      where c.module_id = 'petshop'
        and c.tenant_id = v_tenant_id
      order by c.created_at asc
      limit 1;
    else
      select c.id
      into v_seed_client_id
      from public.clients c
      where c.module_id = 'petshop'
      order by c.created_at asc
      limit 1;
    end if;

    if v_seed_client_id is null then
      if v_clients_has_tenant then
        insert into public.clients (
          tenant_id,
          module_id,
          type,
          name,
          phone,
          details,
          active,
          created_at
        )
        values (
          v_tenant_id,
          'petshop',
          'pet',
          'Cliente teste YuiSync',
          '+5511999999999',
          jsonb_build_object(
            'pet_name', 'Pet teste YuiSync',
            'species', 'dog',
            'breed', 'SRD'
          ),
          true,
          now()
        )
        returning id into v_seed_client_id;
      else
        insert into public.clients (
          module_id,
          type,
          name,
          phone,
          details,
          active,
          created_at
        )
        values (
          'petshop',
          'pet',
          'Cliente teste YuiSync',
          '+5511999999999',
          jsonb_build_object(
            'pet_name', 'Pet teste YuiSync',
            'species', 'dog',
            'breed', 'SRD'
          ),
          true,
          now()
        )
        returning id into v_seed_client_id;
      end if;
    end if;
  end if;

  if v_has_pet_id then
    select a.pet_id
    into v_seed_pet_id
    from public.appointments a
    where a.company_id = v_company_id
      and a.pet_id is not null
    order by a.created_at asc
    limit 1;

    select n2.nspname || '.' || c2.relname
    into v_pet_fk_table
    from pg_constraint fk
    join pg_class c1 on c1.oid = fk.conrelid
    join pg_namespace n1 on n1.oid = c1.relnamespace
    join pg_class c2 on c2.oid = fk.confrelid
    join pg_namespace n2 on n2.oid = c2.relnamespace
    join pg_attribute a on a.attrelid = c1.oid and a.attnum = any(fk.conkey)
    where fk.contype = 'f'
      and n1.nspname = 'public'
      and c1.relname = 'appointments'
      and a.attname = 'pet_id'
    limit 1;

    if v_seed_pet_id is null then
      if v_pet_fk_table = 'public.clients' then
        v_seed_pet_id := v_seed_client_id;
      elsif v_pet_fk_table = 'public.pets' and v_has_pets_table then
        if v_pets_has_tenant and v_pets_has_module and v_tenant_id is not null then
          execute $q$
            select p.id
            from public.pets p
            where p.module_id = 'petshop'
              and p.tenant_id = $1
            order by p.created_at asc
            limit 1
          $q$
          into v_seed_pet_id
          using v_tenant_id;
        elsif v_pets_has_module then
          execute $q$
            select p.id
            from public.pets p
            where p.module_id = 'petshop'
            order by p.created_at asc
            limit 1
          $q$
          into v_seed_pet_id;
        else
          execute $q$
            select p.id
            from public.pets p
            order by p.created_at asc
            limit 1
          $q$
          into v_seed_pet_id;
        end if;
      else
        v_seed_pet_id := coalesce(v_seed_pet_id, v_seed_client_id);
      end if;
    end if;
  end if;

  if v_client_required and v_seed_client_id is null then
    raise notice 'Seed ignorado: appointments.client_id obrigatorio e sem client_id valido.';
    return;
  end if;

  if v_pet_required and v_seed_pet_id is null then
    raise notice 'Seed ignorado: appointments.pet_id obrigatorio e sem pet_id valido.';
    return;
  end if;

  select pg_get_constraintdef(c.oid)
  into v_status_constraint
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'appointments'
    and c.contype = 'c'
    and (
      c.conname = 'appointments_status_check'
      or pg_get_constraintdef(c.oid) ilike '%status%'
    )
  order by case when c.conname = 'appointments_status_check' then 0 else 1 end, c.oid
  limit 1;

  if v_status_constraint is not null then
    for v_status_value in
      select lower((regexp_matches(v_status_constraint, '''([^'']+)''', 'g'))[1])
    loop
      if v_status_value is null or v_status_value = '' then
        continue;
      end if;
      if not (v_status_value = any(v_allowed_statuses)) then
        v_allowed_statuses := array_append(v_allowed_statuses, v_status_value);
      end if;
    end loop;
  end if;

  v_seed_free_status := nullif(lower(trim(coalesce(v_company_free_status, ''))), '');
  v_seed_booked_status := nullif(lower(trim(coalesce(v_company_booked_status, ''))), '');

  if coalesce(array_length(v_allowed_statuses, 1), 0) > 0 then
    if v_seed_free_status is not null and not (v_seed_free_status = any(v_allowed_statuses)) then
      v_seed_free_status := null;
    end if;
    if v_seed_booked_status is not null and not (v_seed_booked_status = any(v_allowed_statuses)) then
      v_seed_booked_status := null;
    end if;
  end if;

  if v_seed_booked_status is null then
    foreach v_status_value in array array[
      'booked', 'agendado', 'reservado', 'confirmado', 'ocupado', 'blocked', 'bloqueado', 'concluido'
    ]
    loop
      if coalesce(array_length(v_allowed_statuses, 1), 0) = 0 or v_status_value = any(v_allowed_statuses) then
        v_seed_booked_status := v_status_value;
        exit;
      end if;
    end loop;
  end if;

  if v_seed_free_status is null then
    foreach v_status_value in array array[
      'available', 'livre', 'disponivel', 'aberto', 'open', 'aguardando', 'pendente', 'cancelado'
    ]
    loop
      if (
        coalesce(array_length(v_allowed_statuses, 1), 0) = 0
        or v_status_value = any(v_allowed_statuses)
      ) and v_status_value <> coalesce(v_seed_booked_status, '') then
        v_seed_free_status := v_status_value;
        exit;
      end if;
    end loop;
  end if;

  if v_seed_booked_status is null and coalesce(array_length(v_allowed_statuses, 1), 0) > 0 then
    v_seed_booked_status := v_allowed_statuses[1];
  end if;

  if v_seed_free_status is null and coalesce(array_length(v_allowed_statuses, 1), 0) > 0 then
    select s
    into v_seed_free_status
    from unnest(v_allowed_statuses) as s
    where s <> v_seed_booked_status
    limit 1;

    v_seed_free_status := coalesce(v_seed_free_status, v_seed_booked_status);
  end if;

  v_seed_free_status := coalesce(v_seed_free_status, 'available');
  v_seed_booked_status := coalesce(
    v_seed_booked_status,
    case when v_seed_free_status = 'booked' then 'agendado' else 'booked' end
  );

  if v_has_companies_table and v_has_company_free_status and v_has_company_booked_status then
    update public.companies
    set
      schedule_free_status = v_seed_free_status,
      schedule_booked_status = v_seed_booked_status
    where id = v_company_id;
  end if;

  for v_hour in 8..17 loop
    v_start := make_time(v_hour, 0, 0);
    v_end := (v_start + interval '1 hour')::time;
    v_status := case when v_hour in (8, 11) then v_seed_booked_status else v_seed_free_status end;

    v_service_type_value := case
      when v_status = v_seed_booked_status then 'banho'
      when v_service_type_required then 'banho'
      else null
    end;

    v_customer_name_value := case
      when v_status = v_seed_booked_status then 'Cliente teste'
      when v_customer_name_required then 'Slot livre YuiSync'
      else null
    end;

    v_customer_phone_value := case
      when v_status = v_seed_booked_status then '+5511999999999'
      when v_customer_phone_required then '+5500000000000'
      else null
    end;

    if v_has_pet_id and v_has_client_id then
      update public.appointments
      set
        tenant_id = v_tenant_id,
        module_id = 'petshop',
        client_id = coalesce(v_seed_client_id, client_id),
        pet_id = coalesce(v_seed_pet_id, pet_id),
        company_id = v_company_id,
        service_date = v_tomorrow,
        start_time = v_start,
        end_time = v_end,
        scheduled_at = ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
        status = v_status,
        service_type = v_service_type_value,
        description = case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
        customer_name = v_customer_name_value,
        customer_phone = v_customer_phone_value,
        reminder_sent = false,
        reminder_sent_at = null,
        updated_at = now()
      where company_id = v_company_id
        and service_date = v_tomorrow
        and start_time = v_start;
    elsif v_has_pet_id then
      update public.appointments
      set
        tenant_id = v_tenant_id,
        module_id = 'petshop',
        pet_id = coalesce(v_seed_pet_id, pet_id),
        company_id = v_company_id,
        service_date = v_tomorrow,
        start_time = v_start,
        end_time = v_end,
        scheduled_at = ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
        status = v_status,
        service_type = v_service_type_value,
        description = case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
        customer_name = v_customer_name_value,
        customer_phone = v_customer_phone_value,
        reminder_sent = false,
        reminder_sent_at = null,
        updated_at = now()
      where company_id = v_company_id
        and service_date = v_tomorrow
        and start_time = v_start;
    elsif v_has_client_id then
      update public.appointments
      set
        tenant_id = v_tenant_id,
        module_id = 'petshop',
        client_id = coalesce(v_seed_client_id, client_id),
        company_id = v_company_id,
        service_date = v_tomorrow,
        start_time = v_start,
        end_time = v_end,
        scheduled_at = ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
        status = v_status,
        service_type = v_service_type_value,
        description = case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
        customer_name = v_customer_name_value,
        customer_phone = v_customer_phone_value,
        reminder_sent = false,
        reminder_sent_at = null,
        updated_at = now()
      where company_id = v_company_id
        and service_date = v_tomorrow
        and start_time = v_start;
    else
      update public.appointments
      set
        tenant_id = v_tenant_id,
        module_id = 'petshop',
        company_id = v_company_id,
        service_date = v_tomorrow,
        start_time = v_start,
        end_time = v_end,
        scheduled_at = ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
        status = v_status,
        service_type = v_service_type_value,
        description = case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
        customer_name = v_customer_name_value,
        customer_phone = v_customer_phone_value,
        reminder_sent = false,
        reminder_sent_at = null,
        updated_at = now()
      where company_id = v_company_id
        and service_date = v_tomorrow
        and start_time = v_start;
    end if;

    if not found then
      begin
        if v_has_pet_id and v_has_client_id then
          insert into public.appointments (
            tenant_id,
            module_id,
            company_id,
            client_id,
            pet_id,
            service_date,
            start_time,
            end_time,
            scheduled_at,
            status,
            service_type,
            description,
            customer_name,
            customer_phone,
            reminder_sent,
            reminder_sent_at,
            created_at,
            updated_at
          )
          values (
            v_tenant_id,
            'petshop',
            v_company_id,
            v_seed_client_id,
            v_seed_pet_id,
            v_tomorrow,
            v_start,
            v_end,
            ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
            v_status,
            v_service_type_value,
            case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
            v_customer_name_value,
            v_customer_phone_value,
            false,
            null,
            now(),
            now()
          );
        elsif v_has_pet_id then
          insert into public.appointments (
            tenant_id,
            module_id,
            company_id,
            pet_id,
            service_date,
            start_time,
            end_time,
            scheduled_at,
            status,
            service_type,
            description,
            customer_name,
            customer_phone,
            reminder_sent,
            reminder_sent_at,
            created_at,
            updated_at
          )
          values (
            v_tenant_id,
            'petshop',
            v_company_id,
            v_seed_pet_id,
            v_tomorrow,
            v_start,
            v_end,
            ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
            v_status,
            v_service_type_value,
            case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
            v_customer_name_value,
            v_customer_phone_value,
            false,
            null,
            now(),
            now()
          );
        elsif v_has_client_id then
          insert into public.appointments (
            tenant_id,
            module_id,
            company_id,
            client_id,
            service_date,
            start_time,
            end_time,
            scheduled_at,
            status,
            service_type,
            description,
            customer_name,
            customer_phone,
            reminder_sent,
            reminder_sent_at,
            created_at,
            updated_at
          )
          values (
            v_tenant_id,
            'petshop',
            v_company_id,
            v_seed_client_id,
            v_tomorrow,
            v_start,
            v_end,
            ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
            v_status,
            v_service_type_value,
            case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
            v_customer_name_value,
            v_customer_phone_value,
            false,
            null,
            now(),
            now()
          );
        else
          insert into public.appointments (
            tenant_id,
            module_id,
            company_id,
            service_date,
            start_time,
            end_time,
            scheduled_at,
            status,
            service_type,
            description,
            customer_name,
            customer_phone,
            reminder_sent,
            reminder_sent_at,
            created_at,
            updated_at
          )
          values (
            v_tenant_id,
            'petshop',
            v_company_id,
            v_tomorrow,
            v_start,
            v_end,
            ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
            v_status,
            v_service_type_value,
            case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
            v_customer_name_value,
            v_customer_phone_value,
            false,
            null,
            now(),
            now()
          );
        end if;
      exception
        when unique_violation then
          null;
      end;
    end if;
  end loop;
end $$;

do $$
declare
  v_tenant uuid;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'system_update_logs'
  ) then
    select c.tenant_id
    into v_tenant
    from public.companies c
    where c.id = '00000000-0000-0000-0000-000000000002';

    if v_tenant is null then
      select t.id into v_tenant
      from public.tenants t
      where t.active = true
      order by t.created_at asc
      limit 1;
    end if;

    insert into public.system_update_logs (
      tenant_id,
      module_id,
      category,
      status,
      source,
      title,
      description,
      fingerprint,
      created_at
    )
    values (
      v_tenant,
      'system',
      'infra',
      'success',
      'changelog',
      'Compatibilidade do seed de agenda com schema real',
      'Hotfix aplicado para seed do motor central YuiSync em schemas com pet_id/client_id obrigatorios e checks customizados de appointments.status.',
      'milestone-yui-core-seed-compat-20260403',
      now()
    )
    on conflict (fingerprint) do nothing;
  end if;
end $$;

commit;
