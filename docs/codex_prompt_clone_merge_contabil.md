# Prompt Para Codex: Trabalhar No Repo Contabil Separado E Preparar Merge Futuro

Voce vai trabalhar como agente Codex no projeto separado `yuisync-contabil`. O objetivo agora e evoluir esse repo livremente como ambiente de homologacao do modulo contabil, usando Supabase/Vercel separados. Depois, quando estiver maduro, o modulo sera trazido para o repo principal do YuiSync.

## Repositorios

Repo principal em producao, usado apenas como referencia de padrao:

```bash
https://github.com/eyezzzz/yuisync.git
```

Repo de trabalho do modulo contabil:

```bash
https://github.com/KiritoRudeus/yuisync-contabil.git
```

## Objetivo Atual

Evoluir o projeto contabil separado para ficar compativel com o YuiSync principal, usando a mesma filosofia:

- mesmo login;
- mesmo multi-tenant;
- Supabase staging proprio do contabil;
- Vercel proprio do contabil;
- mesma sidebar/router/module config;
- permissoes por `module_permissions`;
- isolamento por `tenant_id` e `module_id`;
- sem aplicar SQL destrutivo;
- push no repo contabil separado, nao no repo principal.

## Comandos Iniciais

Clone o repo contabil em uma pasta limpa:

```bash
cd C:\tmp
git clone https://github.com/KiritoRudeus/yuisync-contabil.git yuisync-contabil-work
cd C:\tmp\yuisync-contabil-work
git checkout main
git pull origin main
git checkout -b codex/contabil-dev
```

Opcionalmente, clone o repo principal do YuiSync ao lado apenas para comparar padroes:

```bash
cd C:\tmp
git clone https://github.com/eyezzzz/yuisync.git yuisync-main-reference
```

Trabalhe sempre no repo contabil:

```bash
C:\tmp\yuisync-contabil-work
```

Use o repo principal apenas como referencia:

```bash
C:\tmp\yuisync-main-reference
```

## Regra Principal

Como este e o repo separado do contabil, voce pode refatorar arquivos globais dele livremente. A meta e deixar o projeto contabil organizado, funcional e facil de migrar depois para o YuiSync principal.

Mesmo assim, mantenha a arquitetura compativel com futura extracao:

- `src/modules/contabil/**`
- SQLs realmente necessarios em `database/contabil/**`
- libs especificas em `server/lib/contabil/**`
- docs especificas em `docs/contabil/**`

Pode alterar `src/config/modules.jsx`, router, auth, server e package do repo contabil se isso ajudar a homologar o produto. A restricao de arquivos globais so sera importante quando formos mesclar no repo principal.

## Como Preparar Para Merge Futuro

Mesmo trabalhando separado, deixe o modulo pronto para ser extraido depois:

```text
src/modules/contabil/
```

Registrar o modulo em:

```text
src/config/modules.jsx
```

Usar roles:

```js
admin_contabil
funcionario_contabil
```

Modelo de permissao esperado:

- usuarios admin global acessam tudo;
- usuarios normais acessam modulos em `allowed_modules`;
- paginas internas respeitam `module_permissions[activeModuleId]`;

SQLs devem ficar separados:

```text
database/contabil/
```

Preferir nomes como:

```text
database/contabil/001_schema.sql
database/contabil/002_rls.sql
database/contabil/003_seed.sql
database/contabil/004_indexes.sql
```

## Banco De Dados Staging

Use Supabase staging proprio do contabil. Nao aplique SQL no banco de producao do YuiSync principal.

Todas as tabelas novas precisam ter:

- `id uuid primary key default gen_random_uuid()`;
- `tenant_id`;
- `module_id default 'contabil'`;
- `created_at`;
- `updated_at` quando fizer sentido;
- indices por `tenant_id`, `module_id` e campos de busca;
- RLS compatível com tenancy.

Prefira tabelas/prefixos:

```text
contabil_clients
contabil_documents
contabil_tasks
contabil_appointments
contabil_chat_sessions
contabil_knowledge_base
contabil_audit_logs
```

Como o repo e separado, tabelas genericas podem funcionar no staging. Mas para facilitar a migracao futura, prefira prefixos `contabil_` ou SQLs organizados em `database/contabil/**`.

## Env Vars

O YuiSync principal ja possui:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=/api
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_MS=30000
FOCUS_NFE_TOKEN=
FOCUS_NFE_PROD_URL=
FOCUS_NFE_HOMOLOG_URL=
FOCUS_NFE_WEBHOOK_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_GRAPH_VERSION=v25.0
WHATSAPP_REPLY_DEBOUNCE_MS=0
WHATSAPP_TENANT_ID=
WHATSAPP_MODULE_ID=petshop
API_PORT=3090
API_ALLOWED_ORIGINS=http://localhost:3080
```

Se o modulo contabil precisar, adicionar em `.env.example` sem expor segredo real:

```env
OPENAI_RAG_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
RAG_TOP_K=6
RAG_MIN_SCORE=0.18
RAG_MAX_CONTEXT_CHARS=12000
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
GOOGLE_CALENDAR_TIMEOUT_MS=15000
FOCUS_NFE_WEBHOOK_HMAC_SECRET=
FIELD_ENCRYPTION_SECRET=
SIGNED_URL_SECRET=
APP_SECRET=
```

Nao colocar `service_role` em variavel `VITE_`.

## Dependencias

Compare o `package.json` do repo contabil fonte com o principal.

Adicionar dependencias somente se forem usadas pelo modulo integrado. Possiveis candidatas:

```json
{
  "googleapis": "^172.0.0",
  "jspdf": "^3.0.0",
  "openai": "^6.37.0",
  "zod": "^4.4.3"
}
```

Antes de adicionar, confira se o YuiSync principal ja possui alternativa equivalente.

## Chat IA Contabil

O YuiSync PetShop usa a arquitetura:

- LLM interpreta linguagem natural;
- guardiao determina fluxo e bloqueios;
- banco e ferramentas sao fonte da verdade;
- respostas criticas nao podem inventar dados.

Para o contabil, seguir a mesma logica:

- LLM entende mensagem, documentos e intencao;
- guardiao contabil decide proxima pergunta/acao;
- RAG e banco fornecem dados reais;
- nunca inventar prazo, imposto, status, documento, protocolo ou orientacao fiscal;
- casos sensiveis devem ir para atendente/especialista contabil.

Criar preferencialmente:

```text
server/lib/contabil/contabilGuard.js
server/lib/contabil/contabilRag.js
server/lib/contabil/contabilTools.js
```

Evite misturar regras contabeis dentro de:

```text
server/lib/petbotGuard.js
server/lib/chat.js
```

Se precisar integrar no endpoint de chat atual, use roteamento por `module_id`.

## Vercel De Teste

Criar projeto Vercel separado apontando para a branch do repo contabil:

```text
codex/contabil-dev
```

Usar Supabase staging. Nao usar banco de producao durante desenvolvimento pesado.

## Testes Obrigatorios No Repo Contabil

Antes de subir a branch:

```bash
npm install
npm run typecheck
npm run build
```

Criar testes basicos do contabil quando implementar guardiao:

```text
test/contabilGuard.test.mjs
```

Casos minimos:

- cliente identificado;
- cliente desconhecido;
- duvida fiscal simples com base RAG;
- pedido de prazo/status vindo do banco;
- documento pendente;
- documento recebido;
- caso sensivel que chama especialista;
- tentativa de inventar valor/prazo bloqueada;
- usuario sem permissao nao acessa dados de outro tenant.

## Checklist Antes De Pedir Merge Para O YuiSync Principal

Confirmar:

- `src/modules/contabil/**` existe e compila;
- `src/config/modules.jsx` registra `contabil`;
- build passa;
- SQLs do contabil estao em `database/contabil/**`;
- nada destrutivo foi aplicado em banco de producao;
- nenhum segredo foi commitado;
- Vercel staging abre;
- Supabase staging tem RLS e indices;
- README ou doc de setup contabil foi atualizado.

## Como Entregar No Repo Contabil

Ao terminar, fazer push da branch:

```bash
git status
git add .
git commit -m "Prepare contabil module for YuiSync merge"
git push origin codex/contabil-dev
```

Nao fazer push no repo principal do YuiSync.

Depois disso, avisar:

- branch criada;
- arquivos globais alterados no repo contabil;
- SQLs que precisam ser aplicados;
- env vars novas;
- testes rodados;
- pendencias conhecidas.
