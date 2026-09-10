## ADDED Requirements

### Requirement: Identificação do setor Núcleo por configuração
O sistema SHALL guardar, por empresa, qual setor é o Núcleo de Inteligência e Gestão, em `numeros_config`, e SHALL reconhecer como membro do Núcleo apenas quem tem `perfis.setor_id` igual a esse setor.

#### Scenario: Empresa com Núcleo configurado
- **WHEN** `numeros_config` da empresa aponta o setor "Núcleo de Inteligência e Gestão"
- **THEN** usuários com `setor_id` daquele setor são reconhecidos como Núcleo
- **AND** enxergam todos os celulares e números da empresa

#### Scenario: Empresa sem configuração
- **WHEN** não existe linha em `numeros_config` para a empresa
- **THEN** ninguém é reconhecido como Núcleo naquela empresa
- **AND** nenhum celular ou número é visível pela área do Núcleo

#### Scenario: Apontar o setor exige permissão nominal
- **WHEN** um usuário sem `numeros_configurar` tenta gravar `numeros_config`
- **THEN** a escrita é recusada pelo banco
- **AND** o acesso total de administrador não concede essa permissão por herança

### Requirement: Cadastro de celular
O sistema SHALL permitir ao Núcleo cadastrar celulares com identificação obrigatória, modelo opcional e setor dono obrigatório.

#### Scenario: Cadastrar celular
- **WHEN** um membro do Núcleo com `numeros_administrar` cadastra um celular com identificação e setor
- **THEN** o celular é gravado vinculado àquele setor
- **AND** passa a aceitar números daquele mesmo setor

#### Scenario: Identificação duplicada
- **WHEN** já existe celular com a mesma identificação na empresa, ignorando maiúsculas e espaços nas pontas
- **THEN** o cadastro é recusado
- **AND** a tela informa que aquela identificação já existe

#### Scenario: Setor do celular é imutável com número vinculado
- **WHEN** alguém tenta trocar o setor de um celular que já tem número vinculado
- **THEN** a alteração é recusada pelo banco com mensagem explicando o motivo
- **AND** o setor original permanece

#### Scenario: Setor do celular pode mudar enquanto está vazio
- **WHEN** um celular sem nenhum número vinculado tem o setor alterado
- **THEN** a alteração é aceita

### Requirement: Limite de seis números por celular
O sistema SHALL impedir que um celular tenha mais de 6 números vinculados, tanto na interface quanto no banco.

#### Scenario: Sexto número
- **WHEN** um celular com 5 números recebe mais um
- **THEN** o cadastro é aceito
- **AND** a tela passa a mostrar 6/6 e desabilita o cadastro naquele celular

#### Scenario: Sétimo número
- **WHEN** alguém tenta cadastrar um número em celular que já tem 6
- **THEN** o banco recusa a operação
- **AND** a mensagem informa o limite de 6 números por celular

#### Scenario: Dois cadastros simultâneos no mesmo celular
- **WHEN** duas sessões cadastram o sexto e o sétimo número no mesmo celular ao mesmo tempo
- **THEN** apenas um é gravado
- **AND** o outro recebe o erro de limite

### Requirement: Cadastro de número de WhatsApp
O sistema SHALL registrar cada número de WhatsApp como registro próprio, com número normalizado, celular, setor herdado do celular, situação, posse e data de cadastro.

#### Scenario: Cadastrar número
- **WHEN** um membro do Núcleo cadastra um número em um celular
- **THEN** o número é gravado com `situacao = 'em_aquecimento'` e `posse = 'nucleo'`
- **AND** o `setor_id` é copiado do celular, não escolhido por quem cadastra
- **AND** uma movimentação do tipo `cadastro` é gravada

#### Scenario: Número já cadastrado
- **WHEN** alguém tenta cadastrar um número que já existe na empresa
- **THEN** o cadastro é recusado
- **AND** a tela identifica que aquele número já possui cadastro, indicando o celular e o setor onde está

#### Scenario: Máscara não cria número diferente
- **WHEN** um número é digitado como `(18) 99999-9999` e outro como `18999999999`
- **THEN** os dois são tratados como o mesmo número
- **AND** o segundo cadastro é recusado como duplicado

#### Scenario: Número inválido
- **WHEN** o número informado não tem 10 ou 11 dígitos, ou tem DDD fora da faixa 11–99
- **THEN** o cadastro é recusado antes de chegar ao banco
- **AND** a tela explica o formato esperado

### Requirement: Situação do número
O sistema SHALL permitir ao Núcleo alterar a situação de um número entre `em aquecimento`, `ativo` e `banido`, e SHALL registrar cada alteração no histórico.

#### Scenario: Alterar situação
- **WHEN** um membro do Núcleo com `numeros_administrar` altera a situação de um número
- **THEN** a nova situação é gravada
- **AND** uma movimentação do tipo `situacao_alterada` registra situação anterior e nova

#### Scenario: Setor não altera situação
- **WHEN** um usuário que não é do Núcleo tenta alterar a situação de um número
- **THEN** a operação é recusada

### Requirement: Liberar número ao setor
O sistema SHALL permitir ao Núcleo disponibilizar ao setor dono um número que esteja no Núcleo e com situação `ativo`.

#### Scenario: Liberar número ativo
- **WHEN** um membro do Núcleo com `numeros_liberar_ao_setor` libera um número com `posse = 'nucleo'` e `situacao = 'ativo'`
- **THEN** a posse passa a `setor`
- **AND** uma movimentação `liberado_ao_setor` registra Núcleo como origem e o setor como destino
- **AND** o número passa a aparecer em "Meus Chips" daquele setor para a liderança

#### Scenario: Liberar número que não está ativo
- **WHEN** alguém tenta liberar um número com situação `em_aquecimento` ou `banido`
- **THEN** a operação é recusada
- **AND** a mensagem informa que só número ativo pode ser liberado

#### Scenario: Número em aquecimento continua visível ao Núcleo
- **WHEN** um número está com `situacao = 'em_aquecimento'`
- **THEN** ele continua listado no controle do Núcleo
- **AND** não aparece em "Meus Chips" de nenhum setor

### Requirement: Recebimento de números relançados
O sistema SHALL apresentar ao Núcleo os números que voltaram dos setores, com o motivo e a observação informados no relançamento.

#### Scenario: Número relançado aparece para o Núcleo
- **WHEN** a liderança de um setor relança um número ao Núcleo
- **THEN** o número volta a aparecer no controle do Núcleo com `posse = 'nucleo'`
- **AND** o motivo e a observação do relançamento ficam visíveis
- **AND** o registro é o mesmo, com o histórico anterior preservado

#### Scenario: Tratar e liberar de novo
- **WHEN** o Núcleo altera a situação de um número relançado para `ativo` e o libera
- **THEN** o número volta ao mesmo setor a que pertence
- **AND** o histórico mostra a ida, a volta e a nova ida

### Requirement: Isolamento do módulo no banco
O sistema SHALL garantir por RLS que só o Núcleo administra celulares e números, independentemente do que a interface mostre.

#### Scenario: Usuário de setor tenta cadastrar celular
- **WHEN** um usuário que não é do Núcleo tenta inserir em `numeros_celulares`, mesmo chamando o banco diretamente
- **THEN** a inserção é recusada pela política de segurança

#### Scenario: Usuário sem a chave da aba
- **WHEN** um usuário do setor Núcleo não tem `ver_controle_numeros`
- **THEN** a rota `/controle-numeros` não abre
- **AND** as leituras do módulo pelo banco não retornam linhas
