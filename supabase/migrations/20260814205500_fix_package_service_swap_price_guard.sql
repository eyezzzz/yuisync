begin;

-- O guard introduzido para reaplicar pacote em agendamentos já existentes usa a
-- queda de preço como sinal de que a Agenda tentou aplicar um benefício. Isso é
-- correto quando o código do serviço permanece o mesmo, mas gera falso positivo
-- quando o usuário troca, por exemplo, Tosa na Tesoura por uma Tosa na Máquina
-- mais barata: o novo serviço é avulso, porém `price` também diminui.
--
-- Preservamos integralmente o guard atual (inclusive reabertura de venda, saneio
-- de estados legados e proteção contra conversão silenciosa em avulso). A nova
-- camada remove somente `price` do payload quando existe mudança real de serviço.
-- Nessa situação o core já recalcula catálogo/pacote por causa da troca de código,
-- portanto a heurística de queda de preço não é necessária nem desejável.

do $$
begin
  if to_regprocedure('public.update_petshop_appointment_transaction_package_price_guard(uuid,jsonb)') is null then
    alter function public.update_petshop_appointment_transaction(uuid, jsonb)
      rename to update_petshop_appointment_transaction_package_price_guard;
  end if;
end;
$$;

create or replace function public.update_petshop_appointment_transaction(
  p_appointment_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.appointments%rowtype;
  v_has_current boolean := false;
  v_requested_service_codes text[] := array[]::text[];
  v_current_service_codes text[] := array[]::text[];
  v_services_changed boolean := false;
  v_service_type_changed boolean := false;
  v_safe_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  select *
  into v_current
  from public.appointments
  where id = p_appointment_id;

  v_has_current := found;

  -- Deixa o guard preservado produzir as mensagens/validações canônicas quando
  -- o agendamento não existe ou quando o payload não contém lista de serviços.
  if v_has_current and p_payload ? 'services' then
    select coalesce(array_agg(requested.code order by requested.ordinality), array[]::text[])
    into v_requested_service_codes
    from (
      select
        entry.ordinality,
        nullif(trim(coalesce(entry.item->>'code', entry.item->>'service_type')), '') as code
      from jsonb_array_elements(coalesce(p_payload->'services', '[]'::jsonb))
        with ordinality as entry(item, ordinality)
    ) requested
    where requested.code is not null;

    select coalesce(array_agg(current_item.code order by current_item.ordinality), array[]::text[])
    into v_current_service_codes
    from (
      select
        entry.ordinality,
        nullif(trim(coalesce(entry.item->>'code', entry.item->>'service_type')), '') as code
      from jsonb_array_elements(coalesce(v_current.service_items, '[]'::jsonb))
        with ordinality as entry(item, ordinality)
    ) current_item
    where current_item.code is not null;

    v_services_changed := v_requested_service_codes is distinct from v_current_service_codes;
  end if;

  if v_has_current then
    v_service_type_changed := nullif(trim(p_payload->>'service_type'), '') is not null
      and nullif(trim(p_payload->>'service_type'), '')
        is distinct from nullif(trim(v_current.service_type), '');
  end if;

  if v_services_changed or v_service_type_changed then
    -- O core resolve preço, duração, benefício e transporte novamente quando há
    -- troca real de serviço. Retirar `price` impede apenas que a camada de
    -- compatibilidade interprete "novo serviço mais barato" como "pacote".
    v_safe_payload := v_safe_payload - 'price';
  end if;

  return public.update_petshop_appointment_transaction_package_price_guard(
    p_appointment_id,
    v_safe_payload
  );
end;
$$;

revoke all on function public.update_petshop_appointment_transaction(uuid, jsonb) from public;
grant execute on function public.update_petshop_appointment_transaction(uuid, jsonb)
  to authenticated, service_role;

comment on function public.update_petshop_appointment_transaction(uuid, jsonb) is
  'Evita falso positivo de pacote em troca real de serviço e delega ao guard transacional preservado.';

notify pgrst, 'reload schema';

commit;
