## ADDED Requirements

### Requirement: Abertura com o veredito do mês

O relatório SHALL abrir com uma capa que responde "como foi o mês?" antes de qualquer tabela: o total recebido em tipografia de destaque, a meta ao lado, o percentual alcançado e **uma frase em português** que diz se bateu, por quanto e em que ritmo.

A frase SHALL ser derivada dos mesmos números do corpo do relatório, nunca escrita à parte. Quem projeta o arquivo numa reunião precisa poder ler a primeira tela em voz alta e já ter dado o recado.

A capa SHALL identificar o escopo (empresa, setor ou pessoa), o mês, quem gerou e quando, e SHALL marcar visualmente se o mês estava fechado ou ainda em curso.

#### Scenario: Meta batida

- **WHEN** o total recebido do escopo é maior ou igual à meta
- **THEN** a capa mostra o total em destaque, o selo de meta alcançada e uma frase informando por quanto a meta foi superada

#### Scenario: Meta não batida

- **WHEN** o total recebido é menor que a meta
- **THEN** a frase informa quanto faltou em reais e o percentual alcançado
- **AND** não usa linguagem de comemoração

#### Scenario: Escopo sem meta cadastrada

- **WHEN** não existe meta para o escopo no mês
- **THEN** a capa mostra o total recebido e informa que não havia meta cadastrada
- **AND** não exibe percentual nem veredito de "bateu/não bateu"

#### Scenario: Mês ainda em curso

- **WHEN** o mês do relatório é o mês corrente
- **THEN** a capa marca o documento como parcial, com a data e hora do retrato

### Requirement: Seções com uma pergunta cada

O relatório SHALL ser dividido em seções navegáveis, e cada seção SHALL responder UMA pergunta, anunciada no próprio título. Uma seção SHALL abrir pelo número que a responde, sustentar com gráfico e só então detalhar em tabela.

Seção que não tem conteúdo SHALL ser omitida — inclusive do menu de navegação. Uma aba que abre vazia é pior do que uma aba que não existe.

A ordem SHALL ser fixa: visão do mês, operadores, quartis, ranking, Pix Automático, destaques e curiosidades, fechamento individual, comparativo entre setores.

#### Scenario: Seção sem dados

- **WHEN** o escopo não tem nenhum registro de Pix Automático no mês
- **THEN** a seção de Pix não é renderizada nem aparece na navegação

#### Scenario: Ordem preservada

- **WHEN** o relatório é gerado para qualquer escopo
- **THEN** as seções presentes aparecem sempre na mesma ordem relativa

### Requirement: Coerência visual com o aplicativo

O relatório SHALL usar a mesma linguagem visual das telas que representa: a paleta de quartis (`COR_QUARTIL`), a mesma convenção de cor para projeção (verde ≥ 100%, azul ≥ 80%, âmbar ≥ 50%, vermelho abaixo), cartões com rótulo em caixa alta pequena sobre valor em destaque, e pílulas para quartil.

Valores monetários SHALL usar `pt-BR` com símbolo de real; percentuais SHALL usar vírgula decimal; números SHALL ser alinhados à direita em fonte tabular.

O relatório SHALL se adaptar ao tema claro e escuro do sistema operacional de quem abre, e SHALL declarar cor de fundo e de texto explicitamente em ambos.

#### Scenario: Cor de projeção consistente

- **WHEN** um operador aparece na tabela com 96% de projeção e no ranking na mesma seção
- **THEN** a mesma cor é usada nos dois lugares

#### Scenario: Aberto em sistema com tema escuro

- **WHEN** o arquivo é aberto num navegador com `prefers-color-scheme: dark`
- **THEN** a página usa fundo escuro e texto claro, com contraste suficiente para leitura

### Requirement: Modo apresentação

O relatório SHALL oferecer um modo de apresentação que exibe uma seção por vez ocupando a tela, navegável pelas setas ← e →, com Esc para sair.

O modo SHALL indicar a posição atual ("3 de 8") e SHALL ser acionável por um controle visível na navegação. Sair do modo SHALL devolver o leitor à seção em que ele estava.

O modo apresentação SHALL ser um aprimoramento: com JavaScript desabilitado, o documento continua legível por rolagem, com todas as seções visíveis.

#### Scenario: Navegação por teclado

- **WHEN** o leitor entra no modo apresentação e pressiona a seta direita
- **THEN** avança para a próxima seção existente
- **AND** ao chegar na última, a seta direita não avança para uma seção vazia

#### Scenario: Saída pelo Esc

- **WHEN** o leitor pressiona Esc no modo apresentação na seção de Quartis
- **THEN** o modo é encerrado e a página volta à navegação normal posicionada em Quartis

#### Scenario: Sem JavaScript

- **WHEN** o arquivo é aberto num contexto que não executa JavaScript
- **THEN** todas as seções aparecem empilhadas e legíveis

### Requirement: Impressão como documento completo

Ao imprimir, o relatório SHALL exibir TODAS as seções, independentemente de qual estivesse aberta, com quebra de página entre seções e sem cortar cartão, tabela ou gráfico ao meio.

Os controles de navegação e o botão de modo apresentação SHALL desaparecer na impressão.

#### Scenario: Impressão a partir de uma aba

- **WHEN** o leitor está na seção de Ranking e aciona a impressão
- **THEN** o PDF gerado contém todas as seções do relatório, começando pela capa

#### Scenario: Elemento não fatiado

- **WHEN** uma tabela de operadores fica no limite de uma página
- **THEN** a quebra ocorre entre linhas, e cabeçalho de seção não fica órfão no fim da página

### Requirement: Arquivo autocontido e portátil

O relatório SHALL continuar sendo um único arquivo HTML sem nenhuma requisição externa: sem CDN, sem fonte da web, sem imagem remota, sem `fetch`. Todo CSS, JavaScript e gráfico SHALL estar embutido.

Todo texto vindo do banco SHALL ser escapado antes de entrar no HTML.

#### Scenario: Aberto sem internet

- **WHEN** o arquivo é aberto de um pen drive numa máquina sem rede
- **THEN** o relatório renderiza completo, com gráficos e navegação funcionando

#### Scenario: Nome com marcação HTML

- **WHEN** um setor ou operador tem `<script>` ou aspas no nome cadastrado
- **THEN** o texto aparece literal na tela e nenhum script é executado

### Requirement: Ressalvas visíveis, não escondidas

O relatório SHALL manter uma seção de observações que explique o que pode distorcer a leitura: cobertura parcial de classificação Direto/Extra, mês ainda aberto, meta ausente, configuração de feriados ausente, relatório analítico não importado.

A ressalva SHALL nomear a causa e o caminho de correção, não apenas alertar.

#### Scenario: Cobertura baixa de Direto/Extra

- **WHEN** mais de 20% do valor recebido está sem classificação Direto/Extra
- **THEN** o relatório informa o percentual, explica que são linhas importadas antes de o relatório trazer a coluna "Tipo comissão" e indica que reimportar o mês corrige

#### Scenario: Nenhuma ressalva aplicável

- **WHEN** o mês está fechado, com meta, config e cobertura completa
- **THEN** a seção de observações não é renderizada

### Requirement: Comparativo com o mês anterior

O relatório SHALL comparar o mês em fechamento com o mês imediatamente anterior no MESMO escopo, mostrando a variação de recebido, de meta e de quantidade de pagamentos, em valor absoluto e em percentual.

Quando não houver dado do mês anterior, o comparativo SHALL informar a ausência em vez de exibir variação de 100%.

#### Scenario: Mês anterior com dados

- **WHEN** o escopo recebeu R$ 1.000.000 no mês anterior e R$ 1.168.344,63 no mês do relatório
- **THEN** o comparativo mostra a variação positiva em reais e em percentual, com cor de alta

#### Scenario: Mês anterior sem relatório importado

- **WHEN** não há linhas de analítico no mês anterior para o escopo
- **THEN** o comparativo informa que não há base de comparação
- **AND** não exibe percentual de variação

### Requirement: Peso do arquivo sob controle

O relatório SHALL ter um teto de tamanho, e a geração SHALL degradar de forma previsível ao se aproximar dele: as seções por operador SHALL ser limitadas a um número máximo, priorizando por valor recebido, e o relatório SHALL informar quantos operadores ficaram de fora.

#### Scenario: Setor grande

- **WHEN** o escopo tem mais operadores do que o teto de seções individuais
- **THEN** o relatório traz as seções dos operadores de maior recebimento até o teto
- **AND** informa quantos operadores não ganharam seção própria, sem removê-los das tabelas e do ranking
