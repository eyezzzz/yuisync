-- YuiSync Petshop performance cleanup
-- Apply this before deploying the frontend changes that call these RPCs.

create index if not exists idx_products_tenant_module_active_name
  on public.products (tenant_id, module_id, active, name);

create index if not exists idx_products_tenant_module_barcode
  on public.products (tenant_id, module_id, barcode)
  where barcode is not null;

create index if not exists idx_products_tenant_module_active_category
  on public.products (tenant_id, module_id, active, category);

create index if not exists idx_products_tenant_module_active_stock
  on public.products (tenant_id, module_id, active, stock_quantity);

create index if not exists idx_clients_tenant_module_active_name
  on public.clients (tenant_id, module_id, active, name);

create index if not exists idx_clients_tenant_module_phone
  on public.clients (tenant_id, module_id, phone)
  where phone is not null;

create index if not exists idx_sales_tenant_module_status_created_at
  on public.sales (tenant_id, module_id, status, created_at desc);

create index if not exists idx_chat_sessions_tenant_module_status_last
  on public.chat_sessions (tenant_id, module_id, status, last_message_at desc);

create index if not exists idx_chat_messages_session_role
  on public.chat_messages (session_id, role);

create or replace function public.get_petshop_product_summary(
  p_tenant_id uuid,
  p_module_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := coalesce(p_tenant_id, public.resolve_current_tenant_id());
  v_summary jsonb;
begin
  if v_tenant is null or not public.has_module_tenant_access(p_module_id, v_tenant) then
    raise exception 'Access denied for module/tenant' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'totalProducts', count(*)::int,
    'totalValue', coalesce(sum(coalesce(p.price, 0) * coalesce(p.stock_quantity, 0)), 0),
    'criticalCount', (count(*) filter (
      where coalesce(p.stock_quantity, 0) > 0
        and coalesce(p.stock_quantity, 0) <= coalesce(p.min_stock, 0)
    ))::int,
    'outCount', (count(*) filter (where coalesce(p.stock_quantity, 0) = 0))::int,
    'categories', (
      select coalesce(jsonb_agg(c.category order by c.category), '[]'::jsonb)
      from (
        select distinct p2.category
        from public.products p2
        where p2.tenant_id = v_tenant
          and p2.module_id = p_module_id
          and p2.category is not null
          and btrim(p2.category) <> ''
      ) c
    )
  )
  into v_summary
  from public.products p
  where p.tenant_id = v_tenant
    and p.module_id = p_module_id;

  return coalesce(v_summary, jsonb_build_object(
    'totalProducts', 0,
    'totalValue', 0,
    'criticalCount', 0,
    'outCount', 0,
    'categories', '[]'::jsonb
  ));
end;
$$;

create or replace function public.search_petshop_products(
  p_tenant_id uuid,
  p_module_id text,
  p_search text default null,
  p_category text default null,
  p_status text default null,
  p_active_only boolean default true,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  category text,
  description text,
  price numeric,
  cost_price numeric,
  stock_quantity numeric,
  min_stock numeric,
  species_target text,
  image_url text,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  barcode text,
  upsell_link_id uuid,
  upsell_product jsonb,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := coalesce(p_tenant_id, public.resolve_current_tenant_id());
  v_search text := nullif(btrim(p_search), '');
  v_category text := nullif(btrim(p_category), '');
  v_status text := nullif(btrim(lower(p_status)), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_tenant is null or not public.has_module_tenant_access(p_module_id, v_tenant) then
    raise exception 'Access denied for module/tenant' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.name,
    p.category,
    p.description,
    p.price,
    p.cost_price,
    p.stock_quantity,
    p.min_stock,
    p.species_target,
    p.image_url,
    p.active,
    p.created_at,
    p.updated_at,
    p.barcode,
    p.upsell_link_id,
    case
      when up.id is null then null
      else jsonb_build_object(
        'id', up.id,
        'name', up.name,
        'price', up.price,
        'category', up.category,
        'image_url', up.image_url
      )
    end as upsell_product,
    count(*) over() as total_count
  from public.products p
  left join public.products up
    on up.id = p.upsell_link_id
   and up.tenant_id = v_tenant
   and up.module_id = p_module_id
  where p.tenant_id = v_tenant
    and p.module_id = p_module_id
    and (not coalesce(p_active_only, true) or p.active = true)
    and (
      v_category is null
      or p.category = v_category
    )
    and (
      v_search is null
      or p.name ilike '%' || v_search || '%'
      or p.barcode ilike '%' || v_search || '%'
      or p.category ilike '%' || v_search || '%'
    )
    and (
      v_status is null
      or (v_status = 'esgotado' and coalesce(p.stock_quantity, 0) = 0)
      or (v_status = 'critico' and coalesce(p.stock_quantity, 0) > 0 and coalesce(p.stock_quantity, 0) <= coalesce(p.min_stock, 0))
      or (v_status = 'ok' and coalesce(p.stock_quantity, 0) > coalesce(p.min_stock, 0))
    )
  order by p.name
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.search_petshop_clients(
  p_tenant_id uuid,
  p_module_id text,
  p_search text default null,
  p_species text default null,
  p_plan_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  module_id text,
  type text,
  name text,
  document text,
  phone text,
  email text,
  address text,
  neighborhood text,
  city text,
  notes text,
  active boolean,
  details jsonb,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := coalesce(p_tenant_id, public.resolve_current_tenant_id());
  v_search text := nullif(btrim(p_search), '');
  v_species text := nullif(btrim(p_species), '');
  v_plan_status text := nullif(btrim(p_plan_status), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_tenant is null or not public.has_module_tenant_access(p_module_id, v_tenant) then
    raise exception 'Access denied for module/tenant' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.module_id,
    c.type,
    c.name,
    c.document,
    c.phone,
    c.email,
    c.address,
    c.neighborhood,
    c.city,
    c.notes,
    c.active,
    c.details,
    c.created_at,
    count(*) over() as total_count
  from public.clients c
  where c.tenant_id = v_tenant
    and c.module_id = p_module_id
    and (
      v_search is null
      or c.name ilike '%' || v_search || '%'
      or c.phone ilike '%' || v_search || '%'
      or c.document ilike '%' || v_search || '%'
      or c.address ilike '%' || v_search || '%'
      or c.neighborhood ilike '%' || v_search || '%'
      or c.city ilike '%' || v_search || '%'
      or c.details->>'pet_name' ilike '%' || v_search || '%'
      or c.details->>'breed' ilike '%' || v_search || '%'
    )
    and (
      v_species is null
      or c.details->>'species' = v_species
    )
    and (
      v_plan_status is null
      or exists (
        select 1
        from public.client_subscriptions cs
        where cs.tenant_id = v_tenant
          and cs.module_id = p_module_id
          and cs.client_id = c.id
          and cs.status = v_plan_status
      )
    )
  order by c.name
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.get_petshop_dashboard_snapshot(
  p_tenant_id uuid,
  p_module_id text,
  p_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := coalesce(p_tenant_id, public.resolve_current_tenant_id());
  v_start timestamptz := (p_date::timestamp at time zone 'America/Sao_Paulo');
  v_end timestamptz := ((p_date + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_appointments jsonb := '[]'::jsonb;
  v_today_stats jsonb := '{}'::jsonb;
  v_stock jsonb := '{}'::jsonb;
  v_sales jsonb := '{}'::jsonb;
  v_chat jsonb := '{}'::jsonb;
begin
  if v_tenant is null or not public.has_module_tenant_access(p_module_id, v_tenant) then
    raise exception 'Access denied for module/tenant' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'client_id', a.client_id,
    'service_type', a.service_type,
    'scheduled_at', a.scheduled_at,
    'duration_min', a.duration_min,
    'price', a.price,
    'status', a.status,
    'notes', a.notes,
    'source', a.source,
    'created_at', a.created_at,
    'employee_id', a.employee_id,
    'groomer_id', a.groomer_id,
    'live_status', a.live_status,
    'pets', jsonb_build_object(
      'id', c.id,
      'owner_name', c.name,
      'phone', c.phone,
      'email', c.email,
      'owner_address', c.address,
      'owner_neighborhood', c.neighborhood,
      'owner_city', c.city,
      'pet_name', c.details->>'pet_name',
      'species', c.details->>'species',
      'breed', c.details->>'breed'
    )
  ) order by a.scheduled_at), '[]'::jsonb)
  into v_appointments
  from (
    select *
    from public.appointments
    where tenant_id = v_tenant
      and module_id = p_module_id
      and scheduled_at >= v_start
      and scheduled_at < v_end
    order by scheduled_at
    limit 8
  ) a
  left join public.clients c
    on c.id = a.client_id
   and c.tenant_id = v_tenant
   and c.module_id = p_module_id;

  select jsonb_build_object(
    'total', count(*)::int,
    'agendado', (count(*) filter (where status = 'agendado'))::int,
    'confirmado', (count(*) filter (where status = 'confirmado'))::int,
    'em_andamento', (count(*) filter (where status = 'em_andamento'))::int,
    'concluido', (count(*) filter (where status = 'concluido'))::int,
    'cancelado', (count(*) filter (where status = 'cancelado'))::int
  )
  into v_today_stats
  from public.appointments
  where tenant_id = v_tenant
    and module_id = p_module_id
    and scheduled_at >= v_start
    and scheduled_at < v_end;

  select jsonb_build_object(
    'criticalCount', (count(*) filter (
      where coalesce(stock_quantity, 0) > 0
        and coalesce(stock_quantity, 0) <= coalesce(min_stock, 0)
    ))::int,
    'outCount', (count(*) filter (where coalesce(stock_quantity, 0) = 0))::int,
    'criticalItems', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p2.id,
        'name', p2.name,
        'category', p2.category,
        'stock_quantity', p2.stock_quantity,
        'min_stock', p2.min_stock
      ) order by p2.stock_quantity, p2.name), '[]'::jsonb)
      from (
        select *
        from public.products
        where tenant_id = v_tenant
          and module_id = p_module_id
          and active = true
          and coalesce(stock_quantity, 0) <= coalesce(min_stock, 0)
        order by stock_quantity, name
        limit 20
      ) p2
    )
  )
  into v_stock
  from public.products
  where tenant_id = v_tenant
    and module_id = p_module_id
    and active = true;

  with today_sales as (
    select *
    from public.sales
    where tenant_id = v_tenant
      and module_id = p_module_id
      and status = 'concluido'
      and created_at >= v_start
      and created_at < v_end
  ),
  sale_labels as (
    select
      s.id,
      coalesce(s.total_price, 0) as amount,
      case
        when lower(coalesce(s.source, '')) = 'whatsapp' then 'WhatsApp'
        when exists (
          select 1
          from public.sale_items si
          left join public.products p on p.id = si.product_id
          where si.sale_id = s.id
            and (
              lower(coalesce(p.category, '')) like '%banho%'
              or lower(coalesce(p.category, '')) like '%tosa%'
              or lower(coalesce(p.category, '')) like '%groom%'
            )
        ) then 'Banho/Tosa'
        when exists (
          select 1
          from public.sale_items si
          left join public.products p on p.id = si.product_id
          where si.sale_id = s.id
            and lower(coalesce(p.category, '')) like '%veterin%'
        ) then 'Veterinaria'
        when coalesce(s.source, '') = '' or lower(s.source) = 'pdv' then 'PDV'
        else upper(s.source)
      end as label
    from today_sales s
  ),
  sale_mix as (
    select label, sum(amount) as amount
    from sale_labels
    group by label
    order by amount desc
    limit 5
  )
  select jsonb_build_object(
    'revenue', coalesce((select sum(total_price) from today_sales), 0),
    'count', coalesce((select count(*) from today_sales), 0)::int,
    'upsells', coalesce((
      select count(*)
      from public.sale_items si
      join today_sales s on s.id = si.sale_id
      where si.upsell = true
    ), 0)::int,
    'salesMix', coalesce((
      select jsonb_agg(jsonb_build_object('label', label, 'amount', amount) order by amount desc)
      from sale_mix
    ), '[]'::jsonb)
  )
  into v_sales;

  with scoped_sessions as (
    select *
    from public.chat_sessions
    where tenant_id = v_tenant
      and module_id = p_module_id
    order by last_message_at desc
    limit 500
  ),
  message_flags as (
    select
      ss.id,
      bool_or(cm.role = 'human_agent') as has_human,
      bool_or(cm.role = 'assistant') as has_assistant
    from scoped_sessions ss
    left join public.chat_messages cm on cm.session_id = ss.id
    group by ss.id
  ),
  closed_sessions as (
    select ss.*, mf.has_human, mf.has_assistant
    from scoped_sessions ss
    left join message_flags mf on mf.id = ss.id
    where ss.status = 'closed'
       or ss.closed_at is not null
       or ss.csat_score is not null
  ),
  hour_counts as (
    select
      extract(hour from timezone('America/Sao_Paulo', coalesce(opened_at, last_message_at)))::int as hour,
      count(*) as total
    from scoped_sessions
    where timezone('America/Sao_Paulo', coalesce(opened_at, last_message_at))::date = p_date
    group by 1
  ),
  hour_series as (
    select
      h.hour,
      least(
        sum(coalesce(hc.total, 0) * 0.4) over (order by h.hour),
        8
      ) as saved
    from generate_series(8, 17) h(hour)
    left join hour_counts hc on hc.hour = h.hour
  )
  select jsonb_build_object(
    'openChats', (count(*) filter (where status <> 'closed'))::int,
    'botChats', (count(*) filter (where status = 'bot'))::int,
    'avgCsat', case when (count(csat_score) filter (where csat_score is not null)) = 0 then null else avg(csat_score) filter (where csat_score is not null) end,
    'csatCount', (count(csat_score) filter (where csat_score is not null))::int,
    'aiResolved', coalesce((select count(*) from closed_sessions where coalesce(has_assistant, false) = true and coalesce(has_human, false) = false), 0)::int,
    'humanResolved', coalesce((select count(*) from closed_sessions where coalesce(has_human, false) = true), 0)::int,
    'closedCount', coalesce((select count(*) from closed_sessions), 0)::int,
    'aiHours', jsonb_build_object(
      'totalHours', 8,
      'savedHours', least((count(*) filter (
        where timezone('America/Sao_Paulo', coalesce(opened_at, last_message_at))::date = p_date
      ) * 0.4), 8),
      'series', coalesce((
        select jsonb_agg(jsonb_build_object(
          'time', lpad(hour::text, 2, '0') || ':00',
          'saved', round(saved::numeric, 1)
        ) order by hour)
        from hour_series
      ), '[]'::jsonb)
    )
  )
  into v_chat
  from scoped_sessions;

  return jsonb_build_object(
    'date', p_date,
    'appointments', v_appointments,
    'todayStats', v_today_stats,
    'stock', v_stock,
    'sales', v_sales,
    'chat', v_chat
  );
end;
$$;
