## Context

Pós-pull `a031bd4`: PaguePlay moveu Desempenho Equipes/Quartis/Gráfico do Analítico para o Painel Líder; o Analítico BookPlay mantém a estrutura com `AnaliticoLider`/`AnaliticoOperador`. O dashboard do operador hoje empilha `MetaProgressoHeader` (meta/ranking/quartil em barras) + `AnalyticsPanel` (cards de tabulação + analítico + gráficos) — denso e redundante.

Fontes de dado já existentes e reutilizáveis:
- `useAnaliticoDashboard` → linhas agregadas do mês (RPC `fn_analitico_dashboard_mes`, escopo servidor: operador vê só o seu), `porDia`, `porForma`, realtime.
- `MetaProgressoHeader` → já busca meta do operador, `MetasConfigMes` (feriados, quartis, contar_dia_atual), ranking (`buscarResumoOperadoresAnalitico`) e calcula projeção/quartil com `lib/diasUteis`. Essa lógica será extraída para um hook (`useMetaOperador`) para alimentar tanto o header quanto os novos cards.
- `useDiretoExtraConfig.isAtivoParaUsuario` → decide se o setor tem direto/extra.
- Direto/extra do operador: derivado dos acordos tabulados do mês (`acordosMes` do `useAnalytics`, campo `tipo_vinculo`) — mesma fonte que o `AnalyticsPanel` usa hoje.
- `buscarAnalitico` → linhas completas (`AnaliticoRecebimento`) para o detalhamento (líder) — o operador usa `dados` já passados a `AnaliticoOperador`.

## Goals / Non-Goals

**Goals:**
- Dashboard do operador com os cards do modelo de referência, menos poluído, mantendo o gráfico Recebido vs Agendado.
- Analítico do operador visualmente vivo, sem colunas redundantes (usuário/comissão), tipo condicional.
- Detalhamento por forma de pagamento com filtros (cliente/NR/forma/data) e escopo por papel, compartilhado entre operador e líder.
- Reusar cálculo existente (diasUteis, quartis, ranking) — zero duplicação de matemática.
- Zero migration, zero dependência nova, zero quebra do que existe.

**Non-Goals:**
- Não mexer no Painel Líder PaguePlay (reorganizado no a031bd4).
- Não alterar tabulação, importação, permissões ou RPCs.
- Não implementar exportação Excel (fora de escopo).
- Não redesenhar o dashboard do líder/admin — só a visão do operador.

## Decisions

### 1. Hook `useMetaOperador` extraído do `MetaProgressoHeader`
Extrair a busca/cálculo (meta, config do mês, ranking, recebido analítico, projeção, quartil, meta diária, esperado, diferença, posição) para `src/hooks/useMetaOperador.ts`. `MetaProgressoHeader` e o novo bloco de cards consomem o mesmo hook. **Por quê:** evita duplicar a matemática e garante que header e cards nunca divirjam. Alternativa (copiar cálculo no componente novo) descartada — foi a causa de divergências passadas (ver comentário em `setoresDoOperador`).

### 2. Novo componente `DashboardOperadorCards`
`src/components/DashboardOperadorCards/index.tsx` renderiza o grid de cards (2 fileiras + fileira meta-do-dia/ranking, como o print). Renderizado no Dashboard apenas para perfil operador/elite em visão individual. Cards dependentes de meta somem sem meta; direto/extra somem sem a lógica no setor. "Recebido baixa anterior" calculado de `porDia` do analítico (dias entre último dia útil anterior e ontem, via `ehDiaUtil`). O `AnalyticsPanel` continua existindo; a redução de poluição vem de ocultar no dashboard do operador os cards que o novo bloco já cobre (flag/prop no `AnalyticsPanel`), não de deletar código.

### 3. Detalhamento como componente compartilhado com `modo`
`DetalhamentoFormaPagamento.tsx` com prop `modo: 'operador' | 'lider'`:
- `operador`: recebe `dados: AnaliticoRecebimento[]` (os mesmos de `AnaliticoOperador`), campo operador travado, sem equipe/setor, coluna usuário oculta. Vira sub-aba "Detalhado" ao lado de Meus recebimentos/Ranking.
- `lider`: busca via `buscarAnalitico({ empresaId, mes })` + escopo `setoresDoOperador` (clone/órfão), autocomplete de operador, filtros equipe/classe. Vira aba no `AnaliticoLider`.
**Por quê:** um componente, duas entradas — mesma UI, escopos diferentes; o servidor já garante que operador só recebe as próprias linhas.

### 4. Helper de forma de pagamento com cor canônica
`src/lib/formaPagamento.ts`: `rotuloFormaPagamento(forma, detalhe)` + `corFormaPagamento(rotulo)` (Pix=âmbar, Pix Automático=vermelho, Cartão=azul, Cartão Recorrente=violeta, Boleto Negociação/Boleto=verde, Boleto Bancário=teal, Recorrente=slate, default=indigo). Agregação `agruparPorFormaPagamento(linhas)` em `analitico.service.ts` (valor/qtd/%, ordenada, total = soma). Mesmo desenho da iteração anterior (revertida), recriado.

### 5. Tipo Direto/Extra no analítico do operador via acordo vinculado
A linha do analítico não tem `tipo_vinculo`; quando `acordo_id` existe, buscar o `tipo_vinculo` dos acordos vinculados (lote único por ids, join leve) e exibir badge. Sem acordo ou setor sem lógica → sem badge. **Por quê:** não inventa dado; usa o vínculo real da tabulação.

### 6. Layout dos cards fiel ao print, tokens do tema
Grid `sm:grid-cols-2 lg:grid-cols-4`; anel de projeção reusa `DonutChart` de `AnalyticsPanel/SubComponents`; card de quartil com fundo `COR_QUARTil+alpha`; meta de hoje com barra de progresso (padrão das barras existentes); tudo `Card` shadcn + `formatBRL` + dark/light.

## Risks / Trade-offs

- **[Duplicidade visual header × cards]** `MetaProgressoHeader` e os novos cards mostram meta/quartil/ranking → Mitigação: no dashboard do operador, exibir só o bloco novo (header compacto oculto para operador em visão individual, mantido para demais perfis/tenants).
- **[Busca de tipo_vinculo por linha]** N acordos vinculados → Mitigação: uma query em lote `in('id', acordoIds)` por render, cacheada no estado.
- **[Baixa anterior sem feriados]** `ehDiaUtil` não conhece feriados da config → Mitigação: usar os feriados de `MetasConfigMes` quando disponíveis (mesma config já carregada pelo hook).
- **[Cards demais em tela pequena]** → grid responsivo 2 colunas no mobile; card de ranking/meta-do-dia em fileira própria.
- **[Regressão no AnalyticsPanel]** por ocultar cards → Mitigação: ocultação por prop booleana com default preservando o comportamento atual; testes existentes do painel continuam passando.

## Migration Plan

Front-end puro, sem migration:
1. Helper forma pagamento + agregação + testes.
2. Hook `useMetaOperador` (extração) + testes de paridade com o header.
3. `DashboardOperadorCards` + integração no Dashboard (operador).
4. Revamp `AnaliticoOperador` (tabela viva + sub-aba Detalhado).
5. `DetalhamentoFormaPagamento` compartilhado + aba no `AnaliticoLider`.
6. Verificação (tsc, lint, vitest, preview logada).
Rollback: revert dos commits; nada persistido muda.

## Open Questions

- "Classe" do dashboard de referência = setor no Gestão de Acordos? Assumido setor (filtro já existente); rotular "Setor".
- Card "Recebimento Extra/Direto" para operador BookPlay usa acordos tabulados (`tipo_vinculo`) — aceitável que difira do total analítico quando houver não-tabulados? Assumido sim (mesmo comportamento do painel atual); o card Total recebido segue o analítico.
