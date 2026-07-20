# Runbook de homologacao e publicacao do hardening

Este documento fecha a etapa tecnica sem executar alteracoes destrutivas no banco de producao. Todas as migracoes devem passar primeiro por um clone ou backup restauravel e por uma Preview da Vercel.

## Ordem dos PRs

1. `codex/hardening-pr1` — dependencias, auditoria, testes e divisao do bundle.
2. `codex/hardening-pr2` — baseline, isolamento por tenant, RLS e protecao de reset/fiscal.
3. `codex/hardening-pr3` — checkout, estoque e agendamento transacionais.
4. `codex/hardening-pr4` — correcoes por aba, estados comuns e protecoes visuais.
5. `codex/hardening-pr5` — homologacao, gates e este runbook.

As branches sao empilhadas. Cada PR deve ter como base a branch anterior; somente o ultimo merge aprovado deve chegar a `main` na mesma ordem.

## Pre-condicoes obrigatorias

- Confirmar que `MAINTENANCE_TEST_TENANT_ID` e `VITE_TEST_TENANT_ID` apontam para o mesmo tenant descartavel.
- Criar usuarios exclusivos para tenant A, tenant B, usuario comum, gestor e admin de homologacao. Nao usar contas pessoais.
- Configurar os secrets do workflow listados em `.github/workflows/quality.yml`.
- Configurar `E2E_BASE_URL` com a URL da Preview, nunca com producao.
- Confirmar que nenhuma variavel `VITE_*` contem `service_role`, chave privada fiscal, OpenAI ou WhatsApp.
- Congelar alteracoes manuais no schema durante a janela de migracao.

## Backup e baseline

1. No Supabase, confirmar o status do backup automatico/PITR e registrar o horario de recuperacao imediatamente anterior a migracao.
2. Gerar um dump logico do schema e dos dados com uma credencial de banco temporaria, armazenando-o fora do repositorio:

   ```bash
   pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" --file yuisync-pre-hardening.dump
   pg_dump --schema-only --no-owner --no-acl "$DATABASE_URL" --file yuisync-pre-hardening-schema.sql
   ```

3. Validar o artefato com `pg_restore --list yuisync-pre-hardening.dump`.
4. Restaurar o dump em um projeto/branch descartavel e executar um login de smoke antes de tocar em producao.
5. Comparar o schema restaurado com `supabase/migrations/20260720000000_live_baseline.sql`. Divergencias devem gerar uma nova baseline revisada; nao editar uma migracao que ja foi aplicada.

Os arquivos de dump, URLs de banco e chaves nunca devem ser adicionados ao Git.

## Aplicacao das migracoes

Aplicar exatamente nesta ordem no ambiente restaurado e depois na Preview:

1. `20260720000000_live_baseline.sql`
2. `20260720001000_tenant_security_hardening.sql`
3. `20260720002000_transactional_operations.sql`
4. `20260720003000_ui_data_guards.sql`

Depois de cada arquivo, registrar horario, operador, ambiente, checksum e resultado em um changelog externo. Interromper na primeira falha; nao pular arquivos nem reaplicar manualmente trechos isolados.

## Gates de homologacao

Executar na branch da Preview:

```bash
npm ci
npm run audit
npm run typecheck
npm run test
npm run test:petbot
npm run test:transactions
npm run test:tenant
npm run build
npm run test:e2e -- --project=desktop
```

O workflow exige dois usuarios de tenants diferentes e falha quando as credenciais RLS nao estao configuradas. O E2E percorre as 19 abas em 390, 768, 1024 e 1440 px, além de validar recuperacao de sessao para usuario comum e gestor.

Validacoes manuais adicionais no tenant de testes:

- duas vendas concorrentes do ultimo item;
- repeticao da mesma chave de idempotencia;
- falha fiscal registrada para reprocessamento sem apagar a venda;
- dois agendamentos concorrentes no mesmo horario;
- tentativa de alterar a tarifa MotoDog pelo navegador;
- reset fora do tenant de testes;
- importacao `.xlsx` e `.csv` com linhas invalidas e confirmacao de gravacao atomica;
- verificacao das permissoes com usuario comum, gestor e admin global.

## Estrategia de rollback

O rollback preferencial e de codigo, mantendo as mudancas aditivas do banco:

1. Desabilitar o merge/deploy e revogar temporariamente acesso aos novos endpoints se houver risco financeiro.
2. Reimplantar o ultimo commit aprovado da Vercel.
3. Preservar `stock_movements`, chaves de idempotencia e filas fiscais para auditoria; nao apagar historico para simular rollback.
4. Para a guarda visual de MotoDog, a reversao tecnica isolada e:

   ```sql
   drop trigger if exists trg_enforce_booking_motodog_fee on public.petshop_booking_requests;
   drop function if exists public.enforce_booking_motodog_fee();
   ```

5. Nao remover RLS, constraints de tenant, razao de estoque ou funcoes transacionais em producao sem uma migracao compensatoria revisada.
6. Se houver corrupcao ou migracao parcialmente aplicada, bloquear gravacoes e restaurar o backup/PITR em um novo projeto; validar contagens e totais antes de trocar a conexao da aplicacao.

## Publicacao e monitoramento

- Fazer merge em `main` somente com todos os checks verdes e aprovacao da Preview.
- Acompanhar por pelo menos 60 minutos: taxa de erro por `requestId`, p95 das APIs, conflitos de estoque/agendamento, falhas e reprocessamentos fiscais, webhooks e recusas de RLS.
- Conferir manualmente uma venda, um pagamento dividido, uma movimentacao de estoque e um agendamento no tenant de testes.
- Registrar qualquer excecao de vulnerabilidade com pacote, impacto, mitigacao, responsavel e prazo. Criticas/altas bloqueiam a publicacao.

## Condicao atual

As migracoes estao preparadas, mas nao foram aplicadas ao Supabase de producao por este trabalho. A publicacao permanece bloqueada ate existir backup confirmado, Preview configurada e dois usuarios reais de tenants distintos para o teste de RLS.
