## ADDED Requirements

### Requirement: Gráfico de evolução diária

O painel SHALL exibir um gráfico com um ponto por dia do mês em análise, alimentado por `porDia` de `agregarAnalitico` — a mesma fonte do total exibido nos cards.

Todos os dias do mês SHALL aparecer no eixo, mesmo os sem recebimento: a sequência é o que dá a leitura de ritmo. Dia sem movimento simplesmente não desenha barra.

O gráfico NÃO SHALL rotular cada barra com o valor. Com até 31 dias os rótulos se sobrepõem e viram ruído; o valor exato SHALL ficar no tooltip.

#### Scenario: Mês com dias vazios

- **WHEN** o mês tem 11 dias decorridos e apenas 9 tiveram recebimento
- **THEN** o eixo mostra todos os dias do mês em ordem, com barra apenas nos 9

#### Scenario: Valor sob demanda

- **WHEN** o usuário passa o cursor sobre um dia
- **THEN** o tooltip mostra o valor recebido daquele dia

### Requirement: Classificação da barra pela meta diária

Cada barra SHALL usar uma cor única em dois pesos: cheia quando o recebimento do dia alcança a meta diária, esmaecida quando não alcança. Duas cores fortes distintas competiriam com a régua de meta, que é a informação nova, e excluiriam quem não distingue as duas cores — o peso comunica sozinho.

Uma régua horizontal tracejada SHALL marcar a meta diária, rotulada com o valor.

A meta diária SHALL ser a mesma usada pelos cards de projeção (`calcularProjecao`: meta ÷ total de dias úteis) — as duas leituras não podem discordar dentro do mesmo painel.

#### Scenario: Dia que alcançou a meta

- **WHEN** a meta diária é R$ 6.190,48 e o dia recebeu R$ 18.384,11
- **THEN** a barra do dia é desenhada cheia e ultrapassa a régua de meta

#### Scenario: Dia abaixo da meta

- **WHEN** a meta diária é R$ 6.190,48 e o dia recebeu R$ 703,30
- **THEN** a barra é desenhada esmaecida

#### Scenario: Fronteira exata

- **WHEN** o recebimento do dia é exatamente igual à meta diária
- **THEN** o dia conta como alcançado e a barra fica cheia

#### Scenario: Sem meta cadastrada

- **WHEN** não existe meta para o escopo em exibição
- **THEN** todas as barras usam um peso único
- **AND** a régua de meta e a legenda de comparação são omitidas

### Requirement: Série de agendado mesclada

O gráfico SHALL sobrepor uma linha fina com o valor AGENDADO por dia, vinda da tabulação (`acordos.vencimento`) — é o que ainda não entrou, e por isso não poderia estar num relatório de recebimento.

As duas séries juntas são o ponto: a barra é o que entrou, a linha é o que está prometido. A série SHALL ser omitida quando não há agendamento nenhum no mês, em vez de desenhar uma linha rente a zero.

#### Scenario: Mês com agendamentos

- **WHEN** há acordos agendados para dias do mês
- **THEN** a linha de agendado aparece sobre as barras
- **AND** a legenda inclui a referência de Agendado

#### Scenario: Mês sem agendamento

- **WHEN** nenhum dia tem valor agendado
- **THEN** a série e a sua legenda são omitidas

### Requirement: Destaque do dia corrente

O gráfico SHALL destacar a barra do dia de hoje quando o mês em análise é o corrente, por CONTORNO e não por outra cor de preenchimento — trocar a cor perderia a informação de alcançou ou não a meta.

O dia de hoje SHALL vir do fuso de São Paulo (`getTodayISO`), nunca de `new Date()` da máquina.

#### Scenario: Mês corrente

- **WHEN** o mês em análise é o corrente e hoje é dia 11
- **THEN** a barra do dia 11 recebe contorno, mantendo o preenchimento que a meta determinou

#### Scenario: Mês fechado

- **WHEN** o mês em análise já terminou
- **THEN** nenhuma barra recebe o destaque de "hoje"

### Requirement: Rodapé de totais do gráfico

O gráfico SHALL exibir um rodapé compacto com a quantidade de dias com recebimento, o total do mês, o melhor dia e a meta diária.

#### Scenario: Rodapé com dados

- **WHEN** 4 dias tiveram recebimento, somando R$ 34.452,54, com melhor dia de R$ 18.384,11
- **THEN** o rodapé mostra os três valores
- **AND** o total do rodapé é igual ao card Total recebido

#### Scenario: Mês sem recebimento

- **WHEN** nenhum dia teve recebimento
- **THEN** o rodapé informa zero dias e não inventa um "melhor dia"

#### Scenario: Sem meta

- **WHEN** não há meta para o escopo
- **THEN** o rodapé não cita meta diária

### Requirement: Escopo do gráfico

O gráfico SHALL respeitar o alternador Eu / Minha equipe: em "Minha equipe" as barras SHALL somar o recebimento diário de todos os membros, e a régua de meta SHALL usar a meta diária da equipe.

#### Scenario: Líder na visão de equipe

- **WHEN** o líder alterna para "Minha equipe"
- **THEN** cada barra passa a somar o recebimento do dia de todos os membros
- **AND** a régua de meta sobe para a meta diária agregada
