-- =============================================================================
-- YuiSync - Support Center status upgrade
-- =============================================================================
-- Objetivo:
-- 1) Migrar status de suporte para: pending -> open -> finalized
-- 2) Converter tickets antigos "closed" para "finalized"
-- 3) Ajustar funcao de reabertura automatica em novas mensagens
-- =============================================================================

begin;

-- 1) Primeiro normalizamos qualquer legado/valor invalido.
-- Mantemos a mecanica principal:
-- pending (aguardando), open (em atendimento), finalized (encerrado).
update public.support_threads
set status = case
  when status in ('pending', 'open', 'finalized') then status
  when status = 'closed' then 'finalized'
  when status = 'resolved' then 'finalized'
  when status = 'done' then 'finalized'
  when status = 'in_progress' then 'open'
  when status = 'new' then 'pending'
  when status is null then 'pending'
  else 'pending'
end;

-- 2) Remove checks antigos para evitar conflito de definicao.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.support_threads'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) ilike '%status%'
        or conname = 'support_threads_status_check'
      )
  loop
    execute format('alter table public.support_threads drop constraint if exists %I', v_constraint.conname);
  end loop;
end $$;

-- 3) Recria check novo e validado no final.
alter table public.support_threads
  add constraint support_threads_status_check
  check (status in ('pending', 'open', 'finalized')) not valid;

alter table public.support_threads
  validate constraint support_threads_status_check;

-- Reabertura quando cliente manda mensagem apos finalizado.
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

commit;
