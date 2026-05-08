-- =============================================================================
-- YuiSync - Motor Central de Bots (Supabase + Edge Functions)
-- =============================================================================
-- Objetivo:
-- 1) Criar camadas de prompt (core / nicho / empresa / RAG)
-- 2) Estruturar conversas com pausa de IA por conversa (ai_paused)
-- 3) Habilitar agendamento atomico via RPC book_appointment (sem race condition)
-- 4) Preparar seeds iniciais para QuatroPatas PetVet (Luma)
--
-- IMPORTANTE:
-- - Script idempotente (pode rodar mais de uma vez).
-- - Não remove estruturas existentes do projeto.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Extensões
-- -----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pg_net";
create extension if not exists "pg_cron";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'yui_prompt_layer'
  ) then
    create type public.yui_prompt_layer as enum ('core', 'niche', 'company');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'yui_appointment_status'
  ) then
    -- Mantemos os status legados para não quebrar módulos antigos.
    create type public.yui_appointment_status as enum (
      'available',
      'booked',
      'blocked',
      'agendado',
      'concluido',
      'cancelado'
    );
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Tabelas do motor central
-- -----------------------------------------------------------------------------
create table if not exists public.niches (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  base_prompt text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid,
  module_id text not null default 'petshop',
  niche_id uuid not null references public.niches(id) on delete restrict,
  name text not null,
  system_prompt text not null,
  bot_name text not null default 'Yui',
  temperature numeric(3,2) not null default 0.70,
  model_name text not null default 'gpt-4o-mini',
  welcome_message text,
  kb_namespace text,
  is_active boolean not null default true,
  schedule_free_status text not null default 'available',
  schedule_booked_status text not null default 'booked',
  created_at timestamptz not null default now()
);

alter table public.companies add column if not exists schedule_free_status text not null default 'available';
alter table public.companies add column if not exists schedule_booked_status text not null default 'booked';
alter table public.companies add column if not exists module_id text not null default 'petshop';

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'tenants'
  ) then
    if not exists (
      select 1
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'companies'
        and constraint_name = 'companies_tenant_id_fkey'
    ) then
      alter table public.companies
        add constraint companies_tenant_id_fkey
        foreign key (tenant_id) references public.tenants(id) on delete set null;
    end if;
  end if;
end $$;

create index if not exists idx_companies_tenant_id on public.companies(tenant_id);
create index if not exists idx_companies_module_id on public.companies(module_id);
create index if not exists idx_companies_niche_id on public.companies(niche_id);
create index if not exists idx_companies_active on public.companies(is_active);

create table if not exists public.prompt_versions (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  layer public.yui_prompt_layer not null,
  content text not null,
  version integer not null,
  is_active boolean not null default true,
  changed_by uuid,
  change_note text,
  created_at timestamptz not null default now(),
  constraint uq_prompt_versions_company_layer_version unique (company_id, layer, version)
);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    if not exists (
      select 1
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'prompt_versions'
        and constraint_name = 'prompt_versions_changed_by_fkey'
    ) then
      alter table public.prompt_versions
        add constraint prompt_versions_changed_by_fkey
        foreign key (changed_by) references public.profiles(id) on delete set null;
    end if;
  end if;
end $$;

create index if not exists idx_prompt_versions_company_layer_active
  on public.prompt_versions(company_id, layer, is_active, version desc);

create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_phone text not null,
  session_token uuid not null default uuid_generate_v4(),
  ai_paused boolean not null default false,
  pause_reason text,
  context jsonb not null default '{}'::jsonb,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint uq_conversations_session_token unique (session_token)
);

create index if not exists idx_conversations_company_phone
  on public.conversations(company_id, customer_phone);

create index if not exists idx_conversations_last_message
  on public.conversations(last_message_at desc);

-- -----------------------------------------------------------------------------
-- Extensão da tabela appointments (compatível com legado)
-- -----------------------------------------------------------------------------
alter table public.appointments add column if not exists company_id uuid;
alter table public.appointments add column if not exists conversation_id uuid;
alter table public.appointments add column if not exists service_date date;
alter table public.appointments add column if not exists start_time time;
alter table public.appointments add column if not exists end_time time;
alter table public.appointments add column if not exists description text;
alter table public.appointments add column if not exists customer_name text;
alter table public.appointments add column if not exists customer_phone text;
alter table public.appointments add column if not exists reminder_sent boolean not null default false;
alter table public.appointments add column if not exists reminder_sent_at timestamptz;
alter table public.appointments add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'appointments'
      and constraint_name = 'appointments_company_id_fkey'
  ) then
    alter table public.appointments
      add constraint appointments_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'appointments'
      and constraint_name = 'appointments_conversation_id_fkey'
  ) then
    alter table public.appointments
      add constraint appointments_conversation_id_fkey
      foreign key (conversation_id) references public.conversations(id) on delete set null;
  end if;
end $$;

-- IMPORTANTE:
-- Não alteramos o tipo de appointments.status para enum porque o projeto
-- já possui views/regras dependentes (ex: vw_agenda_hoje). Mantemos como text
-- para compatibilidade total com módulos existentes.
alter table public.appointments
  alter column status set default 'agendado';

create index if not exists idx_appointments_company_service_date
  on public.appointments(company_id, service_date);

create index if not exists idx_appointments_company_status
  on public.appointments(company_id, status);

create index if not exists idx_appointments_service_date_reminder_status
  on public.appointments(service_date, reminder_sent, status);

create unique index if not exists uq_appointments_company_slot
  on public.appointments(company_id, service_date, start_time)
  where company_id is not null
    and service_date is not null
    and start_time is not null;

create or replace function public.yui_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_yui_appointments_touch_updated_at on public.appointments;
create trigger trg_yui_appointments_touch_updated_at
before update on public.appointments
for each row execute function public.yui_touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.niches enable row level security;
alter table public.companies enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.conversations enable row level security;
alter table public.appointments enable row level security;

create or replace function public.yui_can_access_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role = 'admin'
    )
    or exists (
      select 1
      from public.companies c
      join public.profiles p on p.id = auth.uid()
      where c.id = p_company_id
        and p.active = true
        and c.tenant_id is not null
        and p.active_tenant_id = c.tenant_id
    );
$$;

-- niches
drop policy if exists "Yui niches select" on public.niches;
create policy "Yui niches select"
on public.niches
for select
using (auth.role() in ('authenticated', 'service_role'));

drop policy if exists "Yui niches manage" on public.niches;
create policy "Yui niches manage"
on public.niches
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- companies
drop policy if exists "Yui companies select" on public.companies;
create policy "Yui companies select"
on public.companies
for select
using (public.yui_can_access_company(id));

drop policy if exists "Yui companies insert" on public.companies;
create policy "Yui companies insert"
on public.companies
for insert
with check (auth.role() = 'service_role');

drop policy if exists "Yui companies update" on public.companies;
create policy "Yui companies update"
on public.companies
for update
using (public.yui_can_access_company(id))
with check (public.yui_can_access_company(id));

drop policy if exists "Yui companies delete" on public.companies;
create policy "Yui companies delete"
on public.companies
for delete
using (auth.role() = 'service_role');

-- prompt_versions
drop policy if exists "Yui prompt versions select" on public.prompt_versions;
create policy "Yui prompt versions select"
on public.prompt_versions
for select
using (public.yui_can_access_company(company_id));

drop policy if exists "Yui prompt versions insert" on public.prompt_versions;
create policy "Yui prompt versions insert"
on public.prompt_versions
for insert
with check (auth.role() = 'service_role' or public.yui_can_access_company(company_id));

drop policy if exists "Yui prompt versions update" on public.prompt_versions;
create policy "Yui prompt versions update"
on public.prompt_versions
for update
using (auth.role() = 'service_role' or public.yui_can_access_company(company_id))
with check (auth.role() = 'service_role' or public.yui_can_access_company(company_id));

drop policy if exists "Yui prompt versions delete" on public.prompt_versions;
create policy "Yui prompt versions delete"
on public.prompt_versions
for delete
using (auth.role() = 'service_role');

-- conversations
drop policy if exists "Yui conversations select" on public.conversations;
create policy "Yui conversations select"
on public.conversations
for select
using (public.yui_can_access_company(company_id));

drop policy if exists "Yui conversations insert" on public.conversations;
create policy "Yui conversations insert"
on public.conversations
for insert
with check (auth.role() = 'service_role' or public.yui_can_access_company(company_id));

drop policy if exists "Yui conversations update" on public.conversations;
create policy "Yui conversations update"
on public.conversations
for update
using (auth.role() = 'service_role' or public.yui_can_access_company(company_id))
with check (auth.role() = 'service_role' or public.yui_can_access_company(company_id));

drop policy if exists "Yui conversations delete" on public.conversations;
create policy "Yui conversations delete"
on public.conversations
for delete
using (auth.role() = 'service_role');

-- appointments (políticas adicionais para o fluxo Yui; não removem as existentes)
drop policy if exists "Yui appointments select" on public.appointments;
create policy "Yui appointments select"
on public.appointments
for select
using (
  auth.role() = 'service_role'
  or company_id is null
  or public.yui_can_access_company(company_id)
);

drop policy if exists "Yui appointments insert" on public.appointments;
create policy "Yui appointments insert"
on public.appointments
for insert
with check (
  auth.role() = 'service_role'
  or company_id is null
  or public.yui_can_access_company(company_id)
);

drop policy if exists "Yui appointments update" on public.appointments;
create policy "Yui appointments update"
on public.appointments
for update
using (
  auth.role() = 'service_role'
  or company_id is null
  or public.yui_can_access_company(company_id)
)
with check (
  auth.role() = 'service_role'
  or company_id is null
  or public.yui_can_access_company(company_id)
);

drop policy if exists "Yui appointments delete" on public.appointments;
create policy "Yui appointments delete"
on public.appointments
for delete
using (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- RPC de agendamento atômico
-- -----------------------------------------------------------------------------
create or replace function public.book_appointment(
  p_slot_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_company_id uuid,
  p_conversation_id uuid,
  p_service_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.appointments%rowtype;
  v_free_status text;
  v_booked_status text;
begin
  select
    nullif(lower(trim(coalesce(c.schedule_free_status, ''))), ''),
    nullif(lower(trim(coalesce(c.schedule_booked_status, ''))), '')
  into v_free_status, v_booked_status
  from public.companies c
  where c.id = p_company_id;

  v_free_status := coalesce(v_free_status, 'available');
  v_booked_status := coalesce(
    v_booked_status,
    case when v_free_status = 'booked' then 'agendado' else 'booked' end
  );

  select *
  into v_slot
  from public.appointments
  where id = p_slot_id
    and company_id = p_company_id
  for update skip locked;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'slot_taken');
  end if;

  if lower(coalesce(v_slot.status::text, '')) <> v_free_status then
    return jsonb_build_object('success', false, 'reason', 'slot_taken');
  end if;

  update public.appointments
  set
    status = v_booked_status,
    conversation_id = coalesce(p_conversation_id, conversation_id),
    service_type = coalesce(nullif(trim(p_service_type), ''), service_type, 'agendamento'),
    customer_name = coalesce(nullif(trim(p_customer_name), ''), customer_name, 'Cliente'),
    customer_phone = coalesce(nullif(trim(p_customer_phone), ''), customer_phone),
    description = coalesce(description, 'Agendamento confirmado via YuiSync'),
    updated_at = now()
  where id = v_slot.id
  returning * into v_slot;

  return jsonb_build_object(
    'success', true,
    'reason', null,
    'appointment_id', v_slot.id,
    'service_date', v_slot.service_date,
    'start_time', v_slot.start_time,
    'status', v_slot.status
  );
end;
$$;

grant execute on function public.book_appointment(uuid, text, text, uuid, uuid, text)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Seeds iniciais
-- -----------------------------------------------------------------------------
insert into public.niches (id, name, base_prompt)
values (
  '00000000-0000-0000-0000-000000000001',
  'pet_shop',
  $$
Você atende um pet shop com foco em banho, tosa e serviços de rotina.
Fale em português do Brasil com simpatia, objetividade e tom profissional.
Sempre confirme nome do pet, serviço e horário antes de finalizar.
$$
)
on conflict (id) do update
set
  name = excluded.name,
  base_prompt = excluded.base_prompt;

do $seed_company$
declare
  v_tenant uuid;
begin
  select t.id
  into v_tenant
  from public.tenants t
  where t.active = true
  order by t.created_at asc
  limit 1;

  insert into public.companies (
    id,
    tenant_id,
    module_id,
    niche_id,
    name,
    system_prompt,
    bot_name,
    temperature,
    model_name,
    welcome_message,
    kb_namespace,
    is_active,
    schedule_free_status,
    schedule_booked_status
  )
  values (
    '00000000-0000-0000-0000-000000000002',
    v_tenant,
    'petshop',
    '00000000-0000-0000-0000-000000000001',
    'QuatroPatas PetVet',
    $company_prompt$
Você é a Luma, assistente oficial da QuatroPatas PetVet.
Sempre priorize clareza, cordialidade e segurança.
Nunca invente horários. Use apenas os horários disponíveis no contexto.
$company_prompt$,
    'Luma',
    0.70,
    'gpt-4o-mini',
    'Olá. Eu sou a Luma da QuatroPatas PetVet. Posso te ajudar com horários e serviços.',
    'quatropatas-petvet',
    true,
    'available',
    'booked'
  )
  on conflict (id) do update
  set
    tenant_id = excluded.tenant_id,
    module_id = excluded.module_id,
    niche_id = excluded.niche_id,
    name = excluded.name,
    system_prompt = excluded.system_prompt,
    bot_name = excluded.bot_name,
    temperature = excluded.temperature,
    model_name = excluded.model_name,
    welcome_message = excluded.welcome_message,
    kb_namespace = excluded.kb_namespace,
    is_active = excluded.is_active,
    schedule_free_status = excluded.schedule_free_status,
    schedule_booked_status = excluded.schedule_booked_status;
end $seed_company$;

insert into public.prompt_versions (
  company_id,
  layer,
  content,
  version,
  is_active,
  changed_by,
  change_note
)
values
(
  '00000000-0000-0000-0000-000000000002',
  'core',
  'Camada core inicial YuiSync para comportamento universal.',
  1,
  true,
  null,
  'Seed inicial'
),
(
  '00000000-0000-0000-0000-000000000002',
  'niche',
  'Camada de nicho pet_shop aplicada para QuatroPatas.',
  1,
  true,
  null,
  'Seed inicial'
),
(
  '00000000-0000-0000-0000-000000000002',
  'company',
  'Camada da empresa QuatroPatas PetVet com identidade da Luma.',
  1,
  true,
  null,
  'Seed inicial'
)
on conflict (company_id, layer, version) do nothing;

do $$
declare
  v_company_id uuid := '00000000-0000-0000-0000-000000000002';
  v_tenant_id uuid;
  v_tomorrow date := ((now() at time zone 'America/Sao_Paulo')::date + 1);
  v_hour int;
  v_start time;
  v_end time;
  v_status text;
  v_service_type_value text;
  v_customer_name_value text;
  v_customer_phone_value text;
  v_status_constraint text;
  v_status_value text;
  v_allowed_statuses text[] := '{}';
  v_seed_free_status text;
  v_seed_booked_status text;
  v_company_free_status text;
  v_company_booked_status text;
  v_has_company_free_status boolean := false;
  v_has_company_booked_status boolean := false;

  v_has_clients_table boolean := false;
  v_has_pets_table boolean := false;
  v_has_client_id boolean := false;
  v_has_pet_id boolean := false;
  v_client_required boolean := false;
  v_pet_required boolean := false;
  v_clients_has_tenant boolean := false;
  v_pets_has_tenant boolean := false;
  v_pets_has_module boolean := false;
  v_service_type_required boolean := false;
  v_customer_name_required boolean := false;
  v_customer_phone_required boolean := false;
  v_pet_fk_table text;

  v_seed_client_id uuid;
  v_seed_pet_id uuid;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies' and column_name = 'schedule_free_status'
  ) into v_has_company_free_status;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies' and column_name = 'schedule_booked_status'
  ) into v_has_company_booked_status;

  select c.tenant_id
  into v_tenant_id
  from public.companies c
  where c.id = v_company_id;

  if v_has_company_free_status and v_has_company_booked_status then
    select c.schedule_free_status, c.schedule_booked_status
    into v_company_free_status, v_company_booked_status
    from public.companies c
    where c.id = v_company_id;
  end if;

  if v_tenant_id is null then
    select t.id
    into v_tenant_id
    from public.tenants t
    where t.active = true
    order by t.created_at asc
    limit 1;
  end if;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'clients'
  ) into v_has_clients_table;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'pets'
  ) into v_has_pets_table;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'client_id'
  ) into v_has_client_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'pet_id'
  ) into v_has_pet_id;

  select coalesce((
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'client_id'
  ), false) into v_client_required;

  select coalesce((
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'pet_id'
  ), false) into v_pet_required;

  select coalesce((
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'service_type'
  ), false) into v_service_type_required;

  select coalesce((
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'customer_name'
  ), false) into v_customer_name_required;

  select coalesce((
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'customer_phone'
  ), false) into v_customer_phone_required;

  if v_has_clients_table then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'clients' and column_name = 'tenant_id'
    ) into v_clients_has_tenant;
  end if;

  if v_has_pets_table then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pets' and column_name = 'tenant_id'
    ) into v_pets_has_tenant;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pets' and column_name = 'module_id'
    ) into v_pets_has_module;
  end if;

  if v_has_client_id then
    select a.client_id
    into v_seed_client_id
    from public.appointments a
    where a.company_id = v_company_id
      and a.client_id is not null
    order by a.created_at asc
    limit 1;
  end if;

  if v_seed_client_id is null and v_has_clients_table then
    if v_clients_has_tenant and v_tenant_id is not null then
      select c.id
      into v_seed_client_id
      from public.clients c
      where c.module_id = 'petshop'
        and c.tenant_id = v_tenant_id
      order by c.created_at asc
      limit 1;
    else
      select c.id
      into v_seed_client_id
      from public.clients c
      where c.module_id = 'petshop'
      order by c.created_at asc
      limit 1;
    end if;

    if v_seed_client_id is null then
      if v_clients_has_tenant then
        insert into public.clients (
          tenant_id,
          module_id,
          type,
          name,
          phone,
          details,
          active,
          created_at
        )
        values (
          v_tenant_id,
          'petshop',
          'pet',
          'Cliente teste YuiSync',
          '+5511999999999',
          jsonb_build_object(
            'pet_name', 'Pet teste YuiSync',
            'species', 'dog',
            'breed', 'SRD'
          ),
          true,
          now()
        )
        returning id into v_seed_client_id;
      else
        insert into public.clients (
          module_id,
          type,
          name,
          phone,
          details,
          active,
          created_at
        )
        values (
          'petshop',
          'pet',
          'Cliente teste YuiSync',
          '+5511999999999',
          jsonb_build_object(
            'pet_name', 'Pet teste YuiSync',
            'species', 'dog',
            'breed', 'SRD'
          ),
          true,
          now()
        )
        returning id into v_seed_client_id;
      end if;
    end if;
  end if;

  if v_has_pet_id then
    select a.pet_id
    into v_seed_pet_id
    from public.appointments a
    where a.company_id = v_company_id
      and a.pet_id is not null
    order by a.created_at asc
    limit 1;

    select n2.nspname || '.' || c2.relname
    into v_pet_fk_table
    from pg_constraint fk
    join pg_class c1 on c1.oid = fk.conrelid
    join pg_namespace n1 on n1.oid = c1.relnamespace
    join pg_class c2 on c2.oid = fk.confrelid
    join pg_namespace n2 on n2.oid = c2.relnamespace
    join pg_attribute a on a.attrelid = c1.oid and a.attnum = any(fk.conkey)
    where fk.contype = 'f'
      and n1.nspname = 'public'
      and c1.relname = 'appointments'
      and a.attname = 'pet_id'
    limit 1;

    if v_seed_pet_id is null then
      if v_pet_fk_table = 'public.clients' then
        v_seed_pet_id := v_seed_client_id;
      elsif v_pet_fk_table = 'public.pets' and v_has_pets_table then
        if v_pets_has_tenant and v_pets_has_module and v_tenant_id is not null then
          execute $q$
            select p.id
            from public.pets p
            where p.module_id = 'petshop'
              and p.tenant_id = $1
            order by p.created_at asc
            limit 1
          $q$
          into v_seed_pet_id
          using v_tenant_id;
        elsif v_pets_has_module then
          execute $q$
            select p.id
            from public.pets p
            where p.module_id = 'petshop'
            order by p.created_at asc
            limit 1
          $q$
          into v_seed_pet_id;
        else
          execute $q$
            select p.id
            from public.pets p
            order by p.created_at asc
            limit 1
          $q$
          into v_seed_pet_id;
        end if;
      else
        v_seed_pet_id := coalesce(v_seed_pet_id, v_seed_client_id);
      end if;
    end if;
  end if;

  if v_client_required and v_seed_client_id is null then
    raise notice 'Yui seed de agenda ignorado: appointments.client_id obrigatorio e nao foi possivel resolver um client_id valido.';
    return;
  end if;

  if v_pet_required and v_seed_pet_id is null then
    raise notice 'Yui seed de agenda ignorado: appointments.pet_id obrigatorio e nao foi possivel resolver um pet_id valido.';
    return;
  end if;

  select pg_get_constraintdef(c.oid)
  into v_status_constraint
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'appointments'
    and c.contype = 'c'
    and (
      c.conname = 'appointments_status_check'
      or pg_get_constraintdef(c.oid) ilike '%status%'
    )
  order by case when c.conname = 'appointments_status_check' then 0 else 1 end, c.oid
  limit 1;

  if v_status_constraint is not null then
    for v_status_value in
      select lower((regexp_matches(v_status_constraint, '''([^'']+)''', 'g'))[1])
    loop
      if v_status_value is null or v_status_value = '' then
        continue;
      end if;
      if not (v_status_value = any(v_allowed_statuses)) then
        v_allowed_statuses := array_append(v_allowed_statuses, v_status_value);
      end if;
    end loop;
  end if;

  v_seed_free_status := nullif(lower(trim(coalesce(v_company_free_status, ''))), '');
  v_seed_booked_status := nullif(lower(trim(coalesce(v_company_booked_status, ''))), '');

  if coalesce(array_length(v_allowed_statuses, 1), 0) > 0 then
    if v_seed_free_status is not null and not (v_seed_free_status = any(v_allowed_statuses)) then
      v_seed_free_status := null;
    end if;
    if v_seed_booked_status is not null and not (v_seed_booked_status = any(v_allowed_statuses)) then
      v_seed_booked_status := null;
    end if;
  end if;

  if v_seed_booked_status is null then
    foreach v_status_value in array array[
      'booked', 'agendado', 'reservado', 'confirmado', 'ocupado', 'blocked', 'bloqueado', 'concluido'
    ]
    loop
      if coalesce(array_length(v_allowed_statuses, 1), 0) = 0 or v_status_value = any(v_allowed_statuses) then
        v_seed_booked_status := v_status_value;
        exit;
      end if;
    end loop;
  end if;

  if v_seed_free_status is null then
    foreach v_status_value in array array[
      'available', 'livre', 'disponivel', 'aberto', 'open', 'aguardando', 'pendente', 'cancelado'
    ]
    loop
      if (
        coalesce(array_length(v_allowed_statuses, 1), 0) = 0
        or v_status_value = any(v_allowed_statuses)
      ) and v_status_value <> coalesce(v_seed_booked_status, '') then
        v_seed_free_status := v_status_value;
        exit;
      end if;
    end loop;
  end if;

  if v_seed_booked_status is null and coalesce(array_length(v_allowed_statuses, 1), 0) > 0 then
    v_seed_booked_status := v_allowed_statuses[1];
  end if;

  if v_seed_free_status is null and coalesce(array_length(v_allowed_statuses, 1), 0) > 0 then
    select s
    into v_seed_free_status
    from unnest(v_allowed_statuses) as s
    where s <> v_seed_booked_status
    limit 1;

    v_seed_free_status := coalesce(v_seed_free_status, v_seed_booked_status);
  end if;

  v_seed_free_status := coalesce(v_seed_free_status, 'available');
  v_seed_booked_status := coalesce(
    v_seed_booked_status,
    case when v_seed_free_status = 'booked' then 'agendado' else 'booked' end
  );

  if v_has_company_free_status and v_has_company_booked_status then
    update public.companies
    set
      schedule_free_status = v_seed_free_status,
      schedule_booked_status = v_seed_booked_status
    where id = v_company_id;
  end if;

  for v_hour in 8..17 loop
    v_start := make_time(v_hour, 0, 0);
    v_end := (v_start + interval '1 hour')::time;
    v_status := case when v_hour in (8, 11) then v_seed_booked_status else v_seed_free_status end;

    v_service_type_value := case
      when v_status = v_seed_booked_status then 'banho'
      when v_service_type_required then 'banho'
      else null
    end;

    v_customer_name_value := case
      when v_status = v_seed_booked_status then 'Cliente teste'
      when v_customer_name_required then 'Slot livre YuiSync'
      else null
    end;

    v_customer_phone_value := case
      when v_status = v_seed_booked_status then '+5511999999999'
      when v_customer_phone_required then '+5500000000000'
      else null
    end;

    if v_has_pet_id and v_has_client_id then
      update public.appointments
      set
        tenant_id = v_tenant_id,
        module_id = 'petshop',
        client_id = coalesce(v_seed_client_id, client_id),
        pet_id = coalesce(v_seed_pet_id, pet_id),
        end_time = v_end,
        scheduled_at = ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
        status = v_status,
        service_type = v_service_type_value,
        description = case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
        customer_name = v_customer_name_value,
        customer_phone = v_customer_phone_value,
        reminder_sent = false,
        reminder_sent_at = null,
        updated_at = now()
      where company_id = v_company_id
        and service_date = v_tomorrow
        and start_time = v_start;
    elsif v_has_pet_id then
      update public.appointments
      set
        tenant_id = v_tenant_id,
        module_id = 'petshop',
        pet_id = coalesce(v_seed_pet_id, pet_id),
        end_time = v_end,
        scheduled_at = ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
        status = v_status,
        service_type = v_service_type_value,
        description = case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
        customer_name = v_customer_name_value,
        customer_phone = v_customer_phone_value,
        reminder_sent = false,
        reminder_sent_at = null,
        updated_at = now()
      where company_id = v_company_id
        and service_date = v_tomorrow
        and start_time = v_start;
    elsif v_has_client_id then
      update public.appointments
      set
        tenant_id = v_tenant_id,
        module_id = 'petshop',
        client_id = coalesce(v_seed_client_id, client_id),
        end_time = v_end,
        scheduled_at = ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
        status = v_status,
        service_type = v_service_type_value,
        description = case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
        customer_name = v_customer_name_value,
        customer_phone = v_customer_phone_value,
        reminder_sent = false,
        reminder_sent_at = null,
        updated_at = now()
      where company_id = v_company_id
        and service_date = v_tomorrow
        and start_time = v_start;
    else
      update public.appointments
      set
        tenant_id = v_tenant_id,
        module_id = 'petshop',
        end_time = v_end,
        scheduled_at = ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
        status = v_status,
        service_type = v_service_type_value,
        description = case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
        customer_name = v_customer_name_value,
        customer_phone = v_customer_phone_value,
        reminder_sent = false,
        reminder_sent_at = null,
        updated_at = now()
      where company_id = v_company_id
        and service_date = v_tomorrow
        and start_time = v_start;
    end if;

    if not found then
      begin
        if v_has_pet_id and v_has_client_id then
          insert into public.appointments (
            tenant_id,
            module_id,
            company_id,
            client_id,
            pet_id,
            service_date,
            start_time,
            end_time,
            scheduled_at,
            status,
            service_type,
            description,
            customer_name,
            customer_phone,
            reminder_sent,
            reminder_sent_at,
            created_at,
            updated_at
          )
          values (
            v_tenant_id,
            'petshop',
            v_company_id,
            v_seed_client_id,
            v_seed_pet_id,
            v_tomorrow,
            v_start,
            v_end,
            ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
            v_status,
            v_service_type_value,
            case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
            v_customer_name_value,
            v_customer_phone_value,
            false,
            null,
            now(),
            now()
          );
        elsif v_has_pet_id then
          insert into public.appointments (
            tenant_id,
            module_id,
            company_id,
            pet_id,
            service_date,
            start_time,
            end_time,
            scheduled_at,
            status,
            service_type,
            description,
            customer_name,
            customer_phone,
            reminder_sent,
            reminder_sent_at,
            created_at,
            updated_at
          )
          values (
            v_tenant_id,
            'petshop',
            v_company_id,
            v_seed_pet_id,
            v_tomorrow,
            v_start,
            v_end,
            ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
            v_status,
            v_service_type_value,
            case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
            v_customer_name_value,
            v_customer_phone_value,
            false,
            null,
            now(),
            now()
          );
        elsif v_has_client_id then
          insert into public.appointments (
            tenant_id,
            module_id,
            company_id,
            client_id,
            service_date,
            start_time,
            end_time,
            scheduled_at,
            status,
            service_type,
            description,
            customer_name,
            customer_phone,
            reminder_sent,
            reminder_sent_at,
            created_at,
            updated_at
          )
          values (
            v_tenant_id,
            'petshop',
            v_company_id,
            v_seed_client_id,
            v_tomorrow,
            v_start,
            v_end,
            ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
            v_status,
            v_service_type_value,
            case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
            v_customer_name_value,
            v_customer_phone_value,
            false,
            null,
            now(),
            now()
          );
        else
          insert into public.appointments (
            tenant_id,
            module_id,
            company_id,
            service_date,
            start_time,
            end_time,
            scheduled_at,
            status,
            service_type,
            description,
            customer_name,
            customer_phone,
            reminder_sent,
            reminder_sent_at,
            created_at,
            updated_at
          )
          values (
            v_tenant_id,
            'petshop',
            v_company_id,
            v_tomorrow,
            v_start,
            v_end,
            ((v_tomorrow + v_start) at time zone 'America/Sao_Paulo'),
            v_status,
            v_service_type_value,
            case when v_status = v_seed_booked_status then 'Slot de teste ocupado' else 'Slot de teste livre' end,
            v_customer_name_value,
            v_customer_phone_value,
            false,
            null,
            now(),
            now()
          );
        end if;
      exception
        when unique_violation then
          null;
      end;
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Log da entrega (se tabela de logs estiver ativa)
-- -----------------------------------------------------------------------------
do $$
declare
  v_tenant uuid;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'system_update_logs'
  ) then
    select c.tenant_id
    into v_tenant
    from public.companies c
    where c.id = '00000000-0000-0000-0000-000000000002';

    if v_tenant is null then
      select t.id into v_tenant
      from public.tenants t
      where t.active = true
      order by t.created_at asc
      limit 1;
    end if;

    insert into public.system_update_logs (
      tenant_id,
      module_id,
      category,
      status,
      source,
      title,
      description,
      fingerprint,
      created_at
    )
    values (
      v_tenant,
      'system',
      'infra',
      'success',
      'changelog',
      'Motor central YuiSync (Edge Functions + RPC atomica)',
      'Camadas de prompt, parser de intent, RAG de agenda e agendamento atomico via RPC book_appointment foram habilitados.',
      'milestone-yui-core-engine-20260403',
      now()
    )
    on conflict (fingerprint) do nothing;
  end if;
end $$;

commit;
