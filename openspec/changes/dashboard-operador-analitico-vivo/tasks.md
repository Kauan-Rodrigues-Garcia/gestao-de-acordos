## 1. Fundamentos (helper + agregação)

- [x] 1.1 Criar `src/lib/formaPagamento.ts`: `rotuloFormaPagamento(forma, detalhe)` (rótulo canônico) e `corFormaPagamento(rotulo)` (cor estável por forma)
- [x] 1.2 Teste unitário do helper (BookPlay com detalhe, PaguePlay sem, cores estáveis)
- [x] 1.3 Criar `agruparPorFormaPagamento(linhas)` em `analitico.service.ts` ({ formas: rotulo/valor/qtd/perc ordenado desc, totalValor, totalQtd })
- [x] 1.4 Teste unitário da agregação (total = soma, % ≈ 100, dois tenants, vazio)

## 2. Hook useMetaOperador (extração do MetaProgressoHeader)

- [x] 2.1 Criar `src/hooks/useMetaOperador.ts` expondo: metaValor, config (dias úteis/quartis/feriados), recebidoMes, recebidoHoje, porDia, metaDiaria, esperadoAteHoje, diferenca, projecaoPct, quartil, posicaoRanking, diasUteisTotais/decorridos, carregado
- [x] 2.2 Refatorar `MetaProgressoHeader` para consumir o hook sem mudança visual/comportamental
- [x] 2.3 Adicionar cálculo "baixa anterior" no hook: dias entre último dia útil anterior (considerando feriados da config) e ontem — { valor, qtdRegistros, labelDias, periodo }
- [x] 2.4 Teste do hook (paridade dos números com o comportamento do header + baixa anterior segunda×dia comum)

## 3. DashboardOperadorCards

- [x] 3.1 Criar `src/components/DashboardOperadorCards/index.tsx`: grid de cards (Total recebido+meta, Direto, Extra, Projeção com DonutChart, Valor esperado, Diferença, Quartil colorido, Baixa anterior)
- [x] 3.2 Fileira Meta de hoje (barra de progresso, % do dia, faltam R$X) + Posição no ranking (#N)
- [x] 3.3 Condicionais: sem meta → cards de meta somem; setor sem direto/extra → só card normal de recebido (via `useDiretoExtraConfig.isAtivoParaUsuario`)
- [x] 3.4 Integrar no Dashboard para perfil operador/elite em visão individual; ocultar `MetaProgressoHeader` nesse caso (sem afetar demais perfis)
- [x] 3.5 Adicionar prop no `AnalyticsPanel` para ocultar cards redundantes quando o bloco novo está ativo (default = comportamento atual); manter gráfico Recebido vs Agendado intacto

## 4. Analítico do operador — visual vivo

- [x] 4.1 Reformular a tabela de Meus recebimentos em `AnaliticoOperador.tsx`: cliente em destaque (nome + código), NR mono, badge de forma com cor canônica, data, valor; SEM coluna usuário e SEM comissão
- [x] 4.2 Badge tipo Direto/Extra condicional: setor com lógica ativa + linha com acordo vinculado (buscar `tipo_vinculo` em lote pelos `acordo_id`); sem acordo → sem badge
- [x] 4.3 Preservar TabulacaoCell, filtro de período, indicador não-visto, cards de resumo e rowSpan de pagamentos múltiplos
- [x] 4.4 Polir hierarquia visual (hover, espaçamento, dark/light) mantendo shadcn/tokens

## 5. Detalhamento por Forma de Pagamento (compartilhado)

- [x] 5.1 Criar `src/pages/Dashboard/Analitico/DetalhamentoFormaPagamento.tsx` com prop `modo: 'operador' | 'lider'`
- [x] 5.2 Cards por forma + Total Geral (agrupado) + distribuição em barras horizontais (cor canônica, % na barra, valor+qtd ao lado)
- [x] 5.3 Bloco "Filtros dos Registros": cliente (texto), documento/NR (texto), forma (select), data; Limpar; filtros afetam cards+barras+tabela
- [x] 5.4 Tabela "Registros Detalhados" paginada (~50/página) com total no cabeçalho; coluna Usuário só no modo líder
- [x] 5.5 Modo operador: sub-aba "Detalhado" em `AnaliticoOperador` (dados próprios, campo operador travado com o nome, sem equipe/setor)
- [x] 5.6 Modo líder: aba "Formas de pagamento" em `AnaliticoLider` com escopo setor/clone/órfão (`setoresDoOperador`), autocomplete de operador (sugestões ao digitar, nome+usuário), filtros equipe/classe conforme permissão
- [x] 5.7 Estados de loading e vazio nos dois modos

## 6. Verificação

- [x] 6.1 `tsc` e eslint limpos nos arquivos tocados; vitest (novos + existentes do painel/hooks) passando
- [ ] 6.2 Preview logada (operador): dashboard novo com cards corretos, meta de hoje e ranking; setor sem direto/extra sem os 2 cards; gráfico por dia intacto
- [ ] 6.3 Preview logada (líder): detalhamento com escopo de setor, autocomplete, filtro por NR refletindo em cards+tabela
- [x] 6.4 `openspec validate dashboard-operador-analitico-vivo` sem erros
