begin;

alter table public.settings
  add column if not exists petshop_operational_staff jsonb not null
  default '[{"key":"esteticista-1","name":"Esteticista 1","active":true},{"key":"esteticista-2","name":"Esteticista 2","active":true}]'::jsonb;

update public.settings
set petshop_operational_staff = '[{"key":"esteticista-1","name":"Esteticista 1","active":true},{"key":"esteticista-2","name":"Esteticista 2","active":true}]'::jsonb
where module_id = 'petshop'
  and (petshop_operational_staff is null or jsonb_typeof(petshop_operational_staff) <> 'array');

comment on column public.settings.petshop_operational_staff is
  'Equipe operacional configuravel usada pela Agenda e pelo fechamento de comissoes.';

commit;
