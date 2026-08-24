# Permissões: como o sistema funcionava até 23/08/2026

> ⚠️ **DOCUMENTO HISTÓRICO. NÃO É O MODELO ATUAL.**
>
> Este é o levantamento feito em 2026-08-22, **antes** da reestruturação, para
> medir o que existia. As seções 1 e 2 descrevem um mundo que **não existe
> mais** — e descrevem-no como se fosse correto, que é pior.
>
> Quem procura como o sistema funciona **hoje**: cabeçalho de
> [`src/lib/permissoes-catalogo.ts`](../src/lib/permissoes-catalogo.ts) e a
> seção «§0. O que mudou» logo abaixo.
>
> O arquivo fica no repositório porque explica de onde cada chave veio e qual
> alcance ela precisava preservar. Apagá-lo perderia essa rastreabilidade.

---

## 0. O que mudou em 23/08/2026 — leia isto antes do resto

O modelo abaixo foi **invertido**. Onde este documento diz que a RLS manda e a
permissão só esconde, hoje vale o oposto:

> **O painel de permissões é a autoridade única.** Se ele liga uma aba para um
> cargo, aquele cargo abre a aba. Se ele limita a um setor, o banco limita ao
> setor. Se ele desliga, está desligado — e não há caminho alternativo.

Regra ditada pelo Cleber em 23/08/2026:

> «Eu quero ter o poder absoluto dessa aba de permissões. Não quero nenhum tipo
> de regra que bloqueie uma decisão minha. Eu quero definir o teto.»

O que a executou, aplicado em produção:

| Migration | O que fez |
| --- | --- |
| `20260823010000` | **Matou `fn_teto_rls_acordos`** — o teto por cargo que ficava acima do painel e cortava, em silêncio, o que ele liberava |
| `20260823020000` | Criou `fn_user_tem()` e `fn_user_escopo()`: o painel dentro do Postgres, espelhando `useCargoPermissoes` |
| `20260823030000`–`060000` | Converteu ~76 policies em 40 tabelas de lista-de-cargo para pergunta-ao-painel |
| `20260824200000` | Monitoramento de uso — a última policy que ainda decidia por cargo |

**A única exceção é `super_admin`**, e ela é deliberada: é a garantia de que
ninguém se tranca para fora editando o próprio painel.

O resto deste documento fica como registro do ponto de partida. **A tabela de
tetos da §2 não vale mais** — aquele teto foi removido.

---

## 1. Eram três camadas ~~, não uma~~ — hoje são duas, e uma manda

> **Superado pela §0.** Fica registrado porque explica a origem dos defeitos.

O acesso era decidido em três lugares independentes:

| Camada | Onde mora | O que decidia |
| --- | --- | --- |
| **RLS** | Políticas no Postgres | Quais LINHAS existem para esta pessoa |
| **Permissão** | `cargos_permissoes` (JSONB por empresa+cargo) | Qual aba/botão/filtro aparece |
| **Exceção** | `perfis_permissoes` | Sobrescreve o cargo, chave a chave |

E a regra que resultava disso — **hoje falsa, e era a causa da queixa**:

> ~~A permissão nunca amplia o que o RLS nega. Ela só esconde o que o RLS
> permitiria. Ligar uma permissão de escopo para um cargo cujo RLS não alcança
> aquele dado não abre nada — entrega uma tela vazia, sem erro.~~

Era exatamente isto que produzia «eu libero na tela e não acontece nada». Hoje a
RLS **lê** o painel: `fn_user_tem()` e `fn_user_escopo()` são as mesmas quatro
camadas de resolução do frontend (acesso total → exceção da pessoa → mapa do
cargo → negado), avaliadas dentro da policy.

Das três camadas, **`perfis_permissoes` continua valendo e vale acima do
cargo** — é como se libera ou bloqueia uma pessoa específica sem mexer no cargo
dela.

---

## 2. ~~O teto do RLS, por cargo~~ — REMOVIDO

> **Esta seção descreve algo que não existe mais.** `fn_teto_rls_acordos` foi
> derrubada por `20260823010000`. Nenhum cargo tem teto acima do painel, exceto
> a chave-mestra do `super_admin`.
>
> Fica como registro do alcance que cada cargo tinha antes da virada — é a
> linha de base contra a qual as migrations provaram «ninguém perdeu acesso».

Lido da política `acordos_select` **em 22/08/2026**:

| Cargo | BookPlay | PaguePlay |
| --- | --- | --- |
| `operador` | só os próprios | só os próprios |
| `ouvidoria` | só os próprios | só os próprios |
| `lider` | **o próprio setor** | **a empresa inteira** |
| `elite` | **o próprio setor** | **só os próprios** |
| `gerencia` | **o próprio setor** | **só os próprios** |
| `diretoria` | empresa inteira | empresa inteira |
| `administrador` | empresa inteira | empresa inteira |
| `super_admin` | tudo | tudo |

Duas assimetrias que não eram erro de leitura:

- A política tinha um ramo exclusivo da BookPlay para `lider`/`elite`/`gerencia`
  com recorte por setor (incluindo operador clonado no setor). Fora da BookPlay,
  o ramo equivalente citava **apenas `lider`**.
- Por isso `elite` e `gerencia` na PaguePlay tinham teto de "só os próprios" em
  `acordos`, mesmo tendo `ver_acordos_gerais = true`. A permissão estava ligada
  e o RLS não acompanhava. **É este o defeito que a §0 encerrou**: hoje o que
  está ligado no painel funciona.

---

## 3. As permissões globais de escopo

São seis chaves, e são elas que criam a dependência entre abas que o pedido
manda acabar. Abaixo, onde cada uma é lida e o que decide.

### `ver_todos_setores` — a mais contaminante

Uma chave, quatro telas:

| Lido em | Decide |
| --- | --- |
| `hooks/useAnalytics.ts` | Escopo do **Dashboard** E do **Painel Diretoria** (mesmo hook) |
| `hooks/useSetoresEquipes.ts` | Quais setores e equipes entram nas listas de filtro |
| `services/analitico/escopoAnalitico.ts` | Escopo do **Analítico** e do **Recebimento** |
| `hooks/useAnaliticoImport.ts` | Carimbo de setor na importação do relatório |

### `ver_acordos_gerais` — a segunda mais contaminante

| Lido em | Decide |
| --- | --- |
| `pages/Acordos/index.tsx` | Se a lista filtra por `operador_id`; se a coluna Operador aparece |
| `pages/Dashboard/index.tsx` | Se o Dashboard filtra por `operador_id` |
| `pages/Lixeira.tsx` | Se a Lixeira mostra só os próprios acordos |

Uma chave decidindo Acordos, Dashboard e Lixeira ao mesmo tempo é exatamente o
caso citado no pedido: mudar o escopo de Acordos mexe na Lixeira sem querer.

> ✅ **Aposentada na fase 5a.** As três abas ganharam `<aba>_escopo_setor`
> própria — a Lixeira na fase 1, o Dashboard na 3a, Acordos na 5a — e a chave
> ficou sem consumidor. Era a mais usada do sistema, e é a que melhor ilustra o
> pedido: a mesma pergunta agora tem uma resposta por aba.

### As outras quatro

| Chave | Lido em | Decide |
| --- | --- | --- |
| `ver_analiticos_global` | `escopoAnalitico.ts` | Junto com `ver_todos_setores`, a visão global do analítico |
| `filtrar_por_setor` | `Dashboard/index.tsx` (1 uso) | Se o seletor de setor aparece no Dashboard |
| `filtrar_por_equipe` | `Dashboard/index.tsx` (1 uso) | Se o seletor de equipe aparece no Dashboard |
| `filtrar_por_usuario` | `Acordos/*` (2 usos) | Se o seletor de operador aparece em Acordos |

> ✅ **Estado em 2026-08-22, depois das fases 1 a 4.** `filtrar_por_setor` e
> `filtrar_por_equipe` foram aposentadas na fase 3b, e `ver_analiticos_global`
> na fase 4 — as três ficaram sem consumidor no instante em que a aba
> correspondente ganhou escopo próprio, e o teste de contrato acusou. Só
> `filtrar_por_usuario` e `ver_todos_setores` continuam vivas, e as duas apenas
> em Acordos. Os valores gravados viraram entradas órfãs e inertes; a faxina do
> JSON fica para a fase 8.

### O resolvedor único

`escopoAnalitico.ts` exportava `veTodosOsSetores(cargo, temPermissao)`.

Ele já unificou uma divergência antiga (a aba decidia por cargo, o dashboard por
permissão, e a mesma pessoa via dois totais diferentes). Era o ponto único de
escopo — e por isso mesmo era o problema: **uma resposta só para cinco telas**.

> ✅ **Aposentado na fase 4.** O último consumidor saiu junto com o escopo
> próprio do Analítico. A pergunta agora é
> `escopoEfetivo('<aba>', temPermissao) === 'todos_setores'`, respondida por
> aba.
>
> Correção de um número que este documento trouxe errado: **26 arquivos**
> importavam *algo* de `escopoAnalitico.ts`; chamadas de `veTodosOsSetores` em
> si eram **cinco**.

---

## 4. Alcance da mudança

| Medida | Valor |
| --- | --- |
| Arquivos do front que consultam permissões | 48 |
| Ocorrências das 6 chaves globais de escopo | 76, em ~30 arquivos |
| Chamadas de `veTodosOsSetores` | 5 (26 arquivos importam algo do módulo) |
| Políticas RLS que consultam `fn_tem_permissao` | **0** |
| Funções que consultam `fn_tem_permissao` | **0** |

A última linha é o dado que decide a arquitetura: **o RLS hoje não sabe nada
sobre o mapa de permissões.** Ele decide por cargo, setor e empresa.

---

## 5. Restrições que a implementação precisa respeitar

1. **Catálogo em dois lados.** `src/lib/permissoes-catalogo.ts` e
   `fn_permissoes_catalogo()` precisam bater. Testes de contrato quebram a CI se
   divergirem, nos dois sentidos: chave sem uso no código, e uso no código sem
   chave no catálogo.
2. **Permissão morta é armadilha conhecida.** `ver_acordos_proprios` e
   `ver_analiticos_setor` já foram botões que ligavam e não mudavam nada. Daí
   nasceu a lista `PERMISSOES_LEGADAS_PADRAO_TRUE`.
3. **Chave ausente é `false`, sem exceção.** O `PERMISSOES_LEGADAS_PADRAO_TRUE`
   foi removido em 2026-08-15, quando a migration `20260815154058` gravou o
   catálogo inteiro em todo cargo — sem ausência, o fallback não tinha função.
   `docs/REGRAS-DE-NEGOCIO.md` §2.4 descrevia a versão antiga até 2026-08-22.
4. **`ON CONFLICT DO NOTHING` no seed** já deixou empresa com
   `cargos_permissoes` vazio — e aí tudo que não é legado cai em `false`.
5. **`administrador` e `super_admin` recebem `true` sempre**, antes de consultar
   tabela, exceto nas chaves de `PERMISSOES_EXPLICITAS`.
6. **`ver_logs` é aba, não leitura.** O RLS de `logs_sistema` é o piso real.
   Existe teste ligando os dois lados.

---

## 6. Estado atual das seis chaves, por cargo

Este é o **retrato que a migração precisa preservar**. Lido da produção.

| Empresa | Cargo | todos_setores | acordos_gerais | analiticos_global | f_setor | f_equipe | f_usuario |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: |
| bookplay | operador | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| bookplay | ouvidoria | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| bookplay | lider | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ |
| bookplay | elite | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ |
| bookplay | gerencia | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ |
| bookplay | diretoria | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| bookplay | administrador | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pagueplay | operador | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| pagueplay | ouvidoria | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ |
| pagueplay | lider | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ |
| pagueplay | elite | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ |
| pagueplay | gerencia | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ |
| pagueplay | diretoria | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pagueplay | administrador | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Leitura prática: **hoje ninguém abaixo de diretoria tem `ver_todos_setores`.**
Nenhum líder, elite ou gerência enxerga todos os setores, em nenhuma das duas
operações.

---

## 7. A decisão que a reestruturação exige

O pedido quer que cada aba tenha seu próprio escopo, e cita o caso:

> Pix Automático → todos os setores; Acordos → somente individual.

Isso tem duas leituras, e elas levam a implementações muito diferentes.

### Leitura A — o escopo por aba só ESTREITA

Cada aba recebe seu escopo, e ele é aplicado por cima do teto do RLS. O painel
de permissões nunca oferece um nível acima do teto do cargo.

- Não mexe em RLS.
- "Pix → todos os setores" para um líder BookPlay continua entregando o setor
  dele, porque é o que o RLS permite — e o painel **não oferece** essa opção,
  em vez de oferecer e devolver vazio.
- Resolve integralmente a contaminação entre abas.
- Não amplia o alcance de ninguém.

### Leitura B — o escopo por aba também AMPLIA

Para "Pix → todos os setores" funcionar de verdade num líder BookPlay, o RLS
precisa consultar o mapa de permissões por aba.

- Exige políticas novas em `acordos` e nas RPCs analíticas.
- É mudança de superfície de segurança: hoje zero políticas consultam permissão.
- É o caminho mais próximo do que a tentativa de 20/08 fez, e é onde mora o
  risco de repetir aquele resultado.

**Sem essa definição, qualquer escopo por aba pode virar exatamente o bug que o
pedido manda evitar: opção que aparece, é selecionada e devolve tela vazia.**
