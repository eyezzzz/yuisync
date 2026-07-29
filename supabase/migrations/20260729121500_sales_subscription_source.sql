begin;

-- A origem da venda evoluiu alem dos canais iniciais (PDV/WhatsApp).
-- Mantemos a validacao de preenchimento, sem transformar novos canais
-- financeiros como agenda e assinatura em falhas de checkout.
alter table public.sales
  drop constraint if exists sales_source_check;

alter table public.sales
  add constraint sales_source_check
  check (
    source is null
    or char_length(btrim(source)) between 1 and 64
  );

comment on constraint sales_source_check on public.sales is
  'Canal nao vazio que originou a venda, como pdv, whatsapp, agenda ou assinatura.';

commit;
