## ADDED Requirements

### Requirement: Copiar NR individual
O sistema SHALL permitir copiar o NR de uma linha da tabela Pix Automático para a área de transferência com um clique.

#### Scenario: Copiar NR de uma linha
- **WHEN** o usuário clica no ícone de copiar ao lado do NR de uma linha
- **THEN** o valor do NR (`nr_cliente`) é copiado para a área de transferência
- **AND** um retorno visual confirma a cópia (ex.: toast "NR copiado")

#### Scenario: Clipboard indisponível
- **WHEN** a API de clipboard do navegador não está disponível ou falha
- **THEN** o sistema exibe um aviso de erro
- **AND** não quebra a página

### Requirement: Seleção de linhas para líder
O sistema SHALL permitir que um líder (ou superior) selecione linhas da tabela Pix Automático via checkbox por linha e um controle "selecionar todos os visíveis".

#### Scenario: Selecionar linhas individuais
- **WHEN** o líder marca o checkbox de uma ou mais linhas
- **THEN** essas linhas ficam marcadas como selecionadas
- **AND** a barra de ações em lote mostra a quantidade selecionada

#### Scenario: Selecionar todos os visíveis
- **WHEN** o líder aciona "selecionar todos"
- **THEN** todas as linhas atualmente visíveis (após filtros) ficam selecionadas

#### Scenario: Seleção indisponível para operador
- **WHEN** o usuário não é líder/admin
- **THEN** os checkboxes de seleção não são exibidos

### Requirement: Copiar em lote no formato de encaminhamento
O sistema SHALL gerar, a partir das linhas selecionadas, um texto com uma linha por acordo no formato `NR: <nr> OPERADOR <operador> VALOR <valor> COMISSÃO <comissao> DATA <dd/mm>` e copiá-lo para a área de transferência.

#### Scenario: Copiar acordos selecionados
- **WHEN** o líder tem ao menos uma linha selecionada e aciona "Copiar selecionados"
- **THEN** o sistema monta uma linha por acordo no formato acima
- **AND** o texto completo é copiado para a área de transferência
- **AND** um retorno visual confirma a cópia com a quantidade copiada

#### Scenario: Formato de cada linha
- **WHEN** uma linha de acordo é formatada
- **THEN** `NR` usa `nr_cliente`, `OPERADOR` usa o nome do operador, `VALOR` usa o valor do acordo, `COMISSÃO` usa a comissão calculada da linha e `DATA` usa a data de registro no formato `dd/mm`

#### Scenario: Nenhuma linha selecionada
- **WHEN** o líder aciona "Copiar selecionados" sem nenhuma seleção
- **THEN** o sistema avisa que não há acordos selecionados
- **AND** nada é copiado
