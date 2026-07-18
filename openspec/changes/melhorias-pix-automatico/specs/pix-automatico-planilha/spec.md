## ADDED Requirements

### Requirement: Importar planilha de Pix Automático
O sistema SHALL permitir importar uma planilha (.xlsx ou .csv) de acordos Pix Automático já preenchida, criando um registro por linha válida, mantendo os registros existentes e permitindo continuar adicionando novos manualmente.

#### Scenario: Importar arquivo válido
- **WHEN** o usuário seleciona uma planilha com colunas de NR e valor (e opcionalmente operador)
- **THEN** cada linha válida vira um registro Pix novo com status pendente
- **AND** os registros já existentes na tela permanecem
- **AND** um retorno informa quantos registros foram importados

#### Scenario: Linha inválida é ignorada
- **WHEN** uma linha não tem NR ou tem valor inválido/vazio
- **THEN** essa linha é ignorada
- **AND** o resumo da importação informa quantas linhas foram ignoradas

#### Scenario: Duplicado não sobrescreve
- **WHEN** a planilha contém um NR que já existe para o mesmo operador
- **THEN** a linha duplicada é ignorada (não cria segundo registro nem sobrescreve o existente)
- **AND** o resumo informa quantos duplicados foram ignorados

#### Scenario: Operador da linha importada
- **WHEN** a planilha não traz operador ou o importador não é líder
- **THEN** o registro é criado com o operador do usuário logado
- **WHEN** o importador é líder e a planilha traz um operador reconhecido da empresa
- **THEN** o registro é atribuído a esse operador

### Requirement: Exportar planilha de Pix Automático
O sistema SHALL permitir exportar os registros Pix Automático atualmente visíveis (respeitando filtros) para uma planilha, para repasse a terceiros.

#### Scenario: Exportar registros visíveis
- **WHEN** o usuário aciona "Exportar"
- **THEN** o sistema gera um arquivo com uma linha por registro visível
- **AND** as colunas incluem NR, operador, valor, comissão, status e data de registro
- **AND** o download é iniciado no navegador

#### Scenario: Exportar sem registros
- **WHEN** não há registros visíveis
- **THEN** o sistema avisa que não há dados para exportar
- **AND** nenhum arquivo é gerado
