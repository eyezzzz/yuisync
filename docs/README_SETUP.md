# Guia de Configuracao - YuiSync

Este projeto agora roda com:
- frontend React/Vite na porta `3080`
- API segura local na porta `3090`
- bots separados, sempre com chaves server-side

## 1. Configurar o Supabase

1. Crie um projeto no Supabase.
2. Abra o `SQL Editor`.
3. Execute primeiro [`database/DATABASE.sql`](/C:/Users/gabri/Desktop/PROJETO%20YUISYNC/database/DATABASE.sql).
4. Execute em seguida [`database/security_hardening.sql`](/C:/Users/gabri/Desktop/PROJETO%20YUISYNC/database/security_hardening.sql).
5. Execute tambem [`database/security_multibot_hardening.sql`](/C:/Users/gabri/Desktop/PROJETO%20YUISYNC/database/security_multibot_hardening.sql) para isolamento de bots e indices tenant-aware.
6. Execute [`database/bot_channels_dynamic.sql`](/C:/Users/gabri/Desktop/PROJETO%20YUISYNC/database/bot_channels_dynamic.sql) para modo dinamico (bots por tenant via banco, sem criar .env por cliente).

## 2. Fechar o Auth

1. Em `Authentication > Providers`, mantenha `Email` habilitado.
2. Em `Authentication > Sign In / Providers`, desative `Enable email signups` se quiser criacao de contas apenas por admin.
3. Crie ou escolha um usuario confiavel e promova o primeiro admin com o SQL comentado no topo de [`database/security_hardening.sql`](/C:/Users/gabri/Desktop/PROJETO%20YUISYNC/database/security_hardening.sql).

## 3. Variaveis de ambiente

Crie `.env` na raiz a partir de [`.env.example`](/C:/Users/gabri/Desktop/PROJETO%20YUISYNC/.env.example).

Regras importantes:
- `VITE_*` existe apenas para variaveis publicas do frontend.
- `OPENAI_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY` nunca devem usar prefixo `VITE_`.
- bots e API devem usar apenas chaves server-side.

Exemplo:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica-anon
VITE_API_URL=/api

SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-chave-publica-anon
SUPABASE_SERVICE_ROLE_KEY=sua-chave-server-only

OPENAI_API_KEY=sua-chave-openai-server-only
OPENAI_MODEL=gpt-4o-mini

API_PORT=3090
API_ALLOWED_ORIGINS=http://localhost:3080
```

## 4. Bots

Cada bot deve ter `.env` proprio usando nomes server-side. Use:
- [`bot/petshop-bot/.env.example`](/C:/Users/gabri/Desktop/PROJETO%20YUISYNC/bot/petshop-bot/.env.example)
- [`bot/marmitaria-bot/.env.example`](/C:/Users/gabri/Desktop/PROJETO%20YUISYNC/bot/marmitaria-bot/.env.example)
- [`bot/contabil-bot/.env.example`](/C:/Users/gabri/Desktop/PROJETO%20YUISYNC/bot/contabil-bot/.env.example)

Modo recomendado:
- ative `BOT_DYNAMIC_CONFIG=true` no ambiente do `petshop-bot`
- preencha `tenant_bot_channels` no banco com `tenant_id`, `telegram_bot_token` e `active=true`

Assim o launcher sobe as instancias automaticamente por tenant, sem arquivo `.env` por cliente.

Atalho recomendado no Windows:
```powershell
npm run bot:petshop:dynamic
```

## 5. Rodar localmente

```bash
npm install
npm run start
```

Ou, separando por processo:

```bash
npm run api
npm run dev
npm run bot
```

## 6. Checklist de seguranca antes de subir

- aplique o hardening SQL
- desative signup publico no Supabase
- remova qualquer `VITE_OPENAI_API_KEY`
- use `SUPABASE_SERVICE_ROLE_KEY` so em API e bots
- rotacione chaves antigas que ja ficaram expostas localmente ou em bundles antigos
