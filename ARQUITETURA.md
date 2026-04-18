# AcordosPRO — Arquitetura e Documentação

## Estrutura do Projeto

```
src/
├── components/           # Componentes reutilizáveis
│   ├── ui/               # shadcn/ui (não editar manualmente)
│   ├── Layout.tsx        # Layout principal com sidebar
│   ├── ProtectedRoute.tsx # Proteção de rotas por perfil
│   ├── SeedSetores.tsx   # Inicialização automática de setores
│   ├── AcordoDetalheInline.tsx  # Detalhe de acordo inline
│   ├── AcordoEditInline.tsx     # Edição otimista (optimistic update)
│   ├── AcordoNovoInline.tsx     # Criação de acordo inline
│   ├── AnalyticsPanel.tsx       # Painel analítico (Recharts)
│   ├── ChatNotificacoes.tsx     # Notificações em tempo real
│   ├── ModalFilaWhatsApp.tsx    # Fila de mensagens WhatsApp
│   ├── StatCard.tsx             # Card de estatísticas
│   ├── ErrorBoundary.tsx        # Error boundary global/por página
│   └── ThemeToggle.tsx          # Alternância de tema
│
├── hooks/                # React hooks
│   ├── useAuth.tsx       # Autenticação + perfil + empresa (multi-tenant)
│   ├── useAcordos.ts     # Acordos + métricas do dashboard
│   ├── useAnalytics.ts   # Analytics com realtime
│   ├── useNotificacoes.ts # Notificações do usuário
│   ├── useNrRegistros.ts  # Registros NR únicos
│   ├── usePresence.ts     # Presença online de usuários
│   ├── useEmpresa.tsx     # Dados da empresa atual
│   └── use-mobile.tsx    # Responsividade
│
├── providers/            # Context Providers
│   ├── RealtimeAcordosProvider.tsx  # Canal WebSocket centralizado (singleton)
│   └── PresenceProvider.tsx         # Presença online (singleton por empresa)
│
├── services/             # Camada de serviços (lógica de negócio)
│   ├── acordos.service.ts    # Queries, cálculos e métricas de acordos
│   ├── setores.service.ts    # Queries e seed de setores
│   ├── aiImport.service.ts   # Integração com IA para importação
│   ├── aiConfig.service.ts   # Configuração do modelo de IA
│   ├── lixeira.service.ts    # Soft delete + retenção 3 dias
│   ├── notificacoes.service.ts # Notificações do sistema
│   ├── nr_registros.service.ts # Controle de NR únicos
│   └── empresas.service.ts   # Dados de empresas
│
├── integrations/         # Integrações externas
│   └── ai/               # Camada de IA (pronta para expansão)
│       ├── index.ts          # Factory, tipos, funções de domínio
│       ├── providers/
│       │   └── openai.ts     # Adapter OpenAI
│       └── README.md         # Como ativar a IA
│
├── lib/                  # Utilitários e configurações
│   ├── supabase.ts       # Cliente Supabase + tipos TypeScript
│   ├── index.ts          # Constantes, labels, formatadores, rotas
│   ├── money.ts          # 💰 Utilitários monetários centralizados
│   ├── utils.ts          # cn() e outros helpers
│   ├── motion.ts         # Presets de animação Framer Motion
│   └── tenant.ts         # Lógica multi-tenant (slug)
│
├── pages/                # Páginas da aplicação
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Acordos.tsx           # Lista + fila WhatsApp
│   ├── AcordoForm.tsx        # Cadastro/edição
│   ├── AcordoDetalhe.tsx     # Detalhes + histórico
│   ├── ImportarExcel.tsx     # Importação via planilha + IA
│   ├── Lixeira.tsx           # Acordos excluídos (soft delete, 3 dias)
│   ├── PainelLider.tsx       # Gestão da equipe + analítico
│   ├── PainelDiretoria.tsx   # KPIs estratégicos para diretoria
│   ├── AdminUsuarios.tsx     # CRUD usuários + status online
│   ├── AdminCargos.tsx       # Gestão de cargos e permissões
│   ├── AdminSetores.tsx      # CRUD setores
│   ├── AdminEquipes.tsx      # CRUD equipes
│   ├── AdminConfiguracoes.tsx
│   ├── AdminIA.tsx           # Configuração do modelo OpenAI
│   └── AdminLogs.tsx         # Auditoria completa
│
├── App.tsx               # Roteamento com lazy loading
└── main.tsx              # Entry point
```

---

## Banco de Dados (Supabase)

### Tabelas

| Tabela | Descrição |
|--------|-----------|
| `public.empresas` | Empresas/tenants do sistema |
| `public.perfis` | Usuários do sistema (vinculados ao auth.users) |
| `public.acordos` | Acordos financeiros |
| `public.setores` | Setores da empresa |
| `public.equipes` | Equipes por setor |
| `public.metas` | Metas por setor, equipe ou operador |
| `public.historico_acordos` | Log de alterações nos acordos |
| `public.logs_whatsapp` | Log de mensagens enviadas |
| `public.modelos_mensagem` | Templates de mensagem |
| `public.logs_sistema` | Log geral do sistema |
| `public.notificacoes` | Notificações internas |
| `public.nr_registros` | Controle de NR únicos por empresa |

### Migrations — Ordem de Execução

Execute as migrations na ordem numérica abaixo:

```
01_schema_completo.sql          # Schema base completo
02_seed_setores.sql             # Setores iniciais
03_add_instituicao.sql          # Coluna instituicao em acordos
03b_add_instituicao_setor.sql   # Complemento: coluna setor_id (executa após 03)
04_history_trigger.sql          # Trigger de histórico de alterações
05_ai_config.sql                # Configuração do modelo de IA
06_update_status_tipo.sql       # Atualização de enums
07_fix_lider_setor_policy.sql   # Correção de política RLS para líder
08_fix_rls_policies.sql         # Correções gerais de RLS
09_multi_empresa.sql            # Suporte multi-tenant
10_indices_performance.sql      # Índices de performance
11_tenant_lockdown.sql          # Isolamento total por tenant
12_fix_signup_resilience.sql    # Resiliência no cadastro
13_fix_signup_database_error.sql# Correção de erros de signup
14a_add_equipes.sql             # Tabela equipes (executa antes de 14b)
14b_auth_username.sql           # Login por username (executa após 14a)
15a_add_metas.sql               # Tabela metas (executa antes de 15b)
15b_fix_username_lookup.sql     # Correção RPC username lookup (executa após 15a)
16_fix_username_lookup_v2.sql   # Refinamento da busca por username
17_fix_signup_login_tenant.sql  # Correções de signup multi-tenant
18_fix_novos_cargos_completo.sql# Suporte a novos perfis (elite, gerencia, diretoria)
19_pagination_indexes.sql       # Índices para paginação
```

> **Nota sobre sufixos (a/b):** arquivos com o mesmo número base e sufixo `a`/`b`
> foram criados na mesma sprint e devem ser executados em sequência.
> O sufixo `b` indica complemento direto do arquivo `a`.

### Setores Iniciais

Execute o script `supabase/migrations/02_seed_setores.sql` no SQL Editor do Supabase.
Setores: Em dia, Play 1, Play 2, Play 3, Play 4, Play 5, Play 6.

---

## 🔐 Perfis de Acesso (RBAC)

O sistema implementa controle de acesso baseado em perfis (RBAC) com **7 níveis**,
controlado via PostgreSQL RLS e pelo componente `ProtectedRoute`.

| Perfil | Nível | Acesso |
|--------|-------|--------|
| `operador` | 1 | Vê e gerencia apenas seus próprios acordos |
| `lider` | 2 | Vê acordos e operadores do seu setor; gerencia equipe |
| `gerencia` | 3 | Visão multi-setor da empresa; relatórios gerenciais |
| `elite` | 4 | Recursos avançados habilitados via toggle Elite; combinável com outros perfis |
| `administrador` | 5 | Acesso total — todos os setores, acordos, configurações e logs |
| `diretoria` | 6 | Painel estratégico (`PainelDiretoria`) com KPIs, projeções e comparativos |
| `super_admin` | 7 | Cross-tenant — enxerga e gerencia todas as empresas do sistema |

### Detalhamento por Perfil

#### `operador`
- Acessa apenas seus próprios acordos (filtro por `operador_id = auth.uid()`)
- Pode criar, editar e mover acordos para a lixeira
- Sem acesso ao painel de administração

#### `lider`
- Acessa todos os acordos do seu setor (`setor_id` vinculado ao perfil)
- Visualiza e gerencia os operadores da equipe
- Acessa o `PainelLider` com métricas da equipe
- Pode criar equipes e definir metas do setor

#### `gerencia`
- Visão de múltiplos setores da empresa
- Acesso a relatórios analíticos gerais
- Não tem acesso ao painel de administração de usuários/configurações

#### `elite`
- Perfil complementar que habilita funcionalidades premium
- O toggle Elite no `PainelDiretoria` alterna entre visão individual e consolidada
- Pode ser aplicado sobre operador, lider ou gerencia

#### `administrador`
- Acesso total a todos os recursos da empresa
- Gerencia usuários, setores, equipes, configurações e logs
- Configura o modelo de IA e parâmetros do sistema

#### `diretoria`
- Acessa o `PainelDiretoria` com KPIs estratégicos
- Visualiza agendamento por setor e tipo de pagamento
- Compara mês atual × anterior com deltas visuais
- Projeção automática de atingimento de meta
- Não tem acesso às configurações administrativas

#### `super_admin`
- Perfil reservado para equipe técnica
- Cross-tenant: acessa dados de todas as empresas
- Ignora validação de slug de tenant no login
- Não é criado via fluxo normal de cadastro

### Proteção de Rotas

```tsx
// Exemplo de uso do ProtectedRoute
<ProtectedRoute allowedPerfis={['administrador', 'super_admin']}>
  <AdminUsuarios />
</ProtectedRoute>
```

### RLS no PostgreSQL

Todas as tabelas possuem RLS habilitado. As políticas garantem isolamento por `empresa_id`:

```sql
-- Exemplo: operador vê apenas seus próprios acordos
CREATE POLICY "acordos_operador_select" ON public.acordos
  FOR SELECT USING (
    operador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.perfis p
      WHERE p.id = auth.uid()
        AND p.perfil IN ('lider', 'gerencia', 'administrador', 'super_admin', 'elite', 'diretoria')
        AND p.empresa_id = acordos.empresa_id
    )
  );
```

---

## Multi-Tenant

O sistema suporta múltiplas empresas isoladas por `empresa_id` e `empresa_slug`.

- Cada empresa tem um `slug` único (ex: `bookplay`, `pagueplay`)
- O frontend é configurado por empresa via variável de ambiente `VITE_TENANT_SLUG`
- No login, o sistema valida que o usuário pertence à empresa do site acessado
- O `super_admin` ignora essa validação e pode acessar qualquer empresa

```typescript
// src/lib/tenant.ts
export function getConfiguredTenantSlug(): string | null {
  return import.meta.env.VITE_TENANT_SLUG ?? null;
}
```

---

## Realtime (WebSocket)

### Padrão Broadcaster (RealtimeAcordosProvider)

Para evitar conflitos de múltiplos canais WebSocket com o mesmo filtro, o sistema
usa o padrão Broadcaster:

```
RealtimeAcordosProvider (singleton por empresa)
├── 1 canal WebSocket: rt-acordos-central-{empresa_id}
├── Registry de subscribers: Map<instanceId, callback>
├── INSERT: busca registro completo com joins antes de notificar
├── UPDATE: merge cirúrgico preservando joins locais
└── DELETE: distribui apenas o id removido
```

Todos os hooks que precisam de realtime (useAcordos, useAnalytics) se subscrevem
ao provider em vez de criar canais próprios.

### PresenceProvider

Controla o status online/offline dos usuários:

```
PresenceProvider (singleton por empresa)
├── 1 canal: presence-empresa-{empresa_id}
├── Heartbeat 20s para evitar timeout
├── track() imediato após SUBSCRIBED
└── untrack() + removeChannel no logout/cleanup
```

---

## Cálculos Monetários

**Regra central:** usar `safeNum()` de `src/lib/money.ts` antes de qualquer soma.

```ts
import { safeNum, sumSafe, formatBRL, parseBRL } from '@/lib/money';

// Correto — nunca soma diretamente
const total = sumSafe(acordos.map(a => a.valor));

// Formatar
formatBRL(total); // "R$ 1.234,56"

// Parse de formulário
parseBRL("1.234,56"); // 1234.56
```

---

## Integração de IA

Ver `src/integrations/ai/README.md` para instruções completas.

### Edge Function: `ai-normalize-import`

Localização: `supabase/functions/ai-normalize-import/index.ts`

Fluxo:
1. Frontend faz upload da planilha (xlsx)
2. `aiImport.service.ts` extrai as linhas brutas
3. Chama a Edge Function via `supabase.functions.invoke('ai-normalize-import')`
4. A Edge Function envia para a OpenAI API (modelo configurável via Admin → IA)
5. Retorna os dados normalizados nos campos corretos do sistema

A chave `OPENAI_API_KEY` é armazenada nos Secrets do Supabase (nunca exposta no frontend).

### Edge Function: `admin-change-password`

Localização: `supabase/edge_function/admin-change-password.ts`

Permite que administradores troquem a senha de outros usuários via Service Role Key,
sem expor a chave no frontend.

---

## Plugin de Build: CDN Prefix Images

Localização: `vite-plugins/cdn-prefix-images.ts`

Plugin Vite customizado que reescreve referências a imagens do diretório `public/images`
para apontar para um CDN externo quando a variável `CDN_IMG_PREFIX` está definida no
ambiente de build.

```bash
# Ativar CDN no build
CDN_IMG_PREFIX=https://cdn.example.com npm run build

# Debug (mostra rewrites no console)
CDN_IMG_DEBUG=1 CDN_IMG_PREFIX=https://cdn.example.com npm run build
```

Suporta reescrita em: HTML (`src`, `href`, `srcset`), JSX/TSX (via AST Babel) e CSS (`url()`).

---

## Variáveis de Ambiente

```env
# Supabase (obrigatório)
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>

# Multi-tenant (opcional — identifica a empresa pelo slug)
VITE_TENANT_SLUG=bookplay

# IA (opcional — ativar quando pronto)
VITE_AI_ENABLED=true
VITE_AI_PROVIDER=openai
VITE_AI_API_KEY=sk-...
VITE_AI_MODEL=gpt-4o-mini
VITE_AI_ENDPOINT=https://api.openai.com/v1/chat/completions

# Build CDN (opcional — reescreve imagens para CDN no build de produção)
CDN_IMG_PREFIX=https://cdn.example.com
CDN_IMG_DEBUG=1

# Feature flags
VITE_ENABLE_ROUTE_MESSAGING=true  # Habilita mensagens na troca de rota
```

> **Segurança:** As chaves `SUPABASE_SERVICE_ROLE_KEY` e `OPENAI_API_KEY` são
> configuradas nos **Secrets** do Supabase e nunca devem aparecer no frontend.
