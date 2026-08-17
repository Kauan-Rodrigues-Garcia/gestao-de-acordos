## ADDED Requirements

### Requirement: Seção de Pix Automático no fechamento

O relatório de fechamento SHALL trazer uma seção de Pix Automático quando o escopo tiver movimento de Pix no mês, com: valor total de Pix, quantidade de acordos, comissão gerada e o percentual de comissão aplicado.

O Pix SHALL ser apresentado como acompanhamento próprio, e o relatório SHALL deixar explícito que **o valor do Pix já está contido no recebimento do analítico** — somá-lo ao total do mês contaria o mesmo dinheiro duas vezes.

A seção SHALL usar as mesmas funções de cálculo da tela (`comissaoDe`, `totaisPorStatus`, `acordosFeitosNoMes`), nunca uma conta reescrita.

#### Scenario: Setor com movimento de Pix

- **WHEN** o escopo tem acordos de Pix Automático aprovados no mês
- **THEN** a seção exibe valor total, quantidade, comissão gerada e o percentual do setor

#### Scenario: Escopo sem Pix no mês

- **WHEN** o escopo não tem nenhum acordo de Pix no mês
- **THEN** a seção não é renderizada nem aparece na navegação

#### Scenario: Aviso de dupla contagem

- **WHEN** a seção de Pix é renderizada
- **THEN** ela informa que o valor já está incluído no recebimento do analítico

### Requirement: Meta de Pix por equipe

Quando o escopo for de setor ou de diretoria, a seção SHALL mostrar a meta de Pix **equipe a equipe** — realizado, meta, percentual e projeção — e o consolidado do setor, espelhando o que `PixMetaPainel` mostra na tela.

A meta do setor SHALL ser a SOMA das metas das equipes, nunca um total guardado à parte.

Equipe sem meta cadastrada SHALL aparecer com o realizado e a marcação de meta ausente, em vez de sumir da tabela.

#### Scenario: Setor com três equipes

- **WHEN** o setor tem três equipes, duas com meta de Pix e uma sem
- **THEN** as três aparecem com o realizado
- **AND** as duas com meta mostram percentual e projeção
- **AND** a terceira é marcada como sem meta
- **AND** o consolidado do setor soma apenas as metas existentes

#### Scenario: Projeção de Pix consistente com a tela

- **WHEN** o mesmo mês é aberto no Pix Automático do sistema e no relatório
- **THEN** o percentual de projeção de cada equipe é o mesmo nos dois

### Requirement: Ranking de Pix por operador

A seção SHALL trazer o ranking de Pix por operador dentro do escopo, com valor, quantidade de acordos e comissão de cada um, ordenado por valor, espelhando `PixRankingSetor`.

O ranking SHALL destacar os três primeiros visualmente.

#### Scenario: Ranking do setor

- **WHEN** o relatório é gerado para um setor com movimento de Pix
- **THEN** o ranking lista os operadores do setor ordenados por valor de Pix
- **AND** os três primeiros recebem destaque

### Requirement: Pix respeita o recorte de cargo

A seção de Pix SHALL obedecer ao mesmo recorte do resto do relatório:

- escopo de **operador** traz apenas os números de Pix da própria pessoa, sem ranking de colegas e sem meta de equipe;
- escopo de **setor** traz o setor do usuário;
- escopo de **diretoria** traz todos os setores, com o Pix separado por setor.

#### Scenario: Relatório de operador

- **WHEN** um operador baixa o próprio fechamento
- **THEN** a seção de Pix mostra o Pix dele — valor, acordos e comissão
- **AND** não mostra ranking, nem meta de equipe, nem número de colega

#### Scenario: Relatório de líder

- **WHEN** um líder baixa o fechamento do setor
- **THEN** a seção de Pix traz apenas operadores e equipes do setor dele

### Requirement: Comissão dobrada quando aplicável

Quando o setor tiver a regra de comissão dobrada configurada, a seção SHALL informar se o requisito da dobra foi atingido no mês e qual o efeito na comissão, usando `calcularDobraComissao`.

#### Scenario: Dobra atingida

- **WHEN** o setor bateu o requisito de acordos da dobra no mês
- **THEN** a seção marca a dobra como atingida e mostra a comissão resultante

#### Scenario: Dobra não configurada

- **WHEN** o setor não tem regra de dobra
- **THEN** o bloco de dobra não é renderizado
