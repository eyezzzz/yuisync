-- =============================================================================
-- YuiSync Isolation Manual Tests (RLS + Active Tenant)
-- =============================================================================
-- Objetivo: validar que Usuario A nao enxerga dados do Usuario B.
--
-- Pre-requisitos:
-- 1) multi_tenant_instances.sql aplicado.
-- 2) Dois usuarios reais no auth:
--    - user_a (tenant A)
--    - user_b (tenant B)
-- 3) Os dois com permissao no modulo petshop.
--
-- Observacao:
-- Este teste usa "set local request.jwt.claim.sub" para simular auth.uid().
-- Execute cada bloco separadamente no SQL Editor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- BLOCO 1: Ajuste IDs (substitua os UUIDs)
-- ---------------------------------------------------------------------------
-- Tenant A:
-- select '11111111-1111-1111-1111-111111111111'::uuid as tenant_a_id;
-- Tenant B:
-- select '22222222-2222-2222-2222-222222222222'::uuid as tenant_b_id;
-- User A (auth user id):
-- select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid as user_a_id;
-- User B (auth user id):
-- select 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid as user_b_id;

-- ---------------------------------------------------------------------------
-- BLOCO 2: Dados de prova (execute 1x)
-- ---------------------------------------------------------------------------
-- Substitua os IDs abaixo antes de rodar:
-- tenant_a, tenant_b, user_a, user_b

begin;

-- Vinculos
insert into public.profile_tenants (profile_id, tenant_id, role, active)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'owner', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'owner', true)
on conflict (profile_id, tenant_id) do update set active = true;

update public.profiles
set active_tenant_id = '11111111-1111-1111-1111-111111111111'::uuid
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

update public.profiles
set active_tenant_id = '22222222-2222-2222-2222-222222222222'::uuid
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;

-- Dados separados por tenant
insert into public.clients (tenant_id, module_id, type, name, phone, active, details)
values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'petshop', 'pet', 'Cliente Tenant A', '5511999000001', true, '{"pet_name":"Pet A"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'petshop', 'pet', 'Cliente Tenant B', '5511999000002', true, '{"pet_name":"Pet B"}'::jsonb)
on conflict do nothing;

commit;

-- ---------------------------------------------------------------------------
-- BLOCO 3: Simular User A
-- Esperado: so enxerga "Cliente Tenant A"
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select id, name, tenant_id
from public.clients
where module_id = 'petshop'
order by created_at desc
limit 20;
rollback;

-- ---------------------------------------------------------------------------
-- BLOCO 4: Simular User B
-- Esperado: so enxerga "Cliente Tenant B"
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

select id, name, tenant_id
from public.clients
where module_id = 'petshop'
order by created_at desc
limit 20;
rollback;

-- ---------------------------------------------------------------------------
-- BLOCO 5: Troca de tenant ativo do User A
-- Esperado: ao mudar active_tenant_id, visao muda para tenant escolhido.
-- ---------------------------------------------------------------------------
-- update public.profiles
-- set active_tenant_id = '22222222-2222-2222-2222-222222222222'::uuid
-- where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
--
-- Repetir BLOCO 3 e confirmar que User A passa a ver tenant B.
