## ADDED Requirements

### Requirement: Gráficos em SVG embutido, sem biblioteca

Todo gráfico do relatório SHALL ser SVG gerado pelo próprio código, embutido no arquivo. O relatório NÃO SHALL carregar biblioteca de gráficos, nem gerar imagem raster.

Cada gerador de gráfico SHALL ser uma função pura — entram números, sai string SVG — sem DOM e sem acesso a banco, para que cada um seja testável isoladamente.

Todo gráfico SHALL usar `viewBox` com escala proporcional, de modo a acompanhar a largura disponível sem JavaScript, e SHALL ter rótulo acessível descrevendo o que representa.

#### Scenario: Nenhuma dependência externa

- **WHEN** o relatório é gerado com todos os gráficos
- **THEN** o arquivo não contém referência a script ou folha de estilo externa
- **AND** não contém elemento de imagem apontando para host remoto

#### Scenario: Redimensionamento

- **WHEN** o arquivo é aberto numa janela estreita
- **THEN** os gráficos encolhem proporcionalmente e continuam legíveis, sem rolagem horizontal da página

### Requirement: Pizza de distribuição por quartil

O relatório SHALL trazer um gráfico de setores mostrando quantos operadores estão em cada quartil, com a cor oficial de cada faixa e a contagem legível em cada fatia ou na legenda.

Quartil sem nenhum operador SHALL aparecer apenas na legenda, com zero, e não como fatia invisível.

#### Scenario: Distribuição com quartil vazio

- **WHEN** os operadores estão distribuídos entre o 2º e o 4º quartis, e nenhum está no 1º
- **THEN** a pizza mostra três fatias coloridas
- **AND** a legenda lista os quatro quartis, com zero no primeiro

#### Scenario: Todos no mesmo quartil

- **WHEN** todos os operadores caem no mesmo quartil
- **THEN** o gráfico renderiza um círculo completo na cor daquele quartil

### Requirement: Barras da evolução diária com meta

A evolução diária SHALL ser um gráfico de barras cobrindo todos os dias do mês — inclusive os zerados, para a régua do calendário aparecer — com a linha da meta por dia útil sobreposta.

Dias sem recebimento SHALL ser visivelmente vazios; fim de semana e feriado SHALL ser distinguíveis dos dias úteis.

Cada barra SHALL expor, ao passar o cursor, o dia, o valor e a quantidade de pagamentos.

#### Scenario: Mês com feriado

- **WHEN** o mês tem um feriado cadastrado numa quarta-feira
- **THEN** aquele dia aparece marcado como não útil no eixo

#### Scenario: Meta acima do maior dia

- **WHEN** a meta diária é maior que o melhor dia do mês
- **THEN** a escala do gráfico acomoda a linha da meta, sem cortá-la fora da área visível

### Requirement: Donut de formas de pagamento

As formas de pagamento SHALL ser apresentadas em rosca, com legenda listando rótulo, valor e percentual de cada forma, ordenada por valor.

O centro da rosca SHALL trazer o total. Uma forma que represente o mês inteiro SHALL ser desenhada como círculo, não como arco de volta completa.

#### Scenario: Forma única

- **WHEN** todo o recebimento do mês veio de uma única forma de pagamento
- **THEN** a rosca é um círculo completo na cor daquela forma, com 100% na legenda

#### Scenario: Muitas formas

- **WHEN** existem mais formas do que cores na paleta
- **THEN** as formas de maior valor ocupam a rosca e as demais são agregadas numa fatia "outras", que aparece na legenda com o total agregado

### Requirement: Barras horizontais do ranking

O ranking SHALL ser desenhado com barras horizontais proporcionais ao maior valor, com posição, nome e valor em cada linha, e destaque para os três primeiros.

#### Scenario: Pódio destacado

- **WHEN** o ranking tem quatro ou mais pessoas
- **THEN** as três primeiras recebem destaque visual distinto das demais

#### Scenario: Ranking com um só

- **WHEN** o escopo tem uma única pessoa com recebimento
- **THEN** o ranking não é renderizado como gráfico comparativo

### Requirement: Barra de progresso com marcos de meta

A barra de progresso de meta SHALL aceitar marcos adicionais — as metas em cascata — desenhados sobre a mesma barra, cada um rotulado com o valor do degrau.

A barra SHALL indicar quando o realizado ultrapassa o último marco, sem estourar visualmente o traçado.

#### Scenario: Três degraus, dois batidos

- **WHEN** há meta principal e duas extras, e o realizado passou da segunda
- **THEN** a barra mostra três marcos, os dois primeiros marcados como batidos

#### Scenario: Realizado acima de todos os marcos

- **WHEN** o realizado supera a maior das metas
- **THEN** a barra é preenchida por completo e informa o percentual acima de 100%, sem transbordar o contorno

### Requirement: Sparkline por operador

A página individual de cada operador SHALL trazer uma linha de tendência compacta do recebimento diário dele no mês, suficiente para ler o ritmo sem ocupar o espaço de um gráfico cheio.

#### Scenario: Operador com movimento irregular

- **WHEN** o operador recebeu em poucos dias esparsos do mês
- **THEN** a sparkline mostra os picos nos dias corretos, com os demais no piso

### Requirement: Legibilidade em projeção e em papel

Todo gráfico SHALL permanecer legível em três contextos: tela clara, tela escura e impressão em preto e branco.

Cores SHALL vir de variáveis de tema, de modo que fundo e traço acompanhem o tema. Informação NÃO SHALL depender exclusivamente de cor: fatia, faixa e barra SHALL ter rótulo textual ou valor associado.

Tipografia mínima dos rótulos de gráfico SHALL ser dimensionada para leitura à distância de uma sala de reunião.

#### Scenario: Impressão monocromática

- **WHEN** o relatório é impresso em preto e branco
- **THEN** cada fatia e cada faixa continua identificável pelo rótulo e pelo valor

#### Scenario: Tema escuro

- **WHEN** o arquivo é aberto em tema escuro
- **THEN** eixos, grades e rótulos dos gráficos usam cor de contraste adequado, e não permanecem em tom claro sobre fundo claro
