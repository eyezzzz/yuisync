begin;

-- Agendamentos antigos gravavam apenas o valor dos servicos em price.
-- A migration anterior corrigiu novas gravacoes; esta reconcilia somente linhas
-- em que o valor persistido ainda coincide com a soma dos itens de servico.
with appointment_service_prices as (
  select
    appointment.id,
    round(coalesce(sum(
      case
        when nullif(trim(item->>'unit_price'), '') ~ '^\d+(?:[\.,]\d+)?$'
          then replace(item->>'unit_price', ',', '.')::numeric
        when nullif(trim(item->>'price'), '') ~ '^\d+(?:[\.,]\d+)?$'
          then replace(item->>'price', ',', '.')::numeric
        when nullif(trim(item->>'default_price'), '') ~ '^\d+(?:[\.,]\d+)?$'
          then replace(item->>'default_price', ',', '.')::numeric
        else 0
      end
    ), 0), 2) as service_price,
    public.resolve_petshop_transport_fee(
      appointment.tenant_id,
      appointment.module_id,
      coalesce(appointment.transport_mode, 'cliente_leva')
    ) as transport_fee
  from public.appointments appointment
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(appointment.service_items, '[]'::jsonb)) = 'array'
        then coalesce(appointment.service_items, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) item
  where appointment.module_id = 'petshop'
    and coalesce(appointment.transport_mode, 'cliente_leva') <> 'cliente_leva'
  group by appointment.id
), legacy_totals as (
  select
    appointment.id,
    prices.service_price,
    prices.transport_fee
  from public.appointments appointment
  join appointment_service_prices prices on prices.id = appointment.id
  where prices.service_price > 0
    and prices.transport_fee > 0
    and abs(coalesce(appointment.price, 0) - prices.service_price) < 0.01
)
update public.appointments appointment
set price = round(legacy_totals.service_price + legacy_totals.transport_fee, 2),
    updated_at = now()
from legacy_totals
where appointment.id = legacy_totals.id;

commit;
