begin;

create or replace function public.yuisync_uppercase_jsonb_keys(
  p_payload jsonb,
  p_keys text[]
)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := coalesce(p_payload, '{}'::jsonb);
  current_key text;
begin
  if jsonb_typeof(result) <> 'object' then
    return p_payload;
  end if;

  foreach current_key in array coalesce(p_keys, array[]::text[])
  loop
    if result ? current_key and jsonb_typeof(result -> current_key) = 'string' then
      result := jsonb_set(
        result,
        array[current_key],
        to_jsonb(upper(result ->> current_key)),
        true
      );
    end if;
  end loop;

  return result;
end;
$$;

create or replace function public.yuisync_uppercase_service_items(p_items jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := '[]'::jsonb;
  current_item jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return p_items;
  end if;

  for current_item in select value from jsonb_array_elements(p_items)
  loop
    result := result || jsonb_build_array(
      public.yuisync_uppercase_jsonb_keys(
        current_item,
        array['name', 'label', 'service_name']
      )
    );
  end loop;

  return result;
end;
$$;

create or replace function public.yuisync_uppercase_petshop_row()
returns trigger
language plpgsql
as $$
declare
  payload jsonb := to_jsonb(new);
  text_keys text[] := array[]::text[];
  current_key text;
begin
  if coalesce(payload ->> 'module_id', '') <> 'petshop' then
    return new;
  end if;

  if tg_table_name = 'clients' then
    text_keys := array[
      'name',
      'address',
      'neighborhood',
      'city',
      'notes'
    ];
  elsif tg_table_name = 'pets' then
    text_keys := array[
      'owner_name',
      'owner_address',
      'owner_neighborhood',
      'owner_city',
      'pet_name',
      'breed',
      'color',
      'notes'
    ];
  elsif tg_table_name = 'appointments' then
    text_keys := array[
      'notes',
      'responsible_staff_name',
      'delivery_staff_name',
      'transport_label',
      'transport_address',
      'transport_neighborhood',
      'transport_city',
      'transport_reference'
    ];
  end if;

  foreach current_key in array text_keys
  loop
    if payload ? current_key and jsonb_typeof(payload -> current_key) = 'string' then
      payload := jsonb_set(
        payload,
        array[current_key],
        to_jsonb(upper(payload ->> current_key)),
        true
      );
    end if;
  end loop;

  if tg_table_name = 'clients'
    and payload ? 'details'
    and jsonb_typeof(payload -> 'details') = 'object'
  then
    payload := jsonb_set(
      payload,
      '{details}',
      public.yuisync_uppercase_jsonb_keys(
        payload -> 'details',
        array[
          'pet_name',
          'breed',
          'color',
          'address_complement',
          'address_reference'
        ]
      ),
      true
    );
  end if;

  if tg_table_name = 'appointments'
    and payload ? 'service_items'
    and jsonb_typeof(payload -> 'service_items') = 'array'
  then
    payload := jsonb_set(
      payload,
      '{service_items}',
      public.yuisync_uppercase_service_items(payload -> 'service_items'),
      true
    );
  end if;

  new := jsonb_populate_record(new, payload);
  return new;
end;
$$;

update public.clients
set
  name = case when name is null then null else upper(name) end,
  address = case when address is null then null else upper(address) end,
  neighborhood = case when neighborhood is null then null else upper(neighborhood) end,
  city = case when city is null then null else upper(city) end,
  notes = case when notes is null then null else upper(notes) end,
  details = public.yuisync_uppercase_jsonb_keys(
    details,
    array[
      'pet_name',
      'breed',
      'color',
      'address_complement',
      'address_reference'
    ]
  )
where module_id = 'petshop';

do $$
declare
  set_clause text;
begin
  if to_regclass('public.pets') is not null then
    select string_agg(
      format('%1$I = case when %1$I is null then null else upper(%1$I) end', column_name),
      ', '
      order by ordinal_position
    )
    into set_clause
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pets'
      and column_name = any(array[
        'owner_name',
        'owner_address',
        'owner_neighborhood',
        'owner_city',
        'pet_name',
        'breed',
        'color',
        'notes'
      ]);

    if set_clause is not null then
      execute format(
        'update public.pets set %s where module_id = %L',
        set_clause,
        'petshop'
      );
    end if;
  end if;
end;
$$;

do $$
declare
  set_clause text;
begin
  if to_regclass('public.appointments') is not null then
    select string_agg(
      format('%1$I = case when %1$I is null then null else upper(%1$I) end', column_name),
      ', '
      order by ordinal_position
    )
    into set_clause
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointments'
      and column_name = any(array[
        'notes',
        'responsible_staff_name',
        'delivery_staff_name',
        'transport_label',
        'transport_address',
        'transport_neighborhood',
        'transport_city',
        'transport_reference'
      ]);

    if set_clause is not null then
      execute format(
        'update public.appointments set %s where module_id = %L',
        set_clause,
        'petshop'
      );
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'appointments'
        and column_name = 'service_items'
    ) then
      update public.appointments
      set service_items = public.yuisync_uppercase_service_items(service_items)
      where module_id = 'petshop'
        and service_items is not null;
    end if;
  end if;
end;
$$;

drop trigger if exists clients_petshop_uppercase_text on public.clients;
create trigger clients_petshop_uppercase_text
before insert or update on public.clients
for each row
execute function public.yuisync_uppercase_petshop_row();

do $$
begin
  if to_regclass('public.pets') is not null then
    execute 'drop trigger if exists pets_petshop_uppercase_text on public.pets';
    execute 'create trigger pets_petshop_uppercase_text before insert or update on public.pets for each row execute function public.yuisync_uppercase_petshop_row()';
  end if;

  if to_regclass('public.appointments') is not null then
    execute 'drop trigger if exists appointments_petshop_uppercase_text on public.appointments';
    execute 'create trigger appointments_petshop_uppercase_text before insert or update on public.appointments for each row execute function public.yuisync_uppercase_petshop_row()';
  end if;
end;
$$;

comment on function public.yuisync_uppercase_petshop_row() is
  'Padroniza em caixa alta somente campos textuais de clientes, pets e agenda do modulo petshop, preservando emails, telefones, codigos e campos tecnicos.';

commit;
