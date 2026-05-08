# YuiSync - CRM Completo (Supabase + OpenAI + React)

YuiSync é um sistema de CRM moderno e robusto que utiliza React no frontend, Node.js no backend, Supabase como banco de dados e autenticação, e integração com OpenAI para funcionalidades de IA.

## 🚀 Guia de Inicialização

Siga os passos abaixo para configurar o projeto localmente a partir do GitHub.

### 1. Pré-requisitos

Certifique-se de ter instalado em sua máquina:
- [Node.js](https://nodejs.org/) (Recomendado v18+)
- [npm](https://www.npmjs.com/) ou [yarn](https://yarnpkg.com/)
- Uma conta no [Supabase](https://supabase.com/)

### 2. Clonar o Repositório

```bash
git clone https://github.com/usuario/yuisync.git
cd yuisync
```

### 3. Instalar Dependências

```bash
npm install
```

### 4. Configurar Variáveis de Ambiente

O projeto utiliza um arquivo `.env` para gerenciar chaves de API e URLs. Copie o arquivo de exemplo e preencha com suas credenciais:

```bash
cp .env.example .env
```

Abra o arquivo `.env` e preencha as seguintes informações essenciais:
- **Supabase**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **OpenAI**: `OPENAI_API_KEY`.
- **WhatsApp** (Opcional): Configurações da Cloud API se for utilizar.

### 5. Configurar o Banco de Dados (Supabase)

O diretório `database/` contém os scripts SQL necessários para criar a estrutura do banco de dados. 

1. Acesse o **SQL Editor** no painel do seu projeto Supabase.
2. Execute os scripts na seguinte ordem sugerida para garantir as dependências:
   - `database/yuisync_core_bootstrap.sql`
   - `database/yuisync_core_engine.sql`
   - `database/DATABASE.sql`
   - (Execute os demais scripts conforme a necessidade do seu módulo, como `petshop_*` se for o caso).

### 6. Executar o Projeto

Para iniciar o servidor backend e o frontend simultaneamente:

```bash
npm start
```

Isso executará:
- **Backend (API)**: Porta 3090 (configurável no `.env`)
- **Frontend (Vite)**: Geralmente porta 5173 ou similar.

---

## 🛠️ Scripts Disponíveis

- `npm run dev`: Inicia o servidor de desenvolvimento do Vite.
- `npm run api`: Inicia apenas o servidor backend Node.js.
- `npm start`: Inicia ambos (Frontend + API) usando `concurrently`.
- `npm run build`: Gera a build de produção do frontend.
- `npm run preview`: Visualiza a build de produção localmente.

## 📂 Estrutura do Projeto

- `src/`: Código fonte do frontend (React).
- `server/`: Código fonte do backend (Node.js).
- `database/`: Scripts SQL para configuração do banco de dados.
- `supabase/`: Funções de borda (Edge Functions) do Supabase.
- `scripts/`: Scripts utilitários de desenvolvimento.

---

## 📄 Licença

Este projeto está sob a licença ISC.
