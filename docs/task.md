# Resumo da Task

Organização do trabalho para correção completa do YuiSync (Segurança, Arquitetura e Qualidade).

## Checklist

- `[x]` **1. RLS e Segurança de Dados**
  - Configurar políticas rígidas usando `module_id` em todas as tabelas no `DATABASE.sql`.
  - Converter a tabela `pets` genérica, ou separar estruturas para isolar totalmente os dados e não misturar PetShop com Contabilidade.
- `[x]` **2. Dependências e Workspaces**
  - Mover dependências do frontend que estão em dev (ex: axios, framer-motion) para dependências de runtime.
  - Criar `bot/package.json` isolando os pacotes de backend (Telegram, Groq, Discord).
- `[x]` **3. Refatoração do App.jsx (God Component) e React Router**
  - Implementar o `react-router-dom` para o roteamento.
  - Componentizar Sidebar, ModuleSwitcher e Loading.
  - Remover verificação falha de sessão baseada em `sessionStorage`.
- `[ ]` **4. Limpeza Visual**
  - Centralizar os tokens no CSS (removendo `overflow: hidden;` do body e radius excessivo).
  - Integrar Tailwind configs adequadamente.
