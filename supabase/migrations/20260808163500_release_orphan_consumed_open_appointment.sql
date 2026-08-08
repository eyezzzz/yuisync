begin;

-- Alguns registros legados ficaram em um estado ainda mais inconsistente:
-- o agendamento está aberto (agendado/confirmado/em_andamento), o snapshot
-- continua como `consumed`, mas `subscription_id` já é NULL. Nesse cenário não
-- existe assinatura vinculada para reverter e a proteção antiga bloqueia a
-- edição antes que a transação consiga reconstruir o serviço.
--
-- Para atendimentos SEM venda/caixa vinculada, esse marcador órfão pode ser
-- liberado com segurança. Se existir venda, continuamos exigindo estorno.

create or replace function public.release_orphan_consumed_petshop_appointment(
  p_appointment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
begin
  select *
  into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found
    or v_appointment.module_id <> 'petshop'
    or v_appointment.status in ('concluido', 'completed', 'finalizado')
    or v_appointment.subscription_benefit_status <> 'consumed'
  then
    return false;
  end if;

  if exists (
    select 1
    from public.sales sale
    where sale.tenant_id = v_appointment.tenant_id
      and sale.module_id = v_appointment.module_id
      and sale.appointment_id = v_appointment.id
  ) then
    raise exception 'Atendimento já lançado no caixa. Estorne o lançamento antes de alterar serviço ou transporte.';
  end if;

  -- Quando há assinatura vinculada, usa a rotina completa para devolver o
  -- consumo ao pacote antes de liberar o snapshot do agendamento.
  if v_appointment.subscription_id is not null then
    perform public.repair_petshop_reopened_consumed_appointment(p_appointment_id);
    return true;
  end if;

  -- Sem subscription_id não há contador de pacote identificável para reverter.
  -- O que restou é somente o snapshot órfão no agendamento. Liberamos esse
  -- snapshot e deixamos a edição seguinte reconstruir preço/serviço normalmente.
  update public.appointments
  set subscription_benefits = public.mark_petshop_subscription_benefits(
        coalesce(subscription_benefits, '[]'::jsonb),
        'released'
      ),
      subscription_benefit_used = false,
      subscription_discount = 0,
      subscription_label = null,
      subscription_benefit_status = 'released',
      updated_at = now()
  where id = p_appointment_id
    and tenant_id = v_appointment.tenant_id;

  return true;
end;
$$;

revoke all on function public.release_orphan_consumed_petshop_appointment(uuid) from public;
grant execute on function public.release_orphan_consumed_petshop_appointment(uuid)
  to service_role;

-- Atualiza a camada externa da RPC para sanear QUALQUER `aberto + consumed`,
-- inclusive quando o vínculo histórico de assinatura já não existe.
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
  v_tenant_id uuid := nullif(p_payload->>'tenant_id', '')::uuid;
  v_module_id text := coalesce(nullif(trim(p_payload->>'module_id'), ''), 'petshop');
  v_requested_status text := nullif(trim(p_payload->>'status'), '');
begin
  select *
  into v_current
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'Agendamento nao encontrado.';
  end if;

  if v_tenant_id is null then
    v_tenant_id := v_current.tenant_id;
  end if;

  if v_current.tenant_id <> v_tenant_id
    or v_current.module_id <> v_module_id
    or not public.has_tenant_access(v_tenant_id)
  then
    raise exception 'Agendamento nao pertence ao tenant ativo.';
  end if;

  -- Se o mesmo Save está reabrindo um concluído e alterando serviço, muda apenas
  -- o status primeiro para que o trigger de transição consiga desfazer o consumo.
  if v_current.status in ('concluido', 'completed', 'finalizado')
    and coalesce(v_requested_status, v_current.status) not in ('concluido', 'completed', 'finalizado')
    and v_current.subscription_benefit_status = 'consumed'
  then
    update public.appointments
    set status = v_requested_status,
        updated_at = now()
    where id = p_appointment_id
      and tenant_id = v_tenant_id;

    select *
    into v_current
    from public.appointments
    where id = p_appointment_id
      and tenant_id = v_tenant_id
    for update;
  end if;

  -- Caso confirmado em produção: o registro já está aberto, porém continua
  -- `consumed`. Não condicionamos mais o reparo à existência de subscription_id.
  if v_current.status not in ('concluido', 'completed', 'finalizado')
    and v_current.subscription_benefit_status = 'consumed'
  then
    perform public.release_orphan_consumed_petshop_appointment(p_appointment_id);

    select *
    into v_current
    from public.appointments
    where id = p_appointment_id
      and tenant_id = v_tenant_id
    for update;

    if v_current.subscription_benefit_status = 'consumed' then
      raise exception 'Estado legado de pacote não pôde ser liberado para edição.';
    end if;
  end if;

  return public.update_petshop_appointment_transaction_core(
    p_appointment_id,
    p_payload
  );
end;
$$;

revoke all on function public.update_petshop_appointment_transaction(uuid, jsonb) from public;
grant execute on function public.update_petshop_appointment_transaction(uuid, jsonb)
  to authenticated, service_role;

-- Saneamento imediato dos registros órfãos já abertos. Atendimentos com venda
-- vinculada permanecem intactos e protegidos.
do $$
declare
  v_appointment record;
begin
  for v_appointment in
    select appointment.id
    from public.appointments appointment
    where appointment.module_id = 'petshop'
      and appointment.status not in ('concluido', 'completed', 'finalizado')
      and appointment.subscription_benefit_status = 'consumed'
      and not exists (
        select 1
        from public.sales sale
        where sale.tenant_id = appointment.tenant_id
          and sale.module_id = appointment.module_id
          and sale.appointment_id = appointment.id
      )
    order by appointment.created_at
  loop
    perform public.release_orphan_consumed_petshop_appointment(v_appointment.id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
