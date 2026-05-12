-- =============================================================================
-- YuiSync - Prompt runtime por tenant
-- =============================================================================
-- Objetivo:
-- 1) Guardar a instrucao customizada do bot em settings, por tenant + modulo.
-- 2) Manter novos tenants sem prompt customizado por padrao.
-- 3) Impedir que o runtime dependa de prompt_versions / ai_training_documents.
-- =============================================================================

begin;

alter table public.settings
  add column if not exists bot_prompt text not null default '';

alter table public.settings
  add column if not exists delivery_fee numeric(10,2) not null default 10.00;

alter table public.companies
  alter column system_prompt set default '';

update public.settings
set
  bot_prompt = coalesce(bot_prompt, ''),
  delivery_fee = coalesce(delivery_fee, 10.00);

update public.companies
set system_prompt = coalesce(system_prompt, '');

commit;
