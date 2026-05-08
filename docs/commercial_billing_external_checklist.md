# YuiSync - Checklist externo para cobranca automatica

Este projeto ja esta preparado para armazenar o estado comercial por negocio (`tenant`) e por modulo (`petshop`).
Para ligar cobranca automatica de verdade, precisamos apenas conectar um gateway.

## 1) Escolher gateway

Opcoes mais comuns:

- `Asaas`
- `Stripe`
- `Iugu`
- `Mercado Pago`

## 2) Credenciais e configuracoes externas

Dados minimos que voce vai receber do gateway:

- `API key` (server-side, nunca no frontend)
- `Webhook secret` para validar eventos
- Ambiente de `teste` e de `producao`

## 3) Mapeamento por negocio (tenant)

No YuiSync, cada negocio precisa destes campos preenchidos:

- `payment_provider`
- `provider_customer_id`
- `provider_subscription_id`
- `auto_charge_enabled`

Esses campos ja estao na tabela `tenant_subscriptions` e na aba `Comercial`.

## 4) Eventos de webhook que devemos processar

- `subscription_created`
- `subscription_updated`
- `payment_received`
- `payment_failed`
- `subscription_canceled`

Cada evento deve atualizar:

- `tenant_subscriptions.status`
- `tenant_subscriptions.next_billing_at`
- `tenant_subscriptions.updated_at`

## 5) Regras de seguranca obrigatorias

- Chaves do gateway apenas no backend (`server/.env`)
- Validacao de assinatura do webhook
- Idempotencia por evento recebido
- Log de auditoria por tenant

## 6) Regra operacional recomendada

- Enquanto o gateway nao estiver conectado, manter `payment_provider` vazio e fluxo manual.
- Quando conectar, habilitar `auto_charge_enabled` apenas em tenants homologados.
