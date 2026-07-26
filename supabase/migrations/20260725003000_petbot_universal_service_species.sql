begin;

-- Align the authoritative transaction with the runtime catalog normalizer.
-- Legacy imports may store universal service species as all/todos/qualquer/pet.
-- Those values mean "no restriction" and must never reject a confirmed booking.
do $migration$
declare
  v_definition text;
  v_pattern text :=
    'if[[:space:]]+v_service_species[[:space:]]+is[[:space:]]+not[[:space:]]+null[[:space:]]+'
    || 'and[[:space:]]+lower\(v_species\)[[:space:]]+not[[:space:]]+in[[:space:]]*\('
    || 'v_service_species,[[:space:]]*'
    || 'case[[:space:]]+when[[:space:]]+v_service_species[[:space:]]+in[[:space:]]*\(''cao'',''caes'',''cachorro'',''canino''\)[[:space:]]+then[[:space:]]+''dog''[[:space:]]+else[[:space:]]+v_service_species[[:space:]]+end,[[:space:]]*'
    || 'case[[:space:]]+when[[:space:]]+v_service_species[[:space:]]+in[[:space:]]*\(''gato'',''felino''\)[[:space:]]+then[[:space:]]+''cat''[[:space:]]+else[[:space:]]+v_service_species[[:space:]]+end\)'
    || '[[:space:]]+then[[:space:]]+raise[[:space:]]+exception[[:space:]]+''Servico nao corresponde a especie informada\.'';[[:space:]]+end[[:space:]]+if;';
  v_replacement text :=
    E'if v_service_species is not null\n'
    || E'        and v_service_species not in (''all'', ''any'', ''todos'', ''todas'', ''qualquer'', ''pet'', ''pets'', ''ambos'')\n'
    || E'        and not (\n'
    || E'          lower(v_species) = v_service_species\n'
    || E'          or (v_service_species in (''dog'', ''cao'', ''caes'', ''cachorro'', ''cachorra'', ''canino'', ''canina'')\n'
    || E'              and lower(v_species) in (''dog'', ''cao'', ''caes'', ''cachorro'', ''cachorra'', ''canino'', ''canina''))\n'
    || E'          or (v_service_species in (''cat'', ''gato'', ''gata'', ''gatos'', ''gatas'', ''felino'', ''felina'')\n'
    || E'              and lower(v_species) in (''cat'', ''gato'', ''gata'', ''gatos'', ''gatas'', ''felino'', ''felina''))\n'
    || E'        )\n'
    || E'      then\n'
    || E'        raise exception ''Servico nao corresponde a especie informada.'';\n'
    || E'      end if;';
begin
  select pg_get_functiondef(
    'public.create_petbot_order_transaction(jsonb)'::regprocedure
  ) into v_definition;

  if v_definition ~ 'v_service_species[[:space:]]+not[[:space:]]+in[[:space:]]*\(''all''' then
    return;
  end if;

  if v_definition !~* v_pattern then
    raise exception
      'Nao foi possivel localizar a validacao de especie da RPC do PetBot.';
  end if;

  v_definition := regexp_replace(v_definition, v_pattern, v_replacement, 'i');
  execute v_definition;

  select pg_get_functiondef(
    'public.create_petbot_order_transaction(jsonb)'::regprocedure
  ) into v_definition;

  if v_definition !~ 'v_service_species[[:space:]]+not[[:space:]]+in[[:space:]]*\(''all''' then
    raise exception
      'A RPC do PetBot nao passou a aceitar servicos de especie universal.';
  end if;
end
$migration$;

revoke all
on function public.create_petbot_order_transaction(jsonb)
from public, anon, authenticated;

grant execute
on function public.create_petbot_order_transaction(jsonb)
to service_role;

notify pgrst, 'reload schema';

commit;
