# YuiSync Vercel + WhatsApp Deploy Checklist

Use este checklist depois de subir o codigo para o GitHub.

## 1. Vercel

1. Importe o repositorio `https://github.com/eyezzzz/yuisync` na Vercel.
2. Framework preset: `Vite`.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Production branch: a branch que voce for usar para deploy.

## 2. Variaveis na Vercel

Cadastre em `Project Settings > Environment Variables`:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=/api

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_MS=12000

WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_GRAPH_VERSION=v25.0
WHATSAPP_TENANT_ID=
WHATSAPP_MODULE_ID=petshop
```

Notas:
- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` ou token do WhatsApp em variaveis `VITE_*`.
- Se existir mais de um tenant no Supabase, preencha `WHATSAPP_TENANT_ID`.
- `WHATSAPP_APP_SECRET` e recomendado para validar a assinatura `x-hub-signature-256` da Meta.

## 3. URL do Webhook na Meta

Depois do deploy, use uma destas URLs:

```text
https://SEU-DOMINIO-VERCEL/api/webhook
```

ou, por compatibilidade:

```text
https://SEU-DOMINIO-VERCEL/api/whatsapp/webhook
```

No painel da Meta:
- Callback URL: uma das URLs acima.
- Verify token: o mesmo valor de `WHATSAPP_VERIFY_TOKEN`.
- Assine o campo `messages` do WhatsApp Business Account.

## 4. Supabase

Confirme no SQL Editor:

```sql
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.chat_sessions;
```

Se ja existir na publication, o Supabase pode retornar erro de duplicidade; nesse caso esta OK.

Tambem confirme que as tabelas usadas existem:
- `tenants`
- `chat_sessions`
- `chat_messages`
- `settings`
- `products`
- `appointments`
- `companies`

## 5. Teste rapido

1. Rode o deploy na Vercel.
2. Valide o webhook pelo painel da Meta.
3. Envie uma mensagem real para o numero conectado.
4. Abra a Dashboard YuiSync em `Chat IA`.
5. A conversa deve aparecer/atualizar automaticamente via Supabase Realtime.
