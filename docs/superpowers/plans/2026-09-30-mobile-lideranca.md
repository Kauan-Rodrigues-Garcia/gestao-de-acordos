# Mobile da liderança — Plano de implementação

> **Execução:** inline, tarefa a tarefa. Passos em checkbox (`- [ ]`).
> A **L1** está detalhada. A **L2** está em roteiro: o passo a passo é escrito
> quando começar, com o código da época.

**Objetivo:** líder (e elite que lidera) abre no celular a visão da equipe no
modelo do Painel do Líder — Equipe, Quartis, Gráfico, Hoje — e recebe aviso quando
a equipe bate a meta do mês.

**Spec:** `docs/superpowers/specs/2026-09-30-mobile-lideranca-design.md` (aprovada
em 30/09/2026, visual v2 `docs/mobile/prototipo-lider.html`)
**Conversa:** `docs/MOBILE-PWA-EM-ANDAMENTO.md` → «Liderança»

**Arquitetura:** rota nova `/m/equipe` (lazy, chunk próprio) ao lado da `/m`. Os
números não têm conta nova: as contas que hoje vivem **dentro** dos componentes
`DesempenhoEquipes` e `QuartisOperadores` saem para funções puras testadas, que o
Painel e o celular passam a chamar. A busca de dados é a mesma do Painel do Líder,
feita uma vez por mês/empresa.

## Restrições globais

- Banco `vfrvvoetidtsqbbhdkmj` é produção (`CLAUDE.md`): nenhuma leitura ou escrita
  sem «pode». **A L1 não toca o banco.**
- Nenhuma conta nova: as extrações são movimentação de código, e o Painel passa a
  usar a função extraída (o mesmo resultado, provado pelos testes que já existem e
  pelos novos).
- Cargos: `PERFIS_QUE_CONTAM_NO_RECEBIMENTO` para quem conta; `lider` para quem só
  lidera. Nunca uma lista nova escrita à mão.
- Sem canal Realtime novo, sem recharts no celular, `localStorage` em `try/catch`.
- A cada commit: testes do que mudou verdes. Antes do push: `npm test`,
  `npm run typecheck`, eslint dos arquivos tocados, `npm run build`.

## Achados que o plano resolve

- `lideresDaEquipe` recebe só perfis `lider` (`DesempenhoEquipes` busca
  `.eq('perfil', 'lider')`). Um **elite** só aparece como líder pelo vínculo
  explícito (`equipe_lideres`). `equipesQueLidero` segue isso: explícito vale para
  qualquer cargo; a reserva (`perfis.equipe_id` + clones) só para `lider` — a mesma
  regra de `jaLideraAlgo`.
- Equipe de **treinamento** usa dias úteis a partir do início dela (`treinoMap`),
  tanto no card quanto nos quartis. Vem junto.
- **Meta indireta** (PaguePlay) entra nos quartis via `combinarMetaDupla`. Vem junto
  pela extração.
- O **Gráfico** do site é por dia **corrido** (dia sem recebimento = buraco), a média
  é total ÷ dias com recebimento, o valor é bruto, e na PaguePlay as linhas vêm do
  recebimento diário + ajustes. O celular segue isso (o protótipo mostrava dias úteis).

---

## L1 — Tela da equipe (sem banco)

### Mapa de arquivos

| Arquivo | O quê |
|---|---|
| `src/lib/mobile/preferencia.ts` (+ test) | `lider` na tela mínima; `destinoMobile()` |
| `src/lib/mobile/equipesQueLidero.ts` (+ test) | quais equipes a pessoa lidera |
| `src/pages/Dashboard/Analitico/acumuladoDaEquipe.ts` (+ test) | extraído do `useMemo` de `DesempenhoEquipes` |
| `src/pages/Dashboard/Analitico/linhasQuartil.ts` (+ test) | extraído do `useMemo` de `QuartisOperadores` |
| `src/lib/mobile/graficoDia.ts` (+ test) | barras por dia, média, melhor dia (regra do `GraficoRecebimento`) |
| `src/lib/mobile/formato.ts` | valor abreviado («R$ 41,9 mil») |
| `src/pages/Mobile/equipe/useTelaEquipe.ts` | busca as fontes (as do Painel) e monta a equipe escolhida |
| `src/pages/Mobile/equipe/index.tsx` | a tela, cabeçalho, seletor, abas |
| `src/pages/Mobile/equipe/AbaEquipe.tsx`, `AbaQuartis.tsx`, `AbaGrafico.tsx`, `AbaHoje.tsx` | uma por aba |
| `src/pages/Mobile/equipe/Regua.tsx` | a régua (assinatura) |
| `src/pages/Mobile/equipe/equipe.css` | tokens do v2, escopados em `.tela-equipe` |
| `src/pages/Mobile/index.tsx` | troca Eu/Equipe do elite; líder → `/m/equipe` |
| `src/App.tsx` | rota `/m/equipe`; `PainelDeEntrada` usa `destinoMobile` |
| `src/pages/Mobile/EscolherOperador.tsx` | super admin também escolhe líder |

### Task L1.1: quem abre o quê

- [ ] Teste primeiro: `lider` celular sem marca → abre; `destinoMobile('lider')` →
  `/m/equipe`; operador/elite → `/m`; gerência → não abre.
- [ ] `ehPerfilDaTelaMinima` aceita `lider`; `destinoMobile(perfil)`.
- [ ] `ROUTE_PATHS.MOBILE_EQUIPE = '/m/equipe'`; `PainelDeEntrada` navega para
  `destinoMobile`.
- [ ] Commit.

### Task L1.2: `equipesQueLidero`

- [ ] Teste primeiro com os casos de `lideresDaEquipe.test` (Bryan × Kauan,
  `jaLideraAlgo`), + elite só pelo explícito, + clone de líder.
- [ ] Implementar a partir das mesmas três fontes.
- [ ] Commit.

### Task L1.3: extrair o acumulado da equipe

- [ ] `acumuladoDaEquipe.ts`: `somarPorEquipe({ resumos, operadorEquipeMap,
  equipesExtrasPorOperador, creditosDeOrigem })` → `Record<equipe, SomaDoSetor>`;
  `diasDaEquipe({ ano, mes, feriados, hoje, contarHoje, inicioTreino })`.
- [ ] `DesempenhoEquipes` passa a chamar as duas (comportamento igual).
- [ ] Testes: principal + clone (sem contar duas vezes na própria), crédito de
  origem, ajuste junto, treinamento.
- [ ] `npx vitest run src/pages/Dashboard/Analitico` verde. Commit.

### Task L1.4: extrair as linhas dos quartis

- [ ] `linhasQuartil.ts`: `montarLinhasQuartil(entrada)` → `{ porSetor, semMeta }`,
  com o corpo atual do `useMemo` (férias/desligado/arquivado, recorte, sem meta,
  treinamento, H.O., meta indireta, ordenação) e `distribuicaoQuartis(linhas,
  quartis)`.
- [ ] `QuartisOperadores` passa a chamar (comportamento igual).
- [ ] Testes: saídas de férias/desligado, arquivado em mês passado, sem meta,
  recorte por equipe com clone, H.O., ordem.
- [ ] Commit.

### Task L1.5: gráfico por dia

- [ ] Teste primeiro: soma por dia, dia sem valor = `null`, média = total ÷ dias com
  valor, melhor dia, dia de hoje marcado, escopo de equipe (`linhaNoEscopo`).
- [ ] Implementar com a mesma regra do `GraficoRecebimento`.
- [ ] Commit.

### Task L1.6: dados da tela

- [ ] `useTelaEquipe`: `buscarEquipesComOperadores`, `buscarResumoOperadoresAnalitico`,
  `buscarCreditosDeOrigem`, metas (`setor/equipe/operador`), `getMetasConfig`,
  equipes de treinamento, perfis `lider` + `equipe_lideres` + clones (para
  `equipesQueLidero`), perfis que contam (nome/situação) — as consultas do Painel.
  Equipe escolhida lembrada em `localStorage['mobile:equipe']`.
- [ ] Gráfico e Hoje só buscam quando a aba abre: `buscarRecebidoPorDia` (BookPlay) ou
  `buscarResumoMensalDiario().linhasDia` + ajustes (PaguePlay); pagamentos com
  `buscarAnalitico` dos operadores da equipe (sem permissão → só agregados).
- [ ] Recarrega em `visibilitychange` e no aviso do service worker (como a `/m`).
- [ ] Commit.

### Task L1.7: tela

- [ ] `equipe.css` com os tokens do v2; `Regua`; cabeçalho (seletor de equipe, troca
  Eu/Equipe do elite, sino), abas no rodapé.
- [ ] Aba Equipe (card escuro + régua com «esperado hoje», frase da projeção, ritmo,
  quanto falta por faixa hoje/amanhã via `degrausComAmanha`).
- [ ] Aba Quartis (barra + filtros por faixa, ordem, lista com régua, folha de
  detalhe com `detalharOperador`, «Mandar resumo no WhatsApp» com
  `montarMensagemOperador` → `navigator.share`, cópia como reserva).
- [ ] Aba Gráfico (SVG próprio, leitura do dia tocado) e aba Hoje.
- [ ] Estados: carregando, sem equipe liderada, equipe sem meta, sem relatório.
- [ ] Testes de componente: filtros, folha, troca Eu/Equipe, estados vazios.
- [ ] Commit.

### Task L1.8: verificação e push

- [ ] `npm test`, `npm run typecheck`, eslint dos tocados, `npm run build` (conferir
  que `/m/equipe` virou chunk próprio sem recharts).
- [ ] Conferência visual numa prévia com dados fictícios em viewport de celular (o
  app local não lê o banco de produção).
- [ ] Atualizar `docs/MOBILE-PWA-EM-ANDAMENTO.md`.
- [ ] Push na branch. Pedir ao usuário: conferir no preview da Vercel com um líder e
  um elite, comparando com o Painel do Líder.

---

## L2 — Aviso «equipe bateu a meta» (roteiro)

- Migration: `fn_recebido_mes_por_equipe(p_empresas uuid[], p_mes text)` extraída de
  `fn_desafio_contexto_equipe` (que passa a chamá-la); `push_marcos_equipe`
  `(equipe_id, mes)` único + semente das equipes já em 100%;
  `push_equipes_verificar (empresa_id, mes)`; gatilho da fila marca verificação;
  `fn_push_disparar` olha as duas; `fn_push_metas_equipe_batidas(empresa, mes)` com
  destinatários (líderes pela regra do `lideresDaEquipe` + membros, com aparelho) —
  **SQL mostrado, espera «pode»**.
- `enviar-push` v3: rodada chama a verificação; textos de líder e de operador sem
  valores; deduplicação líder-membro; `tag` `meta-equipe:<equipe>:<mês>` — deploy
  **com «pode»**.
- Testes SQL e de texto (spec §5).
