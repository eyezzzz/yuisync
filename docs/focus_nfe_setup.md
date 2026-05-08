# Focus NFe - Setup no YuiSync

Este documento descreve o caminho para ativar emissao real via Focus NFe no projeto.

## 1) Banco de dados

Rode os SQLs nesta ordem:

1. `database/multi_tenant_instances.sql`
2. `database/petshop_advanced_features.sql`
3. `database/petshop_fiscal_automation.sql`
4. `database/petshop_fiscal_runtime.sql`
5. `database/petshop_fiscal_manual_mode_fix.sql`

## 2) Variaveis de ambiente (backend)

No arquivo `.env` do projeto:

```env
FOCUS_NFE_TOKEN=seu_token_focus
FOCUS_NFE_PROD_URL=https://api.focusnfe.com.br
FOCUS_NFE_HOMOLOG_URL=https://homologacao.focusnfe.com.br
FOCUS_NFE_WEBHOOK_TOKEN=token_privado_webhook
```

Observacao:
- o token da Focus fica apenas no backend;
- nunca enviar token para frontend.

## 3) Configuracao por tenant (UI)

Na tela de configuracoes do petshop:

1. Provedor fiscal: `Focus NFe`
2. Ambiente: `homologacao` (inicialmente)
3. Emissao fiscal via botao manual no PDV/historico
4. Preencher dados do emissor:
   - CNPJ
   - IE/IM
   - regime
   - endereco fiscal
   - serie e numeracao

## 4) Fluxo de emissao implementado (manual)

1. Venda concluida no PDV (sem emissao automatica)
2. Usuario clica em "Emitir Cupom Fiscal"
3. Endpoint backend enfileira e chama Focus:
   - `POST /api/fiscal/sales/:saleId/issue`
4. Status e resposta gravados em:
   - `fiscal_documents`
   - `invoices.fiscal_status`

Se o backend fiscal estiver indisponivel, o sistema usa fallback local para nao bloquear o PDV.

## 5) Webhook Focus

Endpoint disponivel:

`POST /api/fiscal/webhooks/focus?token=SEU_TOKEN_PRIVADO`

Esse endpoint atualiza status fiscal no banco quando receber retorno da Focus.

## 6) Proxima etapa recomendada

Configurar payload fiscal completo por tipo de documento (`nfce`, `nfe`, `nfse`) usando:

- campos fiscais corretos por item (NCM, CFOP, CST/CSOSN)
- dados de destinatario quando aplicavel
- validacoes por UF/municipio

Sem isso, a Focus pode rejeitar notas com erro fiscal, mesmo com a integracao ativa.
