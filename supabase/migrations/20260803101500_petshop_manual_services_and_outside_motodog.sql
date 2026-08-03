begin;

alter table public.appointments
  drop constraint if exists appointments_transport_mode_check;

alter table public.appointments
  add constraint appointments_transport_mode_check
  check (
    transport_mode is null
    or transport_mode in (
      'cliente_leva', 'motodog', 'buscar_e_levar',
      'buscar_e_levar_fora_muriae', 'somente_buscar', 'somente_levar'
    )
  );

update public.settings settings
set pet_transport_options = coalesce((
  select jsonb_agg(option_item)
  from jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(settings.pet_transport_options, '[]'::jsonb)) = 'array'
        then coalesce(settings.pet_transport_options, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) option_item
  where option_item->>'id' <> 'buscar_e_levar_fora_muriae'
), '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
  'id', 'buscar_e_levar_fora_muriae',
  'label', 'Buscar e levar (fora de Muriaé)',
  'fee', 30,
  'maxWeightKg', 10,
  'active', true
))
where settings.module_id = 'petshop';

update public.settings settings
set message_templates = jsonb_set(
  coalesce(settings.message_templates, '{}'::jsonb),
  '{motodog_options}',
  to_jsonb(
    coalesce(
      nullif(settings.message_templates->>'motodog_options', ''),
      E'🚗 **MotoDog**\n\n**Buscar e levar**\nPets de até 10 kg (dentro de Muriaé)\n💰 **[BUSCAR_E_LEVAR]**\n\n**Somente buscar**\nPets de até 10 kg (dentro de Muriaé)\n💰 **[SOMENTE_BUSCAR]**\n\n**Somente levar**\nPets de até 10 kg (dentro de Muriaé)\n💰 **[SOMENTE_LEVAR]**'
    ) || E'\n\n**Buscar e levar (fora de Muriaé)**\nPets de até 10 kg\n💰 **[BUSCAR_E_LEVAR_FORA_MURIAE]**'
  ),
  true
)
where settings.module_id = 'petshop'
  and position('[BUSCAR_E_LEVAR_FORA_MURIAE]' in coalesce(settings.message_templates->>'motodog_options', '')) = 0;

insert into public.petshop_services (
  tenant_id,
  module_id,
  code,
  name,
  group_type,
  default_price,
  default_duration_min,
  commission_type,
  commission_rate,
  active,
  sort_order,
  icon,
  created_at,
  updated_at
)
select distinct
  settings.tenant_id,
  'petshop',
  'motodog_buscar_levar_fora_muriae',
  'MotoDog - buscar e levar (fora de Muriaé)',
  'motoboy',
  30,
  60,
  'percentage',
  0,
  true,
  310,
  'bike',
  now(),
  now()
from public.settings settings
where settings.module_id = 'petshop'
  and settings.tenant_id is not null
on conflict (tenant_id, module_id, code) do update
set
  name = excluded.name,
  group_type = excluded.group_type,
  default_price = excluded.default_price,
  default_duration_min = excluded.default_duration_min,
  active = true,
  icon = excluded.icon,
  updated_at = now();

commit;
