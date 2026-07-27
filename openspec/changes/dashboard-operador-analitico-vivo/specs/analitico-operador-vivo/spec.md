## ADDED Requirements

### Requirement: Tabela de recebimentos detalhada e sem redundância
A visão "Meus recebimentos" do operador no Analítico SHALL exibir cada linha com o cliente em destaque (nome completo + código do cliente quando disponível), NR do documento, forma de pagamento (badge colorido por forma), data de pagamento e valor. A coluna de usuário SHALL ser omitida (o usuário é o próprio operador). Nenhuma coluna de comissão SHALL existir. A coluna/badge de tipo (Direto/Extra) SHALL aparecer somente quando o setor do operador tem a lógica direto/extra ativa E a linha tem acordo tabulado com `tipo_vinculo` conhecido; caso contrário é omitida.

#### Scenario: Operador em setor sem direto/extra
- **WHEN** o operador de um setor sem a lógica abre Meus recebimentos
- **THEN** a tabela mostra cliente, NR, forma, data e valor — sem coluna de tipo, sem usuário, sem comissão

#### Scenario: Operador em setor com direto/extra
- **WHEN** o setor tem a lógica ativa e a linha está tabulada num acordo com tipo_vinculo
- **THEN** a linha mostra badge "Direto" (azul) ou "Extra" (âmbar); linhas não tabuladas ficam sem badge de tipo

#### Scenario: Funcionalidades preservadas
- **WHEN** a tabela nova renderiza
- **THEN** Tabular acordo (TabulacaoCell), filtro de período, indicador de não visto e cards de resumo (total recebido, tabulados) continuam funcionando como antes

### Requirement: Visual vivo com a estética do Gestão de Acordos
A tabela SHALL usar hierarquia visual clara: nome do cliente em peso maior, código/NR em fonte mono, badges de forma coloridos pela cor canônica da forma, hover na linha e espaçamento confortável — usando componentes shadcn e tokens de tema (claro/escuro), sem cores fixas incompatíveis com o tema.

#### Scenario: Tema claro e escuro
- **WHEN** o usuário alterna o tema
- **THEN** a tabela permanece legível, badges e destaques usam as cores canônicas com contraste adequado
