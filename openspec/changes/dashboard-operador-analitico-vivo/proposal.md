## Why

O dashboard do operador está poluído: mistura métricas de tabulação, analítico e agendamento sem hierarquia clara, e não responde as perguntas diárias do operador ("quanto fiz, quanto falta hoje, em que ritmo estou, onde estou no ranking"). O dashboard de referência (Controle Receptivo) organiza isso em cards objetivos: total recebido vs meta, direto/extra, projeção, valor esperado por dias úteis, diferença, quartil, baixa anterior, meta do dia e posição no ranking.

A visão do operador no Analítico ("Meus recebimentos") também está "sem vida": tabela crua, pouco atrativa, com informação de cliente truncada. Falta um detalhamento por forma de pagamento (cards + distribuição + registros filtráveis por NR/cliente/forma/data) — para o operador ver só o dele e o líder/supervisor ver o setor geral.

## What Changes

- **Dashboard do operador (BookPlay/PaguePlay)** — novo bloco de cards no estilo do print de referência, com a estética do Gestão de Acordos, alimentado pelo relatório analítico + metas já existentes (`MetaProgressoHeader` já calcula tudo):
  - Total recebido (com meta individual), Recebimento Direto, Recebimento Extra — quando o setor NÃO tem lógica direto/extra, exibe apenas o card normal de recebido (sem direto/extra).
  - Projeção % (anel), Valor esperado ("com base em X de Y dias úteis"), Diferença para projeção (+/− colorido).
  - Análise por Quartil (card colorido com mensagem do quartil atual).
  - Recebido baixa anterior (dias desde o último dia útil: ex. sexta–domingo, com nº de registros).
  - Meta de hoje (barra de progresso: recebido hoje ÷ meta diária, "faltam R$ X").
  - Posição no ranking (#N).
  - Mantém o gráfico "Recebido vs Agendado — por dia" existente.
  - Reduz a poluição atual: os cards antigos redundantes do painel do operador dão lugar a este bloco.
- **Analítico do operador — visual "vivo"**: tabela de recebimentos detalhada por cliente (código + nome completo destacado, instituição), NR documento, badge de tipo Direto/Extra (somente quando o setor tem a lógica ativa e a linha tem acordo vinculado), data e valor. SEM coluna de usuário (é o próprio operador), SEM coluna de comissão. Badges de forma coloridos, hover, hierarquia visual. Mantém Tabular acordo, filtro de período e cards de resumo.
- **Detalhamento por Forma de Pagamento** (nova seção no Analítico):
  - Cards por forma (valor, % do total, nº de registros) + card Total Geral destacado.
  - Distribuição em barras horizontais com % e valores.
  - "Filtros dos Registros": cliente, documento (NR), forma de pagamento, data.
  - Tabela "Registros Detalhados" paginada.
  - **Operador**: vê apenas os próprios dados; campo operador travado com o próprio nome; coluna usuário oculta.
  - **Líder/supervisor**: vê o setor geral, com filtros de operador (autocomplete), equipe e classe/setor; coluna usuário visível.
- Nenhuma lógica existente é removida ou quebrada: tabulação, ranking, escopo de setor/clone/órfão, permissões e tenants continuam como estão.

Sem mudança de banco. Nenhuma migration.

## Capabilities

### New Capabilities
- `dashboard-operador-metas`: Bloco de cards do dashboard do operador (recebido/meta, direto/extra condicional, projeção, valor esperado, diferença, quartil, baixa anterior, meta de hoje, ranking), calculado a partir do analítico + metas config, com fallback quando o setor não tem lógica direto/extra ou não há meta.
- `analitico-operador-vivo`: Reformulação visual e informacional da visão "Meus recebimentos" do operador no Analítico (cliente detalhado, sem usuário/comissão, tipo condicional).
- `detalhamento-forma-pagamento`: Seção de detalhamento por forma de pagamento (cards, distribuição, filtros por cliente/NR/forma/data, registros paginados) com escopo por papel (operador = próprio; líder+ = setor).

### Modified Capabilities
<!-- Nenhuma capability formal existente em openspec/specs/. -->

## Impact

- **Dashboard**: `src/pages/Dashboard/index.tsx`, novo componente de cards (ex. `src/components/DashboardOperadorCards/`), reuso de `MetaProgressoHeader` (lógica de meta/ranking/quartil extraída para hook reutilizável), `useAnaliticoDashboard`, `lib/diasUteis`, `useDiretoExtraConfig`.
- **Analítico operador**: `src/pages/Dashboard/Analitico/AnaliticoOperador.tsx` (tabela nova + sub-aba "Detalhado"), `TabulacaoCell` intocado.
- **Detalhamento forma pagamento**: novo componente compartilhado (ex. `src/pages/Dashboard/Analitico/DetalhamentoFormaPagamento.tsx`) usado na visão do operador e na do líder (`AnaliticoLider.tsx`); helper de rótulo/cor de forma em `src/lib/formaPagamento.ts`; agregação em `analitico.service.ts`.
- Sem dependências novas (shadcn, recharts, lucide, framer-motion já presentes). Sem migration. PaguePlay pós-reorganização (abas movidas ao Painel Líder) não é afetado — mudanças ficam no Analítico BookPlay e nos componentes compartilhados.
