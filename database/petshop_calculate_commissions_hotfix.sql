create or replace function public.calculate_commissions(
  p_module_id text,
  p_start timestamptz,
  p_end timestamptz,
  p_tenant_id uuid default null
)
returns table (
  profile_id uuid,
  groomer_name text,
  appointments_count bigint,
  revenue numeric,
  commission numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  has_appointments_tenant boolean;
  has_rules_tenant boolean;
  sql_text text;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointments'
      and column_name = 'tenant_id'
  ) into has_appointments_tenant;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'commission_rules'
      and column_name = 'tenant_id'
  ) into has_rules_tenant;

  sql_text := '
    with scoped as (
      select
        a.groomer_id as profile_id,
        p.full_name as groomer_name,
        count(*)::bigint as appointments_count,
        coalesce(sum(a.price), 0)::numeric as revenue,
        coalesce(rule.type, ''percentage'') as rule_type,
        coalesce(rule.rate, 0)::numeric as rule_rate
      from public.appointments a
      join public.profiles p
        on p.id = a.groomer_id
      left join lateral (
        select cr.type, cr.rate
        from public.commission_rules cr
        where cr.module_id = a.module_id
          and cr.profile_id = a.groomer_id
          and cr.applies_to in (''all'', ''services'')';

  if has_rules_tenant then
    sql_text := sql_text || '
          and ($4 is null or cr.tenant_id = $4)';
  end if;

  sql_text := sql_text || '
        order by cr.created_at desc
        limit 1
      ) rule on true
      where a.module_id = $1
        and a.groomer_id is not null
        and a.status = ''concluido''
        and a.scheduled_at >= $2
        and a.scheduled_at <= $3';

  if has_appointments_tenant then
    sql_text := sql_text || '
        and ($4 is null or a.tenant_id = $4)';
  end if;

  sql_text := sql_text || '
      group by a.groomer_id, p.full_name, rule.type, rule.rate
    )
    select
      profile_id,
      groomer_name,
      appointments_count,
      revenue,
      case
        when rule_type = ''fixed'' then round((appointments_count * rule_rate)::numeric, 2)
        else round((revenue * (rule_rate / 100))::numeric, 2)
      end as commission
    from scoped
    order by revenue desc, groomer_name asc';

  return query execute sql_text using p_module_id, p_start, p_end, p_tenant_id;
end;
$$;
