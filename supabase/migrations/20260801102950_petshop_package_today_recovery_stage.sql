begin;

-- A migration principal 1030 foi criada antes da regra definitiva
-- "hoje permanece reservado". Este estágio preserva o horário original e
-- desloca temporariamente para o fim do mesmo dia apenas os ciclos ativos que
-- já possuem recorrência criada hoje. Assim o backfill da 1030 não classifica
-- a reserva de hoje como atendimento legado.
create table if not exists public._yuisync_package_today_recovery_stage (
  subscription_id uuid primary key,
  tenant_id uuid not null,
  original_first_appointment_at timestamptz not null,
  staged_at timestamptz not null default now()
);

insert into public._yuisync_package_today_recovery_stage (
  subscription_id,
  tenant_id,
  original_first_appointment_at
)
select
  subscription.id,
  subscription.tenant_id,
  subscription.first_appointment_at
from public.client_subscriptions subscription
where subscription.module_id = 'petshop'
  and subscription.status = 'active'
  and subscription.first_appointment_at is not null
  and subscription.first_appointment_at::date = current_date
  and subscription.recurring_appointments_created_at is not null
  and exists (
    select 1
    from public.appointments appointment
    where appointment.subscription_id = subscription.id
      and appointment.tenant_id = subscription.tenant_id
      and appointment.module_id = subscription.module_id
      and appointment.source = 'package_activation'
      and appointment.subscription_benefit_status = 'reserved'
      and appointment.scheduled_at::date = current_date
      and appointment.status not in ('concluido', 'completed', 'finalizado', 'cancelado', 'no_show')
  )
on conflict (subscription_id) do nothing;

update public.client_subscriptions subscription
set first_appointment_at = current_date + time '23:59:59',
    updated_at = now()
from public._yuisync_package_today_recovery_stage stage
where subscription.id = stage.subscription_id
  and subscription.tenant_id = stage.tenant_id
  and subscription.first_appointment_at::date = current_date
  and subscription.first_appointment_at < current_date + time '23:59:59';

comment on table public._yuisync_package_today_recovery_stage is
  'Estagio temporario da migracao de pacotes; restaurado e removido pela migration 1035.';

commit;
