# Gestão de Acordos — Arquitetura e Documentação

> Este documento cobre **como o sistema é construído**. Para **como o sistema
> decide** — permissões, RLS, tabulação de acordos, Direto/Extra, equipes,
> metas, analítico e recebimento diário, nas duas operações (Pague Play e
> Book Play) — consulte [docs/REGRAS-DE-NEGOCIO.md](./docs/REGRAS-DE-NEGOCIO.md).
>
> Para o que está **errado e precisa mudar**, com o custo que já cobrou, veja
> [docs/DIVIDA-TECNICA.md](./docs/DIVIDA-TECNICA.md). Hoje há **1 item urgente**:
> `nr_cliente` e `instituicao` significam coisas diferentes em cada empresa, e
> essa conflação já causou dois bugs em produção. Código novo que toque essas
> duas colunas deve ler aquele documento primeiro.

## Estrutura do Projeto

A regra de camadas é constante: **página não conversa com o Supabase quando há
regra envolvida**. A regra mora em `services/`, o estado e o realtime em
`hooks/`, e a tela consome os dois.

```
pages/  →  hooks/  →  services/  →  lib/supabase.ts
             ↑
        providers/  (singletons: realtime, presença, notificações)
```

```
src/
├── components/           # Componentes reutilizáveis
│   ├── ui/               # shadcn/ui (não editar manualmente)
│   ├── Layout.tsx        # Layout principal com sidebar
│   ├── ProtectedRoute.tsx       # Proteção de rotas por cargo + permissão
│   ├── AcordoDetalheInline/     # Detalhe de acordo inline (+ editar parcelado)
│   ├── AcordoEditInline.tsx     # Edição otimista (optimistic update)
│   ├── AcordoNovoInline/        # Criação inline (FormPP / FormBP + autorização NR)
│   ├── AnalyticsPanel/          # Painel analítico (Recharts)
│   ├── ModalAdicionarParcela.tsx  # Parcela avulsa no mesmo NR
│   ├── ChatNotificacoes.tsx     # Notificações em tempo real
│   ├── ModalFilaWhatsApp.tsx    # Fila de mensagens WhatsApp
│   ├── comemoracao/             # Overlay de meta batida
│   ├── pet/                     # Pet Aura (gamificação)
│   ├── ErrorBoundary.tsx        # Error boundary global/por página
│   └── ThemeToggle.tsx          # Alternância de tema
│
├── hooks/                # Estado + realtime (29 hooks)
│   ├── useAuth.tsx       # Autenticação + perfil + empresa (multi-tenant)
│   ├── useEmpresa.tsx    # Empresa atual + slug do tenant
│   ├── useCargoPermissoes.ts    # Permissões configuráveis por cargo
│   ├── useAcordos.ts     # Acordos + métricas (React Query + realtime)
│   ├── useAnalytics.ts   # Analytics com realtime
│   ├── useAnalitico.ts / useAnaliticoImport.ts   # Aba Analítico
│   ├── useDiario.ts / useDiarioImport.ts         # Recebimento diário
│   ├── useSolicitacoesWhatsapp.ts / useComemoracoes.ts / useOuvidoriaAcesso.ts
│   └── useVersionCheck.ts       # Detecta novo deploy (dist/version.json)
│
├── providers/            # Context Providers (singletons)
│   ├── RealtimeAcordosProvider.tsx  # Canal WebSocket centralizado
│   ├── PresenceProvider.tsx         # Presença online por empresa
│   └── NotificacoesProvider.tsx     # Estado único do sino + painel
│
├── services/             # Camada de serviços — a regra de negócio mora aqui
│   ├── acordos.service.ts       # Queries, filtros, métricas
│   ├── nr_registros.service.ts  # Titularidade de NR/Código
│   ├── direto_extra.service.ts  # Config e resolução Direto/Extra
│   ├── tratarExclusaoVinculo.ts # Quebra do par ao excluir
│   ├── parcelas.service.ts      # Parcela no mesmo NR + lote + numeradas
│   ├── lixeira.service.ts       # Soft delete + retenção 3 dias
│   ├── desligamento.service.ts / situacaoUsuario.service.ts
│   ├── autorizacao_lider.service.ts  # JWT do líder (nunca id em parâmetro)
│   ├── impersonacao.service.ts
│   ├── pix_automatico.service.ts     # Comissão Pix [BP]
│   ├── solicitacoesWhatsapp.service.ts / ouvidoria.service.ts
│   ├── analitico/        # Parser, importação, escopos, composição do mês
│   ├── diario/           # Parser, importação, guard do relatório mensal
│   ├── metas/ · equipes/ · admin/ · pet/ · bookplay/ · pagueplay/
│   └── acordo-visao/     # Leitura de acordo por imagem (IA + OCR)
│
├── lib/                  # Utilitários e configurações
│   ├── supabase.ts       # Cliente Supabase + interfaces de domínio
│   ├── database.types.ts # Tipos gerados do schema
│   ├── index.ts          # Cargos, rotas, labels, percentuais PP, formatadores
│   ├── tenant.ts         # Slug do tenant + branding
│   ├── tenant-config.ts  # useTenant() — diferenças de comportamento PP × BP
│   ├── money.ts          # 💰 Utilitários monetários centralizados
│   ├── diasUteis.ts      # Dias úteis, feriados, quartis
│   ├── mesReferencia.ts  # Recorte de mês no fuso de São Paulo
│   ├── cpf.ts            # Detecção de CPF (nenhum CPF de cliente é gravado)
│   └── observabilidade.ts # Sentry
│
├── pages/                # Uma pasta por módulo
│   ├── Login.tsx · Registro.tsx
│   ├── Dashboard/            # Lista + filtros + métricas + fila WhatsApp
│   ├── Acordos/              # Lista, Pix Automático, ranking e metas de Pix
│   ├── AcordoForm/           # Cadastro/edição (FormPP / FormBP)
│   ├── AcordoDetalhe.tsx     # Detalhes + histórico
│   ├── Analitico/            # Aba Analítico + aba Recebimento diário
│   ├── ImportarExcel.tsx     # Importação via planilha (Bookplay + PaguePLAY)
│   ├── Lixeira.tsx           # Acordos excluídos (soft delete, 3 dias)
│   ├── PainelLider.tsx       # Gestão da equipe + analítico
│   ├── PainelDiretoria/      # KPIs estratégicos para diretoria
│   ├── Ouvidoria/            # Reclamações e sugestões [PP]
│   ├── CampanhaFacil/        # Campanhas de cobrança [BP]
│   ├── SolicitacoesWhatsapp/ # Chat interno de solicitação
│   ├── Comemoracoes/         # Comemorações de meta (aba de Admin → Usuários)
│   ├── MetasConfig.tsx       # Metas, feriados e quartis
│   └── AdminUsuarios · AdminEquipes · AdminSetoresAba · AdminCargos ·
│       AdminConfiguracoes · AdminLogs · AdminDiretoExtra · AdminDocumentacoes
│
├── App.tsx               # Roteamento com lazy loading
└── main.tsx              # Entry point
```

> As telas de administração foram consolidadas em abas: `/admin/setores`,
> `/admin/equipes`, `/admin/logs`, `/admin/cargos` e `/comemoracoes` continuam
> existindo como **redirects** para a aba correspondente — link antigo, favorito
> e notificação já enviada continuam caindo na tela certa.

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
| `public.logs_sistema` | Trilha de auditoria do sistema — **append-only**, escrita por gatilho. Vide [Logs 2.0](#logs-20--trilha-de-auditoria) |
| `public.notificacoes` | Notificações internas |
| `public.nr_registros` | Controle de NR únicos por empresa |
| `public.analitico_recebimentos` | Recebimentos do ERP — vide seção Analítico |
| `public.diario_recebimentos` | Recebimento diário do ERP |
| `public.cargos_permissoes` | Permissões configuráveis por cargo (JSON) |
| `public.lixeira_acordos` | Soft delete com snapshot e rastro de autoria |
| `public.direto_extra_config` | Ativação de Direto/Extra por setor/equipe/usuário |
| `public.equipe_lideres` / `equipe_operadores_clones` | Liderança e clones de equipe |
| `public.metas_config_mes` / `metas_validacoes` | Feriados, quartis e trava de meta |
| `public.pix_automatico_*` | Acordos, config, metas e registro de NR do Pix `[BP]` |
| `public.ouvidoria_*` · `solicitacoes_whatsapp` · `comemoracoes` · `pet_*` | Módulos auxiliares |

### Migrations

Os arquivos vivem em `supabase/migrations/`. Há **177 scripts legados**, criados
antes da adoção da CLI oficial, e migrations novas com timestamp de 14 dígitos.
O legado inclui prefixos repetidos e nomes que a CLI atual não reconhece como
histórico formal; por isso ele não deve ser enviado com `db push --include-all`.

| Faixa | Convenção |
|---|---|
| `01_` … `20_` | Fundação (schema, RLS, multi-tenant, cargos). Numeração sequencial simples. |
| `<nome>_AAAA_MM_DD.sql` | Sprints de abril/2026 (NR, Direto/Extra, view deduplicada). |
| `AAAAMMDD<letra>_<assunto>.sql` | Legado de maio a agosto/2026; a letra ordenava scripts do mesmo dia. |
| `AAAAMMDDHHMMSS_<assunto>.sql` | Padrão oficial atual, criado por `supabase migration new`. |

> **Sufixos (a/b/c):** mesmo dia, ordem obrigatória. O `b` é complemento direto
> do `a` — `14a_add_equipes` cria a tabela que `14b_auth_username` usa.

As migrations que estabeleceram as regras vigentes estão tabeladas em
[docs/REGRAS-DE-NEGOCIO.md](./docs/REGRAS-DE-NEGOCIO.md#migrations-de-referência),
ao lado da regra que cada uma criou — é o lugar para procurar "de onde veio esse
comportamento".

O procedimento seguro, a limitação atual do baseline legado e os comandos da
CLI estão em [supabase/MIGRATIONS.md](./supabase/MIGRATIONS.md). A presença de
um script legado no repositório não prova que ele foi aplicado em produção.

### Setores Iniciais

Execute o script `supabase/migrations/02_seed_setores.sql` no SQL Editor do Supabase.
Setores: Em dia, Play 1, Play 2, Play 3, Play 4, Play 5, Play 6.

### Logs 2.0 — trilha de auditoria

> Migration `20260812a_logs_2_0.sql`. Tela: **Configurações → Logs**
> (`src/pages/AdminLogs/`).

**Quem grava é o banco, não a tela.** Até a versão 1.0, `logs_sistema` era escrita
à mão em sete pontos do frontend: quase nada ficava registrado (editar acordo,
mudar cargo, alterar permissão, aprovar comissão, mexer em meta — nada disso
gerava log), e o que ficava não dizia o que havia mudado. Agora uma trigger
genérica (`fn_log_auditoria`) audita **29 tabelas**, com diferença campo a campo,
frase pronta em português, severidade e rótulo humano — independente de qual tela,
RPC ou importação alterou a linha.

| Camada | Responsabilidade |
|--------|------------------|
| `fn_log_auditoria()` | Trigger genérica. Configurada por `TG_ARGV`: categoria, slug da ação, substantivo da frase, colunas do rótulo, colunas ignoradas, coluna do tenant, severidade base |
| `fn_log_registrar(...)` | Única porta de escrita. Resolve autor pela sessão (**não aceita autoria forjada**), força a empresa de quem não é super_admin, mascara dado sensível, captura IP e navegador dos headers do PostgREST. Nunca levanta exceção |
| `fn_log_login_recusado(...)` | Chamável por **anônimo** — é o único evento que existe antes de haver sessão. Só grava se o identificador existir e agrupa rajadas de 30 s numa linha |
| `fn_logs_resumo(...)` | Agregados da tela calculados sobre o filtro inteiro. `SECURITY INVOKER`: respeita o RLS de quem chama |
| `fn_logs_expurgar(dias)` | Único caminho de exclusão. Só super_admin, retenção mínima de 30 dias, e registra o próprio expurgo |
| `fn_log_diff` · `fn_log_mascarar` · `fn_log_rotulo_campo` · `fn_log_contexto` | Diff, máscara de dado pessoal, rótulo de campo e contexto da requisição |

**A trilha é append-only.** Sem política de `UPDATE`, sem política de `DELETE`, e
com `REVOKE` explícito — nenhum evento pode ser editado ou apagado
individualmente, nem por administrador. O `INSERT` direto só aceita linhas com
`usuario_id = auth.uid()`.

**O que o frontend registra** (o que o banco não tem como ver): entrada, saída e
tentativa recusada de login; acesso negado por empresa errada; exportação de
dados; **resumo das três importações** (acordos por planilha, Analítico e
Recebimento Diário — quantas linhas entraram, quantas o banco já tinha, quantas
foram bloqueadas ou reconciliadas e por quê); lembrete de WhatsApp enviado;
exclusão em lote; troca de vínculo Extra com o líder que autorizou; transferência
pelo Analítico; início e fim de impersonação; redefinição de senha. Tudo via
`registrarLog()` de `src/services/logs.service.ts` — nunca `insert` direto.

**Fora da auditoria por trigger, de propósito:** `analitico_recebimentos` e
`diario_recebimentos` (importação em massa — o evento útil é o resumo),
`notificacoes` (derivada de outras triggers), `logs_sistema` (não se audita o
próprio livro) e `pet_*` (aba fora do ar).

**Retenção recomendada: 180 dias.** Uma linha de log por linha alterada é o preço
de "tudo registrado"; os índices cobrem todos os filtros da tela e o expurgo por
idade existe para quando a tabela crescer.

---

## 🔐 Perfis de Acesso (RBAC)

O sistema implementa controle de acesso baseado em perfis (RBAC) com **8 cargos**,
controlado via PostgreSQL RLS e pelo componente `ProtectedRoute`.

Os níveis abaixo são os de `PERFIL_NIVEL`, em `src/lib/index.ts` — **a fonte da
verdade**. Esta tabela é cópia por conveniência; mudou o cargo, mude os dois.

| Perfil | Nível | Acesso |
|--------|-------|--------|
| `operador` | 1 | Vê e gerencia apenas seus próprios acordos |
| `ouvidoria` | 2 | Herda os gates de líder; foco na aba Ouvidoria `[PP]` |
| `lider` | 2 | Vê acordos e operadores do seu setor; gerencia equipe |
| `elite` | 3 | Como líder, com visões adicionais (toggle individual × geral) |
| `gerencia` | 4 | Visão multi-setor da empresa; relatórios gerenciais |
| `diretoria` | 5 | Painel estratégico (`PainelDiretoria`) com KPIs, projeções e comparativos |
| `administrador` | 6 | Acesso total — todos os setores, acordos, configurações e logs |
| `super_admin` | 7 | Cross-tenant — enxerga e gerencia todas as empresas do sistema |

Agrupamentos usados no código:

```ts
PERFIS_LIDER     = ['lider', 'elite', 'gerencia', 'ouvidoria']
PERFIS_ADMIN     = ['administrador', 'super_admin']
PERFIS_DIRETORIA = ['diretoria']
```

`ouvidoria` está dentro de `PERFIS_LIDER` de propósito, e o banco espelha isso
em `fn_user_has_any_role` (migration `20260717b`) — os dois lados mudam juntos.

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

#### `ouvidoria`
- Herda os gates de líder (está em `PERFIS_LIDER`, no código e no banco)
- Acesso à aba Ouvidoria controlado por `ouvidoria_acessos` (nível `ver`/`editar`)

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
- Configura parâmetros do sistema

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
- Não é criado via fluxo normal de cadastro — só outro `super_admin` cria

> **Acesso total é por construção, não por lista.** Nunca houve allowlist de
> usuários: o cargo, sozinho, sempre valeu cross-tenant. A migration
> `20260812b_super_admin_acesso_total.sql` fechou as duas frestas que ainda
> deixavam isso ao acaso:
>
> 1. **Uma política RLS de super_admin em cada tabela** (`<tabela>_super_admin_total`,
>    `FOR ALL USING (fn_user_is_super_admin())` — 58 tabelas). O projeto tem 231
>    políticas e a maioria filtra por empresa; duas escreviam
>    `empresa_id = fn_user_empresa_id()` na mão em vez de chamar
>    `fn_can_access_empresa()` (`acordos_delete_own` e `perfis_lider_update`,
>    confirmadas no banco), o que deixava a tabela voltar **vazia** na outra
>    empresa — sem erro e sem aviso. Políticas permissivas se somam por OR, então
>    uma por tabela basta, e a próxima política nova não precisa lembrar do caso.
> 2. **Linha de `cargos_permissoes` para `super_admin` em toda empresa**, com
>    todas as chaves `true`, mais trigger em `empresas` para empresa nova já
>    nascer com ela. Antes não existia linha nenhuma: funcionava só pelo atalho
>    de `useCargoPermissoes` (`if (isAdmin) return true`), e o banco respondia que
>    o cargo não podia nada.
>
> **Exceção deliberada:** `logs_sistema` **não** recebe a política `FOR ALL` — a
> trilha de auditoria é append-only (`20260812a`). O super_admin já lê tudo pela
> `logs_sis_admin` e apaga por idade pela `fn_logs_expurgar`; o que ele não faz é
> reescrever a própria pegada.
>
> **Cuidado operacional:** o código nunca bloqueia super_admin — marcar a conta
> como desligada ou inativa **não** revoga o acesso (ver `rejectDesligado` em
> `useAuth`). Para tirar o acesso de um super_admin, **troque o cargo dele**.

### Proteção de Rotas

O guard tem **duas camadas**: o cargo (`allowedProfiles`) e a permissão
configurável em Admin → Configurações → Permissões (`requiredPermissao`).

```tsx
// Só por cargo — super_admin sempre passa
<ProtectedRoute allowedProfiles={['administrador', 'super_admin']}>
  <AdminUsuarios />
</ProtectedRoute>

// Cargo + permissão configurável
<ProtectedRoute allowedProfiles={['lider', 'administrador', 'elite', 'gerencia']}
                requiredPermissao="ver_painel_lider">
  <PainelLider />
</ProtectedRoute>
```

Com `requiredPermissao`, a ordem de decisão é: admin/super_admin passa →
permissão `true` passa → permissão `false` **bloqueia, mesmo que o cargo
permitisse** → permissão ausente no banco cai no `allowedProfiles`
(compatibilidade). A resolução vive em `useCargoPermissoes.temPermissao`.

> As permissões do frontend controlam **navegação e interface**. Elas não são
> barreira de segurança: quem manda no dado é a RLS.

### RLS no PostgreSQL

Todas as tabelas têm RLS habilitado, com isolamento por `empresa_id`. Para
acordos, `SELECT`/`INSERT`/`UPDATE`/`DELETE` passam por **uma função só**,
`fn_pode_gerir_acordo(setor_id, operador_id)` (migration `20260723f`) —
centralizar impede que as políticas divirjam entre si.

```
pode gerir o acordo SE:
  é o dono (operador_id = auth.uid())
  OU é super_admin  OU é administrador
  OU (empresa é PaguePlay  E  cargo = lider)        → PP: líder vê tudo (legado)
  OU (empresa NÃO é PaguePlay  E  (                  → BookPlay e demais
        cargo = diretoria
        OU (cargo ∈ {lider, elite, gerencia} E setor do acordo = setor do usuário)
     ))
```

A função é **fail-closed**: chaveia pelo positivo de *Pague Play*, então empresa
não identificada cai no ramo restritivo. A versão anterior chaveava pelo positivo
de Book Play, e uma falha de detecção virava **mais** acesso.

> **Dependência crítica.** A listagem lê da view `acordos_deduplicados`. A RLS
> acima só tem efeito porque a view é `security_invoker` (migration `20260723d`).
> Sem essa flag a view roda como dona e **ignora todas as políticas**.

Duas consequências moldam o código inteiro: o operador só lê os **próprios
acordos** e a **própria linha** de `perfis`. Daí a regra: toda operação sobre o
acordo ou o perfil de outra pessoa passa por **RPC `SECURITY DEFINER`**, com a
autorização verificada no servidor — `select`/`update` direto na tabela falha
silenciosamente sob a RLS.

---

## Multi-Tenant

O sistema suporta múltiplas empresas isoladas por `empresa_id` e `empresa_slug`.

Pague Play e Book Play são **deploys separados do mesmo código**, apontando para
o **mesmo banco**. O que as separa é o slug do tenant, fixado no build.

- Cada empresa tem um `slug` único (ex: `bookplay`, `pagueplay`)
- O frontend é configurado por empresa via `VITE_TENANT_SLUG`
- No login, `useAuth` valida que o usuário pertence à empresa do site acessado
- O `super_admin` ignora essa validação e pode acessar qualquer empresa

A resolução do slug tem três níveis, em ordem de prioridade — a variável de
build, o hostname e, por último, o slug da empresa do perfil logado:

```typescript
// src/lib/tenant.ts
export function getConfiguredTenantSlug(): string {
  const envSlug = normalizeSlug(import.meta.env.VITE_TENANT_SLUG);
  return envSlug || detectSlugFromHostname();   // '' quando não há nenhum
}
```

> **Exceção — impersonação.** Com um `super_admin` impersonando alguém, a ordem
> inverte: a empresa **real do usuário impersonado** manda no branding e nas
> capacidades (`getTenantRuntimeConfig`). Sem isso, o admin logado no site da
> Pague Play veria um usuário Book Play com regras de Pague Play.

As **diferenças de comportamento** entre as duas operações (chave do cliente,
formas de pagamento, máximo de parcelas, campo Estado, distribuição de receita)
ficam centralizadas em `src/lib/tenant-config.ts`, no hook `useTenant()` — que
substituiu mais de 130 chamadas espalhadas a `isPaguePlay(slug)`. A tabela
comparativa completa está em
[docs/REGRAS-DE-NEGOCIO.md](./docs/REGRAS-DE-NEGOCIO.md).

---

## Realtime (WebSocket)

### Padrão Broadcaster (RealtimeAcordosProvider)

Para evitar conflitos de múltiplos canais WebSocket com o mesmo filtro, o sistema
usa o padrão Broadcaster:

```
RealtimeAcordosProvider (singleton por empresa)
├── 1 canal WebSocket: rt-acordos-{empresa_id}-{reconnectTick}
├── Registry de subscribers: Map<instanceId, callback>
├── INSERT: busca registro completo com joins antes de notificar
├── UPDATE: merge cirúrgico preservando joins locais
└── DELETE: distribui apenas o id removido
```

O `reconnectTick` no nome não é enfeite: ao recriar, um nome novo força o
Supabase a abrir um canal fresh em vez de reutilizar um já `CLOSED`.

**Reconexão.** `CLOSED`/`CHANNEL_ERROR`/`TIMED_OUT` esperam 3 s antes de contar
como falha — troca rápida de aba reconecta sozinha nesse intervalo. Persistindo,
o canal é destruído e recriado com backoff exponencial (2 s → 30 s). Voltar para
a aba com o canal morto reconecta **na hora**, sem backoff. E ao reconectar
depois de uma falha, o cache de `acordos` é invalidado — é o que recupera os
eventos perdidos durante o downtime.

Todos os hooks que precisam de realtime (useAcordos, useAnalytics) se subscrevem
ao provider em vez de criar canais próprios.

> O motivo de existir: antes, cada instância de `useAcordos` criava seu próprio
> canal com o mesmo nome. O Dashboard chegava a 4 canais simultâneos, e o
> `removeChannel` de qualquer instância que desmontasse matava o canal das
> outras — era o que fazia a Pague Play perder o Realtime.

### PresenceProvider

Controla o status online/offline dos usuários:

```
PresenceProvider (singleton por empresa)
├── 1 canal: presence-empresa-{empresa_id}
├── Heartbeat 20s para evitar timeout
├── track() imediato após SUBSCRIBED
└── untrack() + removeChannel no logout/cleanup
```

### NotificacoesProvider

Fica **acima do Router** de propósito: o sino no header (`Layout`) e o painel
(`ChatNotificacoes`) são componentes diferentes que precisam do **mesmo** estado
de notificações. Montado abaixo do Router, cada um teria a sua cópia — e o
contador do sino discordaria da lista aberta ao lado.

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

**Parcelas são calculadas em centavos inteiros**, nunca em float — dividir
`valor / n` em ponto flutuante acumula resto que não fecha com a soma. Três
regimes coexistem, e `money.ts` tem um para cada:

| Regime | Função | Onde |
|---|---|---|
| Rateio simples | `calcularParcelas(total, n, false)` | Ambos |
| Regra dos **40 %** (1ª parcela = 40 % do total) | `calcularParcelas(total, n, true)` | `[PP]`, n ≥ 3 |
| **Entrada + demais** (os dois valores digitados; o total é consequência) | `calcularParcelasComEntrada`, `valorDemaisParcelas` | `[BP]` (migration `20260805b`) |

---

## Rotas serverless (Vercel) — `api/`

Toda operação que precisa da `SUPABASE_SERVICE_ROLE_KEY` mora aqui. A chave
ignora RLS, então nunca pode ser exposta ao navegador: fica só nas Environment
Variables da Vercel, **sem** o prefixo `VITE_` (o que tem `VITE_` é embutido no
bundle e vaza).

Estas rotas sobem no mesmo deploy do site. **No local, `npm run dev` basta**: o
plugin `vite-plugins/dev-api.ts` (`apply: 'serve'`, fora do build) serve `/api`
dentro do próprio servidor de dev e carrega as variáveis não-`VITE` do
`.env.local` no `process.env` do Node — elas ficam no processo, nunca chegam ao
navegador. Não é preciso `vercel dev`.

### `api/alterar-senha.ts`

Redefine a senha de um usuário via Admin API do GoTrue. Só administrador e
super_admin; administrador não mexe em super_admin (seria escalada de
privilégio) nem em usuário de outra empresa. Ao concluir, zera
`perfis.senha_alterada` para o dono definir a própria senha.

Não existe "ver a senha atual": o GoTrue guarda bcrypt, que não é reversível.

> Substituiu a Edge Function `admin-change-password`, que nunca chegou a ser
> publicada — o código estava em `supabase/edge_function/`, pasta que a CLI do
> Supabase não lê (ela publica `supabase/functions/<nome>/index.ts`), então o
> `functions.invoke` do frontend sempre recebeu 404.

### `api/impersonar-usuario.ts`

Gera um magic link do usuário-alvo para o super_admin assumir a sessão dele.
Ver `src/services/impersonacao.service.ts` no cliente.

### `api/ler-acordo-imagem.ts`

Leitura de acordo BookPlay por imagem via IA. Exige JWT Supabase válido, perfil
ativo e uma cota persistente por usuário antes de chamar o provedor. A rota
aceita somente PNG/JPEG/WebP, no máximo 5 imagens e 3 MB decodificados (para
respeitar o limite de 4,5 MB do payload Vercel após Base64). A cota
padrão é 10 leituras por 10 minutos; sem configuração ou em indisponibilidade o
front cai no OCR local (Tesseract).

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

# Build CDN (opcional — reescreve imagens para CDN no build de produção)
CDN_IMG_PREFIX=https://cdn.example.com
CDN_IMG_DEBUG=1

# Feature flags
VITE_ENABLE_ROUTE_MESSAGING=true  # Habilita mensagens na troca de rota

# Observabilidade (opcional) — a DSN NÃO é segredo: só permite ENVIAR eventos
VITE_SENTRY_DSN=https://<chave>@<org>.ingest.sentry.io/<id>
```

**Só no servidor — nunca com prefixo `VITE_`.** O que tem `VITE_` é embutido no
bundle e chega ao navegador. Estas ficam nas Environment Variables da Vercel (e
no `.env.local` para o `npm run dev`, via plugin `dev-api`):

| Variável | Usada por |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Rotas administrativas e controle de cota da visão — **ignora todo o RLS** |
| `SUPABASE_PUBLISHABLE_KEY` | Validação do JWT na API de visão; cai em `VITE_SUPABASE_ANON_KEY` quando omitida |
| `VISION_PROVIDER` / `VISION_API_KEY` / `VISION_MODEL` | Provedor da leitura por imagem (sem elas, cai no OCR local) |
| `VISION_RATE_LIMIT_MAX` / `VISION_RATE_LIMIT_WINDOW_SECONDS` | Cota da visão; defaults 10 requisições / 600 segundos |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | Upload de source maps no build — segredo de verdade (acesso de escrita ao Sentry) |

O [.env.example](./.env.example) documenta cada uma com o porquê.

---

## Aba Analítico

Feature adicionada em 2026-06-29, originalmente exclusiva da PaguePlay.

> ⚠️ **Não é mais exclusiva.** A aba foi estendida à BookPlay: o guard em
> `src/pages/Analitico/index.tsx` aceita os dois slugs, e a página vive em
> `src/pages/Analitico/` (a rota `/analitico`). Os componentes de visão
> continuam onde nasceram, em `src/pages/Dashboard/Analitico/`, e são importados
> de lá. As diferenças entre as operações estão nas regras de escopo
> (`services/analitico/escopoAnalitico.ts`), não em um gate por slug.

### Visão Geral

Recebimentos pagos no ERP são importados por um líder via relatório Excel.
Cada linha representa um pagamento de um cliente (cartão consolidado por código,
boleto/pix = 1 linha por pagamento). O operador vê seus recebimentos e pode
"tabular" cada um criando o acordo correspondente.

### Tabela `analitico_recebimentos`

```
id                UUID  PK
empresa_id        UUID  FK empresas (gate de isolamento)
operador_id       UUID  FK auth.users — null quando cobradora não encontrada
operador_usuario  TEXT  username bruto do relatório (coluna "Cobradora")
codigo            TEXT  código do cliente (ex: "1994034")
nome_cliente      TEXT  nome extraído da coluna Cliente
forma_pagamento   TEXT  'boleto_pix' | 'cartao'
valor_recebido    NUMERIC
total_ho          NUMERIC
data_pagamento    DATE
mes_referencia    DATE  truncado ao 1º do mês (indexado)
acordo_id         UUID  FK acordos — preenchido após tabulação
status_tabulacao  TEXT  'nao_tabulado' | 'tabulado' | 'divergente'
visto             BOOL  false = tag "novo" para o operador
importado_por_id  UUID
importado_em      TIMESTAMPTZ
lote_id           UUID  UUID gerado no browser por importação
```

**Chave de unicidade (merge incremental):**
`(empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario)`
— re-upload do mesmo arquivo ignora duplicatas.

**RLS:**
- `SELECT`: operador vê só `operador_id = auth.uid()`; linhas com `operador_id IS NULL` só para líder+; líder/admin vêem tudo da empresa.
- `INSERT`: só líder+.
- `UPDATE`: operador atualiza suas próprias linhas (visto, status_tabulacao); líder+ atualiza tudo.
- `DELETE`: só líder+.

### Fluxo de Importação

```
Líder → upload Excel (browser) → parse local (analiticoParser.ts)
      → resolverOperadores (cruza "Cobradora" com perfis.usuario)
      → preview: delta (novos / já existiam / sem operador)
      → [Confirmar dados] → importarLoteAnalitico (INSERT ON CONFLICT DO NOTHING)
      → notificarImportacaoAnalitico (notificação para todos da empresa)
```

Chaves de serviço: `src/services/analitico/analitico.service.ts`
Hook de estado: `src/hooks/useAnaliticoImport.ts`
Parser: `src/services/analitico/analiticoParser.ts`

### Máquina de Estados da Tabulação

Por linha (campo `status_tabulacao`):

| Estado | Condição | Botão | Ação |
|--------|----------|-------|------|
| `nao_tabulado` | Nenhum acordo `tipo_vinculo='direto'` com esse código | "Tabular acordo" | Abre `AcordoNovoInline` pré-preenchido via sessionStorage draft |
| `tabulado` | Acordo direto existe **do mesmo operador** | "Ver acordo" | Navega até o acordo no Dashboard |
| `divergente` | Acordo direto existe **de outro operador** | "Tabular" + modal | Remove acordo do outro operador (lixeira, sem auth do líder), notifica ambos, loga em `logs_sistema` |

**Tabulação automática de cartão:**
Se `profissionais` tem o código com `estado_uf` preenchido, o acordo é criado automaticamente (sem abrir o formulário). Caso contrário, o formulário abre pré-preenchido com todos os dados disponíveis.

### Permissão `importar_analitico`

Adicionada em `cargos_permissoes` via migration `20260629_analitico_recebimentos.sql`.
- `operador`: `false` (só recebe dados)
- `lider`, `elite`, `gerencia`, `diretoria`, `administrador`, `super_admin`: `true` (padrão)
- Ajustável em tempo real pelo admin sem deploy.

### Visões por Cargo

| Cargo | Visão |
|-------|-------|
| `operador` | Próprios recebimentos + botão de tabulação |
| `lider`, `gerencia`, `administrador` | Por operador + Ranking + bucket de órfãos + importar |
| `elite` | Toggle entre visão individual (próprios) e geral (como líder) |

### Arquivos

```
supabase/migrations/20260629*_analitico_*.sql   (+ 20260802a, 20260803c, 20260809b)
src/pages/Analitico/index.tsx   # RAIZ DA PÁGINA (/analitico): abas + guard + gate por cargo
src/services/analitico/
  ├── analiticoParser.ts        # parse Excel, consolidação cartão, toDate, resolveCols
  ├── analitico.service.ts      # CRUD, importarLote, tabularDivergente, notificar
  ├── escopoAnalitico.ts        # "esta linha conta no que estou olhando?" — regra ÚNICA
  ├── escopoFontes.ts · composicaoMes.ts · analiticoComum.ts
  └── contribuicaoReceptivo.service.ts
src/hooks/
  ├── useAnalitico.ts           # fetch + realtime + marcarVisto
  ├── useAnaliticoImport.ts     # máquina de estados upload→preview→confirmar
  ├── useAnaliticoDashboard.ts  # agregado do mês (fn_analitico_dashboard_mes_json)
  └── useEscopoAnalitico.ts
src/pages/Dashboard/Analitico/  # componentes de visão (importados pela página acima)
  ├── AnaliticoOperador.tsx     # visão operador
  ├── AnaliticoLider.tsx        # visão líder/admin (por operador + ranking + órfãos)
  ├── DesempenhoEquipes.tsx · RankingView.tsx · QuartisOperadores.tsx
  ├── ImportarModal.tsx         # modal upload → preview delta → confirmar
  ├── TabulacaoCell.tsx         # botão de tabulação (máquina de estados)
  └── agregacaoLider.ts · types.ts
```

> **`escopoAnalitico.ts` merece atenção.** A pergunta "esta linha entra na minha
> conta?" já foi respondida em três lugares (aba Analítico, Painel Líder e
> dashboard) de três jeitos — e três contas para o mesmo dinheiro deram três
> números. A regra hoje é uma, pura e testada. Quem precisar dela **importa
> daqui** em vez de reescrever.

---

## Aba Recebimento Diário

Feature adicionada em 2026-07-01, aba interna da página Analítico (`/analitico`).
Diferente do Analítico, é **apenas informativa**: não há vínculo com acordos
tabulados nem máquina de estados de tabulação. O líder importa o relatório de
recebimento diário do ERP e cada operador recebe a lista dos próprios pagamentos.

> Nasceu na PaguePlay, mas **não é mais exclusiva**: a BookPlay também usa a aba,
> com RLS por setor (migration `20260804a`).

### Tabela `diario_recebimentos`

```
id                UUID  PK
empresa_id        UUID  FK empresas (gate de isolamento)
operador_id       UUID  FK perfis — null quando operador não encontrado (órfão)
operador_usuario  TEXT  username bruto do relatório (coluna "Operador")
cliente_codigo    TEXT  coluna "Cód.Cliente", só dígitos — SUBSTITUIU o CPF (20260728b)
nome_cliente      TEXT  coluna "Profissional"
acordo_codigo     TEXT  coluna "Cód.Acordo" (consolida parcelas de cartão na exibição)
forma_pagamento   TEXT  texto bruto (Pix, Boleto, Cartão Padrão…)
valor_recebido    NUMERIC
data_pagamento    DATE
dia_referencia    DATE  dia do relatório (moda das datas de pagamento)
prox_contato      DATE  ≤ dia_referencia → acordo "ignorado" (fora dos totais e listas)
tabulacao         TEXT  coluna "Tabulação" do ERP (informativa)
id_baixa          TEXT  identificador do pagamento no ERP
chave_unica       TEXT  id_baixa ou composta codigo|acordo|forma|valor|data
import_index      INT   nº da importação do dia que adicionou a linha
visto             BOOL  false = "novo" para o operador
importado_por_id / importado_em / lote_id
```

**Chave de unicidade:** `(empresa_id, dia_referencia, chave_unica)` —
importações sucessivas do mesmo dia adicionam apenas pagamentos novos, marcados
com `import_index` incremental (base da tag "+N novos" na visão líder).

**RLS:** igual ao analítico (operador vê só as próprias linhas; órfãos e
importação/exclusão só líder+; operador atualiza as próprias — marcar visto).

### Regras herdadas do protótipo HTML

- Cartão consolida por `acordo_codigo` na exibição (parcelas somadas, badge "Nx");
  Pix/Boleto = 1 item por pagamento.
- `prox_contato ≤ dia_referencia` (data do pagamento) → acordo ignorado: fora
  dos totais e das listas dos operadores; visível só no card "Acordos
  ignorados" da visão líder. A referência é o dia do PAGAMENTO, não o dia em
  que se olha: importar o mensal dias depois não reclassifica pagamentos que
  estavam dentro do vínculo quando aconteceram (migration 20260721h).
- Linhas do arquivo sem a coluna Operador são descartadas no parse (contadas).

### Lógica de "novos" do operador

Um pagamento só é considerado lido quando o operador **abre a aba** após a
importação (`visto = true` em `marcarVistoDiario`). Os ids não vistos na carga
ficam congelados na sessão (`useDiario.novosIds`) — a lista continua separando
"Anteriores" × "Novos" até o próximo acesso. Se o operador não abrir a aba entre
duas importações, os pagamentos das duas aparecem como novos.

### Notificações

Ao confirmar a importação, apenas os operadores **vinculados** que receberam
algum valor na importação são notificados (in-app via `notificacoes` +
notificação nativa do SO disparada em `useNotificacoes` — títulos contendo
"analítico" ou "recebimento diário").

### Permissão `importar_diario`

Adicionada em `cargos_permissoes` via migration `20260701b_diario_recebimentos.sql`
(mesmo padrão de `importar_analitico`; ambas agora expostas em Admin → Cargos).

### Arquivos

```
supabase/migrations/20260701b_diario_recebimentos.sql   # tabela + RLS + realtime + RPC fn_diario_resumo_mes + permissão
src/services/diario/
  ├── diarioParser.ts           # parse Excel, resolveCols, formaKind, diaReferencia
  ├── diario.service.ts         # importarLote, buscas, marcarVisto, notificar, limparDia
  ├── diarioMensalGuard.ts      # exige o relatório MENSAL como 1º import do dia
  ├── escopoDiario.ts · diaDetalhado.ts · diarioComum.ts
  └── *.test.ts                 # testes do parser (headers reais do ERP) e do guard
src/hooks/
  ├── useDiario.ts              # fetch + realtime + novosIds/marcarVisto
  └── useDiarioImport.ts        # máquina de estados upload→preview→confirmar
src/pages/Analitico/Diario/
  ├── index.tsx                 # raiz da aba (seletor de dia + roteia por cargo)
  ├── DiarioLider.tsx           # cards do dia/mês, lista por operador, órfãos, ignorados
  ├── DiarioOperador.tsx        # lista própria (código/nome, forma, valor, data, total)
  ├── DiaDetalhado.tsx          # abertura de um dia específico
  ├── ImportarDiarioModal.tsx   # modal upload → preview (vínculo manual) → confirmar
  ├── FormaChip.tsx             # badge Pix/Boleto/Cartão
  └── helpers.ts                # consolidação, ignorados, agregação por operador
src/pages/Analitico/index.tsx   # + abas internas Analítico × Recebimento diário
src/hooks/useNotificacoes.ts    # notificação nativa também para o diário
src/lib/supabase.ts             # + interface DiarioRecebimento
```

---

## Qualidade e Ferramentas

| Frente | Como está |
|---|---|
| **Testes** | Vitest + Testing Library (happy-dom). 2302 testes em 138 arquivos. Os `.test.ts` ficam **ao lado** do código, não numa pasta separada. |
| **Cobertura** | `vitest.config.ts` tem thresholds como **catraca**: cada valor fica logo abaixo do que a suíte entrega hoje. Ao subir a cobertura, suba os números **no mesmo commit**. |
| **E2E** | Playwright em `tests/e2e/`. |
| **CI** | `.github/workflows/ci.yml`: lint → typecheck → testes com cobertura → build. |
| **Type-check** | `npm run typecheck` roda os **dois** projetos (`tsconfig.app` + `tsconfig.node`). `npx tsc --noEmit` na raiz não checa nada — o `tsconfig.json` tem `"files": []` e sem `-b` o tsc não segue as referências. |
| **Lint** | ESLint 9 flat config + `import-x` + react-hooks. Husky/lint-staged no pre-commit. |
| **Bundle** | 8 vendor chunks manuais em `vite.config.ts` (react, radix, supabase, charts, xlsx, forms, sentry). `npm run analyze` gera `stats.html`. |
| **Observabilidade** | Sentry opcional (`VITE_SENTRY_DSN`). O usuário é identificado por **id, usuário e cargo** — nome e e-mail não saem daqui. Source maps sobem no build e são **apagados do `dist`** no mesmo passo. |
| **Versão do build** | `dist/version.json` + `__APP_VERSION__`; `useVersionCheck` faz polling e avisa quando há deploy novo. |
