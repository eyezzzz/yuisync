begin;

-- O modal da Agenda já calcula o valor líquido dos serviços usando o pacote ativo.
-- Em edições de um agendamento avulso já existente, porém, o núcleo transacional
-- evitava recalcular quando os códigos dos serviços permaneciam iguais. Isso fazia
-- o modal mostrar "Pacote · R$ 0,00", mas o registro continuar avulso e com o valor
-- de catálogo. Esta camada força a resolução transacional somente quando o valor
-- de serviço solicitado pelo modal é menor que o snapshot atual, sinal inequívoco
-- de que há cobertura de pacote a aplicar.

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
  v_after public.appointments%rowtype;
  v_tenant_id uuid := nullif(p_payload->>'tenant_id', '')::uuid;
  v_module_id text := coalesce(nullif(trim(p_payload->>'module_id'), ''), 'petshop');
  v_requested_status text := nullif(trim(p_payload->>'status'), '');
  v_financial_edit boolean := false;
  v_requested_service_price numeric := null;
  v_current_service_price numeric := 0;
  v_current_transport_fee numeric := 0;
  v_force_package_recalc boolean := false;
  v_result jsonb;
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

  -- Atendimento concluído que está sendo reaberto: preserva o fluxo já existente
  -- de anulação auditável da venda antes da edição.
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

  -- Compatibilidade com atendimentos já reabertos por rotas antigas.
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

    select *
    into v_current
    from public.appointments
    where id = p_appointment_id
      and tenant_id = v_tenant_id
    for update;
  end if;

  -- O AgendaPage envia `price` como valor dos serviços antes do transporte.
  if p_payload ? 'price'
    and nullif(trim(p_payload->>'price'), '') is not null
  then
    v_requested_service_price := greatest(0, (p_payload->>'price')::numeric);
  end if;

  if jsonb_typeof(coalesce(v_current.service_items, '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(v_current.service_items, '[]'::jsonb)) > 0
  then
    select round(coalesce(sum(greatest(
      0,
      coalesce(nullif(item->>'unit_price', '')::numeric, 0)
    )), 0), 2)
    into v_current_service_price
    from jsonb_array_elements(v_current.service_items) item;
  end if;

  -- Snapshot legado sem preço por item: deriva somente a parte de serviço do
  -- total armazenado, sem confundir tarifa de transporte com desconto do pacote.
  if v_current_service_price <= 0
    and coalesce(v_current.price, 0) > 0
    and not coalesce(v_current.subscription_benefit_used, false)
  then
    v_current_transport_fee := public.resolve_petshop_transport_fee(
      v_current.tenant_id,
      v_current.module_id,
      coalesce(v_current.transport_mode, 'cliente_leva')
    );
    v_current_service_price := greatest(0, coalesce(v_current.price, 0) - v_current_transport_fee);
  end if;

  -- Caso exato do bug: o modal está mostrando um valor coberto por pacote, mas
  -- o snapshot persistido ainda é avulso. Como os códigos podem ser idênticos, o
  -- core não detectaria mudança. Esvaziar o snapshot dentro da mesma transação
  -- faz o core resolver novamente os serviços e reservar o benefício corretamente.
  v_force_package_recalc :=
    (p_payload ? 'services')
    and v_requested_service_price is not null
    and v_requested_service_price + 0.005 < v_current_service_price
    and not coalesce(v_current.subscription_benefit_used, false)
    and coalesce(v_current.subscription_benefit_status, '') not in ('reserved', 'consumed');

  if v_force_package_recalc then
    update public.appointments
    set service_items = '[]'::jsonb,
        updated_at = now()
    where id = p_appointment_id
      and tenant_id = v_tenant_id;
  end if;

  v_result := public.update_petshop_appointment_transaction_core(
    p_appointment_id,
    p_payload
  );

  if v_force_package_recalc then
    select *
    into v_after
    from public.appointments
    where id = p_appointment_id
      and tenant_id = v_tenant_id;

    -- Nunca converte silenciosamente para atendimento avulso depois de o modal
    -- ter apresentado cobertura do pacote. Se a reserva não puder ser feita, a
    -- transação inteira volta ao estado anterior e o usuário recebe um erro claro.
    if not coalesce(v_after.subscription_benefit_used, false)
      or v_after.subscription_id is null
      or coalesce(v_after.subscription_benefit_status, '') not in ('reserved', 'consumed')
    then
      raise exception 'O pacote exibido na Agenda nao pode mais ser reservado. Atualize os pacotes do pet e tente novamente.';
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function public.update_petshop_appointment_transaction(uuid, jsonb) from public;
grant execute on function public.update_petshop_appointment_transaction(uuid, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
