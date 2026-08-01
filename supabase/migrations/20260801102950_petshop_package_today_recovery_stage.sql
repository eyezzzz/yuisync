begin;

-- A migration principal 1030 foi criada antes da regra definitiva
-- "hoje permanece reservado". Este estágio preserva o horário original e
-- desloca temporariamente o horário semanal para o fim de hoje quando qualquer
-- uma das quatro ocorrências cai no dia atual. As datas da série não mudam.
create table if not exists public._yuisync_package_today_recovery_stage (
  subscription_id uuid primary key,
  tenant_id uuid not null,
  original_first_appointment_at timestamptz not null,
  today_appointment_at timestamptz not null,
  staged_at timestamptz not null default now()
);

insert into public._yuisync_package_today_recovery_stage (
  subscription_id,
  tenant_id,
  original_first_appointment_at,
  today_appointment_at
)
select
  subscription.id,
  subscription.tenant_id,
  subscription.first_appointment_at,
  today_reservation.scheduled_at
from public.client_subscriptions subscription
join lateral (
  select appointment.scheduled_at
  from public.appointments appointment
  where appointment.subscription_id = subscription.id
    and appointment.tenant_id = subscription.tenant_id
    and appointment.module_id = subscription.module_id
    and appointment.source = 'package_activation'
    and appointment.subscription_benefit_status = 'reserved'
    and appointment.scheduled_at::date = current_date
    and appointment.status not in ('concluido', 'completed', 'finalizado', 'cancelado', 'no_show')
  order by appointment.scheduled_at
  limit 1
) today_reservation on true
where subscription.module_id = 'petshop'
  and subscription.status = 'active'
  and subscription.first_appointment_at is not null
  and subscription.recurring_appointments_created_at is not null
on conflict (subscription_id) do nothing;

update public.client_subscriptions subscription
set first_appointment_at = stage.original_first_appointment_at
      + ((date_trunc('day', stage.today_appointment_at) + interval '23 hours 59 minutes 59 seconds')
        - stage.today_appointment_at),
    updated_at = now()
from public._yuisync_package_today_recovery_stage stage
where subscription.id = stage.subscription_id
  and subscription.tenant_id = stage.tenant_id
  and stage.today_appointment_at
      < date_trunc('day', stage.today_appointment_at) + interval '23 hours 59 minutes 59 seconds';

comment on table public._yuisync_package_today_recovery_stage is
  'Estagio temporario da migracao de pacotes; restaura o horario original na migration 1035.';

commit;
