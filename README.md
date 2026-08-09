# Sistema de Gestão de Acordos Financeiros

[![CI](https://github.com/Kauan-Rodrigues-Garcia/gestao-de-acordos/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Kauan-Rodrigues-Garcia/gestao-de-acordos/actions/workflows/ci.yml)
![Tests](https://img.shields.io/badge/tests-1750%20passing-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Node](https://img.shields.io/badge/node-%E2%89%A520-informational)

Plataforma web para gerenciamento de acordos financeiros com controle de acesso por perfis (RBAC), dashboard analítico e importação via planilha Excel.

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| **UI** | React 18, TypeScript, Vite 5 (SWC) |
| **Estilização** | Tailwind CSS 4, shadcn/ui (Radix UI) |
| **Roteamento** | React Router DOM 6 (**HashRouter**) |
| **Formulários** | React Hook Form + Zod |
| **Estado servidor** | TanStack React Query |
| **Estado local** | Zustand |
| **Animações** | Framer Motion |
| **Gráficos** | Recharts |
| **Planilhas** | @e965/xlsx (fork mantido do SheetJS) |
| **Backend/BaaS** | Supabase (Auth, PostgreSQL, RLS, Realtime) |
| **Serverless** | Rotas em `api/` na Vercel — o que precisa de `service_role` |
| **Observabilidade** | Sentry (`@sentry/react`) |
| **Testes** | Vitest + Testing Library · Playwright (e2e) |

---

## ✅ Pré-requisitos

- **Node.js** 18 ou superior
- **npm** (incluído com o Node.js)

---

## 🚀 Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/Kauan-Rodrigues-Garcia/gestao-de-acordos.git
cd gestao-de-acordos

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com a URL e a anon key do seu projeto Supabase

# 4. Inicie o servidor de desenvolvimento
npm run dev
```

---

## 📜 Scripts Disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm run build` | Gera o build de produção |
| `npm run build:dev` | Build em modo development com sourcemaps |
| `npm run build:map` | Build de produção com sourcemaps |
| `npm run preview` | Visualiza o build localmente |
| `npm run lint` | Executa o ESLint |
| `npm run typecheck` | Type-check dos dois projetos TS (app + node) |
| `npm run test` | Roda a suíte Vitest uma vez |
| `npm run test:watch` | Vitest em modo watch |
| `npm run test:coverage` | Vitest com cobertura (thresholds em `vitest.config.ts`) |
| `npm run test:e2e` | Testes end-to-end (Playwright) |
| `npm run analyze` | Build + mapa do bundle (`stats.html`) |

---

## 🔑 Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz do projeto com as seguintes variáveis:

```env
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<sua-anon-key>
```

> A chave `SUPABASE_SERVICE_ROLE_KEY` fica nas **Environment Variables da Vercel**, **sem** o prefixo `VITE_`, e é lida apenas pelas rotas em `api/`. Ela ignora todo o RLS: o que tem `VITE_` é embutido no bundle e vaza para o navegador.
>
> O [.env.example](./.env.example) documenta todas as variáveis, incluindo as opcionais (Sentry, IA de visão, CDN de imagens).

---

## 📁 Estrutura do Projeto

```
gestao-de-acordos/
├── src/
│   ├── App.tsx                     # Roteamento principal (lazy loading)
│   ├── main.tsx                    # Entry point
│   ├── index.css                   # Estilos globais + tema
│   ├── components/
│   │   ├── ui/                     # Componentes shadcn/ui (não editar manualmente)
│   │   ├── Layout.tsx              # Layout com sidebar
│   │   ├── ProtectedRoute.tsx      # Guard de rotas por perfil
│   │   └── ThemeToggle.tsx         # Alternância dark/light mode
│   ├── hooks/
│   │   ├── useAuth.tsx             # Autenticação + perfil + setor
│   │   └── useAcordos.ts           # Acordos + métricas do dashboard
│   ├── services/
│   │   ├── acordos.service.ts      # Lógica de negócio de acordos
│   │   └── setores.service.ts      # Lógica de setores
│   ├── lib/
│   │   ├── supabase.ts             # Cliente Supabase + tipos TypeScript
│   │   ├── money.ts                # Utilitários monetários (BRL)
│   │   ├── motion.ts               # Presets de animação
│   │   └── utils.ts                # Helpers gerais
│   └── pages/                      # Páginas da aplicação (uma pasta por módulo)
├── api/                            # Rotas serverless (Vercel) — tudo que usa service_role
├── supabase/
│   └── migrations/                 # Scripts SQL (PostgreSQL)
└── [vite.config.ts, tsconfig.json, eslint.config.js, ...]
```

---

## 🔐 Perfis de Acesso (RBAC)

O sistema implementa **8 perfis** com níveis crescentes de acesso, protegidos por RLS no PostgreSQL e pelo componente `ProtectedRoute` no frontend. Os níveis abaixo são os de `PERFIL_NIVEL` em `src/lib/index.ts`.

| Perfil | Nível | Permissões |
|---|---|---|
| **operador** | 1 | Acessa apenas seus próprios acordos |
| **ouvidoria** | 2 | Herda os gates de líder; foco na aba Ouvidoria |
| **lider** | 2 | Acessa acordos e operadores do seu setor; gerencia equipe |
| **elite** | 3 | Recursos avançados (toggle Elite); combinável com outros perfis |
| **gerencia** | 4 | Visão multi-setor; relatórios gerenciais |
| **diretoria** | 5 | Painel estratégico com KPIs, projeções e comparativos mensais |
| **administrador** | 6 | Acesso total — todos os setores, acordos, configurações e logs |
| **super_admin** | 7 | Cross-tenant — gerencia todas as empresas do sistema |

> Para as regras completas de permissão, escopo por setor e RLS, consulte [docs/REGRAS-DE-NEGOCIO.md](./docs/REGRAS-DE-NEGOCIO.md).

---

---

## 📖 Documentação

| Documento | Conteúdo |
|---|---|
| [ARQUITETURA.md](./ARQUITETURA.md) | Estrutura de componentes, camada de serviços, banco de dados e decisões de arquitetura |
| [docs/REGRAS-DE-NEGOCIO.md](./docs/REGRAS-DE-NEGOCIO.md) | **Regras de negócio das duas operações** (Pague Play e Book Play): permissões, RLS, tabulação de acordos, Direto/Extra, equipes, metas, analítico e recebimento diário |
| [TESTING.md](./TESTING.md) | Guia de testes |
| [SECURITY.md](./SECURITY.md) | Política de segurança e status de dependências |

---

## 🚀 Deploy em Produção

O projeto usa **HashRouter** (React Router DOM), que armazena a rota no fragmento da URL (ex: `/#/login`). Isso significa que **o servidor nunca recebe a rota** — ele sempre serve `index.html` e o React cuida do roteamento no cliente. Compatível com qualquer hospedagem de arquivos estáticos sem configuração adicional.

> ⚠️ **Por que não BrowserRouter?**  
> O deploy está no **Render** como *Static Site*, que não suporta SPA fallback nativo.  
> Com BrowserRouter, ao recarregar `/login` o Render retorna `404 Not Found` porque não existe o arquivo físico `/login/index.html`.  
> O HashRouter resolve isso definitivamente, sem precisar configurar redirects no servidor.

---

## 🛡️ Melhorias de Qualidade (v2.0)

As seguintes melhorias foram implementadas com base na análise técnica do projeto:

| Melhoria | Descrição |
|---|---|
| **Race condition** | `fetchPerfil` agora usa **7 tentativas** com **backoff exponencial** (500 ms → 8 s), tolerando banco sob alta carga |
| **HashRouter mantido** | BrowserRouter testado e revertido — o Render (Static Site) não tem SPA fallback; HashRouter garante zero 404 ao recarregar |
| **`.env.example`** | Arquivo de exemplo criado com documentação completa de todas as variáveis |
| **Error Boundaries** | `ErrorBoundary` adicionado: envolve toda a app (crash global) e cada página individualmente |
| **Paginação backend** | `fetchAcordos` corrigido: paginação usa lote ampliado para compensar deduplicação client-side |
| **JSDoc** | Documentação JSDoc adicionada em: `useAuth`, `ProtectedRoute`, `Layout`, `StatCard`, `ErrorBoundary` |
| **Índices DB** | Migration `19_pagination_indexes.sql` com índices compostos e parciais para performance em alto volume |
