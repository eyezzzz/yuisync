-- YuiSync - CSAT 0-10 hotfix
-- O PetBot coleta avaliacao final de 0 a 10. Alguns bancos antigos ainda
-- tinham check constraint herdada permitindo uma escala menor.

begin;

alter table public.chat_sessions
  drop constraint if exists chat_sessions_csat_score_check;

alter table public.chat_sessions
  add constraint chat_sessions_csat_score_check
  check (csat_score is null or (csat_score >= 0 and csat_score <= 10));

commit;
