begin;

create table if not exists public.sale_payment_splits (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  module_id text not null,
  sale_id uuid not null references public.sales(id) on delete cascade,
  payment_method text not null,
  amount numeric(10, 2) not null check (amount > 0),
  position integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sale_payment_splits_sale_id
  on public.sale_payment_splits (sale_id);

create index if not exists idx_sale_payment_splits_module_created_at
  on public.sale_payment_splits (module_id, created_at desc);

create index if not exists idx_sale_payment_splits_tenant_created_at
  on public.sale_payment_splits (tenant_id, created_at desc);

create unique index if not exists idx_sale_payment_splits_sale_position
  on public.sale_payment_splits (sale_id, position);

do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'set_tenant_id_from_context'
      and pronamespace = 'public'::regnamespace
  ) then
    drop trigger if exists trg_set_tenant_sale_payment_splits on public.sale_payment_splits;
    create trigger trg_set_tenant_sale_payment_splits
      before insert on public.sale_payment_splits
      for each row
      execute function public.set_tenant_id_from_context();
  end if;
end;
$$;

alter table public.sale_payment_splits enable row level security;

drop policy if exists "Sale payment splits select" on public.sale_payment_splits;
drop policy if exists "Sale payment splits insert" on public.sale_payment_splits;
drop policy if exists "Sale payment splits update" on public.sale_payment_splits;
drop policy if exists "Sale payment splits delete" on public.sale_payment_splits;

create policy "Sale payment splits select"
on public.sale_payment_splits
for select
using (
  case
    when tenant_id is null then public.has_module_access(module_id)
    else public.has_module_tenant_access(module_id, tenant_id)
  end
);

create policy "Sale payment splits insert"
on public.sale_payment_splits
for insert
with check (
  case
    when tenant_id is null then public.has_module_access(module_id)
    else public.has_module_tenant_access(module_id, tenant_id)
  end
);

create policy "Sale payment splits update"
on public.sale_payment_splits
for update
using (
  case
    when tenant_id is null then public.has_module_access(module_id)
    else public.has_module_tenant_access(module_id, tenant_id)
  end
)
with check (
  case
    when tenant_id is null then public.has_module_access(module_id)
    else public.has_module_tenant_access(module_id, tenant_id)
  end
);

create policy "Sale payment splits delete"
on public.sale_payment_splits
for delete
using (
  case
    when tenant_id is null then public.is_module_admin(module_id)
    else public.is_module_tenant_admin(module_id, tenant_id)
  end
);

commit;
