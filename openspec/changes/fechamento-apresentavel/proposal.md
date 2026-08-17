# Fechamento apresentável

## Why

O relatório de fechamento do mês existe para ser **projetado numa reunião de diretoria** — e hoje ele perde feio para a própria tela do sistema. O Painel do Líder, a aba Quartis e o Pix Automático são muito mais ricos e mais bonitos do que o HTML que deveria representá-los; o arquivo entrega uma tabela cinza onde o app entrega pizza de quartis, pódio, barras de meta e projeção colorida.

O efeito prático é que o relatório não cumpre o papel para o qual foi feito: em vez de impressionar e explicar o mês, ele obriga quem apresenta a abrir o sistema ao lado para mostrar "como realmente está". Além do visual, faltam blocos inteiros do mês — Pix Automático não aparece, metas em cascata batidas não aparecem, e o fechamento individual de cada operador não existe como página própria.

## What Changes

A intenção é que o arquivo baixado leia como **uma apresentação de slides bem feita**, não como um dump de tabela: cada seção responde uma pergunta, abre com o número grande, sustenta com gráfico e fecha com a leitura em texto.

### Conteúdo novo

- **Capa de abertura** com o veredito do mês em uma frase (bateu / não bateu, por quanto, com que ritmo) antes de qualquer tabela.
- **Pix Automático**: total do mês, comissão gerada, ranking por operador, meta por equipe e o consolidado do setor, espelhando `PixMetaPainel` e `PixRankingSetor`.
- **Metas em cascata**: quantas das metas do mês (`metas.meta_valor` + `metas_extras`) foram batidas, por operador e pelo grupo, com marco visual de cada degrau.
- **Fechamento individual do operador**: uma seção por pessoa — recebido, meta, % alcançado, quartil, evolução diária, formas de pagamento e Pix — de modo que o líder consiga recortar e mostrar a página de um operador na avaliação dele.
- **Curiosidades do mês**: maior pagamento único, dia de pico, sequência de dias acima da meta diária, operador que mais subiu de posição, forma de pagamento que mais cresceu. São leituras derivadas dos dados que já estão no relatório.
- **Comparativo com o mês anterior**: variação de recebido, de meta e de conversão, para o número do mês ter régua.

### Redesenho visual

- Paleta, tipografia e componentes alinhados com o app (`COR_QUARTIL`, cartões, barras de progresso, pílulas de quartil), para o arquivo parecer o sistema e não outro produto.
- Gráficos de verdade em SVG: pizza de quartis (como `PizzaQuartis3D`), barras de evolução diária com meta, donut de formas, barras horizontais de ranking, sparkline por operador, barra de progresso de meta com marcos das metas em cascata.
- **Modo apresentação**: navegação por seções em tela cheia, com teclas ← → e Esc, para projetar sem depender de rolagem.
- Impressão continua abrindo todas as seções, agora com quebra de página por seção.

### O que NÃO muda

- Nenhum número novo é inventado: toda métrica continua saindo das mesmas fontes que a tela usa.
- O recorte por cargo (operador / setor / diretoria) segue como está.
- O arquivo continua autocontido, sem CDN e sem requisição externa.
- O botão continua aparecendo só em mês fechado.

## Capabilities

### New Capabilities

- `relatorio-fechamento-apresentacao`: o relatório de fechamento como peça de apresentação — estrutura de seções, narrativa, modo apresentação, impressão e as regras de design que o mantêm coerente com o app.
- `fechamento-pix-automatico`: o bloco de Pix Automático dentro do fechamento — total, comissão, ranking, meta por equipe e consolidado do setor, com o recorte por cargo.
- `fechamento-operador-individual`: a página de fechamento de cada operador dentro do relatório — o que ela mostra, para quem aparece e como se relaciona com o recorte de escopo.
- `fechamento-graficos`: a biblioteca de gráficos SVG do relatório (pizza de quartis, barras diárias, donut, ranking, sparkline, progresso com marcos) e as regras que a tornam legível em claro, escuro, projeção e papel.

### Modified Capabilities

<!-- Nenhuma. As capacidades do fechamento nunca foram especificadas em
     openspec/specs/ — a implementação atual nasceu fora do fluxo OpenSpec.
     Este change escreve a especificação delas pela primeira vez. -->

## Impact

**Código alterado**

- `src/services/fechamento/fechamentoHtml.ts` — reescrito; hoje é um arquivo único de ~700 linhas que mistura formatação, gráficos, seções e CSS.
- `src/services/fechamento/fechamento.service.ts` — passa a coletar Pix, metas em cascata, mês anterior e as séries por operador.
- `src/services/fechamento/tipos.ts` — cresce com os novos blocos.
- `src/components/Fechamento/BotaoFechamento.tsx` — sem mudança de comportamento; possivelmente um aviso de progresso mais longo, já que a coleta cresce.

**Código novo (previsto)**

- `src/services/fechamento/graficos/` — os geradores de SVG, puros e testáveis um a um.
- `src/services/fechamento/secoes/` — uma função por seção do relatório.
- `src/services/fechamento/curiosidades.ts` — as leituras derivadas, puras.

**Serviços reutilizados (sem alteração)**

`analitico.service` (`fn_analitico_resumo_por_operador`, `fn_analitico_destaques_dia`, `fn_analitico_dashboard_mes_json`), `escopoAnalitico`, `diretoExtra.service`, `metasConfig.service`, `pix_automatico.service`, `pixAutomaticoView` (`calcularDobraComissao`, `totaisPorStatus`), `contribuicaoReceptivo.service`, `lib/diasUteis`, `lib/projecaoMetas`.

**Banco**

Nenhuma migration. Todas as tabelas e RPCs necessárias já existem e estão aplicadas: `analitico_recebimentos`, `metas` (com `metas_extras`), `metas_config_mes`, `pix_automatico_acordos`, `pix_automatico_metas`, `pix_automatico_config`, `contribuicao_receptivo`.

**Riscos**

- **Tamanho do arquivo**: uma seção por operador em um setor de 14 pessoas multiplica o HTML. Precisa de teto e de medição.
- **Tempo de geração**: o Pix é uma consulta a mais, e o mês anterior dobra a leitura do analítico. O botão precisa continuar respondendo rápido ou avisar.
- **Vazamento de escopo**: a seção por operador é o ponto onde é mais fácil um relatório de líder acabar levando gente de outro setor. Precisa de teste dedicado.
