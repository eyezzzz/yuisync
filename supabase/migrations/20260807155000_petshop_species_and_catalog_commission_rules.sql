begin;

-- ---------------------------------------------------------------------------
-- O catálogo de Serviços passa a ser a fonte de verdade para:
-- 1) espécie atendida (cão, gato ou ambos),
-- 2) faixa de peso,
-- 3) percentual de comissão.
--
-- Regra padrão de comissão estética:
--   qualquer tosa = 10%
--   qualquer outro serviço = 5%
-- Uma taxa explicitamente configurada na aba Serviços continua tendo prioridade.
-- ---------------------------------------------------------------------------

alter table public.petshop_services
  add column if not exists species_target text;

alter table public.petshop_services
  drop constraint if exists petshop_services_species_target_check;

alter table public.petshop_services
  add constraint petshop_services_species_target_check
  check (species_target is null or species_target in ('dog', 'cat'));

comment on column public.petshop_services.species_target is
  'Espécie opcional atendida pelo serviço: dog, cat ou null para ambos.';

create or replace function public.default_petshop_service_commission_rate(
  p_name text,
  p_code text default null
)
returns numeric
language sql
immutable
as $$
  select case
    when regexp_replace(
      public.normalize_petshop_catalog_text(concat_ws(' ', p_name, p_code)),
      '[_-]+',
      ' ',
      'g'
    ) ~ '(^| )(tosa|tosagem|tosar|trim|trimming|stripping)( |$)'
      then 10::numeric
    else 5::numeric
  end;
$$;

create or replace function public.infer_petshop_service_species_target(
  p_explicit text,
  p_name text,
  p_code text default null,
  p_category text default null
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_explicit text := public.normalize_petshop_catalog_text(trim(coalesce(p_explicit, '')));
  v_text text := regexp_replace(
    public.normalize_petshop_catalog_text(concat_ws(' ', p_name, p_code, p_category)),
    '[_-]+',
    ' ',
    'g'
  );
begin
  if v_explicit in ('dog', 'cao', 'caes', 'cachorro', 'cachorra', 'canino', 'canina') then
    return 'dog';
  end if;
  if v_explicit in ('cat', 'gato', 'gata', 'gatos', 'gatas', 'felino', 'felina', 'felinos', 'felinas') then
    return 'cat';
  end if;

  if v_text ~ '(^| )(gato|gata|gatos|gatas|felino|felina|felinos|felinas)( |$)' then
    return 'cat';
  end if;
  if v_text ~ '(^| )(cao|caes|cachorro|cachorra|cachorros|cachorras|canino|canina|caninos|caninas)( |$)' then
    return 'dog';
  end if;

  -- Compatibilidade com o catálogo comercial legado: "Banho/Tosa Pet Porte X"
  -- representa a tabela canina quando não há indicação explícita de gato.
  if v_text ~ '(^| )(banho|tosa|tosagem|tosar)( |$)'
    and v_text ~ '(^| )pet( |$)'
    and v_text ~ '(^| )porte( |$)'
  then
    return 'dog';
  end if;

  return null;
end;
$$;

-- Serviços ligados a Produtos herdam primeiro a espécie já conhecida pelo
-- catálogo comercial/PetBot. Nenhuma configuração operacional explícita é
-- sobrescrita.
update public.petshop_services service
set species_target = public.infer_petshop_service_species_target(
      coalesce(
        service.species_target,
        product.bot_metadata->>'species',
        product.species_target
      ),
      coalesce(service.name, product.name),
      service.code,
      product.category
    ),
    updated_at = now()
from public.products product
where service.source_product_id = product.id
  and service.tenant_id = product.tenant_id
  and service.module_id = product.module_id
  and service.module_id = 'petshop'
  and service.group_type = 'banho_tosa'
  and service.species_target is null
  and public.infer_petshop_service_species_target(
        coalesce(product.bot_metadata->>'species', product.species_target),
        coalesce(service.name, product.name),
        service.code,
        product.category
      ) is not null;

-- Serviços manuais também recebem inferência conservadora pelo nome.
update public.petshop_services service
set species_target = public.infer_petshop_service_species_target(
      null,
      service.name,
      service.code,
      null
    ),
    updated_at = now()
where service.module_id = 'petshop'
  and service.group_type = 'banho_tosa'
  and service.species_target is null
  and public.infer_petshop_service_species_target(null, service.name, service.code, null) is not null;

-- Preenche somente taxas ainda zeradas/não configuradas. Taxas personalizadas
-- maiores que zero permanecem intactas.
update public.petshop_services service
set commission_type = 'percentage',
    commission_rate = public.default_petshop_service_commission_rate(service.name, service.code),
    updated_at = now()
where service.module_id = 'petshop'
  and service.group_type = 'banho_tosa'
  and coalesce(service.commission_rate, 0) = 0;

update public.petshop_services
set commission_type = 'percentage',
    updated_at = now()
where module_id = 'petshop'
  and group_type = 'banho_tosa'
  and coalesce(nullif(trim(commission_type), ''), 'percentage') <> 'percentage';

-- ---------------------------------------------------------------------------
-- Sincronização Produto -> Serviço.
-- Preço/nome/duração continuam comerciais; espécie e comissão ficam no vínculo
-- operacional. Atualizações futuras do produto não apagam regras personalizadas.
-- ---------------------------------------------------------------------------
create or replace function public.sync_product_service_to_petshop_services()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.products%rowtype;
  v_text text;
  v_name text;
  v_code text;
  v_group text;
  v_duration integer := 60;
  v_is_service boolean := false;
  v_species text;
  v_default_commission numeric := 0;
begin
  if tg_op = 'DELETE' then
    update public.petshop_services
    set active = false,
        updated_at = now()
    where tenant_id = old.tenant_id
      and module_id = old.module_id
      and (
        source_product_id = old.id
        or code = 'catalog_' || replace(old.id::text, '-', '')
      );
    return old;
  end if;

  v_row := new;
  v_name := trim(coalesce(v_row.name, ''));
  v_text := public.normalize_petshop_catalog_text(
    concat_ws(' ', v_row.name, v_row.category, v_row.bot_metadata->>'product_type')
  );
  v_code := 'catalog_' || replace(v_row.id::text, '-', '');

  v_is_service := (
    public.normalize_petshop_catalog_text(trim(coalesce(v_row.bot_metadata->>'product_type', ''))) = 'servico'
    or public.normalize_petshop_catalog_text(trim(coalesce(v_row.category, ''))) = 'servico'
    or v_text ~ '(banho|tosa|desembolo|escovac|hidrat|higien|consulta|vacina|exame|cirurg|ultrassom|castr|curativo|microchip)'
  )
  and public.normalize_petshop_catalog_text(v_name) !~ '(banheira|banho a seco|brinquedo|casinha|roupa|shampoo|varinha)'
  and public.normalize_petshop_catalog_text(v_name) !~ '(pacote.*banho|banho.*pacote)';

  if coalesce(v_row.bot_metadata->>'duration_min', '') ~ '^[0-9]+$' then
    v_duration := greatest(15, (v_row.bot_metadata->>'duration_min')::integer);
  elsif coalesce(v_row.bot_metadata->>'service_duration_min', '') ~ '^[0-9]+$' then
    v_duration := greatest(15, (v_row.bot_metadata->>'service_duration_min')::integer);
  end if;

  v_group := public.classify_petshop_appointment_service_group(
    v_name,
    v_code,
    nullif(v_row.bot_metadata->>'service_group', '')
  );

  v_species := case when v_group = 'banho_tosa' then
    public.infer_petshop_service_species_target(
      coalesce(v_row.bot_metadata->>'species', v_row.species_target),
      v_row.name,
      v_code,
      v_row.category
    )
    else null end;

  v_default_commission := case when v_group = 'banho_tosa'
    then public.default_petshop_service_commission_rate(v_name, v_code)
    else 0 end;

  if v_is_service and coalesce(v_row.active, false) and coalesce(v_row.price, 0) > 0 and v_name <> '' then
    insert into public.petshop_services (
      tenant_id,
      module_id,
      code,
      name,
      group_type,
      default_price,
      default_duration_min,
      commission_type,
      commission_rate,
      min_weight_kg,
      max_weight_kg,
      species_target,
      active,
      sort_order,
      icon,
      source_product_id,
      updated_at
    ) values (
      v_row.tenant_id,
      v_row.module_id,
      v_code,
      v_name,
      v_group,
      v_row.price,
      v_duration,
      'percentage',
      v_default_commission,
      null,
      null,
      v_species,
      true,
      500,
      case
        when v_group = 'veterinaria' then 'stethoscope'
        when v_group = 'banho_tosa' then 'droplets'
        else 'paw'
      end,
      v_row.id,
      now()
    )
    on conflict (tenant_id, module_id, code) do update
    set name = excluded.name,
        group_type = excluded.group_type,
        default_price = excluded.default_price,
        default_duration_min = excluded.default_duration_min,
        commission_type = case
          when petshop_services.group_type = 'banho_tosa' then 'percentage'
          else petshop_services.commission_type
        end,
        commission_rate = case
          when petshop_services.group_type = 'banho_tosa'
            and coalesce(petshop_services.commission_rate, 0) = 0
            then excluded.commission_rate
          else petshop_services.commission_rate
        end,
        species_target = coalesce(petshop_services.species_target, excluded.species_target),
        active = true,
        source_product_id = excluded.source_product_id,
        updated_at = now();
  else
    update public.petshop_services
    set active = false,
        updated_at = now()
    where tenant_id = v_row.tenant_id
      and module_id = v_row.module_id
      and (source_product_id = v_row.id or code = v_code);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- O snapshot do agendamento passa a carregar a regra de comissão e a regra de
-- elegibilidade usadas pelo catálogo. Mantemos integralmente o ciclo atual de
-- reserva/consumo de pacotes.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_petshop_appointment_services(
  p_tenant_id uuid,
  p_module_id text,
  p_client_id uuid,
  p_services jsonb,
  p_fallback_service_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested jsonb := coalesce(p_services, '[]'::jsonb);
  v_item jsonb;
  v_service record;
  v_code text;
  v_group text := null;
  v_service_group text;
  v_items jsonb := '[]'::jsonb;
  v_benefits jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_discount numeric := 0;
  v_duration integer := 0;
  v_subscription_id uuid;
  v_preferred_subscription_id uuid;
  v_plan_name text;
  v_subscription_result jsonb;
  v_generic_key text;
  v_benefit_key text;
  v_benefit boolean;
  v_any_benefit boolean := false;
begin
  if jsonb_typeof(v_requested) <> 'array' then
    raise exception 'Lista de servicos invalida.';
  end if;
  if jsonb_array_length(v_requested) = 0 and nullif(trim(p_fallback_service_type), '') is not null then
    v_requested := jsonb_build_array(jsonb_build_object('code', trim(p_fallback_service_type)));
  end if;
  if jsonb_array_length(v_requested) = 0 then
    raise exception 'Selecione pelo menos um servico.';
  end if;
  if jsonb_array_length(v_requested) > 10 then
    raise exception 'Limite de 10 servicos por agendamento.';
  end if;

  v_preferred_subscription_id := nullif(v_requested->0->>'subscription_id', '')::uuid;
  if v_preferred_subscription_id is not null then
    select subscription.id, plan.name
    into v_subscription_id, v_plan_name
    from public.client_subscriptions subscription
    join public.subscription_plans plan
      on plan.id = subscription.plan_id
     and plan.tenant_id = subscription.tenant_id
     and plan.module_id = subscription.module_id
    where subscription.id = v_preferred_subscription_id
      and subscription.tenant_id = p_tenant_id
      and subscription.module_id = p_module_id
      and subscription.client_id = p_client_id
      and subscription.status = 'active'
      and plan.active = true
    limit 1;

    if not found then
      raise exception 'O pacote indicado nao pertence ao pet ou nao esta ativo.';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(v_requested)
  loop
    v_code := nullif(trim(coalesce(v_item->>'code', v_item->>'service_type')), '');
    if v_code is null then raise exception 'Codigo de servico invalido.'; end if;
    if exists (
      select 1 from jsonb_array_elements(v_items) existing
      where existing->>'code' = v_code
    ) then
      continue;
    end if;

    select
      id,
      code,
      name,
      group_type,
      default_price,
      default_duration_min,
      commission_type,
      commission_rate,
      min_weight_kg,
      max_weight_kg,
      species_target
    into v_service
    from public.petshop_services
    where tenant_id = p_tenant_id
      and module_id = p_module_id
      and code = v_code
      and active = true
    for share;

    if not found then raise exception 'Servico nao encontrado ou inativo: %.', v_code; end if;

    v_service_group := public.classify_petshop_appointment_service_group(
      v_service.name,
      v_service.code,
      v_service.group_type
    );
    if v_service_group not in ('banho_tosa', 'veterinaria') then
      raise exception 'Servico % nao esta classificado para a agenda.', v_service.name;
    end if;
    if v_group is null then v_group := v_service_group; end if;
    if v_group <> v_service_group then
      raise exception 'Servicos de banho/tosa e veterinaria devem ser agendados separadamente.';
    end if;

    v_generic_key := public.petshop_plan_service_key(
      v_service.name,
      v_service.code,
      v_service_group
    );
    v_benefit_key := null;

    if v_subscription_id is null then
      v_subscription_result := public.reserve_petshop_client_subscription_benefit(
        p_tenant_id,
        p_module_id,
        p_client_id,
        array[v_service.code, v_generic_key]
      );
      v_benefit_key := nullif(v_subscription_result->>'benefit_key', '');
      if v_benefit_key is not null then
        v_subscription_id := nullif(v_subscription_result->>'subscription_id', '')::uuid;
        v_plan_name := nullif(v_subscription_result->>'plan_name', '');
      end if;
    else
      v_benefit_key := public.reserve_petshop_subscription_benefit(
        v_subscription_id,
        p_tenant_id,
        array[v_service.code, v_generic_key]
      );
    end if;

    v_benefit := v_benefit_key is not null;
    if v_benefit then
      v_any_benefit := true;
      v_discount := v_discount + greatest(0, coalesce(v_service.default_price, 0));
      v_benefits := v_benefits || jsonb_build_array(jsonb_build_object(
        'kind', 'service',
        'key', v_benefit_key,
        'service_code', v_service.code,
        'label', v_service.name,
        'catalog_price', greatest(0, coalesce(v_service.default_price, 0)),
        'commission_type', coalesce(v_service.commission_type, 'percentage'),
        'commission_rate', coalesce(
          v_service.commission_rate,
          public.default_petshop_service_commission_rate(v_service.name, v_service.code)
        ),
        'status', 'reserved',
        'accounting', 'reserved_ledger'
      ));
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', v_service.code,
      'name', v_service.name,
      'group_type', v_service_group,
      'unit_price', case when v_benefit then 0 else greatest(0, coalesce(v_service.default_price, 0)) end,
      'catalog_price', greatest(0, coalesce(v_service.default_price, 0)),
      'duration_min', greatest(15, coalesce(v_service.default_duration_min, 60)),
      'commission_type', coalesce(v_service.commission_type, 'percentage'),
      'commission_rate', coalesce(
        v_service.commission_rate,
        public.default_petshop_service_commission_rate(v_service.name, v_service.code)
      ),
      'min_weight_kg', v_service.min_weight_kg,
      'max_weight_kg', v_service.max_weight_kg,
      'species_target', v_service.species_target,
      'benefit_used', v_benefit,
      'benefit_key', v_benefit_key,
      'benefit_status', case when v_benefit then 'reserved' else null end
    ));

    v_total := v_total + case when v_benefit then 0 else greatest(0, coalesce(v_service.default_price, 0)) end;
    v_duration := v_duration + greatest(15, coalesce(v_service.default_duration_min, 60));
  end loop;

  if jsonb_array_length(v_items) = 0 then raise exception 'Nenhum servico valido selecionado.'; end if;

  return jsonb_build_object(
    'items', v_items,
    'benefits', v_benefits,
    'service_type', v_items->0->>'code',
    'service_group', v_group,
    'price', round(v_total, 2),
    'discount', round(v_discount, 2),
    'duration_min', greatest(15, v_duration),
    'active_subscription_id', v_subscription_id,
    'subscription_id', case when v_any_benefit then v_subscription_id else null end,
    'subscription_label', case when v_any_benefit then v_plan_name else null end,
    'benefit_used', v_any_benefit
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Proteção transacional por espécie + peso. A interface esconde opções
-- incompatíveis, mas o banco continua sendo a última barreira contra gravações
-- diretas, automações antigas ou clientes desatualizados.
-- ---------------------------------------------------------------------------
create or replace function public.validate_petshop_appointment_service_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_weight_text text;
  v_weight numeric;
  v_pet_species text;
  v_code text;
  v_service record;
  v_service_text text;
  v_min_weight numeric;
  v_max_weight numeric;
  v_service_species text;
begin
  if coalesce(new.module_id, '') <> 'petshop' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.client_id is not distinct from old.client_id
      and new.pet_id is not distinct from old.pet_id
      and new.service_type is not distinct from old.service_type
      and new.service_items is not distinct from old.service_items
    then
      return new;
    end if;
  end if;

  select
    replace(trim(coalesce(client.details->>'weight_kg', '')), ',', '.'),
    client.details->>'species'
  into v_weight_text, v_pet_species
  from public.clients client
  where client.id = coalesce(new.client_id, new.pet_id)
    and client.tenant_id = new.tenant_id
    and client.module_id = new.module_id
  limit 1;

  if coalesce(v_weight_text, '') ~ '^[0-9]+([.][0-9]+)?$' then
    v_weight := v_weight_text::numeric;
  end if;

  if v_weight is null or public.infer_petshop_service_species_target(v_pet_species, null, null, null) is null then
    select
      coalesce(v_weight, pet.weight_kg),
      coalesce(v_pet_species, pet.species)
    into v_weight, v_pet_species
    from public.pets pet
    where pet.id = coalesce(new.pet_id, new.client_id)
      and pet.tenant_id = new.tenant_id
      and pet.module_id = new.module_id
    limit 1;
  end if;

  v_pet_species := public.infer_petshop_service_species_target(v_pet_species, null, null, null);

  for v_code in
    select distinct requested.code
    from (
      select nullif(trim(coalesce(item->>'code', item->>'service_type')), '') as code
      from jsonb_array_elements(
        case
          when jsonb_typeof(coalesce(new.service_items, '[]'::jsonb)) = 'array'
            then coalesce(new.service_items, '[]'::jsonb)
          else '[]'::jsonb
        end
      ) item

      union

      select nullif(trim(new.service_type), '')
    ) requested
    where requested.code is not null
  loop
    select
      service.name,
      service.code,
      service.group_type,
      service.min_weight_kg,
      service.max_weight_kg,
      service.species_target
    into v_service
    from public.petshop_services service
    where service.tenant_id = new.tenant_id
      and service.module_id = new.module_id
      and service.code = v_code
    limit 1;

    if not found then
      continue;
    end if;

    v_service_species := coalesce(
      v_service.species_target,
      public.infer_petshop_service_species_target(null, v_service.name, v_service.code, null)
    );

    if v_pet_species in ('dog', 'cat')
      and v_service_species in ('dog', 'cat')
      and v_pet_species <> v_service_species
    then
      raise exception 'Serviço "%" não atende a espécie cadastrada deste pet.',
        coalesce(v_service.name, v_code);
    end if;

    if v_weight is null or coalesce(v_service.group_type, '') <> 'banho_tosa' then
      continue;
    end if;

    v_min_weight := v_service.min_weight_kg;
    v_max_weight := v_service.max_weight_kg;

    if v_min_weight is null and v_max_weight is null then
      v_service_text := regexp_replace(
        public.normalize_petshop_catalog_text(
          coalesce(v_service.name, '') || ' ' || coalesce(v_service.code, '')
        ),
        '[_-]+',
        ' ',
        'g'
      );

      if v_service_text ~ '(^| )(porte (mini|micro)|(mini|micro) porte)( |$)' then
        v_max_weight := 5;
      elsif v_service_text ~ '(^| )(porte pequen[a-z]*|pequen[a-z]* porte)( |$)' then
        v_max_weight := 9.99;
      elsif v_service_text ~ '(^| )(porte medi[a-z]*|medi[a-z]* porte)( |$)' then
        v_min_weight := 10;
        v_max_weight := 19.99;
      elsif v_service_text ~ '(^| )(porte grande|grande porte)( |$)' then
        v_min_weight := 20;
        v_max_weight := 39.99;
      elsif v_service_text ~ '(^| )(porte (gigante|extra grande)|(gigante|extra grande) porte)( |$)' then
        v_min_weight := 40;
      end if;
    end if;

    if (v_min_weight is not null and v_weight < v_min_weight)
      or (v_max_weight is not null and v_weight > v_max_weight)
    then
      raise exception 'Serviço "%" não é compatível com o peso cadastrado do pet (% kg).',
        coalesce(v_service.name, v_code), v_weight;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_validate_petshop_appointment_service_weight
on public.appointments;

drop trigger if exists trg_validate_petshop_appointment_service_eligibility
on public.appointments;

create trigger trg_validate_petshop_appointment_service_eligibility
before insert or update
on public.appointments
for each row
execute function public.validate_petshop_appointment_service_eligibility();

-- ---------------------------------------------------------------------------
-- Comissão operacional: mantém a separação visual (banho / tosa / outros), mas
-- o percentual vem do Serviço. Assim, por exemplo, "Tosa higiênica" pode
-- continuar aparecendo em Outros e ainda receber 10% porque contém uma tosa.
-- ---------------------------------------------------------------------------
create or replace function public.calculate_petshop_operational_commissions(
  p_module_id text,
  p_start timestamptz,
  p_end timestamptz,
  p_tenant_id uuid default null
)
returns table (
  staff_key text,
  collaborator_name text,
  service_count bigint,
  grooming_count bigint,
  other_service_count bigint,
  service_revenue numeric,
  grooming_revenue numeric,
  other_service_revenue numeric,
  grooming_commission numeric,
  other_service_commission numeric,
  total_commission numeric,
  detail jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_tenant_id is null or not public.has_tenant_access(p_tenant_id) then
    raise exception 'Tenant invalido ou sem permissao.';
  end if;

  return query
  with configured_staff as (
    select
      nullif(trim(item->>'key'), '') as staff_key,
      coalesce(nullif(trim(item->>'name'), ''), nullif(trim(item->>'key'), ''), 'Esteticista') as staff_name,
      coalesce(nullif(item->>'active', '')::boolean, true) as active
    from public.settings settings
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(settings.petshop_operational_staff) = 'array' then settings.petshop_operational_staff
        else '[]'::jsonb
      end
    ) item
    where settings.tenant_id = p_tenant_id
      and settings.module_id = p_module_id
  ),
  appointment_base as (
    select
      appointment.id,
      nullif(trim(appointment.responsible_staff_key), '') as staff_key,
      coalesce(nullif(trim(appointment.responsible_staff_name), ''), nullif(trim(appointment.responsible_staff_key), ''), 'Esteticista') as snapshot_name,
      greatest(0, coalesce(appointment.price, 0))::numeric as appointment_price,
      appointment.subscription_id,
      coalesce(appointment.subscription_benefit_used, false) as subscription_benefit_used,
      case
        when jsonb_typeof(coalesce(appointment.service_items, '[]'::jsonb)) = 'array'
          and jsonb_array_length(coalesce(appointment.service_items, '[]'::jsonb)) > 0
          then appointment.service_items
        else jsonb_build_array(jsonb_build_object(
          'code', appointment.service_type,
          'name', appointment.service_type,
          'group_type', coalesce(appointment.service_group, 'banho_tosa'),
          'unit_price', greatest(0, coalesce(appointment.price, 0))
        ))
      end as items
    from public.appointments appointment
    where appointment.tenant_id = p_tenant_id
      and appointment.module_id = p_module_id
      and appointment.status = 'concluido'
      and appointment.scheduled_at >= p_start
      and appointment.scheduled_at <= p_end
      and nullif(trim(appointment.responsible_staff_key), '') is not null
      and coalesce(appointment.service_group, 'banho_tosa') = 'banho_tosa'
  ),
  service_lines as (
    select
      base.id as appointment_id,
      base.staff_key,
      base.snapshot_name,
      coalesce(item->>'code', item->>'service_type', '') as service_code,
      coalesce(item->>'name', item->>'code', item->>'service_type', 'Servico estetico') as service_name,
      base.subscription_id is not null and base.subscription_benefit_used as is_package,
      greatest(0, case
        when base.subscription_id is not null and base.subscription_benefit_used then
          public.petshop_package_service_unit_value(
            base.subscription_id,
            coalesce(item->>'code', item->>'service_type', '')
          )
        else coalesce(
          nullif(item->>'unit_price', '')::numeric,
          nullif(item->>'catalog_price', '')::numeric,
          case when jsonb_array_length(base.items) = 1 then base.appointment_price else 0 end
        )
      end)::numeric as revenue,
      coalesce(
        catalog.commission_rate,
        nullif(item->>'commission_rate', '')::numeric,
        public.default_petshop_service_commission_rate(
          coalesce(item->>'name', item->>'code', item->>'service_type'),
          coalesce(item->>'code', item->>'service_type')
        )
      )::numeric as commission_percent
    from appointment_base base
    cross join lateral jsonb_array_elements(base.items) item
    left join public.petshop_services catalog
      on catalog.tenant_id = p_tenant_id
     and catalog.module_id = p_module_id
     and catalog.code = coalesce(item->>'code', item->>'service_type', '')
    where coalesce(item->>'group_type', 'banho_tosa') = 'banho_tosa'
      and lower(concat_ws(' ', item->>'code', item->>'service_type', item->>'name', item->>'group_type')) !~ '(motodog|moto dog|transport|entrega|delivery|frete|buscar|levar)'
  ),
  rated_lines as (
    select
      line.*,
      case
        when regexp_replace(
          public.normalize_petshop_catalog_text(concat_ws(' ', line.service_code, line.service_name)),
          '[_-]+',
          ' ',
          'g'
        ) ~ '(tesoura|maquina|tosa total|tosa completa|groom|trim)'
          then true
        when regexp_replace(
          public.normalize_petshop_catalog_text(concat_ws(' ', line.service_code, line.service_name)),
          '[_-]+',
          ' ',
          'g'
        ) ~ '(^| )tosa( |$)'
          and regexp_replace(
            public.normalize_petshop_catalog_text(concat_ws(' ', line.service_code, line.service_name)),
            '[_-]+',
            ' ',
            'g'
          ) !~ 'higien'
          then true
        else false
      end as is_grooming
    from service_lines line
  ),
  totals as (
    select
      rated.staff_key,
      max(rated.snapshot_name) as snapshot_name,
      count(*)::bigint as service_count,
      count(*) filter (where rated.is_grooming)::bigint as grooming_count,
      count(*) filter (where not rated.is_grooming)::bigint as other_service_count,
      count(*) filter (where rated.is_package)::bigint as package_count,
      coalesce(sum(rated.revenue), 0)::numeric as service_revenue,
      coalesce(sum(rated.revenue) filter (where rated.is_grooming), 0)::numeric as grooming_revenue,
      coalesce(sum(rated.revenue) filter (where not rated.is_grooming), 0)::numeric as other_service_revenue,
      coalesce(sum(rated.revenue) filter (where rated.is_package), 0)::numeric as package_revenue,
      coalesce(sum(rated.revenue * rated.commission_percent / 100) filter (where rated.is_grooming), 0)::numeric as grooming_commission,
      coalesce(sum(rated.revenue * rated.commission_percent / 100) filter (where not rated.is_grooming), 0)::numeric as other_service_commission,
      coalesce(sum(rated.revenue * rated.commission_percent / 100) filter (where rated.is_package), 0)::numeric as package_commission
    from rated_lines rated
    group by rated.staff_key
  ),
  staff_catalog as (
    select configured.staff_key, configured.staff_name, configured.active
    from configured_staff configured
    where configured.staff_key is not null
    union
    select totals.staff_key, totals.snapshot_name, true
    from totals
  ),
  staff_rows as (
    select
      catalog.staff_key,
      max(catalog.staff_name) as staff_name,
      bool_or(catalog.active) as active
    from staff_catalog catalog
    group by catalog.staff_key
  )
  select
    staff.staff_key,
    staff.staff_name as collaborator_name,
    coalesce(totals.service_count, 0)::bigint,
    coalesce(totals.grooming_count, 0)::bigint,
    coalesce(totals.other_service_count, 0)::bigint,
    round(coalesce(totals.service_revenue, 0), 2),
    round(coalesce(totals.grooming_revenue, 0), 2),
    round(coalesce(totals.other_service_revenue, 0), 2),
    round(coalesce(totals.grooming_commission, 0), 2),
    round(coalesce(totals.other_service_commission, 0), 2),
    round(coalesce(totals.grooming_commission, 0) + coalesce(totals.other_service_commission, 0), 2),
    jsonb_build_object(
      'active', staff.active,
      'grooming_rate', 10,
      'other_service_rate', 5,
      'catalog_driven_commission', true,
      'grooming_revenue', coalesce(totals.grooming_revenue, 0),
      'other_service_revenue', coalesce(totals.other_service_revenue, 0),
      'package_count', coalesce(totals.package_count, 0),
      'package_revenue', coalesce(totals.package_revenue, 0),
      'package_commission', coalesce(totals.package_commission, 0)
    )
  from staff_rows staff
  left join totals on totals.staff_key = staff.staff_key
  order by
    coalesce(totals.grooming_commission, 0) + coalesce(totals.other_service_commission, 0) desc,
    staff.staff_name asc;
end;
$$;

revoke all on function public.calculate_petshop_operational_commissions(text, timestamptz, timestamptz, uuid) from public;
grant execute on function public.calculate_petshop_operational_commissions(text, timestamptz, timestamptz, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
