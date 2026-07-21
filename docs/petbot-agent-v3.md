# PetBot Agent v3

## Objetivo

O PetBot v3 é um agente autônomo de atendimento do YuiSync. A LLM interpreta a conversa, decide o próximo passo e escolhe ferramentas. O backend continua sendo a fonte de verdade para catálogo, preços, estoque, agenda, taxas e gravações.

A arquitetura evita os dois extremos que causavam falhas anteriores:

- **Fluxo hardcoded:** o código formulava perguntas e controlava a conversa.
- **LLM sem limites operacionais:** o modelo podia inferir preço, estoque, serviço ou horário.

## Fronteira de responsabilidade

### LLM

- Interpreta linguagem natural e contexto entre turnos.
- Decide como perguntar dados ausentes sem frases prontas.
- Escolhe ferramentas e conduz venda, agendamento e handoff.
- Sugere produtos somente depois de consultar o catálogo.

### Backend e banco

- Resolvem o produto ou serviço exato.
- Calculam diferenciações reais entre produtos.
- Validam preço, estoque, duração, expediente, capacidade e conflito de agenda.
- Resolvem taxa de entrega e MotoDog a partir das configurações da loja.
- Criam venda, itens, movimentação de estoque, pet, agendamento e ordem em uma única transação idempotente.
- Consultam e consomem benefícios de planos ativos na mesma transação do agendamento.
- Rejeitam qualquer confirmação cuja realidade operacional mudou.

## Ferramentas

1. `search_petshop_products`
2. `resolve_petshop_service`
3. `check_petshop_availability`
4. `prepare_petshop_order`
5. `create_confirmed_petshop_order`
6. `cancel_pending_petshop_order`
7. `send_product_image`
8. `handoff_to_human`

Todas usam JSON Schema estrito. Chamadas paralelas são desativadas para preservar a ordem entre consulta, preparo e confirmação.

## Fonte de verdade

- **Produtos e serviços comerciais:** `products`.
- **Compatibilidade temporária:** `petshop_services`, somente quando não existe produto-serviço correspondente.
- **Agenda:** `appointments` + expediente, intervalo, antecedência e capacidade em `settings`.
- **Planos:** `client_subscriptions` + `subscription_plans`, consultados antes do resumo e consumidos pela RPC.
- **Venda e agendamento:** RPC `create_petbot_order_transaction`.
- **Idempotência:** `petbot_order_commits`, por tenant e pedido pendente.

## Regras invariantes

- A resposta não pode citar preço sem ferramenta que devolveu aquele preço.
- A resposta não pode afirmar estoque sem pesquisa de produto.
- A resposta não pode afirmar disponibilidade sem consulta de agenda.
- A resposta não pode afirmar pedido/agendamento concluído sem RPC confirmada.
- Um serviço de banho/tosa é classificado por raça e peso; a LLM decide como pedir esses fatos.
- Um pedido só é gravado depois de resumo validado em turno anterior e confirmação explícita.
- Benefícios de plano e estoque são consumidos atomicamente; se a realidade mudar, o resumo é recalculado antes de pedir nova confirmação.
- Uma nova venda no mesmo chat usa outro ID de pedido e não é confundida com duplicata.

## Configuração da agenda

Em **Configurações > PetBot**, configure:

- Fuso horário.
- Expediente por dia da semana.
- Intervalo dos horários.
- Antecedência mínima.
- Capacidade simultânea.

O backend e a RPC usam os mesmos campos. Não deixe os valores padrão sem revisão antes de ativar o modo `enabled`.

## Implantação

1. Publicar o código.
2. Aplicar todas as migrações, especialmente `20260721006000_petbot_agent_v3_runtime.sql`.
3. Confirmar que o modelo está fixado em `gpt-4o-mini-2024-07-18`.
4. Começar em `canary` com telefones internos.
5. Validar eventos `petbot_agent_v3` e somente depois usar `enabled`.

Sem a migração v3, o backend interrompe a confirmação em vez de usar um fallback não transacional.

## Testes

```bash
npm run typecheck
npm test
npm run test:petbot
npm run test:transactions
npm run build
```

A suíte legada isolada permanece disponível para manutenção do guardião antigo:

```bash
npm run test:petbot:legacy
```

Avaliação viva opcional com o modelo real:

```bash
OPENAI_API_KEY=... npm run test:petbot:live
```

Ela cobre falta de peso, serviço pronto para agenda, diferenciação de produto e confirmação de pedido pendente. A suíte local também cobre benefícios de plano, estoque, idempotência, capacidade da agenda, transporte e cancelamento de pedido pendente.

## Observabilidade

Cada mensagem do agente registra:

- Modelo.
- Ferramentas e status.
- Duração de cada ferramenta.
- Número de etapas.
- Tentativas de correção de grounding.
- Duração total.
- Pedido pendente, handoff e resultado de gravação.

Use esses eventos para criar indicadores de taxa de conclusão, handoff, erro por ferramenta, latência e respostas reescritas por falta de grounding.

## Referências de arquitetura

- OpenAI Function Calling e Structured Outputs: https://platform.openai.com/docs/guides/function-calling
- OpenAI Evals: https://platform.openai.com/docs/guides/evals
- Anthropic, Building effective agents: https://www.anthropic.com/research/building-effective-agents
- Anthropic, Demystifying evals for AI agents: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Supabase Database Functions: https://supabase.com/docs/guides/database/functions
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
