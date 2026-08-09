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

**Exceção — impersonação.** Quando um `super_admin` está impersonando alguém, a
ordem inverte: a empresa **real do usuário impersonado** manda no branding e nas
capacidades, não o slug fixo do site onde o admin entrou. Sem isso, o admin
logado no site da Pague Play veria um usuário Book Play com regras de Pague Play.

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

O **H.O. é a base de cálculo das metas** — não o valor bruto.

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
Sem conflito, salva direto. **Com** conflito, a ordem é
(`src/pages/AcordoForm/index.tsx`, espelhado em `AcordoNovoInline`):

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

> O **status de aplicação** de cada migration no Supabase é controlado fora do
> repositório. A presença do arquivo aqui não garante que ela rodou em produção.

---

*Última revisão: 2026-08-09.*
