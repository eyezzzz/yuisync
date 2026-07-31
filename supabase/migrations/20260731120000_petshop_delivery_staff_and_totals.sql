begin;

alter table public.appointments
  add column if not exists delivery_staff_key text,
  add column if not exists delivery_staff_name text;

alter table public.service_delivery_orders
  add column if not exists assigned_staff_key text,
  add column if not exists assigned_staff_name text,
  add column if not exists delivery_value numeric(10, 2) not null default 0;

create index if not exists appointments_delivery_staff_period_idx
  on public.appointments (tenant_id, module_id, delivery_staff_key, scheduled_at)
  where delivery_staff_key is not null;

create index if not exists service_delivery_orders_manual_staff_period_idx
  on public.service_delivery_orders (tenant_id, module_id, assigned_staff_key, updated_at)
  where assigned_staff_key is not null;

update public.service_delivery_orders orders
set delivery_value = greatest(0, coalesce(sales.delivery_fee, 0))
from public.sales sales
where orders.sale_id = sales.id
  and orders.order_type = 'entrega'
  and coalesce(orders.delivery_value, 0) = 0;

comment on column public.appointments.delivery_staff_key is
  'Identificador operacional do motoboy configurado manualmente, sem perfil ou login.';
comment on column public.appointments.delivery_staff_name is
  'Nome congelado do motoboy responsavel pelo MotoDog do agendamento.';
comment on column public.service_delivery_orders.assigned_staff_key is
  'Identificador operacional do motoboy configurado manualmente, sem perfil ou login.';
comment on column public.service_delivery_orders.assigned_staff_name is
  'Nome congelado do motoboy responsavel pela entrega da venda.';
comment on column public.service_delivery_orders.delivery_value is
  'Valor integral da entrega usado no fechamento operacional do motoboy.';

commit;
