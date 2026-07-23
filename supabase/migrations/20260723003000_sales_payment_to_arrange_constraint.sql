begin;

alter table public.sales
  drop constraint if exists sales_payment_method_check;

alter table public.sales
  add constraint sales_payment_method_check
  check (
    payment_method is null
    or payment_method in (
      'pix',
      'dinheiro',
      'cartao',
      'cartão',
      'credito',
      'crédito',
      'debito',
      'débito',
      'a_combinar'
    )
  );

commit;
