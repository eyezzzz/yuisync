-- =============================================================================
-- YuiSync - Support Center (Widget + Central Hub)
-- =============================================================================
-- Objetivo:
-- 1) Chat de suporte minimalista para clientes em qualquer modulo
-- 2) Caixa central no Hub Admin para voce/equipe responderem rapido
-- 3) Isolamento por tenant + modulo com RLS
--
-- Execute no SQL Editor do Supabase.
-- =============================================================================

begin;

create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1) Threads de suporte
-- -----------------------------------------------------------------------------
create table if not exists public.support_threads (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null,
  requester_profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'open', 'finalized')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  source text not null default 'widget',
  subject text,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index if not exists idx_support_threads_tenant_module_status
  on public.support_threads(tenant_id, module_id, status, last_message_at desc);

create index if not exists idx_support_threads_requester
  on public.support_threads(requester_profile_id, last_message_at desc);

-- -----------------------------------------------------------------------------
-- 2) Mensagens de suporte
-- -----------------------------------------------------------------------------
create table if not exists public.support_messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  sender_type text not null check (sender_type in ('customer', 'agent', 'system')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_messages_thread_created
  on public.support_messages(thread_id, created_at asc);

create index if not exists idx_support_messages_tenant_created
  on public.support_messages(tenant_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 3) Triggers utilitarios
-- -----------------------------------------------------------------------------
create or replace function public.touch_support_thread_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_threads
  set
    updated_at = now(),
    last_message_at = coalesce(new.created_at, now()),
    last_message_preview = left(new.body, 220),
    status = case when status = 'finalized' then 'pending' else status end
  where id = new.thread_id;

  return new;
end;
$$;

drop trigger if exists trg_touch_support_thread_on_message on public.support_messages;
create trigger trg_touch_support_thread_on_message
after insert on public.support_messages
for each row execute function public.touch_support_thread_from_message();

create or replace function public.resolve_support_message_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  if new.tenant_id is not null then
    return new;
  end if;

  select st.tenant_id
  into v_tenant_id
  from public.support_threads st
  where st.id = new.thread_id
  limit 1;

  new.tenant_id := v_tenant_id;
  return new;
end;
$$;

drop trigger if exists trg_resolve_support_message_tenant on public.support_messages;
create trigger trg_resolve_support_message_tenant
before insert on public.support_messages
for each row execute function public.resolve_support_message_tenant();

create or replace function public.enforce_support_sender_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Somente admin global pode enviar mensagem como agente.
  if new.sender_type = 'agent' and not public.is_global_admin() then
    new.sender_type := 'customer';
  end if;

  -- system pode ser nulo no sender_profile_id.
  if new.sender_type = 'system' then
    new.sender_profile_id := null;
  end if;

  -- customer/agent sem sender explicito usa auth.uid() quando existir.
  if new.sender_type in ('customer', 'agent') and new.sender_profile_id is null and auth.uid() is not null then
    new.sender_profile_id := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_support_sender_type on public.support_messages;
create trigger trg_enforce_support_sender_type
before insert on public.support_messages
for each row execute function public.enforce_support_sender_type();

create or replace function public.set_support_thread_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_support_threads_updated_at on public.support_threads;
create trigger trg_support_threads_updated_at
before update on public.support_threads
for each row execute function public.set_support_thread_updated_at();

-- -----------------------------------------------------------------------------
-- 4) RLS
-- -----------------------------------------------------------------------------
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "Support threads select" on public.support_threads;
create policy "Support threads select"
on public.support_threads
for select
using (
  public.is_global_admin()
  or public.has_tenant_access(tenant_id)
);

drop policy if exists "Support threads insert" on public.support_threads;
create policy "Support threads insert"
on public.support_threads
for insert
with check (
  public.has_tenant_access(tenant_id)
  and requester_profile_id = auth.uid()
);

drop policy if exists "Support threads update" on public.support_threads;
create policy "Support threads update"
on public.support_threads
for update
using (
  public.is_global_admin()
  or requester_profile_id = auth.uid()
)
with check (
  public.is_global_admin()
  or requester_profile_id = auth.uid()
);

drop policy if exists "Support threads delete" on public.support_threads;
create policy "Support threads delete"
on public.support_threads
for delete
using (public.is_global_admin());

drop policy if exists "Support messages select" on public.support_messages;
create policy "Support messages select"
on public.support_messages
for select
using (
  public.is_global_admin()
  or public.has_tenant_access(tenant_id)
);

drop policy if exists "Support messages insert" on public.support_messages;
create policy "Support messages insert"
on public.support_messages
for insert
with check (
  public.has_tenant_access(tenant_id)
  and (
    public.is_global_admin()
    or sender_type <> 'agent'
  )
);

drop policy if exists "Support messages update" on public.support_messages;
create policy "Support messages update"
on public.support_messages
for update
using (public.is_global_admin())
with check (public.is_global_admin());

drop policy if exists "Support messages delete" on public.support_messages;
create policy "Support messages delete"
on public.support_messages
for delete
using (public.is_global_admin());

commit;
