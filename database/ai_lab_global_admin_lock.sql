-- =============================================================================
-- YuiSync - IA Lab exclusivo para Admin Global
-- =============================================================================
-- Objetivo:
-- 1) Restringir documentos e playground da IA para Admin Global
-- 2) Alinhar Storage do bucket yuisync-ai-docs com o mesmo nivel de acesso
-- =============================================================================

begin;

alter table public.ai_training_documents enable row level security;
alter table public.ai_playground_runs enable row level security;

drop policy if exists "AI docs select" on public.ai_training_documents;
create policy "AI docs select"
on public.ai_training_documents
for select
using (public.is_global_admin() or auth.role() = 'service_role');

drop policy if exists "AI docs insert" on public.ai_training_documents;
create policy "AI docs insert"
on public.ai_training_documents
for insert
with check (public.is_global_admin() or auth.role() = 'service_role');

drop policy if exists "AI docs update" on public.ai_training_documents;
create policy "AI docs update"
on public.ai_training_documents
for update
using (public.is_global_admin() or auth.role() = 'service_role')
with check (public.is_global_admin() or auth.role() = 'service_role');

drop policy if exists "AI docs delete" on public.ai_training_documents;
create policy "AI docs delete"
on public.ai_training_documents
for delete
using (public.is_global_admin() or auth.role() = 'service_role');

drop policy if exists "AI playground select" on public.ai_playground_runs;
create policy "AI playground select"
on public.ai_playground_runs
for select
using (public.is_global_admin() or auth.role() = 'service_role');

drop policy if exists "AI playground insert" on public.ai_playground_runs;
create policy "AI playground insert"
on public.ai_playground_runs
for insert
with check (public.is_global_admin() or auth.role() = 'service_role');

drop policy if exists "AI playground update" on public.ai_playground_runs;
create policy "AI playground update"
on public.ai_playground_runs
for update
using (public.is_global_admin() or auth.role() = 'service_role')
with check (public.is_global_admin() or auth.role() = 'service_role');

drop policy if exists "AI playground delete" on public.ai_playground_runs;
create policy "AI playground delete"
on public.ai_playground_runs
for delete
using (public.is_global_admin() or auth.role() = 'service_role');

do $storage_policies$
begin
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
      raise notice 'Sem permissao para alterar policies em storage.objects. Ajuste manualmente no painel Storage.';
  end;
end
$storage_policies$;

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
    select t.id
      into v_tenant
    from public.tenants t
    where t.active = true
    order by t.created_at asc
    limit 1;

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
      'seguranca',
      'success',
      'changelog',
      'IA Lab restrito a Admin Global',
      'RLS reforcada em documentos/playground da IA para impedir acesso de admins locais e colaboradores.',
      'milestone-ai-lab-global-admin-only-20260403',
      now()
    )
    on conflict (fingerprint) do nothing;
  end if;
end $$;

commit;
