-- Remove only artifacts created by petbot_bath_booking_50_case_test.sql when
-- an older copy of the suite was executed without its outer ROLLBACK.
begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

create temporary table petbot_bath_artifacts on commit drop as
select distinct
  commit_row.tenant_id,
  commit_row.session_id,
  commit_row.idempotency_key,
  nullif(commit_row.result->>'sale_id', '')::uuid as sale_id,
  nullif(commit_row.result->>'order_id', '')::uuid as order_id,
  nullif(commit_row.result->>'appointment_id', '')::uuid as appointment_id,
  appointment.pet_id
from public.petbot_order_commits commit_row
left join public.appointments appointment
  on appointment.id = nullif(commit_row.result->>'appointment_id', '')::uuid
where commit_row.idempotency_key like 'bath-50-%';

-- The test reused a real chat session. Remove only values whose terminal key
-- still points at the artificial transaction and recover its message timestamp.
update public.chat_sessions session
set context = coalesce(session.context, '{}'::jsonb)
      - 'last_sale_id'
      - 'last_order_id'
      - 'last_appointment_id'
      - 'last_total'
      - 'last_payment_status'
      - 'last_petbot_idempotency_key',
    intent = 'geral',
    last_message_at = coalesce((
      select max(message.sent_at)
      from public.chat_messages message
      where message.session_id = session.id
    ), session.opened_at, session.created_at)
where exists (
    select 1
    from petbot_bath_artifacts artifact
    where artifact.session_id = session.id
  )
  and coalesce(session.context->>'last_petbot_idempotency_key', '') like 'bath-50-%';

delete from public.service_delivery_orders service_order
using petbot_bath_artifacts artifact
where service_order.id = artifact.order_id;

delete from public.appointments appointment
using petbot_bath_artifacts artifact
where appointment.id = artifact.appointment_id;

delete from public.sales sale
using petbot_bath_artifacts artifact
where sale.id = artifact.sale_id;

delete from public.pets pet
where pet.pet_name like '__PETBOT_BATH_50_%'
  and (
    exists (
      select 1 from petbot_bath_artifacts artifact where artifact.pet_id = pet.id
    )
    or not exists (
      select 1 from public.appointments appointment where appointment.pet_id = pet.id
    )
  );

delete from public.petbot_order_commits commit_row
where commit_row.idempotency_key like 'bath-50-%';

select jsonb_build_object(
  'remaining_test_pets', (
    select count(*) from public.pets where pet_name like '__PETBOT_BATH_50_%'
  ),
  'remaining_test_commits', (
    select count(*) from public.petbot_order_commits where idempotency_key like 'bath-50-%'
  ),
  'cleaned_sales', (select count(*) from petbot_bath_artifacts where sale_id is not null),
  'cleaned_appointments', (select count(*) from petbot_bath_artifacts where appointment_id is not null)
) as cleanup_report;

commit;
