## ADDED Requirements

### Requirement: Agregação por forma de pagamento com rótulo canônico
O sistema SHALL agregar linhas do analítico por forma de pagamento usando um helper único de rótulo (`forma_detalhe` quando presente — BookPlay; fallback "Cartão"/"Boleto/Pix" — PaguePlay), produzindo por forma: valor, quantidade de registros e percentual do total. O total SHALL ser a soma dos valores (nunca reconstituído de percentuais). Cada forma SHALL ter uma cor canônica estável usada em cards, barras e badges.

#### Scenario: Agregação BookPlay
- **WHEN** as linhas têm forma_detalhe (PIX, PIX Automático, Boleto Negociação, Boleto Bancário, Cartão, Recorrente)
- **THEN** o resultado tem uma entrada por rótulo com valor/qtd/% e soma dos % ≈ 100 (±1)

#### Scenario: Agregação PaguePlay
- **WHEN** as linhas não têm forma_detalhe
- **THEN** o resultado agrupa em "Cartão" e "Boleto/Pix"

### Requirement: Seção de detalhamento com cards e distribuição
A seção "Detalhamento por Forma de Pagamento" SHALL exibir: um card por forma (rótulo, valor em BRL, "% · N registro(s)", cor-acento da forma), um card "Total Geral (agrupado)" destacado, e uma distribuição em barras horizontais ordenada por valor (percentual na barra, valor + contagem ao lado). Estados de carregamento e vazio SHALL ser tratados ("Nenhum recebimento no período").

#### Scenario: Render dos cards e barras
- **WHEN** a agregação retorna N formas
- **THEN** aparecem N cards + Total Geral, e N barras ordenadas por valor com % e valores rotulados

#### Scenario: Total consistente
- **WHEN** filtros mudam o conjunto de linhas
- **THEN** o Total Geral é sempre a soma dos cards visíveis e bate com o total da distribuição

### Requirement: Filtros dos registros
A seção SHALL oferecer o bloco "Filtros dos Registros" com: cliente (texto, busca parcial), documento/NR (texto), forma de pagamento (select com as formas presentes), e data de pagamento. Os filtros SHALL afetar tanto a tabela de registros quanto os cards/distribuição. Um botão "Limpar" SHALL restaurar o estado padrão.

#### Scenario: Filtro por NR
- **WHEN** o usuário digita um NR de documento e aplica
- **THEN** a tabela mostra apenas os registros daquele NR e os cards/distribuição refletem o subconjunto

#### Scenario: Filtro por cliente e forma combinados
- **WHEN** o usuário filtra cliente "MARIA" e forma "PIX"
- **THEN** só registros que satisfazem ambos aparecem

### Requirement: Tabela de registros detalhados paginada
A seção SHALL exibir a tabela "Registros Detalhados" com colunas Cliente (código + nome), Documento, Forma (badge colorido), DtPgto e Valor, paginada (blocos de ~50 com "Carregar mais" ou paginação numérica) e com o total de registros no cabeçalho. Para o operador, a coluna Usuário SHALL ser omitida; para líder+, exibida.

#### Scenario: Paginação
- **WHEN** há 838 registros
- **THEN** a tabela mostra o primeiro bloco, o cabeçalho informa "Total: 838 registros" e o usuário pode avançar/carregar mais

### Requirement: Escopo por papel
Para OPERADOR, a seção SHALL mostrar apenas os próprios recebimentos: o campo de operador aparece travado/desabilitado com o próprio nome e não há filtro de equipe/setor. Para LÍDER/supervisor/gerência+, a seção SHALL mostrar o setor em foco (regra de clone/órfão via `setoresDoOperador`, idêntica às abas irmãs) com filtros de operador (autocomplete com sugestões ao digitar), equipe e classe/setor conforme permissão; admin/diretoria com visão global podem alternar setores.

#### Scenario: Operador vê só o seu
- **WHEN** um operador abre o detalhamento
- **THEN** todos os números e registros são apenas dele; o campo operador está travado com o nome dele; sem filtros de equipe/setor

#### Scenario: Líder vê o setor
- **WHEN** um líder restrito ao setor abre o detalhamento
- **THEN** os números consolidam o setor (com clones e órfãos), e o autocomplete de operador sugere nomes ao digitar (nome + usuário), filtrando ao selecionar

#### Scenario: Autocomplete de operador
- **WHEN** o líder digita 2+ caracteres no campo operador
- **THEN** um dropdown lista operadores do escopo que casam com o texto (nome ou usuário); selecionar um filtra tudo; limpar volta ao consolidado
