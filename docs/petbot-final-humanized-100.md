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
- preservar o serviço exato do catálogo entre data, horário, transporte e confirmação;
- tratar as variantes de Escovação Dental cadastradas como escolhas reais do catálogo;
- tratar retirada de produto como modalidade de compra, nunca como MotoDog;
- aceitar confirmação de produto com venda e ordem, sem exigir agendamento;
- interpretar metadados de espécie genéricos ou antigos como ausência de restrição;
- separar ração de antipulgas, xampu, bebedouro e demais produtos mesmo com peso ou metadados antigos;
- manter o produto exato selecionado até retirada/entrega, pagamento e resumo;
- usar a jornada veterinária para gerar horários seguros de consulta;
- preservar e repreparar observações de serviço antes da confirmação;
- exigir consulta de agenda antes da preparação de serviços;
- exigir catálogo e `send_product_image` antes de afirmar preço, estoque ou foto;
- bloquear promoções, serviços e informações comerciais não verificadas;
- selecionar explicitamente o produto real e responder às qualificações solicitadas pela Luna;
- consumir a sequência planejada antes de classificar uma resposta repetida como loop;
- registrar metadados da resposta para auditar as ferramentas executadas no runtime.

## Migration obrigatória para a rodada viva

A RPC transacional instalada no Supabase precisa aceitar serviços universais importados com espécie `all`, `todos`, `qualquer`, `pet` ou equivalente. Aplique antes de considerar o resultado dos 50 fluxos vivos:

```text
supabase/migrations/20260725003000_petbot_universal_service_species.sql
```

Pela CLI vinculada ao projeto correto:

```bash
supabase db push
```

A migration é idempotente, preserva as correções anteriores da RPC e mantém execução restrita ao `service_role`.

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

## Status atual

As correções de runtime, roteamento de ferramentas e validação factual foram aplicadas e verificadas diretamente no `head` da PR após o round 2B. Quality, matriz preditiva e a bateria viva devem ser executadas novamente sobre este commit; o objetivo de encerramento permanece em **100 aprovados e 0 reprovados**, sem remover cenários válidos para atingir o placar.
