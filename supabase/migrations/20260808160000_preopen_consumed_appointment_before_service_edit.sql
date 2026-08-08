begin;

-- Hotfix para o caso em que o editor envia, na mesma transação, a reabertura
-- (concluido -> agendado/confirmado/em_andamento) junto com a troca de serviço.
--
-- O trigger legado `a_prepare_petshop_appointment_plan_benefits` roda antes do
-- trigger de transição de status. Portanto, quando OLD ainda está `consumed`, a
-- troca de `service_items` era rejeitada antes que a reabertura tivesse chance
-- de desfazer o consumo.
--
-- Mantemos a RPC transacional existente como núcleo e colocamos uma camada fina
-- antes dela. Essa camada faz somente a reabertura de status primeiro; em
-- seguida saneia qualquer estado aberto+consumed remanescente e só então chama
-- a implementação original da edição.

do $$
begin
  if to_regprocedure('public.update_petshop_appointment_transaction_core(uuid,jsonb)') is null then
    alter function public.update_petshop_appointment_transaction(uuid, jsonb)
      rename to update_petshop_appointment_transaction_core;
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

  -- Se o registro ainda está concluído e o mesmo Save também está tentando
  -- reabri-lo, fazemos PRIMEIRO uma atualização apenas do status. Como o trigger
  -- de preparação de pacote não observa a coluna status, ele não intercepta
  -- essa etapa; o trigger de transição consegue desfazer o consumo normalmente.
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

  -- Compatibilidade com registros que já estavam visualmente abertos antes
  -- deste hotfix, mas continuaram marcados como `consumed` por uma transição
  -- antiga. O reparo não toca atendimentos lançados no caixa.
  if v_current.status not in ('concluido', 'completed', 'finalizado')
    and v_current.subscription_benefit_status = 'consumed'
    and v_current.subscription_id is not null
  then
    perform public.repair_petshop_reopened_consumed_appointment(p_appointment_id);
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

notify pgrst, 'reload schema';

commit;
