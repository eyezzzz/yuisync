# PetBot Final 100 — resumo

## Humanized: 37/50 aprovados, 13 reprovados
- produtos: 4/10
- serviços: 10/10
- veterinária: 9/10
- confirmações: 6/10
- geral: 8/10
- FAIL produto_04: não chamou prepare_petshop_product_order | pedido de produto não foi preparado
- FAIL produto_05: não chamou prepare_petshop_product_order | pedido de produto não foi preparado
- FAIL produto_06: não chamou send_product_image
- FAIL produto_07: não chamou nenhuma de: prepare_petshop_product_order
- FAIL produto_08: não chamou prepare_petshop_product_order | pedido de produto não foi preparado
- FAIL produto_10: não chamou prepare_petshop_product_order | pedido de produto não foi preparado
- FAIL vet_02: não chamou resolve_petshop_service | não chamou check_petshop_availability | não chamou prepare_petshop_service_booking | serviço resolvido não corresponde ao pedido
- FAIL confirmacao_04: não chamou nenhuma de: cancel_pending_petshop_order, check_petshop_availability, prepare_petshop_service_booking
- FAIL confirmacao_05: O agente não conseguiu finalizar o turno com segurança.
- FAIL confirmacao_07: não chamou create_confirmed_petshop_order
- FAIL confirmacao_08: resposta não corresponde a /endereço|endereco|rua|bairro|referência|referencia/i
- FAIL geral_06: não chamou handoff_to_human | handoff não foi direcionado para atendente
- FAIL geral_08: chamou ferramentas sem necessidade: resolve_petshop_service

## Runtime: 0/0 aprovados, 0 reprovados
