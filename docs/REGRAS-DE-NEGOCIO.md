# Regras de Negócio — Gestão de Acordos

Documento de referência das **lógicas de negócio** do sistema, cobrindo as duas
operações que rodam sobre o mesmo código e o mesmo banco: **Pague Play** e
**Book Play**.

Este arquivo é complementar ao [`ARQUITETURA.md`](../ARQUITETURA.md):

| Documento | Responde |
|---|---|
| `ARQUITETURA.md` | *Como o sistema é construído* — pastas, camadas, stack, padrões de código |
| **`REGRAS-DE-NEGOCIO.md`** (este) | *Como o sistema decide* — quem vê o quê, como um acordo é tabulado, como equipes e metas funcionam |

> **Convenção de leitura.** Cada regra aponta o arquivo onde ela vive. Quando a
> regra muda de comportamento entre as duas empresas, há um marcador explícito:
> **`[PP]`** = só Pague Play · **`[BP]`** = só Book Play · **`[Ambos]`** = igual
> nas duas. Regras sem marcador valem para as duas.

> **Aviso.** Documento descritivo, não normativo: ele descreve o que o código
> faz hoje. Se código e documento divergirem, o código é a verdade — e o
> documento deve ser corrigido no mesmo commit que mudou a regra.

---

## Índice

1. [Multi-tenant: as duas operações](#1-multi-tenant-as-duas-operações)
2. [Perfis, hierarquia e permissões](#2-perfis-hierarquia-e-permissões)
3. [Segurança no banco (RLS)](#3-segurança-no-banco-rls)
4. [Setores](#4-setores)
5. [Equipes, líderes e clones](#5-equipes-líderes-e-clones)
6. [Situação do usuário: ativo, férias, desligado](#6-situação-do-usuário-ativo-férias-desligado)
7. [Tabulação de acordos](#7-tabulação-de-acordos)
8. [Direto e Extra](#8-direto-e-extra)
9. [Exclusão, lixeira e parcelas](#9-exclusão-lixeira-e-parcelas)
10. [Analítico de recebimentos](#10-analítico-de-recebimentos)
11. [Recebimento diário](#11-recebimento-diário)
12. [Metas, dias úteis e quartis](#12-metas-dias-úteis-e-quartis)
13. [Módulos auxiliares](#13-módulos-auxiliares)
14. [Mapa: onde cada regra vive](#14-mapa-onde-cada-regra-vive)

---

## 1. Multi-tenant: as duas operações

### 1.1 Um código, dois deploys

Pague Play e Book Play são **deploys separados do mesmo código**, apontando para
o **mesmo banco Supabase**. O que separa as duas é o *slug* do tenant, fixado no
build:

```
VITE_TENANT_SLUG=pagueplay    # deploy Pague Play
VITE_TENANT_SLUG=bookplay     # deploy Book Play
```

Resolução do slug, em ordem de prioridade (`src/lib/tenant.ts`):

1. `VITE_TENANT_SLUG` (variável de build);
2. o hostname — se contiver `pagueplay` ou `bookplay`;
3. o slug da empresa do perfil logado.

**Duas exceções invertem a ordem**, porque nas duas o slug do build descreve o
*domínio* e não onde a pessoa está:

**Impersonação.** Quando um `super_admin` está impersonando alguém, a empresa
**real do usuário impersonado** manda no branding e nas capacidades. Sem isso, o
admin logado no site da Pague Play veria um usuário Book Play com regras de
Pague Play.

**Troca de empresa pelo super_admin** (`empresaAtiva.service.ts`). Um seletor no
cabeçalho permite ao `super_admin` alternar entre as empresas sem trocar de
domínio. No banco isso já era permitido — `fn_can_access_empresa` deixa
super_admin passar por qualquer `empresa_id`, e as tabelas grandes ainda têm uma
policy `*_super_admin_total` por cima. Faltava a tela deixar escolher.

> **O gate é o CARGO, não a leitura da tabela.** `empresas_select` é
> `(ativo = true)`: qualquer usuário autenticado lê a linha de qualquer empresa.
> Conseguir ler não prova nada. Quem não é super_admin com a chave forçada no
> `localStorage` veria o nome e as cores da outra empresa com todas as telas
> vazias — os dados seguem bloqueados pela RLS. Por isso a escolha confere o
> cargo e é **apagada** quando a conferência falha. A barreira de segurança
> continua sendo a RLS; a conferência existe para a tela não mentir.

A troca **recarrega a página** em vez de chamar `refresh()`: resumos, listas,
metas, permissões de cargo e assinaturas de realtime filtradas por `empresa_id`
ficariam apontando para a empresa anterior. Um estado misto é pior que meio
segundo de recarga — impersonação faz igual.

### 1.2 Isolamento no login

`src/hooks/useAuth.tsx` valida, **a cada sessão**, que o slug da empresa do
perfil bate com o slug configurado no site. Não batendo, o login é recusado e a
sessão é limpa. Isso impede que um usuário Book Play entre pelo endereço da
Pague Play, e vice-versa.

Duas exceções: `super_admin` nunca é bloqueado, e a impersonação ativa atravessa
tenant de propósito.

### 1.3 Diferenças de comportamento entre as operações

Centralizadas em `src/lib/tenant-config.ts` (`useTenant()`), que substituiu mais
de 130 chamadas espalhadas a `isPaguePlay(slug)`.

| Comportamento | Pague Play | Book Play |
|---|---|---|
| **Chave do cliente** | `instituicao`, exibido como **"Código"** | `nr_cliente`, exibido como **"NR"** |
| **Formas de pagamento** | Boleto/PIX e Cartão de Crédito (2 opções) | Boleto, Cartão Recorrente, Pix Automático, Cartão, Pix |
| **Máx. de parcelas** | 12 (`PARCELAS_MAX_PAGUEPLAY`) | 99 (`PARCELAS_MAX_DEFAULT`) — o campo é digitável e aceita 2 dígitos |
| **Campo Estado (UF)** | Sim | Não |
| **Distribuição de receita (H.O./Coren/Cofen)** | Sim | Não |
| **Label do status pendente** | "Pendente" | "Verificar" |
| **Instituições** | — | `MUNDIAL EDITORA`, `BOOKPLAY`, `FACULDADE BOOKPLAY`, `FACULDADE PLAY` |

### 1.4 Distribuição de receita `[PP]`

A Pague Play retém **24,96%** do valor recebido; o restante é repasse. Os
percentuais são constantes em `src/lib/index.ts`:

| Fatia | Percentual | Constante |
|---|---:|---|
| H.O. (Honorários Operacionais — fica na Pague Play) | 24,96 % | `PP_HO_PERCENTUAL` |
| Coren | 56,28 % | `PP_COREN_PERCENTUAL` |
| Cofen | 18,76 % | `PP_COFEN_PERCENTUAL` |

#### A meta é PENSADA em H.O. e GRAVADA em bruto

Esta linha dizia "o H.O. é a base de cálculo das metas — não o valor bruto", e
induzia ao erro. O que acontece de fato:

| | |
|---|---|
| `metas.meta_valor` de operador, agosto/2026 | R$ 72.115,38 |
| × `PP_HO_PERCENTUAL` | **R$ 18.000,00** |

O alvo que a operação combina é o H.O. redondo; o que vai para o banco é o
bruto equivalente. Portanto:

- **Comparar `bruto` contra `meta_valor` está correto** — é o que
  `MetaProgressoHeader` e o painel de metas fazem. Comparar o H.O. contra a
  meta gravada faria ninguém bater meta nunca (os primeiros colocados ficariam
  em ~13%).
- A aba Metas lê e grava **em bruto**. Nenhuma tela converte antes de salvar.
- Para **exibir** a meta em H.O., converte-se na hora de mostrar
  (`metaNaUnidade`, em `src/lib/unidadeValor.ts`). É o que o alternador
  H.O./Bruto do dashboard da Pague Play faz.

> **`total_ho` não é derivado da constante.** Ele vem gravado linha a linha
> pelo relatório do ERP, e na prática soma 25,00% do bruto contra os 24,96% da
> constante. Por isso o percentual da meta em H.O. fica ~0,16 ponto acima do
> percentual em bruto — diferença verdadeira, não arredondamento. Use a coluna
> para o recebido; use a constante só para converter meta e agendado, que não
> têm coluna de H.O.

### 1.5 Módulos exclusivos de cada operação

| Módulo | Operação |
|---|---|
| Analítico de recebimentos, Recebimento diário, Metas/quartis, Ouvidoria | `[PP]` (origem) |
| Pix Automático (comissão), Campanha Fácil, Setor alternativo, Clones de equipe, Líder por equipe | `[BP]` (origem) |

> Vários desses módulos foram espelhados para a outra operação depois de
> nascerem em uma delas. O marcador indica a **origem**, não uma exclusividade
> permanente — confira o código antes de assumir que um recurso não existe do
> outro lado.

---

## 2. Perfis, hierarquia e permissões

### 2.1 Os oito perfis

Definidos em `src/lib/index.ts` (`PERFIL_NIVEL`):

| Nível | Perfil | Alcance |
|---:|---|---|
| 1 | **operador** | Apenas os próprios acordos |
| 2 | **ouvidoria** | Herda os gates de líder; foco na aba Ouvidoria `[PP]` |
| 2 | **lider** | Setor próprio (`[BP]`) / toda a empresa (`[PP]`, legado) |
| 3 | **elite** | Como líder, com visões adicionais |
| 4 | **gerencia** | Como líder, escopo gerencial |
| 5 | **diretoria** | Analíticos globais, sem edição |
| 6 | **administrador** | Acesso total dentro da empresa |
| 7 | **super_admin** | Cross-tenant: todas as empresas |

Agrupamentos usados no código:

```ts
PERFIS_LIDER     = ['lider', 'elite', 'gerencia', 'ouvidoria']
PERFIS_ADMIN     = ['administrador', 'super_admin']
PERFIS_DIRETORIA = ['diretoria']
```

`ouvidoria` está dentro de `PERFIS_LIDER` **de propósito** — e o banco espelha
isso em `fn_user_has_any_role` (migration `20260717b`). Os dois lados precisam
ser alterados juntos.

> A fonte da verdade dos níveis é `PERFIL_NIVEL`, em `src/lib/index.ts`. As
> tabelas do `README.md` e do `ARQUITETURA.md` são cópias por conveniência —
> ao mudar um cargo, mude os três no mesmo commit.

### 2.2 Visibilidade de usuários por perfil

```ts
PERFIS_VISAO_SETOR            = ['operador', 'lider', 'elite', 'ouvidoria']
PERFIS_VISAO_EMPRESA_RESTRITA = ['gerencia', 'diretoria']
```

- **Visão de setor**: enxerga só usuários do próprio setor.
- **Visão de empresa restrita**: enxerga todos os usuários da empresa, mas
  limitado ao próprio cargo ou acima.

### 2.3 Permissões configuráveis por cargo

Além do perfil, há um mapa de permissões por cargo em `cargos_permissoes`
(uma linha por `empresa_id` + `cargo`, com um JSON de chaves booleanas),
editável em **Admin → Configurações → Permissões**.

Catálogo completo (`src/pages/AdminCargos.tsx`):

| Grupo | Chave | O que libera |
|---|---|---|
| **Acordos** | `ver_acordos_proprios` | Ver os próprios acordos |
| | `ver_acordos_gerais` | Ver acordos de todos os operadores do setor/empresa |
| | `criar_acordos` | Cadastrar acordos |
| | `editar_acordos` | Editar acordos existentes |
| | `excluir_acordos` | Excluir (mover para lixeira) |
| | `excluir_em_lote` | Excluir vários de uma vez |
| | `importar_excel` | Importação em lote via planilha |
| **Painéis** | `ver_painel_lider` | Painel do líder |
| | `ver_analiticos_setor` | Métricas e KPIs do próprio setor |
| | `ver_analiticos_global` | Métricas de toda a empresa |
| | `ver_todos_setores` | Dados de todos os setores |
| | `gerenciar_metas` | Criar/editar/acompanhar metas |
| | `importar_analitico` | Importar o relatório analítico do ERP |
| | `importar_diario` | Importar o relatório de recebimento diário |
| **Filtros** | `filtrar_por_setor` / `filtrar_por_equipe` / `filtrar_por_usuario` | Habilita cada filtro nas listagens |
| **Gestão** | `ver_usuarios`, `ver_equipes`, `ver_metas`, `ver_operadores` | Acesso de leitura às telas de gestão |
| | `editar_usuarios`, `editar_equipes` | Acesso de escrita |
| **Lixeira & Logs** | `ver_lixeira`, `ver_logs`, `ver_configuracoes` | Lixeira, auditoria e configurações |

### 2.4 Como uma permissão é resolvida

`src/hooks/useCargoPermissoes.ts` → `temPermissao(chave)`:

1. **`administrador` e `super_admin` recebem `true` sempre** — o painel de
   permissões não os limita.
2. Se a chave **existe** no JSON do banco, o valor salvo vale — inclusive
   `false`, que bloqueia.
3. Se a chave **não existe**:
   - chaves da lista `PERMISSOES_LEGADAS_PADRAO_TRUE` → `true`;
   - qualquer outra → `false`.

O passo 3 existe porque essas permissões nasceram "mortas" (declaradas na tela,
nunca consultadas no código). Quando passaram a ser fiscalizadas, o padrão
`true` evitou tirar acesso de quem já tinha. As legadas são:
`ver_acordos_proprios`, `editar_acordos`, `excluir_acordos`, `importar_excel`,
`ver_analiticos_setor`, `gerenciar_metas`, `filtrar_por_setor`,
`filtrar_por_equipe`, `ver_equipes`, `ver_operadores`, `editar_usuarios`,
`editar_equipes`, `ver_logs`.

> ⚠️ **Armadilha do seed.** O seed de permissões usa `ON CONFLICT DO NOTHING`,
> então uma empresa pode terminar com `cargos_permissoes` vazio — e aí toda
> permissão não-legada cai no padrão `false`. Se um cargo inteiro "perdeu"
> acessos numa empresa, verifique primeiro se existe linha na tabela.

> ⚠️ **`ver_logs` não é uma permissão como as outras.** Ela abre a ABA; quem
> decide a LEITURA é o RLS de `logs_sistema` (política `logs_sis_admin`), que
> admite apenas `super_admin` e o cargo legado `administrador`. Conceder
> `ver_logs` a outro cargo não dá acesso: dá uma aba vazia, porque o RLS devolve
> zero linhas e `fn_logs_resumo` — que é `SECURITY INVOKER` — devolve zeros. Sem
> erro na tela.
>
> Foi o que se via até 17/08/2026: dois diretores da PaguePlay com a aba e nada
> dentro dela. O padrão passou a ser **ninguém**, nos dois catálogos (TypeScript
> e SQL), e a política segue sendo o piso. Para abrir a trilha a mais gente,
> mexa nos **dois lados na mesma migration** — o teste
> `src/lib/__tests__/logs-permissao-vs-rls.test.ts` quebra se só um mudar.

### 2.5 Proteção de rotas

`src/components/ProtectedRoute.tsx` combina as duas camadas. Com
`requiredPermissao` informado:

1. admin/super_admin → passa;
2. permissão explicitamente `true` → passa;
3. permissão explicitamente `false` → **bloqueia, mesmo que o cargo permitiria**;
4. permissão ausente no banco → cai no `allowedProfiles` (compatibilidade).

Sem `requiredPermissao`, vale só o cargo — e `super_admin` sempre passa.

Rotas e seus gates (`src/App.tsx`):

| Rota | Cargos | Permissão |
|---|---|---|
| `/acordos/novo` | operador, lider, administrador, elite, gerencia | `criar_acordos` |
| `/acordos/:id/editar` | + diretoria | `editar_acordos` |
| `/acordos/importar` | + diretoria | `importar_excel` |
| `/lider` | lider, administrador, elite, gerencia | `ver_painel_lider` |
| `/admin/usuarios` | lider, administrador, elite, gerencia | `ver_usuarios` |
| `/admin/configuracoes` | administrador | `ver_configuracoes` |
| `/admin/metas` | administrador, lider, elite, gerencia | `ver_metas` |
| `/admin/lixeira` | todos os cargos operacionais | `ver_lixeira` |
| `/diretoria` | diretoria, administrador | — |

> As permissões do frontend controlam **navegação e interface**. Elas não são
> barreira de segurança: quem manda no dado é a RLS (seção 3).

---

## 3. Segurança no banco (RLS)

### 3.1 A regra única de acordos

Toda visibilidade e escrita de acordos passa por **uma função só**,
`fn_pode_gerir_acordo(setor_id, operador_id)` (migration `20260723f`), usada nas
políticas de `SELECT`, `INSERT`, `UPDATE` e `DELETE`. Centralizar impede que as
políticas divirjam entre si.

```
pode gerir o acordo SE:
  é o dono (operador_id = auth.uid())
  OU é super_admin
  OU é administrador
  OU (empresa é PaguePlay  E  cargo = lider)              → PP: líder vê tudo (legado)
  OU (empresa NÃO é PaguePlay  E  (                        → BookPlay e demais
        cargo = diretoria                                  → vê tudo
        OU (cargo ∈ {lider, elite, gerencia}
            E setor do acordo = setor do usuário)          → preso ao próprio setor
     ))
```

### 3.2 Por que é *fail-closed*

A versão anterior (`20260723b`) chaveava pelo **positivo de Book Play**: se
`fn_user_empresa_is_bookplay()` retornasse `false` por qualquer motivo, o
usuário caía no ramo "não-Book Play → líder vê tudo". Uma falha de detecção
virava **mais** acesso.

A versão atual inverte: chaveia pelo positivo de **Pague Play**. Qualquer
empresa não identificada cai no ramo restritivo. Falha de detecção agora custa
**menos** acesso, nunca mais.

> **Dependência crítica.** A listagem lê da view `acordos_deduplicados`. A RLS
> acima só tem efeito porque a view é `security_invoker` (migration
> `20260723d`). Sem essa flag a view roda como dona e **ignora todas as
> políticas** acima.

### 3.3 Consequências práticas

Duas políticas causam a maior parte dos comportamentos "estranhos" para o
operador — e ambas são intencionais:

- **`acordos_select` fail-closed**: um operador só enxerga os próprios acordos.
  Nenhuma tela do operador consegue ler o acordo de outro operador para agir
  sobre ele.
- **`perfis_select`** (`step4_fix_rls_recursion`): um operador só lê a **própria
  linha** de perfil. Ou seja: o cliente não consegue nem descobrir a situação de
  outro usuário.

**Padrão obrigatório daí em diante:** toda operação que precisa agir sobre o
acordo ou o perfil de outra pessoa passa por uma **RPC `SECURITY DEFINER`**, com
a autorização verificada no servidor. Fazer `select`/`update` direto na tabela
falha silenciosamente sob a RLS.

### 3.4 Autorização de líder — como o token viaja

Quando um operador precisa de autorização superior, `autorizarLider` autentica o
líder por `fetch` direto no endpoint do GoTrue — **sem trocar a sessão do
operador logado** (`src/services/autorizacao_lider.service.ts`). Aceita usuário
ou e-mail (resolvendo o usuário via RPC, igual ao login) e valida o cargo contra
`isPerfilAdminOuLider`.

> 🔒 **Regra de segurança que não pode ser afrouxada.** A autorização viaja como
> **JWT do líder** (`Authorization: Bearer <token>`), nunca como um id de líder
> em parâmetro. Passar o id permitiria a qualquer operador informar um UUID de
> líder conhecido e pular a senha inteira.

---

## 4. Setores

Setores padrão criados no seed (`src/services/setores.service.ts`): `Em dia`,
`Play 1` … `Play 6`.

Cada perfil tem `setor_id`. O acordo carimba `setor_id` na criação, a partir do
setor do operador — acordos legados podem ter `setor_id` nulo, e nesse caso a
RLS cai no setor do operador dono.

### 4.0 Quem NÃO pertence a setor nenhum

**Diretoria, administrador e super_admin pertencem à empresa, não a um setor.**
`setor_id` e `equipe_id` são sempre nulos para esses três cargos
(migration `20260817160000`).

Sustentado em três frentes, que precisam concordar:

| Onde | O quê |
|---|---|
| `PERFIS_ESCOPO_EMPRESA` (`src/lib/index.ts`) | a lista, lida pelo formulário de usuários para esconder o campo Setor |
| `fn_perfis_escopo_empresa` | gatilho `BEFORE INSERT OR UPDATE` que zera os dois campos na gravação |
| `perfis_cupula_sem_vinculo` | `CHECK` que recusa a linha se o gatilho for derrubado |

O gatilho se chama `a_trg_perfis_escopo_empresa`: gatilhos do mesmo tipo disparam
em ordem alfabética, e o prefixo garante que o vínculo é normalizado antes de
`trg_impedir_escalada_de_cargo` julgar um valor que seria descartado.

> **Por que isso não é cosmético.** Duas telas resolviam o setor com
> `setorId ?? perfil?.setor_id`. O componente pai passava `null` querendo dizer
> "todos os setores", o `??` caía no setor de preenchimento — que o formulário de
> criação escolhia sozinho, o primeiro da lista — e a **diretoria via um setor
> só**. Em Quartis, a opção "Todos os setores" voltava calada para um setor. Com
> `setor_id` nulo o `??` não tem para onde cair.

Rebaixar alguém de cúpula para líder **não** devolve setor: a pessoa fica sem
vínculo e precisa de uma transferência explícita (aba Setores). Adivinhar um
setor no rebaixamento reintroduziria o valor de preenchimento.

### 4.1 Setor alternativo `[BP]`

Flag `setores.alternativo` (migration `20260724a`). Ela muda **como o acumulado
do setor é calculado**:

| Tipo | Total do setor |
|---|---|
| **Normal** | Total do **relatório analítico** importado — a soma de todas as linhas carimbadas com aquele `setor_id`. Clones **não** afetam o total. |
| **Alternativo** | Soma dos **usuários que pertencem a ele** (membros + clonados nas equipes dele). |

O caso que originou a flag é o "Digital Amauri": um setor sem relatório próprio,
que recebe via clones de operadores do Play 4 / Play 5. Somar o relatório daria
zero.

A migration só adiciona a flag; as duas agregações vivem no frontend
(`DesempenhoEquipes`, `AnaliticoLider`).

### 4.2 Foto do setor

`setores.foto_url` (migration `20260725a`), exibida nos painéis.

---

## 5. Equipes, líderes e clones

### 5.1 Equipe do operador

Vínculo simples: `perfis.equipe_id`. Cada operador pertence a uma equipe.

### 5.2 Líder por equipe `[BP]`

Migration `20260725b`, tabela `equipe_lideres`. **Mudança de modelo:** o líder
deixou de "morar" numa equipe via `perfis.equipe_id`. Agora **a equipe declara
quem a lidera**.

- Uma equipe pode ter **vários** líderes.
- Um líder pode liderar **várias** equipes — inclusive de outros setores.
- Restrição: `UNIQUE (equipe_id, lider_id)`.
- Leitura liberada a qualquer usuário da empresa (os painéis exibem os líderes
  para todos).

### 5.3 Clones de operador em equipe `[BP]`

Tabela `equipe_operadores_clones`. O operador **continua** na equipe original
(`perfis.equipe_id`) e passa a contar **também** nas equipes em que foi clonado.

- O recebimento do analítico **soma em todas** as equipes onde ele aparece.
- `conta_recebimento` (migration `20260723e`, padrão `true`): quando `false`, o
  recebimento daquele clone **não** conta para aquela equipe nem para o setor
  dela. Serve para clonar alguém só para efeito de visualização.
- Uma equipe pode ser formada **apenas por clones** — por isso o filtro por
  equipe em `acordos.service.ts` resolve membros **e** clones. Sem isso, essas
  equipes retornariam lista vazia.

### 5.4 Tolerância a migration ausente

`equipesClones.service.ts` e `equipesLideres.service.ts` retornam `null`/`false`
quando a tabela não existe, e a interface simplesmente esconde o recurso. É
proposital: permite subir o frontend antes da migration, sem quebrar a tela.

---

## 6. Situação do usuário: ativo, férias, desligado

Migration `20260723c`. Coluna `perfis.situacao`, independente de `perfis.ativo`.

| Situação | Loga? | Ranking / quartil | Recebimento conta? |
|---|:---:|:---:|:---:|
| **ativo** | sim | aparece | sim |
| **ferias** | **sim** | **some** | **sim** |
| **desligado** | **não** | some | sim (mês corrente) |

Pontos que costumam confundir:

- **`ativo` continua sendo o gate de login.** Desligar zera `ativo`; férias
  **não** mexe em `ativo` — a pessoa continua acessando normalmente.
- **O recebimento nunca é filtrado.** Férias e desligado somem de ranking e
  quartil (filtro aplicado na aplicação, a partir de `situacao != 'ativo'`), mas
  os totais de setor e equipe seguem **inteiros**. Tirar o valor deles do total
  faria a soma do setor não bater com o relatório.
- **Arquivamento.** Desligado no mês corrente continua visível. Desligado de mês
  anterior vira `arquivado` e some das listas padrão. Sem `pg_cron`: a aplicação
  chama `fn_arquivar_desligados_anteriores` ao abrir a aba Usuários.

### 6.1 Desligamento libera os acordos

Regra de negócio (2026-07-28): **acordo de quem saiu da empresa não deve virar
vínculo de ninguém — deve mudar de dono.**

Ao marcar alguém como desligado (`situacaoUsuario.service.ts`):

1. `ativo = false`, `desligado_em = now` — o login é bloqueado;
2. `liberarVinculosDeDesligado` dissolve os pareamentos Direto/Extra dele,
   promovendo o parceiro EXTRA ativo a DIRETO e transferindo o NR.

O passo 2 é *best-effort* e roda **depois** do update: se falhar, o
desligamento em si continua valendo. **Reverter o desligamento não refaz os
pareamentos** — eles são desfeitos em definitivo.

E na tabulação (seção 7.3): quem tentar tabular um NR/Código de um desligado
assume o acordo **sem pedir autorização de liderança**.

---

## 7. Tabulação de acordos

### 7.1 A chave única: `nr_registros`

`nr_registros` é a **fonte da verdade** de qual operador detém cada NR/Código —
uma tabela dedicada, em vez de varrer `acordos` a cada verificação.

| Coluna | Conteúdo |
|---|---|
| `nr_value` | O NR (`[BP]`) ou o Código (`[PP]`) |
| `campo` | `nr_cliente` `[BP]` ou `instituicao` `[PP]` |
| `operador_id` / `operador_nome` | Quem detém o vínculo |
| `acordo_id` | O acordo ativo que ocupa esse NR |

Unicidade: `(empresa_id, nr_value, campo)`. Operações em
`nr_registros.service.ts`: `verificarNrRegistro`, `registrarNr`, `transferirNr`,
`liberarNr`, `liberarNrPorAcordoId`, `verificarNrsEmLote` (importação).

O registro é **liberado** quando o acordo é excluído ou marcado como `nao_pago`.

#### A trava vive no banco, não no navegador (migration `20260809d`)

Até 2026-08-09 a regra inteira era do cliente, e o banco **ajudava a furá-la**:
o trigger resolvia conflito com `ON CONFLICT DO UPDATE`, ou seja, o segundo
DIRETO a chegar simplesmente roubava o registro do primeiro, em silêncio.
Bastava a janela entre a consulta e o INSERT — dois operadores tabulando o mesmo
NR nos mesmos segundos consultam antes de qualquer um gravar, e os dois veem
"livre". Foi assim que dois operadores **sem** a lógica Direto/Extra tabularam
o mesmo acordo.

Hoje o trigger **recusa** (`RAISE EXCEPTION NR_JA_REGISTRADO`) quando o NR já
pertence a outro operador. Três detalhes que fazem isso conviver com o que já
existia:

- **mesmo operador continua re-apontando** o próprio NR — é o que mantém o
  parcelamento no mesmo grupo funcionando (seção 9.3);
- **registro órfão não trava ninguém**: só há conflito se o acordo daquele
  registro ainda existir;
- os fluxos que **legitimamente** trocam o dono (autorização de líder, CASO B,
  dono desligado) liberam o NR **antes** de inserir — por `DELETE` do acordo ou
  por `fn_converter_para_extra` — então passam sem alteração.

A checagem do cliente continua existindo: é ela que dá a mensagem boa e abre o
fluxo de autorização. Ela deixou de ser a única — e **passou a falhar fechado**:
erro na consulta agora bloqueia o salvamento em vez de tratar como "NR livre".

#### Uma chave por acordo (migration `20260810b`)

A `20260809d` registrava `nr_cliente` **e** `instituicao` como chaves, em toda
empresa. Na BookPlay `instituicao` não é código: é um `<Select>` de lista fixa
(BOOKPLAY, MUNDIAL EDITORA…), uma **categoria** repetida em todo acordo. Com a
trava ativa, o primeiro operador que salvou virou dono da string `"BOOKPLAY"`
para a empresa inteira, e todo mundo depois levou

> `NR_JA_REGISTRADO: o Código "BOOKPLAY" já está tabulado por <fulano>.`

ao cadastrar, ao editar e ao adicionar parcela — a parcela nova copia
`instituicao` do acordo pai.

A regra passou a ser **uma chave só por acordo** (`fn_nr_campo_chave`), a mesma
que a `fn_sync_par_vinculo` já usava:

| Tem `nr_cliente`? | Chave | Tenant |
|---|---|---|
| sim | `nr_cliente` | BookPlay |
| não | `instituicao` | PaguePlay — lá a instituição **é** o código |

> ⚠️ Isto é um **remendo por inferência**, não a regra certa. As duas colunas
> significam coisas diferentes em cada empresa, e o banco não tem como saber
> qual é qual — foi essa conflação que causou este bug e o do CPF antes dele.
> A origem, o custo já pago e o caminho de saída estão em
> [DIVIDA-TECNICA.md § 1](./DIVIDA-TECNICA.md#1-urgente-as-colunas-nr_cliente-e-instituicao-significam-coisas-diferentes-em-cada-empresa).
> **Leia antes de escrever código novo que toque `instituicao` ou `nr_cliente`.**

A mesma migration fechou três buracos do branch UPDATE, que só reagia a status e
a mudança de valor do NR:

- **DIRETO → EXTRA** não liberava o registro (o NR ficava travado num acordo que
  já não era DIRETO);
- **EXTRA → DIRETO** não reivindicava o registro (o novo DIRETO ficava sem
  titularidade e o NR seguia livre para um terceiro tomar);
- **troca de operador** (transferência) não movia o registro.

E **parcela do mesmo `acordo_grupo_id` não conflita**: o acordo pai já é dono do
NR, a linha nova não muda titularidade nenhuma, logo não há o que autorizar.

O cliente **não** escreve mais em `nr_registros` ao editar. O trigger grava a
titularidade dentro da mesma transação do UPDATE, com a checagem de dono junto;
o `registrarNr` que rodava depois passava por fora dessa checagem
(`onConflict → overwrite`) e reabria pelo navegador exatamente o roubo
silencioso que a `20260809d` tinha fechado no banco.

### 7.2 Status e tipos

| Status | Rótulo `[BP]` | Rótulo `[PP]` |
|---|---|---|
| `verificar_pendente` | Verificar | Pendente |
| `pago` | Pago | Pago |
| `nao_pago` | Não Pago | Não Pago |

Um acordo é **atrasado** quando o vencimento passou e o status ainda não é
`pago` nem `nao_pago` (`isAtrasado`). A data usa timezone `America/Sao_Paulo`
(`getTodayISO`) — não UTC, para o "hoje" não virar antes da meia-noite local.

### 7.3 O fluxo de conflito — ordem exata das decisões

Ao salvar um acordo, se o NR/Código mudou, o sistema consulta `nr_registros`.
Sem conflito, salva direto. **Com** conflito, a decisão sai de
`decidirConflitoNr` (`src/services/conflitoNr.service.ts`) — uma função pura,
usada por **todas** as telas que gravam. A escada vivia copiada em
`AcordoForm` e `AcordoNovoInline`, e faltava inteira na edição, que parava num
toast de "não é possível duplicar" mesmo quando a lógica do dono liberava o
caminho. A ordem:

```
1. O NR já é MEU?
   → erro: "já existe na sua lista de acordos ativos". Fim.

2. O dono está DESLIGADO?
   → assumo como DIRETO, sem autorização de líder.
     O acordo antigo vai pra lixeira e some da lista dele. Fim.

3. O acordo do dono JÁ TEM um EXTRA vinculado?
   → modo 'troca_extra': exige autorização de líder para substituir o extra atual.

4. Direto/Extra — quem tem a lógica ativa?
   CASO A  eu tenho, o dono não  → eu = EXTRA, dono continua DIRETO (sem autorização)
   CASO B  eu não tenho, o dono tem → aviso; ao confirmar eu = DIRETO e o dono cai para EXTRA
   CASO C/D ambos ou nenhum têm  → autorização completa de líder
```

O passo 2 vem **antes** das regras de Direto/Extra de propósito — é a diferença
entre "mudar de dono" e "criar um vínculo com quem não trabalha mais aqui".
O passo 3 vem antes do CASO A pelo mesmo motivo: tirar o lugar de um terceiro
passa por líder, mesmo de quem tem a lógica ativa.

#### Onde a escada roda

Existem **dois** componentes que gravam acordo, e é só isso:

| Componente | Usado por | Alcança o conflito? |
|---|---|---|
| `AcordoNovoInline` | lista de Acordos, Dashboard, `/acordos/novo` | sim — chave digitada no cadastro |
| `AcordoEditInline` | lista de Acordos, `/acordos/:id/editar` | sim `[PP]` (campo Código). `[BP]` não: o NR se define na criação e não muda depois |
| Adicionar parcela (`parcelas.service`) | — | não, por desenho — parcela do mesmo grupo herda o NR e o dono do acordo pai |

`src/pages/AcordoForm` **não tem formulário**: é a moldura de página (cabeçalho,
voltar, carregar o acordo) em volta desses dois. Até 2026-08-10 ele carregava a
própria implementação de tudo — dois formulários por tenant, schemas zod
próprios e uma cópia da escada — e as cópias divergiram: a autenticação de líder
de lá barrava elite, gerência e diretoria, e a checagem de NR rodava mesmo
quando o Código não tinha mudado.

Sobre o NR da BookPlay: ele foi removido da interface em `58616fa` (LGPD) junto
com o CPF, porque a coluna `nr_cliente` guardava **os dois** — CPF na PaguePlay,
NR na BookPlay. Em `8da2afe` o NR voltou só para a BookPlay, onde não é dado
pessoal. Hoje ele é **obrigatório na criação** e **imutável na edição**.

### 7.4 Transferência no servidor

Migration `20260728a`, duas funções `SECURITY DEFINER`:

- **`fn_situacao_operador(p_operador_id)`** — devolve apenas a situação,
  escopada por empresa. Necessária porque a RLS de `perfis` impede o operador de
  ler o perfil alheio.
- **`fn_transferir_acordo_nr(p_acordo_id, p_novo_operador_id, p_motivo)`** —
  faz lixeira + delete + log **em uma transação**, com a autorização decidida no
  servidor:

```
Base A — "dono_desligado": o dono está desligado E quem chama está assumindo para si.
Base B — "lider":          quem chama é lider/elite/gerencia/diretoria/administrador/
                           super_admin na empresa do acordo (ou super_admin global).
Sem nenhuma das duas → recusa.
```

Quando existe token de líder, o cliente chama a RPC por `fetch` com o
`Authorization: Bearer <token do líder>`, **sem** trocar a sessão do operador.

### 7.5 Autorização por solicitação (migration `20260818180000`)

**O líder não vai mais até a máquina do operador.** Ao tentar registrar um
NR/Código já vinculado, a janela de bloqueio traz um botão — **Solicitar
autorização** — no lugar dos campos de usuário e senha.

```
operador clica em Solicitar
  → linha em `autorizacoes_pedidos` com o PAYLOAD do acordo
  → notificação para quem pode decidir
  → a janela FECHA e o operador volta ao trabalho
  → líder decide pela gaveta (canto inferior direito, em qualquer tela)
  → aprovado: o SERVIDOR move o acordo antigo para a lixeira, transfere o NR,
    cria o acordo do solicitante e notifica os dois lados
```

| Decisão | Por quê |
|---|---|
| A execução é do **servidor**, não da tela | o operador já fechou a janela. Se a criação dependesse da tela estar viva, aprovar não faria nada e ele receberia "autorizado" sem acordo |
| O pedido carrega o **payload inteiro** | é o mesmo objeto que o navegador inseriria. `operador_id` e `empresa_id` são reescritos no servidor: payload vem do cliente, e cliente não decide de quem é o acordo |
| `fn_transferir_acordo_nr` é **reusada** | ela lê `auth.uid()`, que na aprovação é o líder — o autorizador certo vai para a lixeira e para o log sem esforço. Copiá-la criaria um segundo caminho de transferência |
| `SELECT … FOR UPDATE` na decisão | a notificação chega para todos juntos; dois líderes clicando ao mesmo tempo é o caso **normal**. O segundo recebe `ja_decidido` com o nome de quem chegou antes |
| Expira em **24 h** | pedido de ontem não pode virar acordo hoje. Verificado na decisão, não por trabalho agendado — sem janela entre expirar e alguém reparar |
| Pedido repetido **não vira fila** | o mesmo operador pedindo o mesmo NR recebe o pedido que já existe. Sem isso, cada clique nervoso criaria um órfão que executaria sobre um acordo já apagado |

**Quem decide** são os mesmos seis cargos de `PERFIS_AUTORIZADORES` — nenhum
poder novo, nenhum perdido. O **recorte** é que muda: líder, elite e gerência
veem os pedidos dos **setores do solicitante**; diretoria, administrador e
super_admin veem a empresa. A regra vive em `fn_pode_autorizar_pedido`, usada
pela policy **e** pelas duas RPCs — uma cópia só.

**Setores, no plural: o clone conta** (migration `20260818200000`). Um operador
emprestado a uma equipe de outro setor (`equipe_operadores_clones`) é
supervisionado também pelo líder de lá, e o pedido dele chega aos dois. Na
PaguePlay isso não é exceção: quase todo o setor *Amauri Digital* é formado por
clones do Play 4 e do Play 5, e sem isso nenhum pedido deles chegava ao líder
de lá.

Os setores vão **congelados na linha** (`setores_escopo`), pela mesma razão de
`setor_id` já ir: é o que decide quem vê o pedido, e ler os clones de agora
faria um pedido de ontem mudar de dono quando alguém entra ou sai de uma equipe
emprestada. `conta_recebimento` **não** entra no filtro — ele decide de quem é
o dinheiro, e aqui a pergunta é de supervisão.

> A regra "setor próprio + setores onde é clone" **não foi reescrita**:
> `fn_setores_do_operador(uuid)` já existia desde `20260731e_comemoracoes.sql`,
> onde decide na tela de quem a comemoração explode. A autorização passou a usar
> a mesma. Continua havendo a versão em TypeScript (`setoresDoOperador`), que
> agrega recebimento em memória — mudou a regra de clone, mudam as duas.

**A gaveta zera na virada do dia.** Aprovado e recusado **ficam na lista o dia
inteiro** — é o registro de que aquilo já foi resolvido e por quem, e é o que
impede duas pessoas de perguntarem a mesma coisa. À meia-noite eles somem e a
lista amanhece só com os pendentes.

Quem apaga é `fn_autorizacao_faxina`, agendada para 00:05 (São Paulo) — **não** a
tela. Um filtro por data no frontend seria uma segunda régua para a mesma coisa,
e as duas divergiriam no primeiro ajuste de horário.

| Passo | O que faz |
|---|---|
| pendente **vencido** vira `cancelado` | não é "limpar pendente": com `expira_em` no passado ele já não pode ser aprovado. Sem isso ficaria na tabela para sempre, porque o que o marcava era alguém **tentar** decidi-lo |
| decidido **antes de hoje** é apagado | o corte é a meia-noite de São Paulo, não "agora menos 24 h": quem recusou às 23h59 vê o próprio trabalho até a virada, em vez de a linha sumir um minuto depois |

> O corte é `timestamptz`, não `date`. Comparar `decidido_em < <date>` faria o
> PostgreSQL converter a data no fuso do **servidor** (UTC), e meia-noite em São
> Paulo é 03:00 UTC — o corte sairia três horas fora do lugar, e o que foi
> decidido entre 21h e 24h sobreviveria um dia a mais.

O histórico de longo prazo fica em `logs_sistema`, que registra **a aprovação e
a recusa** e guarda 730 dias. Registrar a recusa foi consequência direta desta
faxina: antes só a aprovação ia para a trilha, e apagar a linha levaria junto a
única memória de que alguém recusou.

**Aprovar não tem desfazer**, e a gaveta diz isso: o botão exige uma segunda
confirmação na própria linha, com o nome de quem perde o acordo escrito nela.
A decisão fica visível para todos os outros autorizadores ("Autorizado por
Fulano"), que é o que impede duas pessoas de decidirem a mesma coisa.

> **A tela de EDIÇÃO continua pedindo senha.** Lá o que se grava é um `update`
> com o recálculo de parcelamento que `gravar()` faz (regra dos 40 %, entrada,
> `valor_total`). Reproduzir isso no servidor criaria um segundo caminho de
> gravação de acordo, para divergir do primeiro no primeiro ajuste. Enquanto
> aquele recálculo não sair de dentro do componente, editar um acordo para um
> NR já vinculado exige o líder na máquina — é o único caminho que ainda pede.
> Ver `ModalAutorizacaoNRSenha.tsx`.

---

## 8. Direto e Extra

### 8.1 O que a lógica faz

Quando ativa para um operador, ele pode tabular um NR/Código **já tabulado por
outro** — o acordo novo entra como **EXTRA**, e o bloqueio por autorização de
líder é dispensado.

### 8.2 Ativação em três escopos

Tabela `direto_extra_config`. Resolução em cascata
(`resolverDiretoExtraAtivo`), **do mais específico para o mais geral**:

1. config de escopo `usuario` para esse usuário → decide (ativo **ou** inativo);
2. senão, config de escopo `equipe` para a equipe dele → decide;
3. senão, config de escopo `setor` para o setor dele → decide;
4. senão → **inativo**.

Uma config de nível mais específico **vence** as de cima, inclusive para
desativar. Ex.: setor ativo + usuário inativo = usuário inativo.

**Gravar um escopo amplo alinha as exceções que o contradizem** (migration
`20260818220000`, RPC `fn_direto_extra_definir`). Ligar a equipe apaga as
configs de `usuario` **desligadas** dela; desligar apaga as **ligadas**. Só o
que contradiz é tocado. Para o setor, o mesmo um nível acima: alcança as
equipes e as pessoas dentro delas, inclusive quem está ali como clone.

> **O relato que originou isso:** "ativei a lógica para a equipe Atendimento
> 0800, que tem 4 pessoas, e só pegou para 1". Não era aleatório — era a única
> sem config de `usuario`. As outras três tinham uma, desligada, de semanas
> antes, e o mais específico vencia em silêncio.

A cascata **não mudou**. O que mudou é que um ato explícito do administrador
sobre o escopo amplo deixa de ser anulado por uma decisão antiga de que ninguém
se lembra. A exceção continua possível, na ordem que a pessoa espera: liga a
equipe, depois desliga quem não deve ter. O que não sobrevive é a exceção
anterior ao ato — e a tela diz quantas foram alinhadas, em vez de deixar o
administrador descobrir sozinho.

A escrita é atômica de propósito: em duas chamadas haveria uma janela com a
equipe ligada e as exceções ainda valendo.

Consulta pelo servidor: `fn_direto_extra_ativo` (`SECURITY DEFINER`), com
fallback para query direta caso a RPC não exista.

### 8.3 Combinações na tabulação

| Eu tenho | Dono tem | Resultado |
|:---:|:---:|---|
| ✅ | ❌ | **Caso A** — eu = EXTRA, dono segue DIRETO. Sem autorização. Dono é notificado. |
| ❌ | ✅ | **Caso B** — aviso; confirmando, eu = DIRETO e o dono é rebaixado a EXTRA. |
| ✅ | ✅ | **Caso C** — autorização de líder. |
| ❌ | ❌ | **Caso D** — autorização de líder. |

O par é materializado em `acordos`: `tipo_vinculo` (`direto`/`extra`) mais
`vinculo_operador_id` / `vinculo_operador_nome` apontando para o outro lado.

---

## 9. Exclusão, lixeira e parcelas

### 9.1 Quebra do par ao excluir

`src/services/tratarExclusaoVinculo.ts`. **Deve ser chamado ANTES** do delete do
acordo, porque usa os dados dele para achar o par.

| Excluído | Efeito no outro lado |
|---|---|
| **DIRETO** | O EXTRA é **promovido a DIRETO** (`vinculo_operador_* = null`), o `nr_registros` é transferido para ele, e ele é notificado. |
| **EXTRA** | O DIRETO apenas perde a referência ao extra. Nada muda em `nr_registros` — ele já era o titular. |
| sem par | *no-op* |

> As notificações são emitidas em `try/catch`. Sem isso, uma falha ao notificar
> voltaria como erro para um chamador que **já apagou o acordo** — e a
> substituição nunca seria gravada.

### 9.2 Lixeira

Tabela `lixeira_acordos`, retenção padrão de **3 dias**. Guarda o snapshot
completo (`dados_completos` JSONB) mais o rastro de autoria:

- `motivo`: `exclusao_manual` ou `transferencia_nr`;
- `autorizado_por_id` / `autorizado_por_nome`: o líder que autorizou;
- `transferido_para_id` / `transferido_para_nome`: o novo operador.

### 9.3 Parcelas no mesmo NR

`parcelas.service.ts`. Caso que originou o serviço (Book Play, 2026-07-08): o
cliente pagou a entrada no Pix e o restante virou boleto para outra data. O
acordo da entrada já ocupava o NR, e a segunda tabulação era bloqueada sem
alternativa.

A parcela nova entra no **mesmo `acordo_grupo_id`** do acordo existente. O
trigger `trg_sync_nr_registros` apenas re-aponta `nr_registros` para a linha
nova — sem conflito. Duas portas de entrada: a tabulação bloqueada por NR
próprio (`AcordoNovoInline`) e o botão "Adicionar parcela" no detalhe.

---

## 10. Analítico de recebimentos

Tabela `analitico_recebimentos`, alimentada pelo relatório do ERP.

### 10.1 Importação

**Merge incremental**: reimportar o mesmo mês não duplica. Cada lote recebe um
`lote_id` e o `importado_por_id`.

Operadores são resolvidos por *match* automático do nome de usuário
(case-insensitive), com vínculo manual para o que não casar. Linhas de operador
não encontrado podem ser removidas individualmente ou em lote.

**Um login, um operador (migration `20260809b`).** O resumo
(`fn_analitico_resumo_por_operador`) agrupa pelo **perfil**, não pela grafia do
`operador_usuario` — duas grafias do mesmo login no arquivo (caixa diferente, um
espaço a mais) partiam o mesmo operador em duas linhas, cada uma com um pedaço
do dinheiro. O login volta como `MIN(...)`, só para exibição.

**`super_admin` não é operador.** Ele é conta de administração: ficou fora do
resumo, do ranking e das somas de equipe/setor que saem dali. A mesma migration
devolveu ao perfil dono do login as linhas que estavam presas a um `super_admin`
— sem isso o mesmo recebimento aparecia repartido entre dois "Kauan", em equipes
diferentes, e nenhuma das duas linhas era o total da pessoa.

### 10.2 Status de tabulação

Cruzamento entre o relatório e a tabela `acordos` — pelo campo `instituicao`
`[PP]` ou `nr_cliente` `[BP]`, considerando apenas acordos `tipo_vinculo =
'direto'`:

| Status | Significado |
|---|---|
| `nao_tabulado` | Nenhum acordo com esse código |
| `tabulado` | Existe acordo **do mesmo operador** |
| `divergente` | Existe acordo **de outro operador** |

Resolver um `divergente` remove o acordo do outro operador (via lixeira),
notifica e registra em log.

### 10.3 Totais

O total do setor depende da flag `alternativo` — ver seção 4.1. A meta usa o
**valor TOTAL**, e o H.O. é a base do cálculo em `[PP]` (seção 1.4).

> **Nota de conciliação conhecida:** o total recebido no analítico `[PP]` bate
> com o total do recebimento diário, mas o ERP **não credita Coren nem
> indireto** no analítico. Ao comparar as duas telas, essa é a diferença
> esperada.

---

## 11. Recebimento diário

Tabela `diario_recebimentos`. Diferente do analítico, **não** há vínculo com
acordos tabulados — é uma lista informativa por operador.

### 11.1 O relatório

Colunas relevantes: `Data`, `Id.Baixa`, `Cód.Cliente`, `Profissional`,
`Cód.Acordo`, `Parcela`, `Forma Pgto`, `Valor Recebido`, `Operador`,
`Próx. Contato`, `Tabulação`.

**Dedupe entre importações do dia:** `Id.Baixa` quando existe; senão a chave
composta `codigo|acordo|forma|valor|data`.

**Linhas sem Operador** são descartadas — exceto em `[PP]`, onde entram com
operador vazio (sem vínculo) e somam no consolidado do setor. O **rodapé de
totais** do relatório é sempre descartado: identificado por não ter operador
**nem** nenhuma identificação (cliente, código, acordo, forma ou data).

### 11.2 Cód.Cliente substituiu o CPF

Mudança de 2026-07-28, **por ordem da diretoria: nenhum CPF de cliente
permanece no projeto.**

- A coluna `CPF` do relatório existe e é **ignorada de propósito**.
- A identificação passou a ser `Cód.Cliente` (coluna F), gravada em
  `diario_recebimentos.cliente_codigo`, **apenas dígitos** — o ERP exporta com
  separador de milhar (o relatório de 28/07 veio com vírgula: `2,651,454`;
  outras exportações usam ponto). `soDigitos()` cobre os dois.
- Migration `20260728b` removeu `diario_recebimentos.cpf` e `profissionais.cpf`,
  e termina com um bloco que **falha alto** (`RAISE EXCEPTION`) se sobrar
  qualquer coluna com `cpf` no schema `public`.
- Relatórios antigos, sem a coluna, continuam importáveis — apenas ficam sem
  código.

> **Por que isso importa além da privacidade:** o `Cód.Cliente` é o **mesmo
> código usado na tabulação dos operadores**. Existe o índice
> `idx_diario_cliente_codigo (empresa_id, cliente_codigo)` pensado para o
> cruzamento entre recebimento diário e acordos tabulados. Há teste garantindo
> que `Cód.Cliente` não seja confundido com `Cód.Acordo` na resolução de
> colunas — se trocassem, esse cruzamento sairia errado **em silêncio**.

### 11.3 Atribuição do dia

O valor é atribuído ao **`dia_referencia`** da linha, e o dia de referência do
lote é a **moda** das datas de pagamento (o dia mais frequente do arquivo). Ou
seja: "recebido no dia" conta pela data do recebimento no relatório, **não** pela
data em que alguém tabulou.

### 11.4 Acordo ignorado

`Próx. Contato ≤ dia de referência` → a linha é considerada **ignorada** e fica
fora dos totais e das listas. A leitura é: se já existe um próximo contato
marcado para antes ou no próprio dia do pagamento, aquele acordo não fechou.

### 11.5 Regra do relatório mensal

`diarioMensalGuard.ts`. O ERP exporta o diário com o mês inteiro **ou** só com o
dia, à escolha de quem exporta. Para nenhum valor quebrado passar despercebido:

- o **primeiro** relatório importado a cada dia precisa ser o **mensal**
  (multi-dia) — a reconciliação realinha os dias anteriores;
- depois disso, relatórios de 1 dia ficam liberados até o dia seguinte;
- **"Limpar dia"** e **"Limpar tudo"** derrubam a marca: a próxima importação
  volta a exigir o mensal.

A marca fica no `localStorage`, por empresa + dia. Outro navegador ou usuário
não a herda e **também** exigirá o mensal — bloqueio a mais, nunca a menos.

### 11.6 Visões

`AbaDiario` roteia por cargo: líder+ vê a visão geral com importação; o operador
vê só a própria lista (RLS + visão própria).

A tag **"Tabular Acordo Fechado"** marca acordo pago sem tabulação de "acordo
fechado". Aparece nas **duas** visões — a do líder e a do próprio operador.

---

## 12. Metas, dias úteis e quartis

### 12.1 Dias úteis

`src/lib/diasUteis.ts`. Dia útil = **segunda a sexta**, menos os feriados
cadastrados em `metas_config_mes.feriados`. Feriado que cai em fim de semana
**não** subtrai (já não era dia útil).

Equipes de treinamento têm `inicioISO`: contam só a partir daquela data.

### 12.2 Projeção e quartil

```
meta diária    = meta mensal ÷ dias úteis do mês
esperado hoje  = meta diária × dias úteis decorridos
```

Os dias úteis decorridos **incluem o dia atual**, porque o analítico do dia
chega ao longo do dia. Há a flag `contar_dia_atual` em `metas_config_mes`
(migration `20260714a`) para quem quiser o contrário — padrão: não contar.

O **quartil** é a faixa configurada cuja porcentagem mínima a projeção alcança.
Feriados e quartis são configurados por empresa/mês/ano.

### 12.2.1 Painel do Líder — o recorte é um só para as três abas

Desempenho Equipes, Quartis e Gráfico recebem `setorId` e `equipeId` prontos de
`resolverEscopoPainel` (`src/pages/Dashboard/Analitico/escopoDoPainel.ts`).
**`setorId` nulo significa "todos os setores"** e nenhum componente filho
completa esse valor.

Quem enxerga mais de um setor — decidido por `veTodosOsSetores`, a mesma função
do dashboard — ganha os seletores no cabeçalho do painel. Quem não enxerga fica
travado no próprio setor e não vê seletor de setor.

Quatro defeitos que existiam, todos da mesma pergunta respondida em quatro
lugares:

| Onde | O que acontecia |
|---|---|
| `DesempenhoEquipes` | `setorId ?? perfil?.setor_id` — diretoria via um setor só |
| `QuartisOperadores` | "Todos os setores" gravava `''`, e `filtroSetor \|\| setorProprio` voltava ao setor da pessoa |
| `QuartisOperadores` | lista de cargos escrita à mão: gerência com `ver_todos_setores` via tudo sem ganhar seletor |
| `GraficoRecebimento` | sem filtro; e o escopo virava `null` sem setor, caindo na regra própria que divergia do card em R$ 1.933,21 |

Trocar o setor descarta a equipe escolhida: uma equipe de outro setor devolveria
lista vazia, parecendo "não há ninguém" quando o filtro é que era impossível.

### 12.2.2 Card expansível de equipe/setor

Cada card de Desempenho Equipes abre no clique. As contas vivem em
`desempenhoEquipe.ts`, testadas à parte:

- **degraus de quartil** — quanto falta para **cada** faixa acima, não só a
  próxima (`degrausQuartis` em `lib/projecaoMetas.ts`). Quem está no 4º precisa
  ver o 3º, o 2º e o 1º;
- **ritmo** — a diária necessária no que **resta** do mês (sobe quando a equipe
  atrasa, ao contrário da "diária p/ meta", que divide pelo mês inteiro) e onde
  o mês fecha mantendo a média atual;
- **pessoas** — quantas em cada faixa, quem puxa (maior recebimento) e quem
  precisa de ajuda (**menor projeção**, não menor recebimento: quem tem meta
  pequena e recebeu pouco pode estar em dia).

Sem dia útil trabalhado, a estimativa de fechamento é o próprio acumulado — nem
zero, nem extrapolação de um dia que não aconteceu.

### 12.2.1-b Meta direta e indireta `[PP]` (migration `20260818160000`)

Operador com a lógica **Direto/Extra** ativa pode ter duas metas no mês. A opção
fica na linha dele, na aba Metas, e **só aparece para quem tem a lógica** — sem
ela não existe acordo extra para cobrar.

| Frente | Cobrada contra |
|---|---|
| **direta** (a de sempre) | recebimento do analítico |
| **indireta** | acordos `tipo_vinculo = 'extra'` com `status = 'pago'`, no mês de `coalesce(data_pagamento, vencimento)` — com ou sem titular direto vinculado |

O extra existia e não somava em canto nenhum: o operador fecha o acordo em nome
de outra pessoa, o dinheiro entra pelo titular, e o trabalho dele não aparecia
em meta alguma. A meta indireta é o único lugar onde esse valor conta.

**Individual, e só.** Meta e recebimento indiretos **não** entram no acumulado da
equipe nem do setor — somar ali contaria o mesmo dinheiro duas vezes, porque o
extra já entra no recebimento do titular direto, que está na mesma equipe. No
código: a meta indireta só é lida no escopo "eu" de `usePainelMetas`.

**O quartil é do TOTAL:** `(direta + indireta)` contra `(recebido direto +
indireto)`. Cobrar só a metade direta puniria justamente quem foi bem no extra.
Vale na aba Quartis e no dashboard, pela mesma função `combinarMetaDupla` — que
é agnóstica de unidade (o dashboard passa H.O., a aba Quartis passa bruto) e,
com a opção desligada, devolve exatamente o que entrou. É isso que faz as duas
telas rodarem por um caminho só.

Na tela: card **"Suas duas metas"** no dashboard, selo **D+I** na linha da aba
Quartis (onde META e RECEBIMENTO passam a ser o total, igual à % ao lado) e a
quebra das duas frentes dentro da linha expandida.

### 12.2.2-b Linha expansível do operador (aba Quartis)

Mesmo gesto do card de equipe, um nível abaixo: **clicar na linha de um operador
abre o detalhe dele**. As contas vivem em `detalheOperador.ts`, testadas à parte;
o ritmo vem de `ritmoDoPeriodo` (`lib/projecaoMetas.ts`), a **mesma** função que
o card de equipe usa — foi extraída no mesmo commit justamente para as duas abas
não voltarem a divergir.

| Bloco | O que responde |
|---|---|
| **Quanto falta por faixa** | quanto falta para **cada** quartil, não só para o atual (`degrausQuartis`), medido contra o esperado até hoje — igual à % da linha fechada |
| **Ritmo e fechamento** | onde o mês fecha mantendo a média atual, quanto isso sobra/falta contra a meta, a diária necessária no que **resta**, e os dias úteis do recorte |
| **Números do mês** | % da meta cheia, esperado até hoje, pagamentos, ticket médio, H.O. `[PP]`, posição e participação no grupo exibido |

Duas armadilhas que o bloco evita de propósito:

- **% da meta ≠ % de projeção.** Metade do mês com metade da meta é **100 %** de
  projeção e **50 %** da meta. Os dois números aparecem juntos porque respondem
  perguntas diferentes, e trocá-los já foi motivo de discussão em reunião;
- **posição e participação usam o grupo EM EXIBIÇÃO**, não o setor inteiro do
  banco. Quem filtrou por equipe compara com a equipe — é o que está lendo. Sem
  grupo, os dois vêm vazios em vez de "1º de 1".

Os dias úteis são os da própria linha, já reduzidos por equipe em treinamento:
aberta e fechada, a linha tem de dizer a mesma coisa.

### 12.2.3 Duas divergências corrigidas entre as abas

| Caso | Antes | Agora |
|---|---|---|
| Operador de equipe em **treinamento** | Desempenho reduzia os dias úteis; Quartis usava o mês cheio — o mesmo operador em duas faixas | as duas usam os dias da equipe |
| Usuário **desativado** (`ativo = false`) | aparecia em Quartis, ausente em Acompanhamento | as duas filtram `ativo` **e** `situacao` |

O segundo caso não era hipótese: em agosto/2026 havia 1 pessoa `ativo = false`
com `situacao = 'ativo'` — nenhum dos dois filtros sozinho cobria o outro.

### 12.3 Trava de meta por setor

Migration `20260721a`, tabela `metas_validacoes`. Um setor/mês fica `aberto` ou
`validado`.

- `fn_metas_upsert` respeita a trava: itens de setor já validado são **pulados**
  e voltam na lista `bloqueados`;
- `fn_metas_validar_setor` fecha;
- `fn_metas_reabrir_setor` reabre — **exigindo motivo**, que fica registrado em
  `motivo_reabertura`.

Nunca validado equivale a `aberto`.

---

## 13. Módulos auxiliares

### 13.1 Ouvidoria `[PP]`

Migration `20260717b`. Demandas de suporte (`reclamacao` / `sugestao`), com
status `pendente` / `resolvido`.

Prazo em **dias úteis**, contado a partir de `iniciado_em`:

| Situação | Urgência |
|---|---|
| Dentro do prazo (2 dias úteis) | `no_prazo` |
| Falta 1 dia útil | `atencao` |
| Prazo atingido ou estourado | `urgente` |
| Resolvido | — |

Quem acessa a aba é controlado por `ouvidoria_acessos`, com nível `ver` ou
`editar`.

### 13.2 Pix Automático `[BP]`

Registro de acordos fechados no Pix automático para acompanhamento de comissão,
**sem** vínculo com a tabela `acordos`.

1. O operador registra NR + valor → a linha nasce `pendente`;
2. líder+ **aprova** (o que congela o percentual do setor em `pct_comissao`) ou
   **desaprova**;
3. desaprovado não conta em nenhum total, e o dono pode excluir.

Comissão = `valor × pct ÷ 100`. Percentual por setor em
`pix_automatico_config`, padrão **0,25** (isto é, 0,25 %).

**Acordo "feito"** = `pendente` + `aprovado` (`ehAcordoFeito`). Desaprovado
ficou de fora de propósito: se contasse, registrar lixo aproximaria da meta. A
mesma definição vale para o contador da dobra, para o ranking e para o
realizado da meta do setor — três números que a operação compara entre si.

#### Aprovado ≠ pago

São dois estados distintos e a tela mostra os dois: `status = 'aprovado'` é a
comissão reconhecida; `pago` é a que já saiu. **A pagar** = aprovado e ainda
não pago — `pendente` não entra, porque fila de avaliação não é dívida
(`totalPagoPix`).

#### Comissão dobrada — DOIS requisitos

Batidos os dois, o operador recebe **de novo** o que já fez de comissão (fez
R$ 100,00, leva R$ 200,00). Em `calcularDobraComissao`:

| # | Requisito | Base de contagem |
|---|---|---|
| 1 | **18 acordos** Pix no mês (`PIX_META_ACORDOS_DOBRA`) | acordos **feitos** (pendente + aprovado) |
| 2 | **meta de recebimento** do mês batida | recebido no mês, pelo analítico |

Dois detalhes que não podem ser "simplificados":

- as réguas são **diferentes de propósito**. A dobra incide sobre a comissão
  **aprovada** (é a que existe de fato), mas o contador de acordos usa os
  **feitos** — a quantidade é trabalho do operador, e ele não controla quando o
  líder avalia. Com uma régua só, quem fechou 18 veria "12/18" porque a fila de
  aprovação atrasou;
- **sem meta definida no mês, não dobra.** O requisito 2 fica em aberto
  (`metaDefinida: false`). Prometer dobra sem ter contra o que comparar era o
  defeito da versão anterior, que tratava os 18 acordos como a regra inteira.

O selo no ranking do setor diz **REQUISITO**, não "dobrou": aquela tela conhece
os 18 acordos, mas não a meta de recebimento de cada um (`requisitoAcordosOk`).

#### Desaprovado tem prazo — e devolve o NR

Migration `20260809a`:

1. desaprovar **notifica o operador** (trigger `fn_pix_notifica_desaprovacao`),
   dizendo o prazo. Só na transição de status — sem o `IS DISTINCT FROM`,
   qualquer update posterior renotificaria o mesmo fato;
2. o desaprovado vive **2 dias úteis** a partir de `avaliado_em` e depois é
   excluído por `fn_pix_expurga_desaprovados`. **Não há job agendado**: a função
   é chamada ao abrir a aba (`expurgarDesaprovadosVencidos`). Linha sem
   `avaliado_em` nunca é tocada — sem data não há de quando contar;
3. excluir um desaprovado (pelo operador, pelo líder ou pelo expurgo) **libera o
   NR**. Antes, `fn_pix_nr_apos_delete` só apagava o registro `pendente`; o
   `recusado` ficava e travava o NR para sempre. A recusa é do acordo *daquela
   pessoa*, não do NR. `validado` continua para sempre — esse virou dinheiro.

> O prazo conta **só sábado e domingo** como não-úteis; feriado não entra, no
> banco nem no front. É deliberado: a tabela de feriados é por tenant e por mês
> (`metas_config_mes`) e não estaria disponível para a função do banco. Errar um
> feriado adia a exclusão em um dia; **discordar do banco** mostraria ao operador
> um prazo diferente do que vai acontecer.

#### Metas de Pix por equipe

A meta do **setor é a soma** das metas das equipes, nunca um valor digitado à
parte (`calcularMetaPixPorEquipe`) — com dois lugares para a mesma verdade, um
fica velho na primeira alteração. Acordo de operador sem equipe conhecida entra
no total do setor e em nenhuma equipe.

O painel de meta do Pix **não toca no recebimento**: o valor do Pix já entra no
recebimento pelo analítico, e somar aqui contaria o mesmo dinheiro duas vezes.

### 13.3 Campanha Fácil `[BP]`

Transforma exportações do sistema (mailing CSV/TXT, relatórios 245 ou 247 em
Excel) em campanhas de cobrança: aplica descontos, substitui variáveis da
mensagem, distribui responsáveis em **rodízio** e exporta um Excel pronto.
Mensagens e descontos são compartilhados por empresa.

### 13.4 Pet

Economia baseada no recebimento diário.

> 🔒 **Regra de ouro:** o cliente **nunca** credita moedas. O crédito é
> calculado no servidor, a partir de `diario_recebimentos`, por funções
> `SECURITY DEFINER`. O frontend só chama as RPCs. Qualquer atalho aqui vira
> moeda infinita.

Todas as funções toleram a ausência das tabelas/RPCs, caindo no modo
`localStorage`.

### 13.4-b Comemoração de meta

Líder+ monta e dispara (agora ou agendada); o card explode na tela de quem está
no escopo. **Quem monta escolhe o alvo, e o alvo decide a plateia:**

| Alvo | Plateia padrão | "Exibir apenas para a equipe" |
|---|---|---|
| Pessoas | o setor de cada homenageado | a equipe de cada homenageado |
| Equipe | o setor da equipe | só aquela equipe |
| Setor | **a empresa inteira** | não se aplica |

Meta de setor é a única que interrompe quem nem sabe da meta — daí o aviso em
destaque na montagem e o volume **travado em 25%**, sem edição.

**Volume.** Nasce em 25%; acima de 60% a tela avisa que pode atrapalhar quem
está em ligação. As três regras vivem em `pages/Comemoracoes/volume.ts`, e não
no JSX, porque a tela, o botão "Testar" e o INSERT precisam concordar sobre o
mesmo número.

**Clone (migration `20260810a`).** Operador clonado trabalha em dois times. Até
esta migration o banco unia os setores sozinho e a festa caía nos dois, sempre.
Agora, ao clicar em "Comemorar agora"/"Agendar", quem montou responde em qual
setor cada clone deve ser comemorado — "todos os setores" continua disponível, e
é o comportamento antigo, agora deliberado. A resposta vai em
`comemoracao_homenageados.setores_escolhidos`; quem preenche `setores_alvo` e
`equipes_alvo` a partir dela continua sendo o trigger.

> O recorte por equipe é filtro de **exibição** (`pages/Comemoracoes/escopo.ts`),
> não de segurança — igual ao de setor. Quem está no setor mas em outra equipe
> ainda LÊ a linha pela RLS e não vê o card.

### 13.5 Impersonação

Exclusiva de `super_admin`. A sessão do admin é salva no `localStorage`, um
token do usuário-alvo é pedido a `/api/impersonar-usuario` (que **revalida
super_admin no servidor**) e a sessão do navegador é trocada via `verifyOtp`.
Sair restaura a sessão salva.

A sessão do admin persiste em `localStorage` para sobreviver a reloads — é o que
mantém a faixa "Você está como X" e o botão Sair funcionando. Ver também
seção 1.1: a impersonação atravessa tenant de propósito.

### 13.6 Notificações e tags

- **Notificações** (`notificacoes.service.ts`) — em tempo real, disparadas pelos
  eventos de vínculo, transferência e importação.
- **Tags** (`tags.service.ts`) — por empresa, aplicáveis aos acordos.

### 13.7 Retenção da trilha de auditoria

**730 dias (2 anos), faixa única para toda a trilha.** Decidido em 17/08/2026.

| Onde o número vive | O quê |
|---|---|
| `RETENCAO_LOGS_DIAS` (`lib/logs-catalogo.ts`) | padrão do diálogo de expurgo |
| `fn_logs_expurgar(p_dias default 730)` | expurgo manual, piso de 30 dias, exige super_admin e confirmação digitada |
| `fn_logs_retencao_aplicar(730)` + cron `logs-retencao-730d` | aplica sozinho, mensal, dia 1 às 03:40 UTC |

`src/lib/__tests__/logs-retencao.test.ts` quebra se os três divergirem —
divergência aqui não dá erro, dá apagamento com o prazo errado, em silêncio.

**Por que 2 anos:**

- o piso legal é 6 meses (Marco Civil, Art. 15, registros de acesso);
- 2 anos é a janela para ajuizar ação trabalhista após a rescisão, e os logs são
  o que responde *"esse operador tabulou esse acordo?"* numa disputa de comissão;
- minimização (LGPD, Art. 6º III): 97% das linhas da categoria `acordo` carregam
  rótulo identificável de profissional do COREN/COFEN. `fn_log_mascarar` protege
  CPF, telefone e token, mas **não** mascara nome de cliente nem NR.

> **O log não é o registro.** O acordo continua em `acordos`, que não é
> expurgado. A trilha responde "quem mexeu e quando", e essa pergunta envelhece
> mais rápido que "o que foi contratado" — que é o que o prazo de 5 anos do
> Código Civil (Art. 206, §5º, I) protege.

**O que se perde, e foi aceito:** eventos de `seguranca` (impersonação, senha,
permissão, cargo) com mais de 2 anos também saem. A recomendação técnica era
5 anos para essa categoria; optou-se pela simplicidade de um número só. Para
mudar, acrescente recorte por categoria em `fn_logs_retencao_aplicar` — não mexa
no prazo geral.

**Duas coisas a saber sobre o trabalho automático:**

1. Ele tem piso próprio de **365 dias**, mais conservador que os 30 do botão. O
   botão tem um humano que digitou "EXPURGAR"; o cron roda todo mês sem ninguém
   olhando.
2. Ele **registra a execução mesmo quando não apaga nada**. Nos primeiros dois
   anos essa linha de zero remoções vai ser a única coisa que ele produz — e é
   ela que prova que está vivo. Trabalho destrutivo silencioso é indistinguível
   de trabalho que parou de rodar. **Primeira remoção real esperada em
   abril/2028**, porque a trilha começa em 01/04/2026.

### 13.8 Monitoramento de uso

Aba interna de **Configurações → Logs**, ao lado da trilha. Responde uma pergunta
diferente: a trilha diz **o que mudou**, o monitoramento diz **quem está usando**.

`logs_sistema` registra quem **escreve**. Um líder que abre o Painel Líder, olha
os cards e fecha não deixava linha nenhuma — a coluna `rota` existia e estava
preenchida em 7,1% das linhas, sempre com o valor `/`. Daí a tabela nova
(migration `20260817180000`).

| Decisão | Por quê |
|---|---|
| Tabela **separada** (`uso_telas`) | a trilha roda a 500–750 linhas/dia; navegação são milhares. Misturar é o que produziu as 11.297 linhas de ruído expurgadas em `20260817120000` |
| **Agregado diário**, não evento por clique | uma linha por `(empresa, usuário, dia, tela)`. Teto real ~540 linhas/dia |
| Retenção de **180 dias** (contra 730 da trilha) | uso responde "como estão trabalhando agora"; retrato de dois anos não descreve mais nem as telas nem as pessoas |
| Tempo só com a aba **em foco** | sem isso, quem deixa a planilha aberta o dia todo lidera qualquer ranking sem ter usado nada |
| **Cargo gravado na linha** | promover alguém não pode reescrever meses de "uso de operador" como "uso de líder" |

**Sub-aba conta como tela.** "Desempenho Equipes" é aba dentro do Painel Líder e
a URL não muda ao trocar — sem esse nível, a pergunta que originou o painel
ficaria sem resposta. O identificador fica `lider:desempenho`
(`src/lib/telas-catalogo.ts`).

**Escrita só por `fn_uso_registrar`.** `uso_telas` não tem policy de
INSERT/UPDATE, e a RPC resolve a identidade por `auth.uid()` — nunca por
parâmetro. Um painel de uso que aceitasse números vindos do cliente não mediria
nada. A RPC também limita o nome da tela a 120 caracteres e cada envio a 3.600
segundos, porque relógio errado, máquina hibernada ou payload adulterado
mandariam horas numa tacada.

**Leitura travada em super_admin e administrador** — a mesma trava de `ver_logs`.
As quatro funções de agregação são `SECURITY INVOKER` de propósito: `DEFINER` ali
seria um contorno da policy para qualquer um com EXECUTE.

**O achado acionável é quem NÃO usa.** `fn_uso_adocao_tela` parte de `perfis` e
traz o uso por `LEFT JOIN`, porque quem nunca abriu a tela não tem linha em
`uso_telas`. O líder que não olha o Desempenho Equipes é o resultado que muda uma
conversa; o ranking de quem olha, não.

> **A medição começa quando sobe.** Não há histórico de navegação para recuperar
> — a tabela nasce vazia e o painel diz isso em vez de mostrar zeros como se
> fossem dado.

**Lista de pessoas.** Ordenada por tempo, do maior para o menor, com as duas
operações juntas para quem pode ver as duas (`fn_uso_por_pessoa` aceita
`p_empresa_id` nulo = todas as que a RLS permitir — o parâmetro amplia o pedido,
nunca o direito). Mostra 10 e o resto vem em "ver mais"; a busca por nome filtra
em memória, ignorando acento, porque a agregação já chega inteira e uma consulta
por tecla digitada seria desperdício. Clicar numa pessoa abre o detalhe: tempo,
aberturas, dias, série diária e a tabela de telas
(`fn_uso_detalhe_pessoa`, `fn_uso_detalhe_pessoa_dias`).

**Empresa nula vale para as QUATRO leituras** (migration `20260818140000`). A
`20260817200000` ensinou isso só a `fn_uso_por_pessoa`; as outras três seguiram
com `where empresa_id = p_empresa_id`, e em SQL `x = NULL` não é falso — é NULL,
que o `WHERE` descarta. Como o painel abre com **"Todas as empresas"**, a lista
de pessoas vinha cheia e três blocos vinham **vazios**: "Telas mais usadas",
"Atividade por dia" e "Adoção de uma tela". Escolher uma empresa na mão fazia os
três voltarem, o que disfarçou o defeito de "card quebrado".

> Regra que fica: leitura nova de `uso_telas` nasce com
> `(p_empresa_id is null or … = p_empresa_id)`. `SECURITY INVOKER` continua
> sendo o gate — o parâmetro amplia o pedido, nunca o direito.

**Telas sem uso.** O card "Telas mais usadas" diz onde o tempo vai; o vizinho diz
o oposto, e é a metade acionável — tela que ninguém abre em 30 dias ou não serve,
ou ninguém sabe que existe. Sai do **catálogo** (`TELA_LABEL`), não do banco,
pelo mesmo motivo da adoção: tela sem uso não tem linha em `uso_telas`. Módulos
exclusivos de uma operação (Ouvidoria `[PP]`, Campanha Fácil `[BP]`) ficam fora —
na outra empresa não é abandono, é módulo que o tenant não tem.

**Adoção.** O seletor oferece as telas de gestão fixas **mais** as que tiveram
uso no período: sem isso, perguntar pela adoção de uma tela fora da lista era
impossível e a lista envelhecia a cada módulo novo. O resumo (adoção %, média de
aberturas e de tempo) conta só **quem abriu** — diluir pelos que nunca entraram
responde outra pergunta e sempre dá um número menor e inútil. Com as duas
operações juntas, a tabela mostra a empresa de cada pessoa: "líder que não abriu"
não dá para cobrar sem saber de quem cobrar.

### 13.9 Agrupamento de eventos na trilha

Eventos que foram **uma ação** aparecem num card só, que abre. Acrescentar uma
parcela ao mesmo NR, por exemplo, produz três linhas — cria o acordo novo, move
a titularidade do NR e atualiza a contagem de parcelas do antigo — e elas pareciam
log duplicado.

Dois níveis, e a diferença entre eles é dita na tela:

| Regra | Natureza | O card diz |
|---|---|---|
| `criado_em` idêntico + mesmo autor | **exata** — `criado_em` tem default `now()`, o carimbo da **transação** no PostgreSQL | "na mesma operação" |
| Mesmo autor + mesmo NR em até 15 s | **aproximação** — o caso acima são duas transações a 79 ms | "em sequência" |

Em 17/08/2026 a regra exata cobria 2.943 das 5.357 linhas da semana, incluindo
uma importação de 428 linhas que virou um card.

**Nada é escondido.** O card guarda todos os eventos e cada um continua levando
ao detalhe completo. Auditoria que perde granularidade para ficar bonita deixa de
ser auditoria — o que se ganha aqui é apenas onde o olho pousa. E só agrupa
eventos **vizinhos** na lista: reordenar para juntar quebraria a leitura
cronológica.

**Autores diferentes nunca agrupam**, nem na mesma transação: duas pessoas
mexendo no mesmo NR no mesmo instante é exatamente o que um auditor precisa ver
separado.

#### Rótulos consertados

Duas falhas produziam texto ruim em ~872 linhas:

- `trg_log_nr_registros` passava `'a titularidade de NR'` como nome do alvo, e a
  coluna de rótulo `nr_value` já recebia o prefixo `NR ` — daí *"a titularidade
  de NR NR 12983305"*;
- `fn_log_rotulo_campo` não conhecia `acordo_id` e imprimia o nome da coluna do
  banco: *"…: acordo id"*.

A migration `20260817200000` corrige a origem. As linhas já gravadas ficam como
estão — a trilha é somente-acréscimo, e não se reescreve histórico por causa de
rótulo. Quem conserta o passado é a leitura: `normalizarDescricao`
(`src/lib/logs-catalogo.ts`), aplicada na linha do tempo, na tabela, no detalhe e
no CSV. Ela é deliberadamente conservadora — um cliente chamado "NR NR SERVICOS
LTDA" passa intacto.

---

## 14. Mapa: onde cada regra vive

| Regra | Arquivo |
|---|---|
| Slug do tenant, branding, impersonação cruzando tenant | `src/lib/tenant.ts` |
| Diferenças de comportamento PP × BP | `src/lib/tenant-config.ts` |
| Perfis, níveis, percentuais PP, formatadores | `src/lib/index.ts` |
| Isolamento de login por tenant | `src/hooks/useAuth.tsx` |
| Resolução de permissões | `src/hooks/useCargoPermissoes.ts` |
| Catálogo de permissões | `src/pages/AdminCargos.tsx` |
| Gate de rotas | `src/components/ProtectedRoute.tsx`, `src/App.tsx` |
| Fluxo de conflito de tabulação | `src/pages/AcordoForm/index.tsx`, `src/components/AcordoNovoInline/index.tsx` |
| Titularidade de NR/Código | `src/services/nr_registros.service.ts` |
| Trava do NR no banco (recusa + par do vínculo) | `supabase/migrations/20260809d_nr_trava_no_banco.sql` |
| Direto/Extra (config e resolução) | `src/services/direto_extra.service.ts` |
| Quebra do par ao excluir | `src/services/tratarExclusaoVinculo.ts` |
| Desligamento e transferência | `src/services/desligamento.service.ts`, `src/services/situacaoUsuario.service.ts` |
| Autenticação de líder | `src/services/autorizacao_lider.service.ts` |
| Lixeira e retenção | `src/services/lixeira.service.ts` |
| Parcela no mesmo NR | `src/services/parcelas.service.ts` |
| Analítico | `src/services/analitico/` |
| Recebimento diário | `src/services/diario/` |
| Dias úteis, quartis, metas | `src/lib/diasUteis.ts`, `src/services/metas/` |
| Pix Automático: dobra, prazo, ranking, metas | `src/pages/Acordos/pixAutomaticoView.ts`, `src/services/pix_automatico.service.ts` |
| Equipes: líderes e clones | `src/services/equipes/` |
| RLS de acordos | `supabase/migrations/20260723f_acordos_rls_fail_closed.sql` |
| RPCs de transferência | `supabase/migrations/20260728a_transferencia_acordo_rpc.sql` |
| Fim do CPF | `supabase/migrations/20260728b_remove_cpf_usa_cod_cliente.sql` |

### Migrations de referência

| Migration | O que estabeleceu |
|---|---|
| `step4_fix_rls_recursion` | `perfis_select`: operador lê só a própria linha |
| `20260717b_ouvidoria` | Ouvidoria + `ouvidoria` dentro dos gates de líder |
| `20260721a_fase1_trava_metas` | Trava de meta por setor |
| `20260723c_status_usuario` | ativo / férias / desligado + arquivamento |
| `20260723d` | `acordos_deduplicados` com `security_invoker` (**pré-requisito da RLS**) |
| `20260723e` | `conta_recebimento` no clone |
| `20260723f` | RLS de acordos fail-closed e centralizada |
| `20260724a` / `20260724b` | Setor alternativo |
| `20260725a` / `20260725b` | Foto do setor · Líder por equipe |
| `20260726a` | Performance da RLS de acordos (InitPlan + índices) |
| `20260728a` | RPCs de situação e transferência de acordo |
| `20260728b` | Fim do CPF · `cliente_codigo` (**destrutiva**) |
| `20260729a` | Performance: RLS InitPlan em analítico/diário + índice `(empresa_id, data_pagamento)` |
| `20260729b` | Performance: agregado do dashboard em um único JSONB (`fn_analitico_dashboard_mes_json`) |
| `20260805b` | Acordo com entrada `[BP]` (`valor_entrada`) |
| `20260809a` | Pix: prazo do desaprovado, NR liberado na exclusão, UNIQUE da meta por equipe |
| `20260809b` | Analítico: `super_admin` fora do resumo; agrupamento pelo perfil, não pela grafia do login |
| `20260809c` | Despedida do pet (`perfis.pet_despedida`) |
| `20260809d` | **Trava do NR no banco**: trigger recusa em vez de reatribuir · `fn_sync_par_vinculo` acha o par pelo vínculo |
| `20260810a` | Comemoração: alvo por equipe (`somente_equipe` / `equipes_alvo`) · clone escolhe o setor (`setores_escolhidos`) |

> O **status de aplicação** de cada migration no Supabase é controlado fora do
> repositório. A presença do arquivo aqui não garante que ela rodou em produção.

---

*Última revisão: 2026-08-10 (comemoração por equipe e escolha de setor do clone).*
