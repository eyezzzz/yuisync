begin;

-- Quando um atendimento concluído já foi efetivamente lançado no caixa, a venda
-- da agenda não pode continuar ativa se o atendimento voltar para edição.
-- Em vez de apagar o histórico financeiro, anulamos a venda, removemos apenas o
-- vínculo/idempotência do agendamento e preservamos itens/pagamentos para auditoria.
-- O checkout posterior poderá criar uma nova venda com os dados corrigidos.

create or replace function public.void_petshop_appointment_sale_for_reopen(
  p_appointment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_sale public.sales%rowtype;
  v_reason text;
begin
  select *
  into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'Agendamento nao encontrado.';
  end if;

  if v_appointment.module_id <> 'petshop'
    or not public.has_tenant_access(v_appointment.tenant_id)
  then
    raise exception 'Agendamento nao pertence ao tenant ativo.';
  end if;

  select *
  into v_sale
  from public.sales
  where tenant_id = v_appointment.tenant_id
    and module_id = v_appointment.module_id
    and appointment_id = v_appointment.id
  limit 1
  for update;

  if not found then
    return null;
  end if;

  -- Só anulamos automaticamente vendas que nasceram do fechamento da Agenda.
  -- Vendas externas/PDV independentes continuam protegidas.
  if coalesce(v_sale.source, '') <> 'agenda'
    or coalesce(v_sale.fulfillment_type, '') <> 'servico'
  then
    raise exception 'Existe uma venda externa vinculada a este atendimento. Faça o estorno manual antes de editar.';
  end if;

  v_reason := concat(
    'Venda anulada por reabertura do agendamento ',
    v_appointment.id::text,
    ' em ',
    to_char(now(), 'YYYY-MM-DD HH24:MI:SSOF')
  );

  update public.sales
  set status = 'cancelado',
      appointment_id = null,
      idempotency_key = concat('reopened:', v_sale.id::text),
      notes = concat_ws(' | ', nullif(trim(notes), ''), v_reason)
  where id = v_sale.id
    and tenant_id = v_appointment.tenant_id;

  return v_sale.id;
end;
$$;

revoke all on function public.void_petshop_appointment_sale_for_reopen(uuid) from public;
grant execute on function public.void_petshop_appointment_sale_for_reopen(uuid)
  to authenticated, service_role;


-- Substitui somente a camada fina da RPC. O núcleo continua sendo a implementação
-- já testada em update_petshop_appointment_transaction_core(uuid,jsonb).
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
  v_financial_edit boolean := false;
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

  v_financial_edit :=
    (p_payload ? 'services')
    or (p_payload ? 'service_type')
    or (p_payload ? 'client_id')
    or (p_payload ? 'pet_id')
    or (p_payload ? 'transport_mode');

  -- Caso 1: concluído + venda -> aberto. A venda da Agenda é anulada antes da
  -- mudança de status, pois o trigger de reabertura protege vendas ainda ativas.
  if v_current.status in ('concluido', 'completed', 'finalizado')
    and coalesce(v_requested_status, v_current.status) not in ('concluido', 'completed', 'finalizado')
  then
    perform public.void_petshop_appointment_sale_for_reopen(p_appointment_id);

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

  -- Caso 2: o atendimento já foi reaberto por alguma rota antiga, mas a venda
  -- permaneceu vinculada. Ao editar serviço/cliente/transporte, anulamos a venda
  -- da Agenda para que a nova conclusão gere um fechamento correto.
  if v_current.status not in ('concluido', 'completed', 'finalizado')
    and v_financial_edit
    and exists (
      select 1
      from public.sales sale
      where sale.tenant_id = v_current.tenant_id
        and sale.module_id = v_current.module_id
        and sale.appointment_id = v_current.id
    )
  then
    perform public.void_petshop_appointment_sale_for_reopen(p_appointment_id);
  end if;

  -- Limpa qualquer resíduo de pacote consumido após a venda ter sido anulada.
  select *
  into v_current
  from public.appointments
  where id = p_appointment_id
    and tenant_id = v_tenant_id
  for update;

  if v_current.status not in ('concluido', 'completed', 'finalizado')
    and v_current.subscription_benefit_status = 'consumed'
  then
    perform public.release_orphan_consumed_petshop_appointment(p_appointment_id);
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
