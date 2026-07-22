begin;

-- O estado do agente e um documento estruturado. Alguns bancos legados ainda
-- possuem chat_sessions.context como text, enquanto as RPCs atuais usam
-- operadores JSONB. Normalize o contrato uma unica vez e preserve qualquer
-- valor legado que nao seja JSON valido.
create or replace function public._yuisync_safe_chat_context(p_value text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $function$
declare
  v_json jsonb;
begin
  if p_value is null or btrim(p_value) = '' then
    return '{}'::jsonb;
  end if;

  begin
    v_json := p_value::jsonb;

    if jsonb_typeof(v_json) = 'object' then
      return v_json;
    end if;

    return jsonb_build_object('legacy_value', v_json);
  exception
    when others then
      return jsonb_build_object('legacy_text', p_value);
  end;
end;
$function$;

do $migration$
declare
  v_context_type text;
begin
  select column_info.udt_name
  into v_context_type
  from information_schema.columns as column_info
  where column_info.table_schema = 'public'
    and column_info.table_name = 'chat_sessions'
    and column_info.column_name = 'context';

  if v_context_type is null then
    alter table public.chat_sessions
      add column context jsonb;
  elsif v_context_type <> 'jsonb' then
    alter table public.chat_sessions
      alter column context drop default;

    alter table public.chat_sessions
      alter column context type jsonb
      using public._yuisync_safe_chat_context(context::text);
  end if;
end;
$migration$;

update public.chat_sessions
set context = '{}'::jsonb
where context is null;

alter table public.chat_sessions
  alter column context set default '{}'::jsonb,
  alter column context set not null;

drop function public._yuisync_safe_chat_context(text);

commit;
