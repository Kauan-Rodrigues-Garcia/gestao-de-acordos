## ADDED Requirements

### Requirement: Página de fechamento por operador

O relatório SHALL trazer, para cada operador dentro do escopo, uma página própria com o fechamento dele: recebido no mês, meta, percentual alcançado, quartil, diferença contra o esperado, quantidade de pagamentos, evolução diária, formas de pagamento e Pix Automático.

A página SHALL ser autossuficiente: quem a projetar numa conversa de avaliação individual não precisa de nenhuma outra seção para entender o mês daquela pessoa.

Cada página SHALL identificar a pessoa por nome e equipe, e SHALL indicar a posição dela no ranking do escopo.

#### Scenario: Operador com meta e movimento

- **WHEN** um operador do setor tem meta cadastrada e recebimento no mês
- **THEN** a página dele mostra recebido, meta, percentual, quartil, diferença contra o esperado e a evolução diária dele

#### Scenario: Operador sem meta

- **WHEN** o operador não tem meta cadastrada no mês
- **THEN** a página mostra o recebido e as formas de pagamento
- **AND** informa que não há meta cadastrada, em vez de exibir 0% ou pior quartil

#### Scenario: Operador sem movimento

- **WHEN** o operador tem meta mas nenhum recebimento no mês
- **THEN** a página é renderizada com zero explícito e a meta, deixando claro que é ausência de recebimento e não ausência de dado

### Requirement: Metas em cascata batidas

A página do operador SHALL mostrar quantas metas do mês foram batidas quando houver metas em cascata (`metas.meta_valor` mais `metas_extras`), com marco visual de cada degrau na barra de progresso e o valor que falta para a próxima.

O quartil e o percentual principal SHALL continuar sendo calculados sobre a PRIMEIRA meta, como na tela — as metas extras são degraus adicionais, não substituem o alvo.

O mesmo bloco SHALL aparecer no resumo do escopo quando o grupo tiver metas em cascata.

#### Scenario: Segunda meta batida de três

- **WHEN** o operador tem meta principal e duas extras, e já superou a segunda
- **THEN** a barra mostra os três marcos, duas metas batidas e o valor que falta para a terceira

#### Scenario: Todas as metas batidas

- **WHEN** o operador superou a meta principal e todas as extras
- **THEN** a página marca todas como batidas e não exibe "falta X para a próxima"

#### Scenario: Sem metas extras

- **WHEN** o operador tem apenas a meta principal
- **THEN** a barra mostra um único alvo, sem marcos adicionais

### Requirement: Recorte por cargo nas páginas individuais

As páginas individuais SHALL obedecer ao recorte do relatório:

- escopo de **operador** gera exatamente UMA página, a da própria pessoa;
- escopo de **setor** gera páginas apenas de operadores do setor;
- escopo de **diretoria** gera páginas de todos os setores, agrupadas por setor.

Nenhum relatório SHALL conter página de pessoa fora do escopo de quem o gerou.

#### Scenario: Operador baixa o próprio fechamento

- **WHEN** um operador gera o relatório
- **THEN** existe uma única página individual, a dele
- **AND** nenhum nome de colega aparece em lugar nenhum do arquivo

#### Scenario: Líder de setor

- **WHEN** um líder do setor Receptivo gera o relatório
- **THEN** as páginas individuais são apenas de pessoas do Receptivo

#### Scenario: Diretoria

- **WHEN** a diretoria gera o relatório
- **THEN** as páginas individuais aparecem agrupadas por setor, com o nome do setor como divisor

### Requirement: Navegação direta para uma pessoa

A navegação do relatório SHALL permitir chegar à página de um operador específico sem percorrer as demais, por meio de um índice de pessoas na seção de fechamento individual.

#### Scenario: Índice de pessoas

- **WHEN** a seção de fechamento individual tem mais de uma página
- **THEN** ela abre com um índice clicável, ordenado por recebimento, que leva direto à página escolhida

### Requirement: Teto de páginas individuais

A quantidade de páginas individuais SHALL ter um teto, priorizando os operadores de maior recebimento. Os que ficarem de fora SHALL continuar presentes nas tabelas, no ranking e nos quartis, e o relatório SHALL informar quantos ficaram sem página própria.

#### Scenario: Escopo acima do teto

- **WHEN** o escopo tem mais operadores do que o teto de páginas
- **THEN** as páginas geradas são as dos operadores de maior recebimento
- **AND** o relatório informa quantos operadores não ganharam página, sem removê-los das demais seções
