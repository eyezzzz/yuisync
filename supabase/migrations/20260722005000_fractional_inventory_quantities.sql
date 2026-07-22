begin;

-- O legado criou estoque e quantidade vendida como integer. Isso arredonda
-- vendas a granel (por exemplo 0,5 kg) e pode fazer o item, o subtotal e a
-- baixa de estoque divergirem. Converta toda a cadeia comercial para a mesma
-- precisao ja usada em stock_movements.
do $migration$
declare
  v_unexpected_dependencies text;
  v_view_exists boolean := false;
  v_view_definition text;
  v_view_owner text;
  v_view_owner_oid oid;
  v_view_reloptions text[];
  v_view_acl aclitem[];
  v_view_comment text;
  v_grant record;
  v_role_sql text;
begin
  -- ALTER COLUMN TYPE e bloqueado por views. A view conhecida e preservada
  -- abaixo; qualquer dependencia nova interrompe a migracao antes do DROP.
  select string_agg(format('%I.%I', dependency.schema_name, dependency.view_name), ', ')
  into v_unexpected_dependencies
  from (
    select distinct namespace.nspname as schema_name, relation.relname as view_name
    from pg_depend dependency
    join pg_rewrite rewrite on rewrite.oid = dependency.objid
    join pg_class relation on relation.oid = rewrite.ev_class
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_attribute attribute
      on attribute.attrelid = dependency.refobjid
     and attribute.attnum = dependency.refobjsubid
    where dependency.classid = 'pg_rewrite'::regclass
      and relation.relkind in ('v', 'm')
      and (
        (dependency.refobjid = 'public.products'::regclass and attribute.attname in ('stock_quantity', 'min_stock'))
        or (dependency.refobjid = 'public.sale_items'::regclass and attribute.attname = 'quantity')
      )
      and not (namespace.nspname = 'public' and relation.relname = 'vw_critical_stock')
  ) dependency;

  if v_unexpected_dependencies is not null then
    raise exception 'Dependencias inesperadas impedem a conversao das quantidades: %', v_unexpected_dependencies;
  end if;

  if to_regclass('public.vw_critical_stock') is not null then
    select
      pg_get_viewdef(relation.oid, true),
      pg_get_userbyid(relation.relowner),
      relation.relowner,
      relation.reloptions,
      relation.relacl,
      obj_description(relation.oid, 'pg_class')
    into
      v_view_definition,
      v_view_owner,
      v_view_owner_oid,
      v_view_reloptions,
      v_view_acl,
      v_view_comment
    from pg_class relation
    where relation.oid = 'public.vw_critical_stock'::regclass;

    v_view_exists := true;
    execute 'drop view public.vw_critical_stock';
  end if;

  execute 'alter table public.products alter column stock_quantity type numeric(12,3) using stock_quantity::numeric(12,3)';
  execute 'alter table public.products alter column min_stock type numeric(12,3) using min_stock::numeric(12,3)';
  execute 'alter table public.sale_items alter column quantity type numeric(12,3) using quantity::numeric(12,3)';

  if v_view_exists then
    execute format(
      'create view public.vw_critical_stock%s as %s',
      case
        when coalesce(array_length(v_view_reloptions, 1), 0) > 0
          then ' with (' || array_to_string(v_view_reloptions, ', ') || ')'
        else ''
      end,
      v_view_definition
    );
    execute format('alter view public.vw_critical_stock owner to %I', v_view_owner);

    -- Remova grants possivelmente adicionados por DEFAULT PRIVILEGES e
    -- restaure exatamente os grants explicitos capturados antes do DROP.
    for v_grant in
      select distinct exploded.grantee
      from pg_class relation
      cross join lateral aclexplode(coalesce(relation.relacl, '{}'::aclitem[])) exploded
      where relation.oid = 'public.vw_critical_stock'::regclass
        and exploded.grantee <> v_view_owner_oid
    loop
      v_role_sql := case
        when v_grant.grantee = 0 then 'public'
        else quote_ident(pg_get_userbyid(v_grant.grantee))
      end;
      execute format('revoke all on table public.vw_critical_stock from %s', v_role_sql);
    end loop;

    for v_grant in
      select * from aclexplode(coalesce(v_view_acl, '{}'::aclitem[]))
      where grantee <> v_view_owner_oid
    loop
      v_role_sql := case
        when v_grant.grantee = 0 then 'public'
        else quote_ident(pg_get_userbyid(v_grant.grantee))
      end;
      execute format(
        'grant %s on table public.vw_critical_stock to %s%s',
        v_grant.privilege_type,
        v_role_sql,
        case when v_grant.is_grantable then ' with grant option' else '' end
      );
    end loop;

    if v_view_comment is not null then
      execute format('comment on view public.vw_critical_stock is %L', v_view_comment);
    end if;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
      and column_name = 'stock_quantity' and data_type = 'numeric'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
      and column_name = 'min_stock' and data_type = 'numeric'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sale_items'
      and column_name = 'quantity' and data_type = 'numeric'
  ) then
    raise exception 'A conversao para quantidades fracionadas nao foi concluida.';
  end if;
end
$migration$;

notify pgrst, 'reload schema';

commit;
