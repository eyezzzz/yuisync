begin;

-- A capacidade agora e apenas visual. O operador pode registrar quantos
-- atendimentos precisar no mesmo horario, inclusive para o mesmo responsavel.
-- Mantemos a funcao e o trigger existentes para nao quebrar dependencias, mas
-- ela deixa de rejeitar sobreposicoes.
create or replace function public.prevent_appointment_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  return new;
end;
$$;

comment on function public.prevent_appointment_overlap() is
  'Agenda operacional livre: sobreposicoes e responsaveis coincidentes sao permitidos; quatro colunas sao apenas apresentacao.';

commit;
