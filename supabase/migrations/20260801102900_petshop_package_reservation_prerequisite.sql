begin;

-- Pre-requisito defensivo para o ledger de pacotes. Esta migration e
-- intencionalmente anterior a 20260801103000 e pode ser executada mais de uma vez.
alter table public.client_subscriptions
  add column if not exists services_reserved jsonb not null default '{}'::jsonb;

alter table public.client_subscriptions
  drop constraint if exists client_subscriptions_services_reserved_check;
alter table public.client_subscriptions
  add constraint client_subscriptions_services_reserved_check
  check (jsonb_typeof(services_reserved) = 'object');

update public.client_subscriptions
set services_reserved = '{}'::jsonb
where services_reserved is null
   or jsonb_typeof(services_reserved) <> 'object';

comment on column public.client_subscriptions.services_reserved is
  'Beneficios vinculados a agendamentos ainda nao concluidos. Nao contam como consumo realizado.';

commit;
