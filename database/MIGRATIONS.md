# Fluxo de migrações do YuiSync

Os arquivos SQL antigos desta pasta são o arquivo histórico da construção do banco. Eles não devem mais ser executados manualmente ou fora de ordem.

## Fonte de verdade

- `supabase/migrations/20260720000000_live_baseline.sql`: marcador do schema de produção auditado em 20/07/2026.
- Migrações posteriores em `supabase/migrations`: únicas mudanças incrementais autorizadas.
- Antes de aplicar uma migração: gerar backup, executar a auditoria de isolamento e validar em Preview usando o tenant de testes.
- Nunca corrigir produção executando novamente um hotfix de `database/`; transforme a correção em uma nova migração idempotente.

## Ordem de publicação

1. Backup e verificação de registros sem `tenant_id`.
2. Aplicação das migrações pelo timestamp.
3. Teste com usuários dos tenants A e B.
4. Smoke test da Preview.
5. Registro do hash da migração e horário da aplicação.

O tenant de homologação deve ser marcado explicitamente com `tenants.is_test = true`. Nenhum tenant é marcado automaticamente para evitar classificar produção como teste por engano.
