# Bateria final humanizada do PetBot

A validação final possui 100 conversas com LLM:

- 50 casos humanizados usando o interpretador semântico, o prompt real e o GPT-4o mini para validar interpretação, seleção de ferramentas, argumentos e respostas seguras;
- 50 casos vivos usando o runtime real, catálogo real, Supabase, confirmação transacional, venda, ordem, agenda, estoque, idempotência e limpeza dos artefatos.

## Grupos humanizados

- produtos e ração;
- banho, tosa e MotoDog;
- veterinária e emergência;
- confirmação, alteração e cancelamento;
- informações gerais, reclamação, desconto e handoff.

## Ferramentas cobertas

- `search_petshop_products`;
- `resolve_petshop_service`;
- `check_petshop_availability`;
- `get_petshop_transport_options`;
- `prepare_petshop_product_order`;
- `prepare_petshop_service_booking`;
- `create_confirmed_petshop_order`;
- `cancel_pending_petshop_order`;
- `send_product_image`;
- `handoff_to_human`.

## Calibração após as execuções reais

As primeiras rodadas foram usadas como diagnóstico e revelaram tanto defeitos reais quanto problemas da própria matriz. A bateria foi corrigida para:

- distinguir tosa à máquina, tosa à tesoura e cuidados específicos no resolvedor;
- tratar retirada de produto como modalidade de compra, nunca como MotoDog;
- aceitar confirmação de produto com venda e ordem, sem exigir agendamento;
- interpretar metadados de espécie genéricos ou antigos como ausência de restrição;
- usar a jornada veterinária para gerar horários seguros de consulta;
- preservar observações de serviço sem convertê-las em acabamento de tosa;
- descartar falsos positivos de ração causados por categoria ou metadados antigos;
- selecionar explicitamente o produto real e responder às qualificações solicitadas pela Luna;
- consumir a sequência planejada antes de classificar uma resposta repetida como loop;
- registrar metadados da resposta para auditar as ferramentas executadas no runtime.

## Execução

```bash
npm run test:petbot:final:100
```

Variáveis necessárias:

- `OPENAI_API_KEY`;
- `SUPABASE_URL`;
- `SUPABASE_ANON_KEY`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `PETBOT_E2E_TENANT_ID`.

Os relatórios são salvos em `artifacts/petbot-humanized-50.json` e `artifacts/petbot-diagnostic-50.json`.
