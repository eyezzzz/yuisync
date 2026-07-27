begin;

alter table public.settings
  alter column petshop_service_durations set default
  '{"small":{"min_weight_kg":0,"max_weight_kg":9.99,"bath_min":40,"machine_grooming_min":60,"scissor_grooming_min":90},"medium":{"min_weight_kg":10,"max_weight_kg":999.99,"bath_min":60,"machine_grooming_min":90,"scissor_grooming_min":120}}'::jsonb;

update public.settings
set petshop_service_durations =
  case
    when petshop_service_durations is null or jsonb_typeof(petshop_service_durations) <> 'object' then
      '{"small":{"min_weight_kg":0,"max_weight_kg":9.99,"bath_min":40,"machine_grooming_min":60,"scissor_grooming_min":90},"medium":{"min_weight_kg":10,"max_weight_kg":999.99,"bath_min":60,"machine_grooming_min":90,"scissor_grooming_min":120}}'::jsonb
    else
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(petshop_service_durations, '{small,machine_grooming_min}',
                to_jsonb(case when coalesce((petshop_service_durations #>> '{small,machine_grooming_min}')::integer, 90) = 90 then 60 else (petshop_service_durations #>> '{small,machine_grooming_min}')::integer end), true),
              '{small,scissor_grooming_min}',
              to_jsonb(case when coalesce((petshop_service_durations #>> '{small,scissor_grooming_min}')::integer, 120) = 120 then 90 else (petshop_service_durations #>> '{small,scissor_grooming_min}')::integer end), true),
            '{medium,max_weight_kg}', to_jsonb(999.99), true),
          '{medium,machine_grooming_min}',
          to_jsonb(case when coalesce((petshop_service_durations #>> '{medium,machine_grooming_min}')::integer, 120) = 120 then 90 else (petshop_service_durations #>> '{medium,machine_grooming_min}')::integer end), true),
        '{medium,scissor_grooming_min}',
        to_jsonb(case when coalesce((petshop_service_durations #>> '{medium,scissor_grooming_min}')::integer, 150) = 150 then 120 else (petshop_service_durations #>> '{medium,scissor_grooming_min}')::integer end), true)
  end,
  updated_at = now()
where module_id = 'petshop';

comment on column public.settings.petshop_service_durations is
  'Presets editaveis: pequeno 40/60/90 min; medio ou grande 60/90/120 min.';

commit;
