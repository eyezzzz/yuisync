begin;

-- Product pickup is operationally confirmed before payment happens at the
-- counter. Store that state explicitly instead of pretending the customer
-- selected Pix, cash or card in the conversation.
create or replace function public.normalize_petbot_sale_payment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source = 'whatsapp' and coalesce(new.payment_method, '') <> '' then
    if lower(new.payment_method) = 'pix' then
      new.status := 'pendente';
      new.payment_status := 'aguardando_comprovante';
      new.stock_reservation_expires_at := coalesce(
        new.stock_reservation_expires_at,
        now() + interval '30 minutes'
      );
    elsif lower(new.payment_method) in ('dinheiro', 'cartao', 'a_combinar') then
      new.status := 'pendente';
      new.payment_status := 'a_receber';
    end if;
    new.bot_engine_version := coalesce(new.bot_engine_version, 'petbot_agent_v3');
  end if;
  return new;
end;
$$;

do $migration$
declare
  v_definition text;
  v_payment_validation_pattern text :=
    'if[[:space:]]+v_payment_method[[:space:]]+not[[:space:]]+in[[:space:]]*\(''pix'',[[:space:]]*''dinheiro'',[[:space:]]*''cartao''\)[[:space:]]+then[[:space:]]+raise[[:space:]]+exception[[:space:]]+''Forma de pagamento invalida\.'';[[:space:]]+end if;';
  v_payment_validation_replacement text := E'if p_payload->>''fulfillment_type'' = ''retirada'' then\n      v_payment_method := ''a_combinar'';\n    elsif v_payment_method not in (''pix'', ''dinheiro'', ''cartao'') then\n      raise exception ''Forma de pagamento invalida.'';\n    end if;';
  v_payment_status_pattern text :=
    'v_payment_status[[:space:]]*:=[[:space:]]*case[[:space:]]+when[[:space:]]+v_payment_method[[:space:]]*=[[:space:]]*''pix''[[:space:]]+then[[:space:]]+''aguardando_comprovante''[[:space:]]+else[[:space:]]+''baixado''[[:space:]]+end;';
  v_payment_status_replacement text := E'v_payment_status := case\n      when v_payment_method = ''pix'' then ''aguardando_comprovante''\n      when v_payment_method = ''a_combinar'' then ''a_receber''\n      else ''baixado''\n    end;';
begin
  select pg_get_functiondef(
    'public.create_petbot_order_transaction(jsonb)'::regprocedure
  )
  into v_definition;

  if v_definition !~ 'v_payment_method[[:space:]]*:=[[:space:]]*''a_combinar''' then
    if v_definition !~* v_payment_validation_pattern then
      raise exception 'Nao foi possivel localizar a validacao de pagamento da RPC do PetBot.';
    end if;
    v_definition := regexp_replace(
      v_definition,
      v_payment_validation_pattern,
      v_payment_validation_replacement,
      'i'
    );
  end if;

  if v_definition !~ 'when[[:space:]]+v_payment_method[[:space:]]*=[[:space:]]*''a_combinar''[[:space:]]+then[[:space:]]+''a_receber''' then
    if v_definition !~* v_payment_status_pattern then
      raise exception 'Nao foi possivel localizar o status de pagamento da RPC do PetBot.';
    end if;
    v_definition := regexp_replace(
      v_definition,
      v_payment_status_pattern,
      v_payment_status_replacement,
      'i'
    );
  end if;

  execute v_definition;

  select pg_get_functiondef(
    'public.create_petbot_order_transaction(jsonb)'::regprocedure
  )
  into v_definition;
  if v_definition !~ 'v_payment_method[[:space:]]*:=[[:space:]]*''a_combinar''' then
    raise exception 'A RPC do PetBot nao passou a registrar retirada como pagamento a combinar.';
  end if;
end
$migration$;

revoke all on function public.create_petbot_order_transaction(jsonb) from public, anon, authenticated;
grant execute on function public.create_petbot_order_transaction(jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
