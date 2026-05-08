-- =============================================================================
-- YuiSync Security Hardening
-- =============================================================================
-- Aplique este arquivo depois do schema principal.
-- Importante:
-- 1. Remova VITE_OPENAI_API_KEY do frontend.
-- 2. Use SUPABASE_SERVICE_ROLE_KEY apenas no backend/bots.
-- 3. Desative "Enable email signups" no painel do Supabase se quiser operação
--    totalmente administrada por convite/criação interna.
--
-- Bootstrap do primeiro admin:
-- Depois de criar manualmente um usuário confiável, promova-o com:
-- update public.profiles
-- set role = 'admin',
--     allowed_modules = '["petshop","contabilidade","marmitaria"]'::jsonb,
--     module_permissions = '{"petshop":"admin_pet","contabilidade":"admin_contabil","marmitaria":"admin_marmita"}'::jsonb
-- where email = 'seu-email@empresa.com';
-- =============================================================================

begin;

create index if not exists idx_clients_module_id on public.clients (module_id);
create index if not exists idx_appointments_module_scheduled_at on public.appointments (module_id, scheduled_at);
create index if not exists idx_products_module_name on public.products (module_id, name);
create index if not exists idx_sales_module_created_at on public.sales (module_id, created_at desc);
create index if not exists idx_invoices_module_created_at on public.invoices (module_id, created_at desc);
create index if not exists idx_chat_sessions_module_last_message on public.chat_sessions (module_id, last_message_at desc);
create index if not exists idx_chat_messages_session_sent_at on public.chat_messages (session_id, sent_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    email,
    role,
    active,
    allowed_modules,
    module_permissions
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    'employee',
    true,
    '[]'::jsonb,
    '{}'::jsonb
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and role = 'admin'
  );
$$;

create or replace function public.has_module_access(check_module_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and (
        role = 'admin'
        or coalesce(allowed_modules, '[]'::jsonb) ? check_module_id
      )
  );
$$;

create or replace function public.is_module_admin(check_module_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and (
        role = 'admin'
        or coalesce(module_permissions ->> check_module_id, '') like 'admin_%'
      )
  );
$$;

create or replace function public.sale_module_id(target_sale_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select module_id
  from public.sales
  where id = target_sale_id
  limit 1;
$$;

create or replace function public.chat_session_module_id(target_session_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select module_id
  from public.chat_sessions
  where id = target_session_id
  limit 1;
$$;

drop policy if exists "Profiles update own" on public.profiles;
drop policy if exists "Profiles select restricted" on public.profiles;
drop policy if exists "Profiles select own" on public.profiles;

drop policy if exists "Isolamento por módulo Settings" on public.settings;
drop policy if exists "Settings select" on public.settings;
drop policy if exists "Settings insert" on public.settings;
drop policy if exists "Settings update" on public.settings;
drop policy if exists "Settings delete" on public.settings;

drop policy if exists "Isolamento por módulo Clients" on public.clients;
drop policy if exists "Clients select" on public.clients;
drop policy if exists "Clients insert" on public.clients;
drop policy if exists "Clients update" on public.clients;
drop policy if exists "Clients delete" on public.clients;

drop policy if exists "Isolamento por módulo Appointments" on public.appointments;
drop policy if exists "Appointments select" on public.appointments;
drop policy if exists "Appointments insert" on public.appointments;
drop policy if exists "Appointments update" on public.appointments;
drop policy if exists "Appointments delete" on public.appointments;

drop policy if exists "Isolamento por módulo Products" on public.products;
drop policy if exists "Products select" on public.products;
drop policy if exists "Products insert" on public.products;
drop policy if exists "Products update" on public.products;
drop policy if exists "Products delete" on public.products;

drop policy if exists "Isolamento por módulo Sales" on public.sales;
drop policy if exists "Sales select" on public.sales;
drop policy if exists "Sales insert" on public.sales;
drop policy if exists "Sales update" on public.sales;
drop policy if exists "Sales delete" on public.sales;

drop policy if exists "Isolamento Sale Items via Sales" on public.sale_items;
drop policy if exists "Sale items select" on public.sale_items;
drop policy if exists "Sale items insert" on public.sale_items;
drop policy if exists "Sale items update" on public.sale_items;
drop policy if exists "Sale items delete" on public.sale_items;

drop policy if exists "Isolamento por módulo Invoices" on public.invoices;
drop policy if exists "Invoices select" on public.invoices;
drop policy if exists "Invoices insert" on public.invoices;
drop policy if exists "Invoices update" on public.invoices;
drop policy if exists "Invoices delete" on public.invoices;

drop policy if exists "Isolamento por módulo Billing Settings" on public.billing_settings;
drop policy if exists "Billing settings select" on public.billing_settings;
drop policy if exists "Billing settings insert" on public.billing_settings;
drop policy if exists "Billing settings update" on public.billing_settings;
drop policy if exists "Billing settings delete" on public.billing_settings;

drop policy if exists "Isolamento por módulo Chat Sessions" on public.chat_sessions;
drop policy if exists "Chat sessions select" on public.chat_sessions;
drop policy if exists "Chat sessions insert" on public.chat_sessions;
drop policy if exists "Chat sessions update" on public.chat_sessions;
drop policy if exists "Chat sessions delete" on public.chat_sessions;

drop policy if exists "Isolamento Chat Messages via Session" on public.chat_messages;
drop policy if exists "Chat messages select" on public.chat_messages;
drop policy if exists "Chat messages insert" on public.chat_messages;
drop policy if exists "Chat messages update" on public.chat_messages;
drop policy if exists "Chat messages delete" on public.chat_messages;

drop policy if exists "Quick Replies público para autenticados" on public.quick_replies;
drop policy if exists "Quick replies select" on public.quick_replies;
drop policy if exists "Quick replies insert" on public.quick_replies;
drop policy if exists "Quick replies update" on public.quick_replies;
drop policy if exists "Quick replies delete" on public.quick_replies;

drop policy if exists "Isolamento por módulo Accounting" on public.accounting_services;
drop policy if exists "Accounting services select" on public.accounting_services;
drop policy if exists "Accounting services insert" on public.accounting_services;
drop policy if exists "Accounting services update" on public.accounting_services;
drop policy if exists "Accounting services delete" on public.accounting_services;

drop policy if exists "Marmitaria Itens" on public.marmitaria_itens;
drop policy if exists "Marmitaria itens select" on public.marmitaria_itens;
drop policy if exists "Marmitaria itens insert" on public.marmitaria_itens;
drop policy if exists "Marmitaria itens update" on public.marmitaria_itens;
drop policy if exists "Marmitaria itens delete" on public.marmitaria_itens;

drop policy if exists "Marmitaria Config" on public.marmitaria_config;
drop policy if exists "Marmitaria config select" on public.marmitaria_config;
drop policy if exists "Marmitaria config insert" on public.marmitaria_config;
drop policy if exists "Marmitaria config update" on public.marmitaria_config;
drop policy if exists "Marmitaria config delete" on public.marmitaria_config;

drop policy if exists "Marmitaria Pedidos" on public.marmitaria_pedidos;
drop policy if exists "Marmitaria pedidos select" on public.marmitaria_pedidos;
drop policy if exists "Marmitaria pedidos insert" on public.marmitaria_pedidos;
drop policy if exists "Marmitaria pedidos update" on public.marmitaria_pedidos;
drop policy if exists "Marmitaria pedidos delete" on public.marmitaria_pedidos;

drop policy if exists "Marmitaria Bot Sessions" on public.marmitaria_bot_sessions;

create policy "Profiles select own"
on public.profiles
for select
using (id = auth.uid());

create policy "Settings select"
on public.settings
for select
using (public.has_module_access(module_id));

create policy "Settings insert"
on public.settings
for insert
with check (public.is_module_admin(module_id));

create policy "Settings update"
on public.settings
for update
using (public.is_module_admin(module_id))
with check (public.is_module_admin(module_id));

create policy "Settings delete"
on public.settings
for delete
using (public.is_global_admin());

create policy "Clients select"
on public.clients
for select
using (public.has_module_access(module_id));

create policy "Clients insert"
on public.clients
for insert
with check (public.has_module_access(module_id));

create policy "Clients update"
on public.clients
for update
using (public.has_module_access(module_id))
with check (public.has_module_access(module_id));

create policy "Clients delete"
on public.clients
for delete
using (public.is_module_admin(module_id));

create policy "Appointments select"
on public.appointments
for select
using (public.has_module_access(module_id));

create policy "Appointments insert"
on public.appointments
for insert
with check (public.has_module_access(module_id));

create policy "Appointments update"
on public.appointments
for update
using (public.has_module_access(module_id))
with check (public.has_module_access(module_id));

create policy "Appointments delete"
on public.appointments
for delete
using (public.is_module_admin(module_id));

create policy "Products select"
on public.products
for select
using (public.has_module_access(module_id));

create policy "Products insert"
on public.products
for insert
with check (public.is_module_admin(module_id));

create policy "Products update"
on public.products
for update
using (public.is_module_admin(module_id))
with check (public.is_module_admin(module_id));

create policy "Products delete"
on public.products
for delete
using (public.is_module_admin(module_id));

create policy "Sales select"
on public.sales
for select
using (public.has_module_access(module_id));

create policy "Sales insert"
on public.sales
for insert
with check (public.has_module_access(module_id));

create policy "Sales update"
on public.sales
for update
using (public.has_module_access(module_id))
with check (public.has_module_access(module_id));

create policy "Sales delete"
on public.sales
for delete
using (public.is_module_admin(module_id));

create policy "Sale items select"
on public.sale_items
for select
using (public.has_module_access(public.sale_module_id(sale_id)));

create policy "Sale items insert"
on public.sale_items
for insert
with check (public.has_module_access(public.sale_module_id(sale_id)));

create policy "Sale items update"
on public.sale_items
for update
using (public.has_module_access(public.sale_module_id(sale_id)))
with check (public.has_module_access(public.sale_module_id(sale_id)));

create policy "Sale items delete"
on public.sale_items
for delete
using (public.is_module_admin(public.sale_module_id(sale_id)));

create policy "Invoices select"
on public.invoices
for select
using (public.is_module_admin(module_id));

create policy "Invoices insert"
on public.invoices
for insert
with check (public.is_module_admin(module_id));

create policy "Invoices update"
on public.invoices
for update
using (public.is_module_admin(module_id))
with check (public.is_module_admin(module_id));

create policy "Invoices delete"
on public.invoices
for delete
using (public.is_module_admin(module_id));

create policy "Billing settings select"
on public.billing_settings
for select
using (public.is_module_admin(module_id));

create policy "Billing settings insert"
on public.billing_settings
for insert
with check (public.is_module_admin(module_id));

create policy "Billing settings update"
on public.billing_settings
for update
using (public.is_module_admin(module_id))
with check (public.is_module_admin(module_id));

create policy "Billing settings delete"
on public.billing_settings
for delete
using (public.is_global_admin());

create policy "Chat sessions select"
on public.chat_sessions
for select
using (public.is_module_admin(module_id));

create policy "Chat sessions insert"
on public.chat_sessions
for insert
with check (public.is_module_admin(module_id));

create policy "Chat sessions update"
on public.chat_sessions
for update
using (public.is_module_admin(module_id))
with check (public.is_module_admin(module_id));

create policy "Chat sessions delete"
on public.chat_sessions
for delete
using (public.is_module_admin(module_id));

create policy "Chat messages select"
on public.chat_messages
for select
using (public.is_module_admin(public.chat_session_module_id(session_id)));

create policy "Chat messages insert"
on public.chat_messages
for insert
with check (public.is_module_admin(public.chat_session_module_id(session_id)));

create policy "Chat messages update"
on public.chat_messages
for update
using (public.is_module_admin(public.chat_session_module_id(session_id)))
with check (public.is_module_admin(public.chat_session_module_id(session_id)));

create policy "Chat messages delete"
on public.chat_messages
for delete
using (public.is_module_admin(public.chat_session_module_id(session_id)));

create policy "Quick replies select"
on public.quick_replies
for select
using (auth.uid() is not null);

create policy "Quick replies insert"
on public.quick_replies
for insert
with check (public.is_global_admin());

create policy "Quick replies update"
on public.quick_replies
for update
using (public.is_global_admin())
with check (public.is_global_admin());

create policy "Quick replies delete"
on public.quick_replies
for delete
using (public.is_global_admin());

create policy "Accounting services select"
on public.accounting_services
for select
using (public.has_module_access(module_id));

create policy "Accounting services insert"
on public.accounting_services
for insert
with check (public.is_module_admin(module_id));

create policy "Accounting services update"
on public.accounting_services
for update
using (public.is_module_admin(module_id))
with check (public.is_module_admin(module_id));

create policy "Accounting services delete"
on public.accounting_services
for delete
using (public.is_module_admin(module_id));

create policy "Marmitaria itens select"
on public.marmitaria_itens
for select
using (public.has_module_access('marmitaria'));

create policy "Marmitaria itens insert"
on public.marmitaria_itens
for insert
with check (public.is_module_admin('marmitaria'));

create policy "Marmitaria itens update"
on public.marmitaria_itens
for update
using (public.is_module_admin('marmitaria'))
with check (public.is_module_admin('marmitaria'));

create policy "Marmitaria itens delete"
on public.marmitaria_itens
for delete
using (public.is_module_admin('marmitaria'));

create policy "Marmitaria config select"
on public.marmitaria_config
for select
using (public.has_module_access('marmitaria'));

create policy "Marmitaria config insert"
on public.marmitaria_config
for insert
with check (public.is_module_admin('marmitaria'));

create policy "Marmitaria config update"
on public.marmitaria_config
for update
using (public.is_module_admin('marmitaria'))
with check (public.is_module_admin('marmitaria'));

create policy "Marmitaria config delete"
on public.marmitaria_config
for delete
using (public.is_module_admin('marmitaria'));

create policy "Marmitaria pedidos select"
on public.marmitaria_pedidos
for select
using (public.has_module_access('marmitaria'));

create policy "Marmitaria pedidos insert"
on public.marmitaria_pedidos
for insert
with check (public.has_module_access('marmitaria'));

create policy "Marmitaria pedidos update"
on public.marmitaria_pedidos
for update
using (public.has_module_access('marmitaria'))
with check (public.has_module_access('marmitaria'));

create policy "Marmitaria pedidos delete"
on public.marmitaria_pedidos
for delete
using (public.is_module_admin('marmitaria'));

commit;
