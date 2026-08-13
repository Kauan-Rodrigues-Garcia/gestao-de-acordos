## Why

Hoje o operador precisa juntar peças de três telas para saber se está no ritmo: a barra de meta e o quartil moram num bloco de texto miúdo no cabeçalho do Dashboard (`MetaProgressoHeader`), o quanto entrou por dia está dentro do painel Analítico, e o esperado até hoje só existe na tabela de líder (`QuartisOperadores`). Nenhuma dessas superfícies responde de relance a pergunta que o operador faz todo dia: *"quanto falta, e eu estou acima ou abaixo do esperado?"*.

A matemática já existe e está testada (`lib/diasUteis.ts`, `useAnaliticoDashboard`) — o que falta é uma superfície que a mostre inteira, no lugar onde o time já olha. O dashboard de referência que o time usa por fora (`dashboard-bookplay-backup`) resolve isso; a proposta é trazer aquela leitura para dentro do sistema, com o design do projeto.

Para o líder o problema é maior: ele tem meta pessoal E equipe, e hoje não existe nenhuma tela que mostre o agregado da equipe com a mesma régua de projeção usada para o indivíduo.

## What Changes

- **O painel novo SUBSTITUI o corpo do painel de métricas**, em vez de somar um bloco à tela. A faixa "Dados Analíticos" continua sendo o cabeçalho (título, seletor de mês, sparkline, totais) e é dela que vem o mês. O donut de meta e a série "Agendado" do gráfico antigo foram absorvidos; o que sobrou virou bloco recolhível. PaguePlay não muda.
- **Nova faixa de dias úteis**, discreta: dias úteis passados, restantes e total, em uma linha com barra fina de progresso. Deriva de `listarDiasUteis`/`diasUteisDecorridos`, respeitando feriados, `contar_dia_atual` e o início de equipe em treinamento.
- **Novo painel de metas** logo abaixo do painel "Dados Analíticos", com 8 cards:
  - Total recebido (com a meta individual como subtexto)
  - Recebimento direto e Recebimento extra — **só quando o setor tem a lógica Direto/Extra** (`temLogicaDiretoExtra`); somem por completo quando não tem, em vez de mostrar R$ 0,00. Saem do próprio analítico, classificando cada linha pelo vínculo do acordo tabulado (`acordo_id` → `tipo_vinculo`); o que não tem acordo vira "sem vínculo definido", de modo que os três fecham o total — ver a decisão 4 do design
  - Cards por forma de pagamento (Pix, Boleto, Cartão…), herdados do painel antigo
  - Projeção — o donut de % do painel antigo, colorido pela paleta de quartis (`corProjecao`)
  - Valor esperado — com "com base em N de M dias úteis"
  - Diferença para projeção — recebido menos esperado, verde/vermelho
  - Análise por quartil — faixa atual, quanto falta para a meta e % alcançada
  - Recebido baixa anterior — total do último dia com recebimento antes de hoje, com a data e a contagem de registros
- **Novo gráfico "Evolução diária"**: uma barra por dia do mês, cheia quando alcançou a meta diária e esmaecida quando não, régua tracejada na meta, linha fina do Agendado sobreposta (herdada do gráfico antigo) e o dia de hoje marcado por contorno.
- **Alternador Eu / Minha equipe** para o líder: o mesmo painel, com a meta e o recebido somados sobre os membros da equipe. Operador não vê o alternador.
- **`MetaProgressoHeader` é removido**: meta, quartil e ranking passam a ser responsabilidade do painel novo, e o cabeçalho volta a ser só saudação. **BREAKING** para quem dependia da posição visual daquele bloco.
- **O card "Projeção do mês" do painel antigo sai de cena.** **BREAKING**: ele projetava ritmo sobre dias CORRIDOS, enquanto o painel novo projeta contra meta e dias ÚTEIS. Manter os dois deixaria duas "projeções" discordando na mesma tela.

## Capabilities

### New Capabilities
- `painel-metas-dashboard`: a faixa de dias úteis, os cards de recebimento/projeção/quartil e o alternador de escopo Eu/Minha equipe no Dashboard.
- `evolucao-diaria-recebimento`: o gráfico de barras diário com linha de meta e classificação acima/abaixo do esperado.

### Modified Capabilities
<!-- Nenhuma: openspec/specs/ está vazio, não há requisito publicado sendo alterado. -->

## Impact

**Código novo**
- `src/components/PainelMetas/` — componente do painel, seus cards e o gráfico.
- `src/lib/projecaoMetas.ts` — funções puras que hoje estão duplicadas em `MetaProgressoHeader` e `QuartisOperadores` (esperado até hoje, diferença, projeção %, meta diária), extraídas para um único lugar com teste.

**Código alterado**
- `src/pages/Dashboard/index.tsx` — monta o painel novo abaixo do `AnalyticsPanel`; passa `temLogicaDiretoExtra`, setor e equipe em foco (os mesmos valores que já entrega ao `AnalyticsPanel`).
- `src/components/MetaProgressoHeader.tsx` — deixa de renderizar meta/quartil/ranking; a lógica migra para o `PainelMetas`.

**Dados — sem migration**
Tudo já existe: `analitico_recebimentos` via `useAnaliticoDashboard` (com realtime), `metas` (tipo `operador` e `equipe`), `metas_config_mes` (feriados, quartis, `contar_dia_atual`), `acordos.tipo_vinculo` para Direto/Extra e `equipes.treinamento_inicio`.

**Reuso obrigatório (não reimplementar)**
`lib/diasUteis.ts` (dias úteis, `quartilAtual`, `corProjecao`, `COR_QUARTIL`), `useAnaliticoDashboard` (`porDia`, `porOperador`, escopo e realtime), `useEscopoAnalitico` (quem conta no escopo, incluindo clones com `conta_recebimento`), `getMetasConfig` e `formatBRL`.

**Risco principal**
Divergência de número entre o painel novo e o `AnalyticsPanel` logo acima. Os dois precisam sair da mesma base (`agregarAnalitico` + `useEscopoAnalitico`); qualquer conta feita à mão no painel novo reabre o bug que o comentário de `escopoAnalitico.ts` documenta.
