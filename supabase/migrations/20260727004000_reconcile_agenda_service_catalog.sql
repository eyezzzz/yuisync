begin;

alter table public.petshop_services
  add column if not exists source_product_id uuid references public.products(id) on delete set null;

-- Reexecuta o sincronizador para todo produto que a tela Estoque > Servicos
-- considera um servico. O grupo declarado no bot_metadata continua sendo a
-- autoridade para separar banho_tosa, veterinaria e itens fora da agenda.
update public.products product
set bot_metadata = coalesce(product.bot_metadata, '{}'::jsonb)
where product.module_id = 'petshop'
  and product.active = true
  and coalesce(product.price, 0) > 0
  and trim(coalesce(product.name, '')) <> ''
  and (
    public.normalize_petshop_catalog_text(trim(coalesce(product.bot_metadata->>'product_type', ''))) = 'servico'
    or public.normalize_petshop_catalog_text(trim(coalesce(product.category, ''))) = 'servico'
    or public.normalize_petshop_catalog_text(concat_ws(' ', product.name, product.category, product.description, product.bot_metadata->>'product_type'))
      ~ '(banho|tosa|desembolo|escovac|hidrat|higieniz|consulta|vacina|exame|cirurg|ultrassom|castr|curativo|microchip)'
  )
  and public.normalize_petshop_catalog_text(product.name) !~ '(banheira|banho a seco|brinquedo|casinha|roupa|shampoo|varinha)'
  and public.normalize_petshop_catalog_text(product.name) !~ '(pacote.*banho|banho.*pacote)';

comment on column public.petshop_services.source_product_id is
  'Produto de Estoque > Servicos que originou este registro transacional.';

commit;
