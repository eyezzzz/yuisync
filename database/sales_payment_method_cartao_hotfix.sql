-- YuiSync - payment method hotfix
-- O PetBot normaliza cartao sem acento. Bancos antigos podem ter uma
-- constraint menor em sales.payment_method.

begin;

alter table public.sales
  drop constraint if exists sales_payment_method_check;

alter table public.sales
  add constraint sales_payment_method_check
  check (
    payment_method is null
    or payment_method in ('pix', 'dinheiro', 'cartao', 'cartão', 'credito', 'crédito', 'debito', 'débito')
  );

commit;
