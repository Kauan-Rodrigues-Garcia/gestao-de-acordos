## ADDED Requirements

### Requirement: Aba "Meus Chips" restrita ao próprio setor
O sistema SHALL apresentar a cada setor apenas os celulares e números pertencentes àquele setor, e SHALL impedir por RLS o acesso a registros de outro setor.

#### Scenario: Liderança do Play 3 abre a aba
- **WHEN** um líder do Play 3 abre "Meus Chips"
- **THEN** vê os celulares do Play 3 e os números do Play 3 que já foram liberados pelo Núcleo
- **AND** vê a situação atual de cada número e a quem ele foi lançado
- **AND** não vê nenhum registro do Play 1, Play 2 ou de qualquer outro setor

#### Scenario: Tentativa de ler setor alheio pelo banco
- **WHEN** um usuário do Play 3 consulta `numeros_whatsapp` filtrando por um setor que não é o dele
- **THEN** a consulta retorna vazio

#### Scenario: Tentativa de alterar número de outro setor
- **WHEN** um usuário do Play 3 chama qualquer RPC de transição sobre um número do Play 1
- **THEN** a operação é recusada

### Requirement: Operador vê apenas o que foi lançado para ele
O sistema SHALL mostrar ao operador somente os números efetivamente lançados para ele, e SHALL manter os demais números do setor visíveis apenas para a liderança.

#### Scenario: Número liberado ao setor, ainda não lançado
- **WHEN** um número está com `posse = 'setor'` e sem operador
- **THEN** a liderança do setor o vê como disponível para lançamento
- **AND** nenhum operador do setor o vê

#### Scenario: Número lançado ao operador
- **WHEN** a liderança lança o número para um operador
- **THEN** aquele operador passa a vê-lo em "Meus Chips"
- **AND** os demais operadores do setor continuam sem vê-lo
- **AND** a liderança continua vendo o número, agora com o operador ao lado

#### Scenario: Liderança vê o setor inteiro
- **WHEN** a liderança abre a aba
- **THEN** vê tanto os números ainda não lançados quanto os já distribuídos

### Requirement: Lançar número ao operador
O sistema SHALL permitir à liderança do setor lançar um número do próprio setor para um operador do mesmo setor.

#### Scenario: Lançar para operador do setor
- **WHEN** a liderança com `chips_lancar_ao_operador` lança um número com `posse = 'setor'` para um operador do mesmo setor
- **THEN** `operador_id` é gravado
- **AND** uma movimentação `lancado_ao_operador` registra o operador de destino

#### Scenario: Lançar para pessoa de outro setor
- **WHEN** a liderança tenta lançar para alguém que não é do setor do número
- **THEN** a operação é recusada

#### Scenario: Lançar número que ainda está no Núcleo
- **WHEN** a liderança tenta lançar um número com `posse = 'nucleo'`
- **THEN** a operação é recusada
- **AND** a mensagem informa que o número ainda não foi liberado pelo Núcleo

#### Scenario: Lançar número banido
- **WHEN** a liderança tenta lançar um número que está no setor com `situacao = 'banido'`
- **THEN** a operação é recusada
- **AND** a mensagem indica que o caminho daquele número é o relançamento ao Núcleo

#### Scenario: Trocar o operador de um número já lançado
- **WHEN** a liderança lança para outro operador um número que já estava com alguém
- **THEN** o novo operador passa a constar
- **AND** o histórico registra operador de origem e operador de destino

### Requirement: Devolver à liderança
O sistema SHALL permitir ao operador devolver à liderança um número lançado para ele, sem que o número saia do setor.

#### Scenario: Operador devolve
- **WHEN** o operador com `chips_devolver_a_lideranca` devolve um número lançado para ele, informando o motivo
- **THEN** `operador_id` é limpo e a posse continua `setor`
- **AND** uma movimentação `devolvido_a_lideranca` registra o motivo
- **AND** o número deixa de aparecer para o operador e continua com a liderança

#### Scenario: Operador tenta devolver número que não é dele
- **WHEN** o operador chama a devolução para um número lançado a outra pessoa
- **THEN** a operação é recusada

### Requirement: Relançar ao Núcleo
O sistema SHALL permitir à liderança do setor devolver um número ao Núcleo, preservando o registro e o histórico, com motivo obrigatório.

#### Scenario: Relançar número banido
- **WHEN** a liderança com `chips_relancar_ao_nucleo` relança um número informando motivo `banido` e uma observação
- **THEN** a posse volta a `nucleo` e `operador_id` é limpo
- **AND** motivo e observação ficam gravados no número e na movimentação
- **AND** o número deixa de aparecer em "Meus Chips" e volta ao controle do Núcleo

#### Scenario: Relançamento não apaga nem recadastra
- **WHEN** um número é relançado ao Núcleo
- **THEN** o registro continua sendo o mesmo, com o mesmo identificador
- **AND** todas as movimentações anteriores permanecem

#### Scenario: Relançar sem motivo
- **WHEN** a liderança tenta relançar sem escolher um motivo
- **THEN** a operação é recusada

#### Scenario: Operador não relança
- **WHEN** um operador sem `chips_relancar_ao_nucleo` tenta relançar
- **THEN** a operação é recusada
- **AND** a interface oferece a ele apenas "Devolver à liderança"

### Requirement: Histórico de movimentações
O sistema SHALL preservar o histórico completo de movimentações de cada número, sem que o estado atual substitua os registros anteriores.

#### Scenario: Consultar o histórico
- **WHEN** alguém que enxerga um número abre o histórico dele
- **THEN** vê, por movimentação: o número, o tipo de movimentação, setor de origem, setor de destino, situação ou motivo, autor e data

#### Scenario: Ida, volta e nova ida
- **WHEN** um número vai do Núcleo ao Play 3, volta ao Núcleo e é liberado de novo ao Play 3
- **THEN** o histórico apresenta as três movimentações em ordem
- **AND** nenhuma delas foi sobrescrita pela seguinte

#### Scenario: Histórico é imutável
- **WHEN** qualquer usuário tenta alterar ou apagar uma linha de movimentação
- **THEN** a operação é recusada, porque não existe política de alteração nem de exclusão para essa tabela

#### Scenario: Setor apagado não apaga histórico
- **WHEN** um setor citado no histórico é removido do sistema
- **THEN** as movimentações continuam existindo com o nome do setor registrado à época
