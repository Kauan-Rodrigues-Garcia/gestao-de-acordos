# AcordosPRO — Arquitetura e Documentação

## Estrutura do Projeto

```
src/
├── components/           # Componentes reutilizáveis
│   ├── ui/               # shadcn/ui (não editar manualmente)
│   ├── Layout.tsx        # Layout principal com sidebar
│   ├── ProtectedRoute.tsx # Proteção de rotas por perfil
│   └── SeedSetores.tsx   # Inicialização automática de setores
│
├── hooks/                # React hooks
│   ├── useAuth.tsx       # Autenticação + perfil + setor
│   ├── useAcordos.ts     # Acordos + métricas do dashboard
│   └── use-mobile.tsx    # Responsividade
│
├── services/             # Camada de serviços (lógica de negócio)
│   ├── acordos.service.ts    # Queries, cálculos e métricas de acordos
│   └── setores.service.ts    # Queries e seed de setores
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
│   ├── index.ts          # Constantes, labels, formatadores
│   ├── money.ts          # 💰 Utilitários monetários centralizados
│   ├── utils.ts          # cn() e outros helpers
│   └── motion.ts         # Presets de animação Framer Motion
│
├── pages/                # Páginas da aplicação
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Acordos.tsx           # Lista + fila WhatsApp
│   ├── AcordoForm.tsx        # Cadastro/edição
│   ├── AcordoDetalhe.tsx     # Detalhes + histórico
│   ├── PainelLider.tsx       # Gestão da equipe + analítico
│   ├── ImportarExcel.tsx     # Importação via planilha
│   ├── AdminUsuarios.tsx
│   ├── AdminSetores.tsx      # Com seed automático
│   ├── AdminConfiguracoes.tsx
│   └── AdminLogs.tsx
│
├── App.tsx               # Roteamento
└── main.tsx              # Entry point
```

## Banco de Dados (Supabase)

### Tabelas
- `public.perfis`    — usuários do sistema (vinculados ao auth.users)
- `public.acordos`   — acordos financeiros
- `public.setores`   — setores da empresa
- `public.historico_acordos` — log de alterações
- `public.logs_whatsapp`     — log de mensagens enviadas
- `public.modelos_mensagem`  — templates de mensagem
- `public.logs_sistema`      — log geral do sistema

### Setores Iniciais
Execute o script `supabase/migrations/02_seed_setores.sql` no SQL Editor do Supabase.
Setores: Em dia, Play 1, Play 2, Play 3, Play 4, Play 5, Play 6.

## Regras de Negócio

| Perfil       | Acesso                                      |
|--------------|---------------------------------------------|
| operador     | Vê apenas seus próprios acordos             |
| lider        | Vê acordos e operadores do seu setor        |
| administrador| Acesso total — todos os setores e acordos   |

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

## Integração de IA

Ver `src/integrations/ai/README.md` para instruções completas.

Resumo rápido:
1. Adicionar no `.env`: `VITE_AI_ENABLED=true`, `VITE_AI_PROVIDER=openai`, `VITE_AI_API_KEY=sk-...`
2. Ativar o adapter no factory (`src/integrations/ai/index.ts`)
3. Usar as funções de domínio nas telas: `responderPergunta()`, `sugerirAcaoAcordo()`, `resumirAnalitico()`

## Variáveis de Ambiente

```env
# Supabase (obrigatório)
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

# IA (opcional — ativar quando pronto)
VITE_AI_ENABLED=true
VITE_AI_PROVIDER=openai
VITE_AI_API_KEY=sk-...
VITE_AI_MODEL=gpt-4o-mini
VITE_AI_ENDPOINT=https://api.openai.com/v1/chat/completions
```
