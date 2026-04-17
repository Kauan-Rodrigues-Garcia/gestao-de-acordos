# Sistema de Gestão de Acordos Financeiros

Plataforma web para gerenciamento de acordos financeiros com controle de acesso por perfis (RBAC), dashboard analítico, importação via planilha Excel e integração com IA (OpenAI) para normalização de dados.

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
| **Planilhas** | xlsx |
| **Backend/BaaS** | Supabase (Auth, PostgreSQL, Edge Functions) |
| **IA** | OpenAI API via Supabase Edge Function (Deno) |

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
| `npm run test:edge-functions` | Testa as Edge Functions (Deno) |

---

## 🔑 Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz do projeto com as seguintes variáveis:

```env
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<sua-anon-key>
```

> As chaves `SUPABASE_SERVICE_ROLE_KEY` e `OPENAI_API_KEY` são configuradas diretamente nos **Secrets** do Supabase (usadas pelas Edge Functions — nunca devem ser expostas no frontend).

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
│   │   ├── setores.service.ts      # Lógica de setores
│   │   └── aiImport.service.ts     # Integração com IA para importação
│   ├── integrations/ai/            # Camada de IA (OpenAI)
│   ├── lib/
│   │   ├── supabase.ts             # Cliente Supabase + tipos TypeScript
│   │   ├── money.ts                # Utilitários monetários (BRL)
│   │   ├── motion.ts               # Presets de animação
│   │   └── utils.ts                # Helpers gerais
│   └── pages/                      # 13 páginas da aplicação
├── supabase/
│   ├── migrations/                 # Scripts SQL (PostgreSQL)
│   └── functions/
│       └── ai-normalize-import/    # Edge Function de normalização IA (Deno)
└── [vite.config.ts, tsconfig.json, eslint.config.js, ...]
```

---

## 🔐 Perfis de Acesso (RBAC)

| Perfil | Permissões |
|---|---|
| **operador** | Acessa apenas seus próprios acordos |
| **lider** | Acessa acordos e operadores do seu setor |
| **administrador** | Acesso total — todos os setores, acordos, configurações e logs |

As rotas são protegidas pelo componente `ProtectedRoute` com validação de perfil.

---

## 🤖 Integração com IA

A funcionalidade de **Organizar com IA** na tela de importação de planilhas utiliza uma **Supabase Edge Function** (`ai-normalize-import`) que:

1. Recebe as linhas brutas da planilha
2. Envia para a OpenAI API (modelo configurável via Admin → IA)
3. Retorna os dados normalizados nos campos corretos do sistema

A chave da OpenAI é armazenada nos Secrets do Supabase e nunca é exposta no frontend.

---

## 📖 Documentação de Arquitetura

Para detalhes técnicos sobre a estrutura de componentes, camada de serviços, banco de dados e decisões de arquitetura, consulte o arquivo [ARQUITETURA.md](./ARQUITETURA.md).
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
