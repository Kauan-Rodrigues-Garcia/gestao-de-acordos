## ADDED Requirements

### Requirement: Faixa de dias úteis

O Dashboard SHALL exibir uma faixa com três números do mês em análise: dias úteis passados, dias úteis restantes e total de dias úteis. Os três SHALL derivar de `lib/diasUteis.ts`, respeitando os feriados de `metas_config_mes`, a flag `contar_dia_atual` e a data de início da equipe em treinamento.

`restantes` SHALL ser sempre `total − passados`, nunca calculado por outro caminho, para que os três números fechem entre si na tela.

A faixa SHALL ser discreta: é o contexto para ler o resto do painel ("6 de 21 dias"), não um número de destaque. Ocupa uma linha, com tipografia pequena e sem bloco de cor cheia; o único acento SHALL ser uma barra fina com o progresso do mês.

#### Scenario: Mês corrente com feriado no meio

- **WHEN** o mês tem 21 dias úteis, 1 feriado cadastrado numa terça-feira já passada, e 6 dias úteis já decorridos
- **THEN** a faixa mostra 6 passados, 15 restantes e 21 no total
- **AND** o feriado não é contado nem em passados nem no total

#### Scenario: Feriado cai no fim de semana

- **WHEN** um feriado cadastrado cai num sábado ou domingo
- **THEN** o total de dias úteis não é reduzido por ele

#### Scenario: Operador de equipe em treinamento

- **WHEN** o operador pertence a uma equipe com `treinamento = true` e `treinamento_inicio` no dia 10
- **THEN** os dias úteis anteriores ao dia 10 não entram nem no total nem nos passados

#### Scenario: Mês fechado

- **WHEN** o usuário seleciona um mês anterior ao corrente
- **THEN** passados é igual ao total e restantes é 0

#### Scenario: Configuração do mês ausente

- **WHEN** não existe `metas_config_mes` para o mês
- **THEN** a faixa é calculada sem feriados (seg–sex puros) em vez de sumir da tela

### Requirement: Cards de recebimento

Todos os cards de recebimento SHALL sair da MESMA base: o relatório analítico, recortado pelo escopo de `useEscopoAnalitico`. O total vem de `agregarAnalitico` sobre as linhas de `useAnaliticoDashboard`.

Recebimento direto e Recebimento extra SHALL ser obtidos classificando as linhas do analítico pelo vínculo do acordo que a tabulação associou a elas (`analitico_recebimentos.acordo_id` → `acordos.tipo_vinculo`). Linha sem acordo associado SHALL ser contada à parte, como recebimento sem vínculo definido — não há vínculo a consultar, e atribuí-la a "direto" inventaria um número.

Disso decorre a garantia que a tela precisa dar: direto + extra + sem vínculo SHALL ser exatamente igual ao Total recebido.

Os cards de vínculo SHALL ser renderizados somente quando o setor do usuário tem a lógica Direto/Extra ativa (`temLogicaDiretoExtra`); quando não tem, SHALL ser omitidos do grid e os demais SHALL reocupar o espaço.

#### Scenario: Setor sem lógica Direto/Extra

- **WHEN** `temLogicaDiretoExtra` é falso
- **THEN** os cards Recebimento direto e Recebimento extra não são renderizados
- **AND** o de sem vínculo também não, pois sem a separação ele não tem o que explicar

#### Scenario: Setor com lógica Direto/Extra, tudo tabulado

- **WHEN** `temLogicaDiretoExtra` é verdadeiro e todo o recebimento tem acordo tabulado
- **THEN** os cards Recebimento direto e Recebimento extra aparecem
- **AND** direto + extra é igual ao Total recebido
- **AND** o card de sem vínculo não é renderizado, por não haver o que mostrar

#### Scenario: Parte do recebimento sem acordo tabulado

- **WHEN** parte das linhas do analítico não tem `acordo_id`
- **THEN** essa parte aparece como card próprio de recebimento sem vínculo definido
- **AND** direto + extra + sem vínculo é igual ao Total recebido

#### Scenario: Acordo apagado depois de tabulado

- **WHEN** uma linha aponta para um acordo que não existe mais
- **THEN** ela conta como sem vínculo definido, e não como direto

### Requirement: Cards de forma de pagamento

O painel SHALL exibir um card por forma de pagamento do analítico (Pix, Boleto, Pix Automático, Cartão…), ordenados do maior valor para o menor, cada um com o total e a quantidade de pagamentos.

#### Scenario: Formas ordenadas por valor

- **WHEN** o mês tem Pix com R$ 40.000, Boleto com R$ 20.000 e Cartão com R$ 5.611,62
- **THEN** os cards aparecem nessa ordem

#### Scenario: Mês sem formas identificadas

- **WHEN** o agregado não traz forma nenhuma
- **THEN** a linha inteira de cards de forma é omitida

#### Scenario: Concordância com o painel acima

- **WHEN** o painel "Dados Analíticos" mostra um valor de recebido para o escopo atual
- **THEN** o card Total recebido mostra exatamente o mesmo valor, incluindo a Contribuição Receptivo quando ela entra no escopo

#### Scenario: Meta individual no subtexto

- **WHEN** existe meta do tipo `operador` para o usuário no mês
- **THEN** o card Total recebido traz "Meta Individual: <valor>" como subtexto
- **AND** quando não existe meta, o subtexto é omitido em vez de mostrar R$ 0,00

### Requirement: Cards de projeção

O painel SHALL exibir Projeção, Valor esperado e Diferença para projeção, calculados sobre os dias úteis:

- meta diária = meta ÷ total de dias úteis
- valor esperado = meta diária × dias úteis decorridos (mínimo 1)
- projeção % = recebido ÷ valor esperado × 100
- diferença = recebido − valor esperado

A cor da projeção SHALL vir de `corProjecao`, a mesma paleta usada pela tabela de quartis, para que as duas telas falem a mesma língua visual.

#### Scenario: Acima do esperado

- **WHEN** o recebido é R$ 65.611,62 e o esperado é R$ 37.142,86
- **THEN** a projeção mostra 176,6% em verde
- **AND** a diferença mostra "+ R$ 28.468,76" com a legenda "Acima da meta projetada"

#### Scenario: Abaixo do esperado

- **WHEN** o recebido é menor que o esperado
- **THEN** a diferença é exibida com sinal negativo e na cor de alerta

#### Scenario: Legenda da base de cálculo

- **WHEN** o valor esperado é exibido
- **THEN** o card traz "Com base em N de M dias úteis", com N e M vindos da mesma fonte da faixa de dias úteis

#### Scenario: Usuário sem meta

- **WHEN** não existe meta para o escopo em exibição
- **THEN** os cards Projeção, Valor esperado, Diferença para projeção e Análise por quartil são omitidos
- **AND** os cards de recebimento e a evolução diária continuam sendo exibidos

### Requirement: Card de análise por quartil

O painel SHALL exibir o quartil atual derivado da projeção % via `quartilAtual`, usando as faixas configuradas em `metas_config_mes.quartis` (com `QUARTIS_PADRAO` como fallback). O card SHALL informar quanto falta em reais para bater a meta do mês e a % da meta já alcançada.

#### Scenario: Primeiro quartil

- **WHEN** a projeção alcança a faixa de maior `min_pct` configurada
- **THEN** o card mostra "1º Quartil" com o fundo na cor do quartil 1
- **AND** informa quanto falta para a meta e a % alcançada

#### Scenario: Meta já batida

- **WHEN** o recebido é maior ou igual à meta do mês
- **THEN** o card não mostra valor negativo faltando, e sim que a meta foi alcançada

#### Scenario: Quartis não configurados

- **WHEN** `metas_config_mes.quartis` está vazio
- **THEN** o card usa `QUARTIS_PADRAO` em vez de sumir

### Requirement: Card de recebido na baixa anterior

O painel SHALL exibir o total recebido no último dia ANTERIOR a hoje que teve recebimento maior que zero, junto com o dia da semana, a data e a quantidade de registros daquele dia.

O dia é escolhido pelo dado, não pelo calendário: o último dia com recebimento pode não ser o dia útil imediatamente anterior, e é o dado que interessa.

#### Scenario: Último dia com movimento

- **WHEN** hoje é dia 11 e o dia 10 teve R$ 18.384,11 em 121 registros
- **THEN** o card mostra R$ 18.384,11 com "(10/08/2026) 121 registro(s) encontrado(s)" e o dia da semana

#### Scenario: Pula dias sem recebimento

- **WHEN** hoje é dia 11, o dia 10 não teve recebimento e o dia 8 teve
- **THEN** o card mostra o dia 8

#### Scenario: Primeiro dia do mês

- **WHEN** nenhum dia anterior a hoje teve recebimento no mês
- **THEN** o card não é renderizado

### Requirement: Alternador de escopo Eu / Minha equipe

Quando o usuário lidera uma equipe, o painel SHALL oferecer um alternador entre "Eu" e "Minha equipe". Em "Eu" todos os números SHALL ser os pessoais do líder, com a mesma conta aplicada a um operador. Em "Minha equipe" a meta e o recebido SHALL ser a soma sobre os membros da equipe, e todos os cards SHALL recalcular sobre esse agregado.

O alternador SHALL nascer em "Eu". Para quem não lidera equipe, o alternador SHALL ser omitido e o painel SHALL operar sempre no escopo pessoal.

#### Scenario: Operador comum

- **WHEN** o usuário não lidera equipe
- **THEN** o alternador não é renderizado e todos os cards mostram os números pessoais

#### Scenario: Líder alterna para a equipe

- **WHEN** o líder seleciona "Minha equipe"
- **THEN** Total recebido passa a ser a soma do recebido dos membros
- **AND** a meta passa a ser a soma das metas dos membros, ou a meta do tipo `equipe` quando ela existir
- **AND** projeção, valor esperado, diferença e quartil recalculam sobre esses valores

#### Scenario: Membro sem meta na visão de equipe

- **WHEN** um membro da equipe não tem meta cadastrada
- **THEN** o recebido dele continua somando no total
- **AND** a meta dele soma como zero, sem derrubar o painel

#### Scenario: Membro de fora do escopo do relatório

- **WHEN** um operador é clone de outra equipe com `conta_recebimento` ativo
- **THEN** ele é resolvido por `useEscopoAnalitico`, e não por uma lista montada à mão no painel

### Requirement: Substituição do corpo do painel antigo

O painel de metas SHALL SUBSTITUIR o conteúdo antigo da área de métricas do Dashboard, e não ser um bloco adicional abaixo dele.

A faixa "Dados Analíticos" SHALL permanecer inalterada como cabeçalho — título, seletor de mês, sparkline de ritmo e os totais de Recebido/Agendado/Meta. O mês SHALL ser controlado por ela, e o painel NÃO SHALL ter um seletor de mês próprio: duas navegações de mês na mesma área saem de sincronia.

Do conteúdo antigo:
- o donut de % da meta SHALL ser reaproveitado como o card de Projeção;
- a série "Agendado" do gráfico por dia SHALL ser mesclada na evolução diária;
- os cards que continuam úteis mas não falam de meta (Agendado no mês, Não Pagos, Agendado hoje, Agendado restante, Acordos no mês, Taxa de conversão, Ticket médio) SHALL ficar num bloco recolhível, fechado por padrão;
- o card "Projeção do mês" (ritmo sobre dias corridos) SHALL ser removido, por conflitar com a projeção sobre dias úteis que o painel novo apresenta.

#### Scenario: Cabeçalho preservado

- **WHEN** o Dashboard é aberto
- **THEN** a faixa "Dados Analíticos" aparece igual a antes, com o seletor de mês funcionando

#### Scenario: Corpo substituído, não somado

- **WHEN** o painel de metas é renderizado
- **THEN** os cards antigos de recebimento e os dois gráficos antigos não aparecem mais em duplicidade

#### Scenario: Bloco secundário recolhido

- **WHEN** o painel termina de carregar
- **THEN** os cards secundários estão ocultos atrás de um controle de expandir
- **AND** expandi-lo mostra Agendado, Não Pagos, Acordos no mês, Taxa de conversão e Ticket médio

#### Scenario: Troca de mês no cabeçalho

- **WHEN** o usuário muda o mês no seletor da faixa "Dados Analíticos"
- **THEN** a faixa de dias úteis, os cards e o gráfico do painel recalculam para o mês escolhido

#### Scenario: PaguePlay preservada

- **WHEN** o tenant é PaguePlay
- **THEN** o corpo continua sendo o conjunto antigo (`PPMetrics`, gráficos e métricas adicionais), sem o painel de metas

### Requirement: Estados de carregamento e ausência de dados

O painel SHALL exibir esqueletos enquanto qualquer peça do número ainda falta — dados do analítico, escopo, metas ou configuração do mês. O painel NÃO SHALL renderizar valores parciais durante o carregamento.

#### Scenario: Escopo ainda resolvendo

- **WHEN** `useEscopoAnalitico` ainda está pendente
- **THEN** os cards mostram esqueleto em vez de números do escopo errado

#### Scenario: Relatório analítico não importado

- **WHEN** não há linhas de analítico no mês
- **THEN** o painel mostra a faixa de dias úteis e uma mensagem de que o relatório ainda não foi importado, em vez de uma parede de R$ 0,00

#### Scenario: Novo relatório importado

- **WHEN** um relatório analítico é importado enquanto o painel está aberto
- **THEN** todos os cards e o gráfico recalculam sem recarregar a página, pelo realtime já existente em `useAnaliticoDashboard`
