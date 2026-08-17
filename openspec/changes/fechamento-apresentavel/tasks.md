# Tarefas — Fechamento apresentável

## 1. Refatoração sem mudar a saída

Rede de segurança antes de tocar no visual: os testes atuais de `fechamentoHtml.test.ts` (escape, autocontenção, estrutura no DOM, recorte do operador, nome do arquivo) precisam continuar verdes em cada passo deste grupo.

- [x] 1.1 Extrair a folha de estilo de `fechamentoHtml.ts` para `fechamentoCss.ts`, exportada como string, com tokens em `:root` e blocos de `prefers-color-scheme: dark` e `@media print`
- [x] 1.2 Criar `graficos/paleta.ts` com `COR_QUARTIL`, `corDaProjecao`, paleta de formas e os helpers de escala compartilhados
- [x] 1.3 Mover o gráfico de barras diárias para `graficos/barrasDiarias.ts` como função pura, com teste próprio
- [x] 1.4 Mover o donut para `graficos/donut.ts` como função pura, com teste próprio
- [x] 1.5 Mover a barra de progresso para `graficos/progressoMarcos.ts` (ainda sem marcos), com teste próprio
- [x] 1.6 Quebrar as seções atuais em `secoes/capa.ts`, `secoes/visaoDoMes.ts`, `secoes/operadores.ts`, `secoes/quartis.ts`, `secoes/ranking.ts`, `secoes/destaques.ts`, `secoes/diretoria.ts`
- [x] 1.7 Reduzir `fechamentoHtml.ts` a: montar a casca, injetar CSS e JS, juntar as seções e decidir quais existem
- [x] 1.8 Rodar `npm run typecheck`, a suíte completa e o build — a saída HTML deve estar equivalente à anterior

## 2. Gráficos novos

- [x] 2.1 `graficos/pizzaQuartis.ts` — setores por quartil, com cor oficial, contagem na legenda e quartil vazio listado com zero
- [x] 2.2 Tratar no `pizzaQuartis` o caso de todos no mesmo quartil (círculo completo, não arco de volta inteira)
- [x] 2.3 `graficos/rankingBarras.ts` — barras horizontais proporcionais ao maior valor, com destaque para os três primeiros
- [x] 2.4 `graficos/sparkline.ts` — linha de tendência compacta do recebimento diário de uma pessoa
- [x] 2.5 Estender `progressoMarcos.ts` para aceitar marcos de metas em cascata, com rótulo por degrau e tratamento do realizado acima do último marco
- [x] 2.6 Estender `barrasDiarias.ts`: distinguir fim de semana e feriado dos dias úteis, e acomodar a linha da meta quando ela for maior que o melhor dia
- [x] 2.7 Estender `donut.ts`: agregar em "outras" as formas que excedem a paleta, somando o valor na legenda
- [x] 2.8 Garantir em todos os gráficos: cores por `var(--…)`, rótulo acessível, `viewBox` proporcional e informação nunca dependente só de cor
- [x] 2.9 Teste de legibilidade monocromática: cada fatia e faixa tem rótulo ou valor associado no markup

## 3. Coleta de dados nova

- [x] 3.1 Reorganizar `fechamento.service.ts` em duas ondas: obrigatória e tolerante a falha, com a onda 2 registrando observação quando algo falhar
- [x] 3.2 `coleta/pix.ts` — Pix do mês no escopo via `fetchAcordosPix({ operadorId, setorId })`, com totais por `comissaoDe`, `totaisPorStatus` e `acordosFeitosNoMes`
- [x] 3.3 `coleta/pix.ts` — meta de Pix por equipe e consolidado do setor, reusando o cálculo de `PixMetaPainel`; equipe sem meta aparece com realizado e marcação
- [x] 3.4 `coleta/pix.ts` — dobra de comissão via `calcularDobraComissao`, quando o setor tiver a regra configurada
- [x] 3.5 `coleta/mesAnterior.ts` — total, meta e quantidade de pagamentos do mês anterior no MESMO escopo, com ausência explícita quando não houver base
- [x] 3.6 `coleta/seriesPorOperador.ts` — UMA leitura paginada de `analitico_recebimentos` no mês, agregada em memória por `(operador_id, dia)`
- [x] 3.7 Ler `metas.metas_extras` junto com `meta_valor` e expor as metas em cascata por operador e por grupo
- [x] 3.8 Estender `tipos.ts` com os blocos novos: Pix, mês anterior, séries por operador, metas em cascata, curiosidades
- [x] 3.9 Teste do recorte de escopo na coleta de Pix: operador não recebe ranking nem meta de equipe; líder não recebe outro setor

## 4. Curiosidades

- [x] 4.1 `curiosidades.ts` — maior pagamento único do mês no escopo
- [x] 4.2 `curiosidades.ts` — dia de pico e quanto ele representa do mês
- [x] 4.3 `curiosidades.ts` — maior sequência de dias úteis acima da meta diária
- [x] 4.4 `curiosidades.ts` — quem mais subiu de posição contra o mês anterior
- [x] 4.5 `curiosidades.ts` — forma de pagamento que mais cresceu contra o mês anterior
- [x] 4.6 Cada curiosidade é omitida quando falta base (sem meta, sem mês anterior), nunca estimada — com teste por caso

## 5. Redesenho das seções existentes

- [x] 5.1 Capa: total em destaque, meta ao lado, percentual e a frase de veredito derivada dos mesmos números
- [x] 5.2 Capa: variantes de meta batida, não batida, sem meta e mês em curso
- [x] 5.3 Visão do mês: cartões no padrão do app, evolução diária, donut de formas e o bloco Direto/Extra
- [x] 5.4 Seção de comparativo com o mês anterior, com variação em valor e percentual e ausência explícita quando não houver base
- [x] 5.5 Operadores: tabela redesenhada no padrão de `QuartisOperadores`, com pílula de quartil e cor de projeção
- [x] 5.6 Quartis: pizza de distribuição ao lado das listas por faixa
- [x] 5.7 Ranking: pódio dos três primeiros mais barras horizontais para a lista completa
- [x] 5.8 Destaques do dia: manter, no padrão visual novo
- [x] 5.9 Diretoria: comparativo entre setores com participação visual e cor de projeção

## 6. Seção de Pix Automático

- [x] 6.1 `secoes/pix.ts` — cartões de valor total, quantidade, comissão gerada e percentual aplicado
- [x] 6.2 Aviso, em texto, de que o valor do Pix já está contido no recebimento do analítico
- [x] 6.3 Tabela de meta por equipe com realizado, meta, percentual e projeção, mais o consolidado do setor
- [x] 6.4 Ranking de Pix por operador com destaque para os três primeiros
- [x] 6.5 Bloco de dobra de comissão, renderizado só quando o setor tiver a regra
- [x] 6.6 Seção omitida por completo quando o escopo não tiver Pix no mês — inclusive da navegação

## 7. Fechamento individual por operador

- [x] 7.1 `secoes/individual.ts` — página por pessoa com recebido, meta, percentual, quartil, diferença, quantidade e posição no ranking
- [x] 7.2 Sparkline da evolução diária da pessoa e as formas de pagamento dela
- [x] 7.3 Bloco de Pix da pessoa dentro da página individual
- [x] 7.4 Barra de metas em cascata com marcos, metas batidas e o que falta para a próxima
- [x] 7.5 Variantes: sem meta (informa em vez de mostrar 0%) e sem movimento (zero explícito)
- [x] 7.6 Índice clicável de pessoas na abertura da seção, ordenado por recebimento
- [x] 7.7 Agrupamento por setor no nível diretoria, com o nome do setor como divisor
- [x] 7.8 Teto de 30 páginas por valor recebido, informando quantos ficaram de fora sem removê-los das demais seções
- [x] 7.9 Teste de vazamento de escopo por nível: varrer o HTML gerado procurando nome de quem não deveria estar lá

## 8. Modo apresentação e impressão

- [x] 8.1 JavaScript embutido do modo apresentação: uma seção por vez, setas ← →, Esc para sair, indicador "N de M"
- [x] 8.2 Sair do modo devolve o leitor à seção em que estava
- [x] 8.3 Controle visível de entrada no modo, dentro da navegação
- [x] 8.4 Sem JavaScript, todas as seções aparecem empilhadas e legíveis — com teste
- [x] 8.5 Impressão abre todas as seções, com quebra de página entre elas e sem fatiar cartão, tabela ou gráfico
- [x] 8.6 Controles de navegação e de apresentação somem na impressão

## 9. Ressalvas e observações

- [x] 9.1 Revisar as ressalvas existentes no padrão visual novo, nomeando causa e caminho de correção
- [x] 9.2 Ressalva de cobertura de Direto/Extra abaixo do limite, com o caminho de reimportação
- [x] 9.3 Ressalva quando a onda 2 da coleta falhar, dizendo qual seção não pôde ser montada
- [x] 9.4 Seção de observações omitida quando nenhuma ressalva se aplica

## 10. Verificação

- [x] 10.1 Teste de estrutura no DOM: toda seção do menu existe, exatamente uma ativa, nenhum `img` remoto, nenhum `parsererror`
- [x] 10.2 Teste de autocontenção: nenhuma URL externa, nenhum `script src`, nenhum `link stylesheet`
- [x] 10.3 Teste de escape com nome contendo marcação e aspas, nos campos novos (Pix, individual, curiosidades)
- [x] 10.4 Teste de teto de tamanho do arquivo com dados de diretoria realistas — fixar o limite acordado no design
- [x] 10.5 Gerar amostra com dados realistas para conferência visual em claro, escuro, projeção e impressão
- [ ] 10.6 Medir o tempo de geração no escopo de diretoria e decidir se a RPC de agregação por operador e dia passa a ser necessária
- [x] 10.7 `npm run typecheck`, suíte completa, `npm run lint` sem erros novos e `npm run build`
- [x] 10.8 Validar no localhost: baixar o fechamento nos três níveis (operador, líder, diretoria) e conferir o recorte de cada um

## 11. Questões em aberto do design

- [x] 11.1 Fixar o teto de bytes do arquivo, medido na primeira amostra realista
- [ ] 11.2 Decidir, com dados reais, quais curiosidades ficam e quais são ruído
- [x] 11.3 Decidir se o comparativo com o mês anterior entra no escopo de operador ou fica só em setor e diretoria
- [x] 11.4 Decidir se o nível diretoria usa teto global de páginas individuais ou teto por setor
