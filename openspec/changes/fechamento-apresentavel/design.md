# Design — Fechamento apresentável

## Context

O relatório de fechamento existe e funciona: `montarFechamento` coleta, `montarHtmlFechamento` desenha, `baixarRelatorioFechamento` entrega o arquivo. O problema não é a arquitetura de dados — é a camada de apresentação, e é o tamanho do que ela tem para mostrar.

Estado atual:

```
src/services/fechamento/
  tipos.ts                159 linhas   contrato entre coleta e desenho
  fechamento.service.ts   504 linhas   coleta (Supabase)
  fechamentoHtml.ts       677 linhas   TUDO: formatação, gráficos, seções, CSS, JS
  baixarFechamento.ts      74 linhas   blob + log de auditoria
```

`fechamentoHtml.ts` já é o arquivo mais denso do módulo e concentra quatro responsabilidades diferentes. Este change pelo menos dobra o conteúdo — seções por operador, Pix, curiosidades, comparativo, modo apresentação, seis tipos de gráfico. Continuar empilhando no mesmo arquivo produziria algo de 2.000 linhas onde mexer no donut arrisca quebrar a tabela de setores.

Restrições que não mudam:

- **Arquivo único, zero rede.** É aberto de anexo e de pen drive, em sala de reunião.
- **Nenhum número novo.** Toda métrica sai da mesma fonte que a tela usa. Um relatório que discorda do painel aberto na mesma sala destrói a confiança nos dois.
- **Recorte por cargo.** Operador só vê o dele; líder, o setor; diretoria, tudo.
- **Sem migration.** As tabelas e RPCs necessárias já existem e estão aplicadas em produção.

Referências visuais dentro do próprio produto, citadas pelo solicitante: `QuartisOperadores` (tabela + pizza), `PainelLider` (KPIs + abas), `PixMetaPainel` e `PixRankingSetor`, `PainelMetas` (cartões + donut + evolução diária).

## Goals / Non-Goals

**Goals:**

- O arquivo baixado ser tão bom de olhar quanto as telas que ele representa, ao ponto de substituir a projeção do sistema numa reunião.
- Cobrir o mês inteiro: recebimento, metas em cascata, quartis, ranking, destaques, Pix Automático, fechamento individual e comparativo com o mês anterior.
- Quebrar `fechamentoHtml.ts` em peças pequenas e puras, cada uma testável sozinha.
- Manter o custo de geração aceitável para um clique de botão.

**Non-Goals:**

- Mudar o cálculo de qualquer métrica. Se um número está errado, o conserto é na origem.
- Editar dado a partir do relatório. Ele é somente-leitura, e é o retrato de um mês trancado.
- Exportar PDF pelo sistema. O navegador já faz isso, e embutir gerador de PDF traria uma dependência pesada para dentro do bundle.
- Publicar o relatório em URL. O arquivo é entregue ao usuário; distribuição é outro assunto.
- Mexer no cadeado de mês fechado ou no botão — só em mês fechado, como está hoje.

## Decisions

### 1. Quebrar o gerador em módulos por responsabilidade

```
src/services/fechamento/
  tipos.ts                      contrato (cresce)
  fechamento.service.ts         orquestra a coleta
  coleta/
    pix.ts                      Pix do mês no escopo
    mesAnterior.ts              comparativo
    seriesPorOperador.ts        evolução diária individual
  curiosidades.ts               leituras derivadas, puras
  graficos/
    barrasDiarias.ts  donut.ts  pizzaQuartis.ts
    rankingBarras.ts  progressoMarcos.ts  sparkline.ts
    paleta.ts                   cores e escalas compartilhadas
  secoes/
    capa.ts  visaoDoMes.ts  operadores.ts  quartis.ts
    ranking.ts  pix.ts  destaques.ts  individual.ts  diretoria.ts
  fechamentoHtml.ts             monta a casca, injeta CSS/JS, junta as seções
  fechamentoCss.ts              a folha de estilo, como string
  baixarFechamento.ts           inalterado
```

Cada gráfico e cada seção é função pura `(dados) => string`. É o que permite ter teste por peça em vez de um teste de string gigante sobre o documento inteiro.

*Alternativa considerada:* templating com um motor (Handlebars, Eta). Recusada — traz dependência nova, e o que mais existe aqui é lógica condicional e matemática de SVG, que é código, não template.

*Alternativa considerada:* renderizar os componentes React existentes com `renderToStaticMarkup`. Muito tentador: reaproveitaria `QuartisOperadores` literalmente. Recusada porque os componentes dependem de hooks, de Radix, de Tailwind compilado e de contexto de autenticação — arrastar tudo isso para dentro de uma string HTML autocontida daria um arquivo enorme e frágil. O que se reaproveita são as **funções de cálculo**, não os componentes.

### 2. CSS como string única, com variáveis de tema

A folha de estilo sai para `fechamentoCss.ts`, exportada como uma constante. Tokens em `:root`, redefinidos sob `prefers-color-scheme: dark` e sob `@media print`.

Nenhuma cor SHALL ser escrita direto no SVG: os gráficos usam `var(--…)`, e é isso que faz o mesmo gráfico funcionar em claro, escuro e papel sem três versões.

*Alternativa considerada:* estilos inline em cada elemento. Mais simples de gerar, impossível de manter tema e impressão coerentes.

### 3. Modo apresentação como aprimoramento progressivo

O documento nasce com todas as seções empilhadas. O JavaScript embutido — algumas dezenas de linhas, sem framework — assume o controle: esconde as demais, mostra uma por vez e liga as setas.

Sem JavaScript, o arquivo continua um documento completo e rolável. Na impressão, o CSS força todas as seções visíveis, independentemente do estado do JavaScript.

*Alternativa considerada:* uma biblioteca de slides (reveal.js). Recusada pelo mesmo motivo de sempre: centenas de KB embutidos em cada download.

### 4. Coleta em duas ondas, para o botão não travar

A coleta atual já faz seis consultas em paralelo. Este change acrescenta Pix, mês anterior e séries por operador.

Onda 1 (obrigatória, em paralelo): analítico do mês, fontes de escopo, metas, config, perfis, setores.
Onda 2 (em paralelo, tolerante a falha): Pix, mês anterior, Direto/Extra, destaques.

Falha na onda 2 NÃO derruba o relatório: a seção correspondente é omitida e entra uma linha nas observações. Um fechamento sem a seção de Pix ainda é um fechamento; um botão que não produz arquivo nenhum não é nada.

*Alternativa considerada:* buscar tudo em uma onda só. Simples, mas transforma qualquer erro pontual em falha total.

### 5. Séries por operador saem de UMA leitura, não de N

A página individual precisa do recebimento diário de cada pessoa. Fazer uma consulta por operador seria 14 idas ao banco num setor médio.

Em vez disso, uma leitura paginada de `analitico_recebimentos` do mês no escopo, agregada em memória por `(operador_id, dia)`. É a mesma tabela que `diretoExtra.service` já varre; a agregação por operador é local.

*Alternativa considerada:* uma RPC nova que devolva o agregado por operador e dia. Seria mais eficiente e é o caminho certo se a leitura se mostrar lenta — mas exige migration, e este change se propôs a não ter nenhuma. Fica registrado como evolução.

### 6. Teto de páginas individuais: 30, por valor recebido

Trinta páginas cobrem qualquer setor da operação hoje e mantêm o arquivo na casa das centenas de KB. Acima disso, entram as trinta de maior recebimento e o relatório informa quantas ficaram de fora.

Quem ficou sem página continua em todas as tabelas, no ranking e nos quartis — o teto corta a seção detalhada, nunca a pessoa.

*Alternativa considerada:* sem teto. O relatório da diretoria, com todos os setores, passaria de cem páginas individuais e de vários MB.

### 7. Pix reusa as funções da tela, e avisa sobre dupla contagem

`fetchAcordosPix` já aceita `{ operadorId, setorId }`, que é exatamente o recorte de que o relatório precisa. Os cálculos vêm de `comissaoDe`, `totaisPorStatus`, `acordosFeitosNoMes` e `calcularDobraComissao` — os mesmos de `PixAutomatico`.

A seção declara, em texto, que o valor do Pix **já está** no recebimento do analítico. É a mesma ressalva que `PixMetaPainel` documenta, e num relatório apresentado à diretoria a ausência dela convida à soma errada.

### 8. Curiosidades são derivadas, nunca consultadas

Maior pagamento único, dia de pico, sequência de dias acima da meta diária, maior subida no ranking, forma que mais cresceu — tudo sai dos dados já coletados, em `curiosidades.ts`, funções puras.

Cada curiosidade só aparece quando tem base: sem mês anterior não há "maior subida"; sem meta não há "dias acima da meta diária". Curiosidade com dado insuficiente é omitida, não estimada.

### 9. O nome do arquivo e o log de auditoria não mudam

`nomeArquivoFechamento` e o registro em `registrarLog` continuam como estão. O arquivo cresce em conteúdo, não em identidade.

## Risks / Trade-offs

**Tamanho do arquivo cresce muito** → Teto de 30 páginas individuais; teste que gera o relatório de diretoria com dados de setor grande e falha se passar do teto de bytes definido.

**Tempo de geração perceptível** → Coleta em duas ondas paralelas; o botão já mostra estado de carregamento, e o aviso passa a nomear a etapa. Se passar de poucos segundos, o caminho é a RPC de agregação por operador e dia (decisão 5).

**Vazamento de escopo na seção individual** → É o ponto mais arriscado do change: uma página por pessoa é onde é mais fácil um relatório de líder levar gente de outro setor. Teste dedicado por nível (operador, setor, diretoria) que varre o HTML gerado procurando nome de quem não deveria estar lá.

**Regressão visual silenciosa** → HTML gerado por string não quebra: só fica feio. Mitigação: teste que parseia o documento com `DOMParser` e confere estrutura (toda seção do menu existe, exatamente uma ativa, nenhum `img` remoto, nenhum `parsererror`), somado a uma amostra gerada com dados realistas para conferência visual a cada alteração grande.

**Divergência com a tela ao longo do tempo** → O relatório reusa as funções de cálculo, mas nada impede alguém de escrever uma conta nova dentro de uma seção. Mitigação: as seções recebem dados prontos de `DadosFechamento` e não têm acesso a Supabase — a fronteira é o tipo.

**Reescrita grande de um arquivo em produção** → `fechamentoHtml.ts` é reescrito, não emendado. Mitigação: os testes atuais (escape, autocontenção, estrutura, recorte do operador, nome do arquivo) são preservados e passam a rodar contra o gerador novo antes de qualquer seção nova entrar.

## Migration Plan

Não há migration de banco nem mudança de contrato externo. A entrega é incremental e cada passo mantém o relatório funcionando:

1. Extrair CSS e gráficos do arquivo atual, sem mudar uma linha de saída visível. Os testes existentes precisam continuar verdes — é a rede de segurança da refatoração.
2. Quebrar as seções atuais em módulos, ainda sem conteúdo novo.
3. Redesenhar o visual das seções existentes (capa, cartões, tabelas, gráficos).
4. Acrescentar o conteúdo novo, uma seção por vez: Pix, individual, curiosidades, comparativo.
5. Modo apresentação e ajustes de impressão por último — são a camada mais externa.

Rollback: o gerador é uma função pura chamada de um lugar só. Reverter é voltar o commit; nenhum dado gravado muda, nenhum arquivo já baixado é afetado.

## Open Questions

- **Teto de bytes.** 30 páginas é o teto de contagem; falta fixar o teto de tamanho do arquivo que o teste vai vigiar. Proposta: 2 MB, medida na primeira amostra realista.
- **Curiosidades: quais entram.** As cinco listadas são o ponto de partida. Vale medir com dados reais quais são interessantes e quais são ruído antes de fixar a lista.
- **Comparativo no escopo de operador.** Faz sentido o operador ver a variação dele contra o mês anterior — mas o mês anterior pode estar com cobertura de dado pior, e a variação sairia enganosa. Decidir se entra com ressalva ou se fica só nos escopos de setor e diretoria.
- **Agrupamento no relatório da diretoria.** Páginas individuais agrupadas por setor podem ficar longas demais. Alternativa: no nível diretoria, limitar as páginas individuais aos primeiros de cada setor, em vez do teto global.
