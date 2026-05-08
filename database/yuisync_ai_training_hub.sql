-- =============================================================================
-- YuiSync - AI Training Hub (Documentos + Playground)
-- =============================================================================
-- Objetivo:
-- 1) Criar base de documentos de treino para RAG por tenant/empresa
-- 2) Registrar testes de IA realizados no Hub Central
-- 3) Preparar bucket de arquivos para upload de conhecimento
-- =============================================================================

begin;

create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1) Documentos de treino
-- -----------------------------------------------------------------------------
create table if not exists public.ai_training_documents (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null default 'petshop',
  company_id uuid references public.companies(id) on delete cascade,
  title text not null,
  storage_bucket text,
  storage_path text,
  mime_type text,
  file_size bigint,
  content_text text,
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_training_docs_scope
  on public.ai_training_documents(tenant_id, module_id, company_id, status, created_at desc);

create index if not exists idx_ai_training_docs_company
  on public.ai_training_documents(company_id, status, created_at desc);

create unique index if not exists uq_ai_training_docs_storage
  on public.ai_training_documents(storage_bucket, storage_path)
  where storage_path is not null;

-- -----------------------------------------------------------------------------
-- 2) Historico de testes de IA
-- -----------------------------------------------------------------------------
create table if not exists public.ai_playground_runs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id text not null default 'petshop',
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  customer_phone text not null,
  input_message text not null,
  parsed_intent jsonb not null default '{}'::jsonb,
  action text,
  reply text,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_playground_runs_scope
  on public.ai_playground_runs(tenant_id, module_id, company_id, created_at desc);

create index if not exists idx_ai_playground_runs_company
  on public.ai_playground_runs(company_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 3) Trigger de updated_at
-- -----------------------------------------------------------------------------
create or replace function public.yui_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ai_training_docs_updated_at on public.ai_training_documents;
create trigger trg_ai_training_docs_updated_at
before update on public.ai_training_documents
for each row execute function public.yui_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 4) RLS
-- -----------------------------------------------------------------------------
alter table public.ai_training_documents enable row level security;
alter table public.ai_playground_runs enable row level security;

drop policy if exists "AI docs select" on public.ai_training_documents;
create policy "AI docs select"
on public.ai_training_documents
for select
using (
  public.is_global_admin()
  or auth.role() = 'service_role'
);

drop policy if exists "AI docs insert" on public.ai_training_documents;
create policy "AI docs insert"
on public.ai_training_documents
for insert
with check (
  public.is_global_admin()
  or auth.role() = 'service_role'
);

drop policy if exists "AI docs update" on public.ai_training_documents;
create policy "AI docs update"
on public.ai_training_documents
for update
using (
  public.is_global_admin()
  or auth.role() = 'service_role'
)
with check (
  public.is_global_admin()
  or auth.role() = 'service_role'
);

drop policy if exists "AI docs delete" on public.ai_training_documents;
create policy "AI docs delete"
on public.ai_training_documents
for delete
using (
  public.is_global_admin()
  or auth.role() = 'service_role'
);

drop policy if exists "AI playground select" on public.ai_playground_runs;
create policy "AI playground select"
on public.ai_playground_runs
for select
using (
  public.is_global_admin()
  or auth.role() = 'service_role'
);

drop policy if exists "AI playground insert" on public.ai_playground_runs;
create policy "AI playground insert"
on public.ai_playground_runs
for insert
with check (
  public.is_global_admin()
  or auth.role() = 'service_role'
);

drop policy if exists "AI playground update" on public.ai_playground_runs;
create policy "AI playground update"
on public.ai_playground_runs
for update
using (public.is_global_admin())
with check (public.is_global_admin());

drop policy if exists "AI playground delete" on public.ai_playground_runs;
create policy "AI playground delete"
on public.ai_playground_runs
for delete
using (public.is_global_admin());

-- -----------------------------------------------------------------------------
-- 5) Bucket de documentos
-- -----------------------------------------------------------------------------
do $storage_block$
begin
  insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
  )
  values (
    'yuisync-ai-docs',
    'yuisync-ai-docs',
    false,
    10485760,
    array[
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]::text[]
  )
  on conflict (id) do update
  set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  begin
    execute 'drop policy if exists "AI docs storage select" on storage.objects';
    execute 'create policy "AI docs storage select"
      on storage.objects
      for select
      using (bucket_id = ''yuisync-ai-docs'' and public.is_global_admin())';

    execute 'drop policy if exists "AI docs storage insert" on storage.objects';
    execute 'create policy "AI docs storage insert"
      on storage.objects
      for insert
      with check (bucket_id = ''yuisync-ai-docs'' and public.is_global_admin())';

    execute 'drop policy if exists "AI docs storage update" on storage.objects';
    execute 'create policy "AI docs storage update"
      on storage.objects
      for update
      using (bucket_id = ''yuisync-ai-docs'' and public.is_global_admin())
      with check (bucket_id = ''yuisync-ai-docs'' and public.is_global_admin())';

    execute 'drop policy if exists "AI docs storage delete" on storage.objects';
    execute 'create policy "AI docs storage delete"
      on storage.objects
      for delete
      using (bucket_id = ''yuisync-ai-docs'' and public.is_global_admin())';
  exception
    when insufficient_privilege then
      raise notice 'Sem permissao para alterar policies em storage.objects. Configure essas policies manualmente no painel Storage.';
  end;
exception
  when insufficient_privilege then
    raise notice 'Sem permissao para criar/atualizar bucket via SQL. Crie o bucket yuisync-ai-docs no painel Storage.';
end
$storage_block$;

-- -----------------------------------------------------------------------------
-- 6) Log da entrega
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
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'tenants'
    ) then
      select t.id
      into v_tenant
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
      'Hub de Treino de IA com documentos e playground',
      'Criada estrutura para upload de conhecimento, historico de testes da IA e bucket protegido no Supabase Storage.',
      'milestone-yui-ai-hub-20260403',
      now()
    )
    on conflict (fingerprint) do nothing;
  end if;
end $$;

commit;
