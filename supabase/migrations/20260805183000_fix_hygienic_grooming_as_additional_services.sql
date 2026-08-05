begin;

-- Tosa higiênica é um serviço adicional de Banho/Tosa, equivalente a
-- escovação/acabamento para fins de comissão. Ela deve aparecer em "Outros",
-- usar comissão percentual padrão de 5% quando ainda não configurada e ficar
-- disponível normalmente na Agenda.
--
-- A rotina reaproveita cadastros existentes por código ou nome, preservando
-- preço, duração e comissão já configurados. Só cria um novo cadastro quando
-- realmente não encontra um equivalente.

create or replace function public.normalize_petshop_catalog_text(p_value text)
returns text
language sql
immutable
as $$
  select translate(
    lower(coalesce(p_value, '')),
    'áàãâäéèêëíìîïóòõôöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'
  );
$$;

create or replace function public.ensure_petshop_hygienic_grooming_services(
  p_tenant_id uuid,
  p_module_id text default 'petshop'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module_id text := coalesce(nullif(trim(p_module_id), ''), 'petshop');
  v_definition record;
  v_existing_id uuid;
  v_existing_source_product_id uuid;
begin
  if p_tenant_id is null or v_module_id <> 'petshop' then
    return;
  end if;

  for v_definition in
    select *
    from (values
      (
        'tosa_higienica'::text,
        'Tosa higiênica'::text,
        30::integer,
        310::integer,
        array[
          'tosa_higienica',
          'tosa_higienica_simples'
        ]::text[],
        array[
          'tosa higienica',
          'tosa higienica simples'
        ]::text[]
      ),
      (
        'tosa_higienica_com_detalhes'::text,
        'Tosa higiênica com detalhes'::text,
        45::integer,
        320::integer,
        array[
          'tosa_higienica_com_detalhes',
          'tosa_higienica_com_detalhe',
          'tosa_higienica_detalhada',
          'tosa_higienica_completa'
        ]::text[],
        array[
          'tosa higienica com detalhes',
          'tosa higienica com detalhe',
          'tosa higienica detalhada',
          'tosa higienica completa'
        ]::text[]
      )
    ) as definitions(
      canonical_code,
      canonical_name,
      default_duration,
      default_sort_order,
      alias_codes,
      alias_names
    )
  loop
    v_existing_id := null;
    v_existing_source_product_id := null;

    -- Prioriza o cadastro comercial ou já precificado. Isso evita ativar uma
    -- duplicata vazia criada por uma migration anterior quando já havia um item
    -- real cadastrado pelo petshop.
    select service.id, service.source_product_id
    into v_existing_id, v_existing_source_product_id
    from public.petshop_services service
    where service.tenant_id = p_tenant_id
      and service.module_id = v_module_id
      and (
        public.normalize_petshop_catalog_text(service.code)
          = any(v_definition.alias_codes)
        or public.normalize_petshop_catalog_text(service.name)
          = any(v_definition.alias_names)
      )
    order by
      case when service.source_product_id is not null then 0 else 1 end,
      case when coalesce(service.default_price, 0) > 0 then 0 else 1 end,
      case
        when public.normalize_petshop_catalog_text(service.code)
          = v_definition.canonical_code then 0
        else 1
      end,
      service.created_at asc,
      service.id asc
    limit 1;

    if v_existing_id is null then
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
        active,
        sort_order,
        icon,
        updated_at
      ) values (
        p_tenant_id,
        v_module_id,
        v_definition.canonical_code,
        v_definition.canonical_name,
        'banho_tosa',
        0,
        v_definition.default_duration,
        'percentage',
        5,
        true,
        v_definition.default_sort_order,
        'scissors',
        now()
      )
      returning id into v_existing_id;
    else
      update public.petshop_services
      set code = case
            -- Produtos sincronizados mantêm o código catalog_<uuid> para não
            -- quebrar a sincronização com Estoque/Produtos.
            when v_existing_source_product_id is not null then code
            else v_definition.canonical_code
          end,
          name = v_definition.canonical_name,
          group_type = 'banho_tosa',
          default_duration_min = case
            when coalesce(default_duration_min, 0) >= 15
              then default_duration_min
            else v_definition.default_duration
          end,
          commission_type = coalesce(
            nullif(trim(commission_type), ''),
            'percentage'
          ),
          commission_rate = case
            when coalesce(commission_rate, 0) > 0 then commission_rate
            else 5
          end,
          active = true,
          sort_order = coalesce(sort_order, v_definition.default_sort_order),
          icon = 'scissors',
          updated_at = now()
      where id = v_existing_id
        and tenant_id = p_tenant_id
        and module_id = v_module_id;
    end if;

    -- Mantém somente o cadastro escolhido visível para não duplicar o serviço
    -- na Agenda. Nenhum registro é apagado.
    update public.petshop_services service
    set active = false,
        updated_at = now()
    where service.tenant_id = p_tenant_id
      and service.module_id = v_module_id
      and service.id <> v_existing_id
      and (
        public.normalize_petshop_catalog_text(service.code)
          = any(v_definition.alias_codes)
        or public.normalize_petshop_catalog_text(service.name)
          = any(v_definition.alias_names)
      );
  end loop;
end;
$$;

revoke all
on function public.ensure_petshop_hygienic_grooming_services(uuid, text)
from public;

grant execute
on function public.ensure_petshop_hygienic_grooming_services(uuid, text)
to service_role;

-- Corrige todos os tenants PetShop existentes, inclusive quando ainda não há
-- linha na tabela settings, mas já existe catálogo de serviços.
do $$
declare
  v_scope record;
begin
  for v_scope in
    select distinct scope.tenant_id, scope.module_id
    from (
      select settings.tenant_id, settings.module_id
      from public.settings settings
      where settings.tenant_id is not null
        and settings.module_id = 'petshop'

      union

      select service.tenant_id, service.module_id
      from public.petshop_services service
      where service.tenant_id is not null
        and service.module_id = 'petshop'
    ) scope
  loop
    perform public.ensure_petshop_hygienic_grooming_services(
      v_scope.tenant_id,
      v_scope.module_id
    );
  end loop;
end;
$$;

create or replace function public.ensure_petshop_hygienic_grooming_services_from_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.module_id = 'petshop' then
    perform public.ensure_petshop_hygienic_grooming_services(
      new.tenant_id,
      new.module_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ensure_petshop_hygienic_grooming_services
on public.settings;

create trigger trg_ensure_petshop_hygienic_grooming_services
after insert or update of tenant_id, module_id
on public.settings
for each row
execute function public.ensure_petshop_hygienic_grooming_services_from_settings();

notify pgrst, 'reload schema';

commit;
