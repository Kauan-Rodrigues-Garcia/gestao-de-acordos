## ADDED Requirements

### Requirement: Cards de recebimento com meta individual
O dashboard do operador SHALL exibir um card "Total recebido" com o valor recebido do mês (fonte: relatório analítico quando ativo; fallback: tabulação) e a meta individual do mês quando definida. Quando o setor do operador TEM a lógica direto/extra ativa (`useDiretoExtraConfig.isAtivoParaUsuario`), o dashboard SHALL exibir também os cards "Recebimento Direto" e "Recebimento Extra". Quando NÃO tem, esses dois cards SHALL ser omitidos e apenas o card normal de recebido é mostrado.

#### Scenario: Setor com lógica direto/extra
- **WHEN** o operador pertence a um setor com direto/extra ativo
- **THEN** o dashboard mostra Total recebido (com "Meta Individual: R$ X" quando há meta), Recebimento Direto e Recebimento Extra

#### Scenario: Setor sem lógica direto/extra
- **WHEN** o setor do operador não tem direto/extra ativo
- **THEN** apenas o card de Total recebido aparece, sem menção a direto/extra

#### Scenario: Sem meta definida
- **WHEN** o operador não tem meta de operador para o mês
- **THEN** o card de Total recebido aparece sem a linha de meta e os cards dependentes de meta (projeção, valor esperado, diferença, quartil, meta de hoje) são omitidos sem erro

### Requirement: Projeção, valor esperado e diferença
Quando há meta e configuração de dias úteis do mês, o dashboard SHALL exibir: (a) card "Projeção" com anel percentual = recebido ÷ esperado até hoje × 100; (b) card "Valor esperado" = meta diária × dias úteis decorridos, com legenda "Com base em X de Y dias úteis"; (c) card "Diferença para projeção" = recebido − esperado, com sinal e cor (verde positivo / vermelho negativo) e legenda "Acima/Abaixo da meta projetada". Os cálculos SHALL usar `lib/diasUteis` (`diasUteisDoMes`, `diasUteisDecorridos`) e a config de metas do mês (feriados, contar_dia_atual), idênticos aos do `MetaProgressoHeader`.

#### Scenario: Acima do esperado
- **WHEN** recebido = R$ 154.076 e esperado até hoje = R$ 84.782 (15 de 23 dias úteis)
- **THEN** projeção mostra 181% (arredondado), valor esperado mostra R$ 84.782,61 "Com base em 15 de 23 dias uteis" e diferença mostra "+ R$ 69.293" em verde com "Acima da meta projetada"

#### Scenario: Abaixo do esperado
- **WHEN** recebido é menor que o esperado até hoje
- **THEN** a diferença aparece negativa em vermelho com "Abaixo da meta projetada" e o anel de projeção usa cor de alerta (mesma escala de `corProjecao`)

### Requirement: Análise por quartil
Quando há meta e config de quartis, o dashboard SHALL exibir um card "Análise por Quartil" com o quartil atual do operador (via `quartilAtual` da projeção), colorido pela cor do quartil (`COR_QUARTIL`), título "Nº Quartil" e mensagem curta condizente (ex.: 1º quartil com projeção ≥ 100% → mensagem de parabéns com a % da meta alcançada).

#### Scenario: Primeiro quartil com meta batida
- **WHEN** a projeção do operador o coloca no 1º quartil e a % da meta ≥ 100
- **THEN** o card mostra "1º Quartil" com fundo/borda na cor do quartil e mensagem de parabéns citando a % da meta alcançada

#### Scenario: Quartil inferior
- **WHEN** a projeção coloca o operador no 3º ou 4º quartil
- **THEN** o card usa a cor correspondente e mensagem de incentivo, sem tom de erro

### Requirement: Recebido na baixa anterior
O dashboard SHALL exibir um card "Recebido baixa anterior" com a soma dos recebimentos do operador (analítico) nos dias desde o último dia útil anterior até ontem (ex.: numa segunda-feira, sexta+sábado+domingo; numa quarta, apenas terça), com a legenda citando os dias/datas cobertos e o nº de registros encontrados.

#### Scenario: Segunda-feira
- **WHEN** hoje é segunda-feira
- **THEN** o card soma sexta, sábado e domingo, com legenda "Sexta-feira, Sábado, Domingo (dd/mm a dd/mm) · N registro(s)"

#### Scenario: Dia comum
- **WHEN** hoje é quarta-feira
- **THEN** o card soma apenas terça-feira, com a data e o nº de registros

### Requirement: Meta de hoje e posição no ranking
Quando há meta diária, o dashboard SHALL exibir um card "Meta de hoje" com a meta diária, barra de progresso (recebido hoje ÷ meta diária, teto 100% visual), % do dia e "Faltam R$ X" (ou confirmação quando batida). O dashboard SHALL exibir um card "Posição no ranking" com a posição atual do operador no ranking do mês (`fn_analitico_resumo_por_operador`), destacando "#N" e um subtítulo (ex.: "Você está no Top 10!").

#### Scenario: Meta do dia parcial
- **WHEN** meta diária = R$ 5.652,17 e recebido hoje = R$ 3.946,15
- **THEN** a barra mostra ~70%, o texto "70% da meta do dia" e "Faltam R$ 1.706,02"

#### Scenario: Posição no ranking
- **WHEN** o operador é o 2º no ranking do mês
- **THEN** o card mostra "#2" e o subtítulo de contexto

### Requirement: Gráfico Recebido vs Agendado preservado
O dashboard do operador SHALL manter o gráfico existente "Recebido vs Agendado — por dia" (AnalyticsPanel/ChartsSection) funcionando como hoje, abaixo/junto do novo bloco de cards.

#### Scenario: Gráfico continua após o redesign
- **WHEN** o operador abre o dashboard após a mudança
- **THEN** o gráfico por dia continua visível e com os mesmos dados de antes
