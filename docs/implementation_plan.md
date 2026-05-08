# Modernização e Correção YuiSync

Este plano aborda todas as falhas reportadas (Segurança, Arquitetura e Qualidade), preparando o YuiSync para produção.

## User Review Required

> [!WARNING]
> **Migração de Banco de Dados**: A refatoração propõe substituir a tabela `pets` por uma tabela genérica `clients`, o que exigirá recriar o esquema com `DATABASE.sql`. Isso também implica renomear partes do código frontend (`usePets.js` para `useClients.js` e atualizar componentes como `PetsPage.jsx`).

> [!IMPORTANT]
> **Refatoração de Pastas vs Workspaces**: Vou manter os arquivos do portal (Vite) na raiz e configurar o package.json do bot isoladamente em `/bot/package.json`. Isso evita mover todo o projeto para subpastas `frontend` e quebrar o ambiente atual. 

## Proposed Changes

### 1. Database & Security (RLS)

- **[MODIFY] [DATABASE.sql](file:///c:/Users/gabri/Desktop/PROJETO%20YUISYNC/DATABASE.sql)**
  - Ativar `ROW LEVEL SECURITY` para **todas** as tabelas.
  - Para as tabelas contendo `module_id`, criar policy que permite acesso aos Admins AND a qualquer usuário onde o array `allowed_modules` (da tabela `profiles`) contenha o `module_id` respectivo. Exemplo de Policy SQL:
    ```sql
    CREATE POLICY "Acesso por modulo" ON public.sales FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR allowed_modules ? module_id))
    );
    ```
  - Substituir a tabela `pets` pela tabela genérica `clients`. As foreign keys (`pet_id`) em `appointments` e `sales` mudarão para `client_id`. Os campos específicos (`pet_name`, `species` etc.) vão migrar para os perfis ou em um campo `details JSONB` para suportar diferentes módulos sem poluir as colunas.

---

### 2. Pacotes e Dependências

- **[NEW] [bot/package.json](file:///c:/Users/gabri/Desktop/PROJETO%20YUISYNC/bot/package.json)**
  - Arquivo para separar as dependências do backend que interage com o Telegram/Discord.
  - O bot terá seu script centralizado e receberá o Modulo/Tenant injetado por variável, preparando para múltiplos bots de IAs independentes.
- **[MODIFY] [package.json](file:///c:/Users/gabri/Desktop/PROJETO%20YUISYNC/package.json)**
  - Remover dependências Back-end (`discord.js`, `node-telegram-bot-api`, `groq-sdk`, `openai`).
  - Mover dependências Runtime que estão incorretamente em "devDependencies" para "dependencies" (`axios`, `framer-motion`, `luxon`).
  - Adicionar biblioteca `react-router-dom` para o roteamento do Frontend.

---

### 3. App.jsx & AppRouter (React Router)

- **[NEW] [src/components/Sidebar.jsx](file:///c:/Users/gabri/Desktop/PROJETO%20YUISYNC/src/components/Sidebar.jsx)**
- **[NEW] [src/components/ModuleSwitcher.jsx](file:///c:/Users/gabri/Desktop/PROJETO%20YUISYNC/src/components/ModuleSwitcher.jsx)**
- **[NEW] [src/components/LoadingScreen.jsx](file:///c:/Users/gabri/Desktop/PROJETO%20YUISYNC/src/components/LoadingScreen.jsx)**
- **[NEW] [src/router/AppRouter.jsx](file:///c:/Users/gabri/Desktop/PROJETO%20YUISYNC/src/router/AppRouter.jsx)**
- **[MODIFY] [src/App.jsx](file:///c:/Users/gabri/Desktop/PROJETO%20YUISYNC/src/App.jsx)**
  - Serão completamente refatorados para extrair as responsabilidades. 
  - A lógica de `window.location.hash` será substituída pela `<BrowserRouter>`.
  - A validação de `sessionStorage.getItem('@selected_in_session')` será removida, garantindo consistência no comportamento entre abas duplicadas. O estado do usuário e o controle de permissão acontecerão usando guards nas rotas do AppRouter.

---

### 4. Estética e UX Modernizados (O "Adeus" ao Neon Excessivo)

- **[MODIFY] [src/index.css](file:///c:/Users/gabri/Desktop/PROJETO%20YUISYNC/src/index.css)**
  - Substituir o teal-neon (`#00F0FF`) por variantes premium/dark-mode sem brilho excessivo (`#0891b2` - Teal sobrio, `#3f3f46` para surfaces), ajustando de UI template para um CRM corporativo de alto nível.
  - Remover as animações de luz neon de fundo que tiram a credibilidade da aplicação.
  - Remover a propriedade `overflow: hidden;` do body que quebra os scrolls naturais.
  - Alterar o `--radius` de `24px` para variáveis escaláveis de UI premium (`--radius-sm`, `--radius-md`...) evitando componentes com bordas infantis.
- **[MODIFY] [tailwind.config.js](file:///c:/Users/gabri/Desktop/PROJETO%20YUISYNC/tailwind.config.js)**
  - Adição de tokens adequar estilos aos novos escopos CSS sem dependências de inline classes arbitrárias.

---

### 5. Multi-Bots Escaláveis

Os scripts do bot (como `marmitaria_bot.js` e `telegram.js`) já estarão migrados para a pasta bot, com package e env isolados, preparados para carregar instruções diferentes ou IDs de módulo diferentes no startup (permitindo um gerenciador de processos para gerar os IAs correspondentes a cada cliente).

## Open Questions

1. **Migração Client/Pet**: Transformar a entidade pets globalmente em `clients` (renomeando arquivos das rotas para `ClientsPage` e ajustando os hooks) e usar o `details JSONB` para comportar os tipos "CPF", "CNPJ", "Tamanho do Pet" está ok?
2. **Tema Default**: Ao retirar o "Teal Neon AI", prefere algo para um tom "Midnight Blue" corporativo suave?

## Verification Plan

### Automated Tests
- Checagem das Policies do DB (Nenhum select malicioso listando informações de fora do `allowed_modules`).

### Manual Verification
- Testes local da persistência de abas duplas validando a segurança do React Router.
- Compilação separada de Frontend x Backend simulando fluxo Prod Vercel/Railway.
