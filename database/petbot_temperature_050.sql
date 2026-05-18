-- Set PetBot LLM sampling temperature to 0.50 for existing petshop companies.
-- Safe to run more than once.

alter table public.companies
  alter column temperature set default 0.50;

update public.companies
set temperature = 0.50
where module_id = 'petshop'
  and is_active = true;
