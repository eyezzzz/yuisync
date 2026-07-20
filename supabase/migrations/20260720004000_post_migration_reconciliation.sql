begin;

-- A funcao atende duas tabelas com formatos diferentes. A conversao para
-- jsonb evita que o PostgreSQL tente resolver um campo inexistente em NEW.
create or replace function public.prevent_mock_fiscal_outside_test()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  provider_name text;
begin
  provider_name := case
    when tg_table_name = 'fiscal_documents' then coalesce(to_jsonb(new)->>'provider', '')
    else coalesce(to_jsonb(new)->'settings'->>'provider', '')
  end;

  if provider_name = 'mock_local' and not exists (
    select 1 from public.tenants tenant
    where tenant.id = new.tenant_id and tenant.is_test = true
  ) then
    raise exception 'mock_local permitido somente em tenant marcado como teste';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_tenant_reassignment on public.pets;
create trigger prevent_tenant_reassignment
before update of tenant_id on public.pets
for each row execute function public.prevent_tenant_reassignment();

-- Preserva os documentos historicos e explicita que eles foram emitidos pelo
-- simulador legado. O identificador mock_local fica reservado a tenants teste.
update public.fiscal_documents document
set provider = 'legacy_mock_local'
where document.provider = 'mock_local'
  and not exists (
    select 1
    from public.tenants tenant
    where tenant.id = document.tenant_id and tenant.is_test = true
  );

commit;
