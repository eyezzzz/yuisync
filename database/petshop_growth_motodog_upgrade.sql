-- =============================================================================
-- YuiSync PetShop Growth - Upgrade MotoDog no agendamento online
-- =============================================================================
-- Execute este SQL apos petshop_growth_suite.sql
-- =============================================================================

begin;

alter table public.petshop_growth_booking_requests
  add column if not exists transport_mode text default 'dropoff',
  add column if not exists need_motodog boolean default false,
  add column if not exists motodog_fee numeric(10,2) default 0,
  add column if not exists pickup_address text,
  add column if not exists pickup_neighborhood text,
  add column if not exists pickup_city text;

update public.petshop_growth_booking_requests
set
  transport_mode = coalesce(transport_mode, 'dropoff'),
  need_motodog = coalesce(need_motodog, false),
  motodog_fee = coalesce(motodog_fee, 0)
where true;

create or replace function public.create_petshop_booking_request(
  p_slug text,
  p_customer_name text,
  p_pet_name text default null,
  p_phone text default null,
  p_service_interest text default null,
  p_preferred_date date default null,
  p_preferred_period text default null,
  p_transport_mode text default 'dropoff',
  p_need_motodog boolean default false,
  p_motodog_fee numeric default 0,
  p_pickup_address text default null,
  p_pickup_neighborhood text default null,
  p_pickup_city text default null,
  p_notes text default null,
  p_channel text default 'site'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_setting record;
  v_request_id uuid;
  v_mode text;
begin
  select tenant_id, module_id, enabled
  into v_setting
  from public.petshop_growth_booking_settings
  where public_slug = p_slug
  limit 1;

  if v_setting is null then
    raise exception 'Link de agendamento nao encontrado.';
  end if;

  if coalesce(v_setting.enabled, false) = false then
    raise exception 'Agendamento online indisponivel no momento.';
  end if;

  v_mode := case
    when coalesce(p_transport_mode, 'dropoff') in ('dropoff', 'pickup') then coalesce(p_transport_mode, 'dropoff')
    else 'dropoff'
  end;

  insert into public.petshop_growth_booking_requests (
    tenant_id,
    module_id,
    channel,
    customer_name,
    pet_name,
    phone,
    service_interest,
    preferred_date,
    preferred_period,
    transport_mode,
    need_motodog,
    motodog_fee,
    pickup_address,
    pickup_neighborhood,
    pickup_city,
    status,
    notes
  )
  values (
    v_setting.tenant_id,
    v_setting.module_id,
    coalesce(nullif(p_channel, ''), 'site'),
    p_customer_name,
    nullif(p_pet_name, ''),
    nullif(p_phone, ''),
    nullif(p_service_interest, ''),
    p_preferred_date,
    nullif(p_preferred_period, ''),
    v_mode,
    coalesce(p_need_motodog, false),
    case when coalesce(p_need_motodog, false) then coalesce(p_motodog_fee, 0) else 0 end,
    case when coalesce(p_need_motodog, false) then nullif(p_pickup_address, '') else null end,
    case when coalesce(p_need_motodog, false) then nullif(p_pickup_neighborhood, '') else null end,
    case when coalesce(p_need_motodog, false) then nullif(p_pickup_city, '') else null end,
    'pending',
    nullif(p_notes, '')
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

grant execute on function public.create_petshop_booking_request(
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  boolean,
  numeric,
  text,
  text,
  text,
  text,
  text
) to anon, authenticated;

do $$
declare
  v_tenant uuid;
begin
  if to_regclass('public.system_update_logs') is not null then
    select id into v_tenant from public.tenants order by created_at asc limit 1;
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
      'petshop',
      'operacao',
      'success',
      'changelog',
      'Agendamento online com MotoDog',
      'Fluxo de agendamento passou a registrar retirada MotoDog, taxa e endereco completo.',
      'milestone-petshop-booking-motodog-20260404',
      now()
    )
    on conflict (fingerprint) do nothing;
  end if;
end;
$$;

commit;
