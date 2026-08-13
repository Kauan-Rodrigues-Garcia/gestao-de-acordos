## 1. Matemática compartilhada

- [x] 1.1 Criar `src/lib/projecaoMetas.ts` com `calcularProjecao({ meta, recebido, totalUteis, decorridos, quartis })` devolvendo `{ metaDiaria, esperado, diferenca, projecaoPct, quartil, proximo, paraSubir }`, reusando `quartilAtual`/`proximoQuartil` de `lib/diasUteis.ts`
- [x] 1.2 Criar `src/lib/projecaoMetas.test.ts`: meta zero/nula, `totalUteis` zero, `decorridos` zero (piso 1), projeção acima de 100%, projeção exata na fronteira de quartil, quartis vazios caindo em `QUARTIS_PADRAO`
- [x] 1.3 Adicionar `ultimoDiaComRecebimento(porDia, hojeDia)` em `projecaoMetas.ts` — varre para trás e devolve `{ dia, bruto, qtd } | null`; teste cobrindo dia anterior vazio e primeiro dia do mês
- [x] 1.4 Reescrever o `useMemo` de `MetaProgressoHeader.tsx` sobre `calcularProjecao`, sem mudar nenhum número exibido
- [x] 1.5 Reescrever o bloco de cálculo por operador de `QuartisOperadores.tsx` sobre `calcularProjecao`, sem mudar nenhum número exibido
- [x] 1.6 Rodar `npm run typecheck` e a suíte completa — as duas reescritas têm que passar sem alterar expectativa de teste existente

## 2. Hook de dados do painel

- [x] 2.1 Criar `src/hooks/usePainelMetas.ts` recebendo `{ mes, escopoTipo: 'eu' | 'equipe', setorId, equipeId, operadorId }` e compondo `useAnaliticoDashboard` + `useEscopoAnalitico` + `getMetasConfig`
- [x] 2.2 Buscar a meta: `tipo: 'operador'` no modo "eu"; no modo "equipe", `tipo: 'equipe'` quando existir, senão soma das metas `operador` dos membros (mesma precedência de `useAnalytics.ts`)
- [x] 2.3 Resolver dias úteis com `diasUteisDoMes`/`diasUteisDecorridos`, passando feriados, `contar_dia_atual` e `treinamento_inicio` da equipe
- [x] 2.4 Devolver `carregando` verdadeiro enquanto analítico, escopo, metas ou config ainda faltarem — sem valor parcial
- [x] 2.5 Separar direto × extra por `acordos.tipo_vinculo` (tabulação) apenas quando `temLogicaDiretoExtra`, devolvendo também o não tabulado do analítico para fechar o total; caso contrário devolver `null` nos três, para o componente omitir os cards
- [x] 2.6 Teste do hook: escopo pendente devolve `carregando`, membro sem meta soma zero na meta e soma o recebido, clone com `conta_recebimento` entra pelo `useEscopoAnalitico`

## 3. Faixa de dias úteis

- [x] 3.1 Criar `src/components/PainelMetas/FaixaDiasUteis.tsx` com os três números (passados, restantes, total), calculando `restantes = total − passados`
- [x] 3.2 Aplicar a estética do projeto: `Card` com gradiente do primary, `tabular-nums font-mono` nos números, rótulos em `text-muted-foreground uppercase tracking-wide`
- [x] 3.3 Garantir tema claro/escuro e responsivo (três colunas em desktop, empilhado no mobile)
- [x] 3.4 Teste: feriado em dia útil reduz o total, feriado em fim de semana não reduz, mês fechado dá restantes zero, equipe em treinamento ignora dias antes do início — os casos de calendário ficam em `usePainelMetas.test.tsx`, que é onde a conta mora; o teste do componente cobre a exibição dos três números

## 4. Cards de recebimento e projeção

- [x] 4.1 Criar `src/components/PainelMetas/CardMetrica.tsx` ou reusar `MetricCard` de `AnalyticsPanel/SubComponents` — decidido pelo REUSO; só Projeção, Quartil e Baixa anterior ganharam bloco próprio, por serem visualmente distintos na referência
- [x] 4.2 Card Total recebido com "Meta Individual: <valor>" no subtexto, omitindo o subtexto quando não há meta
- [x] 4.3 Cards Recebimento direto, Recebimento extra e Não tabulado, os três renderizados só quando `temLogicaDiretoExtra`, com "por tabulação" no subtexto dos dois primeiros
- [x] 4.4 Card Projeção com anel percentual (SVG circular), cor de `corProjecao`
- [x] 4.5 Card Valor esperado com "Com base em N de M dias úteis"
- [x] 4.6 Card Diferença para projeção com sinal e cor (`COR_QUARTIL[1]` positivo, `COR_QUARTIL[4]` negativo) e legenda "Acima/Abaixo da meta projetada"
- [x] 4.7 Card Análise por quartil: faixa atual com fundo na cor do quartil, quanto falta em reais para a meta e % da meta alcançada; sem valor negativo quando a meta já foi batida
- [x] 4.8 Card Recebido baixa anterior usando `ultimoDiaComRecebimento`, com dia da semana, data e contagem de registros; omitido quando não há dia anterior com recebimento
- [x] 4.9 Omitir Projeção, Valor esperado, Diferença e Quartil quando não há meta, mantendo recebimento e gráfico
- [x] 4.10 Grid responsivo que não deixa buraco quando cards somem
- [x] 4.11 Teste de render dos cards: com meta e sem meta, com e sem Direto/Extra, meta batida, sem baixa anterior

## 5. Gráfico de evolução diária

- [x] 5.1 Criar `src/components/PainelMetas/EvolucaoDiaria.tsx` com `BarChart` do Recharts e `useAxisColors`, alimentado por `porDia`
- [x] 5.2 Colorir cada `<Cell>` por comparação com a meta diária (verde acima ou igual, azul abaixo) e cor neutra quando não há meta
- [x] 5.3 `<ReferenceLine>` na meta diária com rótulo do valor; omitida quando não há meta
- [x] 5.4 Rótulo do valor sobre cada barra; dias sem recebimento aparecem no eixo sem barra
- [x] 5.5 Destacar a barra do dia corrente apenas quando o mês em análise é o corrente
- [x] 5.6 Rodapé com dias com recebimento, total do mês e meta diária — total igual ao card Total recebido
- [x] 5.7 Teste: classificação verde/azul na fronteira exata da meta, sem meta some a linha, mês fechado não destaca "hoje" — a cor é testada por `corDaBarra` exportada, porque o Recharts mede 0×0 em jsdom e não renderiza `Cell` nenhuma

## 6. Alternador Eu / Minha equipe

- [x] 6.1 Detectar se o usuário lidera equipe (cargo + `perfil.equipe_id` ou `equipe_lideres`); quando não lidera, não renderizar o alternador
- [x] 6.2 Renderizar o alternador no topo do painel, nascendo em "Eu", no mesmo estilo dos botões de "Visualizar:" já presentes no header do Dashboard
- [x] 6.3 Ao alternar, trocar o escopo passado ao `usePainelMetas` de `{ tipo: 'operador' }` para `{ tipo: 'equipe', operadores }`
- [x] 6.4 Propagar o escopo ao gráfico — barras somam os membros e a linha de meta usa a meta diária agregada
- [x] 6.5 Não somar Contribuição Receptivo no modo equipe (ela é por setor) e explicitar isso no subtexto do card Total recebido
- [x] 6.6 Teste: operador comum não vê o alternador, líder alternando muda total/meta/projeção, membro sem meta não derruba o painel

## 7. Montagem no Dashboard e limpeza

- [x] 7.1 Criar `src/components/PainelMetas/index.tsx` compondo faixa, cards e gráfico, com esqueletos enquanto `carregando`
- [x] 7.2 Estado de "relatório ainda não importado": faixa de dias úteis mais mensagem, em vez de parede de R$ 0,00
- [x] 7.3 Montar `<PainelMetas />` em `src/pages/Dashboard/index.tsx` logo abaixo do `<AnalyticsPanel />`, passando `setorFiltro`, `equipeFiltroAtivo`, `operadorFiltroAtivo` e `temLogicaDiretoExtra` — os mesmos valores já entregues ao `AnalyticsPanel`
- [x] 7.4 Confirmar que `AnalyticsPanel` continua idêntico em posição, props e render
- [x] 7.5 Esvaziar `MetaProgressoHeader.tsx`: remover meta, quartil e ranking; avaliar deletar o componente se nada sobrar — nada sobrou, arquivo removido
- [x] 7.6 Migrar `data-tour="meta-progresso"` para o `PainelMetas` — o tour NÃO referenciava esse alvo (`OnboardingTour.tsx` usa só `metricas`/`filtros`/`tabela-acordos`/`novo-acordo`); o atributo já estava órfão e foi mantido no painel novo

## 9. Correções pedidas na revisão

- [x] 9.1 Direto/Extra passa a sair do ANALÍTICO: classificar `analitico_recebimentos` pelo vínculo do acordo (`acordo_id` → `tipo_vinculo`); linha sem acordo vira "sem vínculo definido" e a soma fecha com o total
- [x] 9.2 Faixa de dias úteis minimalista: uma linha, tipografia pequena, sem bloco azul cheio, só uma barra fina de progresso
- [x] 9.3 Evolução diária redesenhada — sem cópia da print: cor única em dois pesos, régua tracejada, sem rótulo por barra, destaque de hoje por contorno
- [x] 9.4 Mesclar a série "Agendado" (do gráfico antigo) na evolução diária, omitida quando não há agendamento
- [x] 9.5 Substituir o anel próprio pelo `DonutChart` do painel antigo, que é mais detalhado; deletar `AnelProjecao.tsx`
- [x] 9.6 Trazer os cards de forma de pagamento do painel antigo para o painel novo
- [x] 9.7 O painel vira o CORPO do `AnalyticsPanel` na BookPlay; a faixa "Dados Analíticos" continua o cabeçalho e controla o mês (o painel perde o `SeletorMes` próprio)
- [x] 9.8 Cards antigos que sobraram (Agendado, Não Pagos, Agendado hoje, Agendado restante, Acordos no mês, Taxa de conversão, Ticket médio) viram bloco recolhível; "Projeção do mês" é removido por conflitar com a projeção por dias úteis
- [x] 9.9 PaguePlay intocada: `PPMetrics`, `ChartsSection` e métricas adicionais seguem no caminho antigo
- [x] 9.10 Remover o mount duplicado de `<PainelMetas />` no Dashboard e passar `temLogicaDiretoExtra` sem o gate `isPP`

## 8. Verificação

- [x] 8.1 Teste de concordância: mesmas linhas de analítico e mesmo escopo produzem o mesmo total em `AnalyticsPanel` e `PainelMetas`, inclusive com Contribuição Receptivo
- [x] 8.2 `npm run typecheck` limpo
- [x] 8.3 Suíte completa verde
- [x] 8.4 `npm run build` fecha
- [ ] 8.5 Conferir no dev server (`localhost:8080`, tenant bookplay) como operador e como líder, nos dois temas e em viewport mobile — **BLOQUEADO**: o Dashboard fica atrás do login e eu não digito senha em formulário. O servidor sobe sem erro e a tela de login carrega limpa; falta alguém autenticar para a conferência visual
