# Versão mobile para a liderança

**Data:** 2026-09-30
**Estado:** **RASCUNHO — aguardando aprovação do usuário.** Nada implementado.
**Continua:** `docs/superpowers/specs/2026-09-30-mobile-pwa-push-design.md` (operador, no ar)
**Histórico da conversa:** `docs/MOBILE-PWA-EM-ANDAMENTO.md` → «Liderança — brainstorm RETOMADO»
**Protótipo:** `docs/mobile/prototipo-lider.html` (print `prototipo-lider.png`, dados fictícios)
**Toca:** `src/pages/Mobile/*` (visão da equipe, abas), `src/lib/mobile/preferencia.ts`
(quem abre o quê), extração de código puro de `DesempenhoEquipes.tsx` e
`QuartisOperadores.tsx`, banco (migration nova: marco de meta de equipe, função do
recebido por equipe, ajuste no gatilho da fila), Edge Function `enviar-push`
**Não toca:** telas do site, a `/m` do operador (só ganha a troca Eu / Equipe para o
elite), conta de comissão, importação do analítico

---

## Decisões (30/09/2026)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Público | **Líder** e **elite**. O elite troca entre a visão individual e a da equipe. |
| 2 | Alcance | Só as equipes que a pessoa **lidera** (regra do `lideresDaEquipe`), não o alcance da permissão `painel_lider`. |
| 3 | Aviso | Só **«equipe bateu a meta»**. Sem resumo por lote nem fechamento do dia. |
| 4 | Conteúdo | O modelo do Painel do Líder: recebido + projeção, quartis, quem recebeu hoje, últimos pagamentos. |
| 5 | Formato | **Abas no rodapé**, como app. |
| 6 | Abas do Painel | Desempenho Equipes, Quartis, Gráfico. Ajuste de recebimento e Plantão Elite ficam só no site. |
| 7 | Várias equipes | **Seletor no topo**, uma por vez, lembra a última. |
| 8 | Mês | Só o **atual**. |
| 9 | Gráfico | **SVG próprio**, sem recharts no celular. |
| 10 | Elite abre em | **Sempre** a visão individual; a equipe é um toque. |
| 11 | Quem recebe o aviso | **Líderes e a equipe toda.** |
| 12 | Marco | Só **100%** da meta da equipe. Um aviso por equipe por mês. |

Seguem valendo as decisões da spec do operador: PWA, sem canal Realtime novo, leve
no banco, no servidor e no celular.

---

## 1. Quem abre o quê

| Cargo | No celular, depois do login | Troca Eu / Equipe |
|---|---|---|
| `operador` | `/m` (como hoje) | não |
| `elite` que lidera alguma equipe | `/m` (individual, como hoje) | **sim** — «Equipe» abre `/m/equipe` |
| `elite` que não lidera | `/m` | não |
| `lider` | `/m/equipe` | não (líder não recebe em nome próprio) |
| `lider` sem equipe liderada | `/m/equipe` com «Você ainda não lidera nenhuma equipe» + «Versão completa» | — |
| gerência, diretoria, admin | site completo (fase da diretoria) | — |

- `ehPerfilDaTelaMinima` passa a aceitar `lider`; o destino sai de uma função nova
  `destinoMobile(perfil)` → `'/m'` ou `'/m/equipe'`. Critério de celular e escolha
  «Versão completa» continuam os mesmos (`preferencia.ts`).
- `start_url` do manifest continua `/m`; para o líder, `/m` redireciona para
  `/m/equipe`. A escolha Eu / Equipe do elite **não** é lembrada (decisão 10).
- Super admin: o «Escolha um operador» passa a listar líderes também, para testar a
  visão da equipe pela impersonação que já existe.

### Quais equipes a pessoa lidera

A mesma regra do Painel, invertida: `lideresDaEquipe` diz quem lidera cada equipe;
uma função pura nova `equipesQueLidero(perfilId, entrada)` devolve as equipes em que a
pessoa aparece — `equipe_lideres` manda; sem vínculo explícito, reserva em
`perfis.equipe_id` + clones; quem já lidera algo explicitamente não entra pela
reserva. Testada com os mesmos casos de `lideresDaEquipe` (Bryan × Kauan de
18/08/2026, `jaLideraAlgo` de 02/09/2026).

Mais de uma equipe: seletor no topo (nome da equipe + ▾), uma por vez, a última
escolhida lembrada no aparelho (`localStorage['mobile:equipe']`, com `try/catch`).

---

## 2. A tela da equipe (`/m/equipe`)

Protótipo: `docs/mobile/prototipo-lider.png`. Mesmo visual aprovado da `/m`
(cartão escuro com as cores do ícone, Bricolage Grotesque nos números, Figtree no
texto). Cabeçalho fixo: ícone, **equipe ▾**, setor · mês, sino. Para o elite, a troca
**Eu | Equipe** logo abaixo. Abas no rodapé:

### 2.1 Equipe (Desempenho Equipes)

- Cartão principal: **recebido da equipe**, meta, %, a **barra** com acumulado,
  esperado até hoje e meta no mesmo eixo, e o selo de **projeção** («▲ Projeção 106%
  · fecha em R$ 509 mil»), na cor de `corProjecao`.
- Quatro números: esperado até hoje (e quanto à frente/atrás), falta para a meta
  (e dias úteis restantes), **por dia daqui pra frente** (ritmo necessário) e
  recebido hoje.
- **Degraus de quartil**: a faixa atual e quanto falta para cada faixa acima.
- Equipe sem meta: mostra o recebido e «Sem meta configurada», como o `CardEquipe`.

### 2.2 Quartis

- Barra de distribuição (1º a 4º) com a contagem de cada faixa.
- **Quem puxa** e **Precisa de ajuda** (os mesmos critérios de `detalharEquipe`):
  nome abreviado, recebido × meta, % de projeção, e para quem está embaixo, quanto
  falta para a faixa de cima.
- «Ver todos» abre a lista completa da equipe, ordenada por projeção.
- Quem sai da tabela no site (férias, sem meta, os outros casos de 08/09/2026) sai
  aqui também — mesma regra, extraída do `QuartisOperadores`.

### 2.3 Gráfico

- Barras do **recebido por dia útil** do mês, o dia de hoje em verde (parcial), dias
  futuros vazios, linha tracejada da **meta diária**.
- Média por dia e melhor dia.
- **Acumulado × meta**: linha do acumulado contra a reta até a meta.
- SVG escrito à mão, sem biblioteca. Dados de `buscarResumoMensalDiario` (a RPC
  agregada que o Gráfico do Painel já usa), filtrados pelos operadores da equipe.

### 2.4 Hoje

- Cartão: recebido hoje, nº de pagamentos, quantos operadores receberam, % da meta
  diária.
- **Quem recebeu hoje**: operador, nº de pagamentos, valor, do maior para o menor;
  «N sem pagamento» no título.
- **Últimos pagamentos** da equipe: forma (chip), **cliente abreviado · operador**,
  hora, valor; os chegados depois da última visita em verde com «novo» (marca do
  aparelho, como na `/m`).
- Os pagamentos um a um dependem de a pessoa ler o analítico dos outros
  (`analitico_select` exige `fn_user_escopo('analitico') >= 2`). Sem isso, a aba
  mostra só o cartão e «Quem recebeu hoje», que vêm dos agregados.

### De onde vêm os números

**Nenhuma conta nova.** A tela lê as mesmas fontes que o Painel do Líder e roda as
mesmas contas:

| O quê | Fonte |
|---|---|
| recebido por operador e por equipe, clones, fantasmas | `buscarResumoOperadoresAnalitico`, `buscarEquipesComOperadores`, `buscarCreditosDeOrigem` |
| meta da equipe | `metas` `tipo = 'equipe'` (`metaDe('equipe', id)`), em H.O. na PaguePlay (`metaNaUnidade`) |
| dias úteis, quartis | `getMetasConfig`, `diasUteisDoMes` / `diasUteisDecorridos`, `QUARTIS_PADRAO` |
| projeção, ritmo, degraus, quem puxa | `enriquecerOperadores` + `detalharEquipe` (`desempenhoEquipe.ts`, já testado) |
| dia a dia | `buscarResumoMensalDiario` |
| pagamentos | `buscarAnalitico` com os operadores da equipe, 20 mais recentes |

Hoje a montagem das fontes vive **dentro** do componente `DesempenhoEquipes.tsx`.
Ela sai para uma função pura (ex.: `montarEquipe(fontes, equipeId)`) usada pelo
Painel e pela tela nova — assim os dois não podem divergir. Teste de paridade: os
mesmos dados de entrada dão o mesmo acumulado, meta e projeção nos dois caminhos.

Leveza: `/m/equipe` é outro chunk `lazy()`; a aba Gráfico e a aba Hoje só buscam
dados quando abertas; sem canal Realtime novo — recarrega ao abrir, ao voltar para o
app e quando chega um aviso (mesmo mecanismo da `/m`).

---

## 3. Aviso «equipe bateu a meta»

### Texto

- **Líder** (e elite que lidera): título «🎯 Equipe Bryan bateu a meta!», corpo
  «Meta do mês batida hoje · toque para ver a equipe».
- **Operador da equipe**: título «🎯 Sua equipe bateu a meta!», corpo «A equipe
  Bryan bateu a meta do mês».
- **Sem valores no texto**, como no aviso de meta do operador (a tela de bloqueio é
  pública).
- Quem é líder e membro da mesma equipe recebe **um** aviso (o de líder).
- `tag`: `meta-equipe:<equipe>:<mês>`. Toque: líder → `/m/equipe?equipe=<id>`;
  operador → `/m`.

### Detecção: por estado, não por diferença

O servidor não compara «antes × depois do lote». Pergunta só: **a equipe está em
100% ou mais da meta do mês, e ainda não avisou este mês?** Se sim, avisa e grava o
marco. Isso resolve sozinho reimportação, lote atrasado e rodada que falhou.

- `push_marcos_equipe` — `(equipe_id, mes)` **único**, `empresa_id`, `batida_em`.
  Um aviso por equipe por mês (decisão 12). Se a meta for alterada depois, não
  avisa de novo no mesmo mês.
- **Recebido da equipe no servidor**: a conta já existe em SQL, igual ao Painel, dentro
  de `fn_desafio_contexto_equipe` (migration `20260930115849` — regra do setor da
  pessoa, fantasmas, clones, `total_ho`). Ela sai para uma função própria
  `fn_recebido_mes_por_equipe(p_empresas uuid[], p_mes text)`, que o desafio e o aviso
  passam a chamar — **uma conta só**. PaguePlay compara `total_ho` com a meta
  convertida pelo `ho_percentual` da empresa (mesma conta de `metaEmHO`).
- **Ao ligar**: a migration grava o marco das equipes que **já** passaram de 100% no
  mês corrente, para não disparar uma leva de avisos velhos no primeiro minuto.

### Quando verificar

O aviso de pagamento só enfileira linha de quem tem aparelho inscrito — mas a meta da
equipe sobe com o pagamento de **qualquer** operador. Por isso o mesmo gatilho por
comando (`trg_analitico_push_fila`) passa a marcar também
`push_equipes_verificar (empresa_id, mes)` — **uma linha por comando**, `ON
CONFLICT DO NOTHING`, só quando o lote tem linha do mês corrente.

- `fn_push_disparar` (cron, a cada minuto) chama a Edge Function se houver pendente na
  fila **ou** marca de verificação. Parado continua custando uma consulta de índice.
- A rodada da `enviar-push` chama `fn_push_metas_equipe_batidas(empresa, mes)`
  (SECURITY DEFINER, só `service_role`): calcula as equipes da empresa uma vez, grava os
  marcos novos com `INSERT … ON CONFLICT DO NOTHING RETURNING` e devolve só as
  equipes que bateram agora, já com os destinatários. Apaga a marca de verificação.
- **Destinatários**: líderes da equipe (a regra do `lideresDaEquipe` em SQL, com teste
  de paridade contra o TS) + membros (`perfis.equipe_id` com cargo que conta no
  recebimento + clones `conta_recebimento`), ativos, sem férias/desligados, **com
  aparelho inscrito**.
- Ajuste manual de recebimento não passa pelo gatilho: se ele empurrar a equipe para
  100%, o aviso sai na próxima importação.
- Desligar: `push_config.ativo = false` desliga tudo; uma chave própria
  `avisar_meta_equipe` desliga só este aviso.

---

## 4. Erros e casos-limite

- Líder sem equipe: tela explica e oferece «Versão completa». Nenhum erro.
- Equipe sem meta: tela mostra recebido e «Sem meta»; nunca gera aviso.
- Equipe sem operadores / sem recebimento no mês: zeros, sem quartis, sem erro.
- Líder de equipes em setores diferentes: o seletor mostra «Equipe · Setor».
- Clone: a equipe em que a pessoa é clone soma o recebimento dela (mesma regra do
  Painel) e ela recebe o aviso das duas.
- Virada de mês: o marco é por mês; o mês novo começa sem marco.
- Limpar e reimportar: o marco sobrevive; não avisa de novo.
- Falha na rodada: a marca de verificação fica, a próxima rodada tenta de novo.
- Sem permissão de ler o analítico dos outros: aba Hoje sem a lista de pagamentos.

---

## 5. Testes

- `destinoMobile` / `ehPerfilDaTelaMinima` por cargo; elite com e sem equipe.
- `equipesQueLidero`: explícito manda, reserva, clone, `jaLideraAlgo`.
- `montarEquipe`: **paridade** com o que o `DesempenhoEquipes` mostra para as mesmas
  fontes (BookPlay e PaguePlay em H.O.).
- Quartis: quem sai da tabela (férias, sem meta), quem puxa / precisa de ajuda.
- Gráfico: dias úteis, hoje parcial, dias futuros, meta diária (função pura que gera
  as barras; o SVG só desenha).
- SQL (`*.sql.test.ts`): o desafio e o aviso usam a mesma
  `fn_recebido_mes_por_equipe`; marco único por equipe/mês; semente ao ligar; gatilho
  marca verificação uma vez por comando; destinatários = regra do `lideresDaEquipe`.
- Texto dos avisos (líder × operador, sem valores, deduplicação líder-membro).

Manual antes de liberar: um líder e um elite no Android e no iPhone — trocar de
equipe, trocar Eu / Equipe, conferir os números contra o Painel do Líder.

---

## Entrega

1. **L1 — Tela da equipe** (`/m/equipe`, abas, troca do elite, redirecionamento do
   líder). Não mexe no banco.
2. **L2 — Aviso de meta da equipe** (`fn_recebido_mes_por_equipe`,
   `push_marcos_equipe`, `push_equipes_verificar`, gatilho, `enviar-push` v3).

Banco é produção (`CLAUDE.md`): a migration da L2 é mostrada com o SQL exato e só roda
com o «pode». Registrar a versão aplicada.

## Para confirmar na aprovação

- Texto do aviso sem valores (como o de meta do operador) — ok?
- Aba Hoje sem permissão de analítico da equipe: mostrar só os agregados — ok?
