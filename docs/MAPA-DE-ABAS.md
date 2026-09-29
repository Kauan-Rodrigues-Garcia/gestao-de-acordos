# Mapa de Abas — implementação

Proposta de origem: «Mapa de Abas do Gestão», 29/09/2026. Este documento diz o
que foi feito de cada fase, onde está no código e o que ficou pendente.

**O que não mudou:** nenhuma tabela, nenhum número, nenhuma regra de cálculo,
nenhuma RPC, nenhuma policy e nenhuma chave de permissão. Nada foi executado no
banco. Cada aba nova abre pela chave que abria a tela de onde ela veio.

## Fase 0 — medir as abas internas

Já estava na branch antes desta entrega (commit `17f5211`, «medir abas
internas, gavetas e ociosidade»). As telas novas continuam medindo: o
identificador de uso ganhou as rotas `desempenho`, `nucleo`, `pix-automatico`,
`admin/dados` e `admin/auditoria`, e o `NivelBaseUso` faz a tela embutida medir
no nível certo (`nucleo:celulares`, e não `controle-numeros` no nível 1).

## Fase 1 — só o menu

| Pedido | Onde |
|---|---|
| Seções no menu lateral | `SECOES_MENU` e `secao` em `lib/menuLateral.ts`; `Layout.tsx` desenha por seção; o editor de ordem mostra as seções e só move dentro delas |
| Novo acordo como botão fixo | `NOVO_ACORDO` / `mostrarNovoAcordo` em `lib/menuLateral.ts`; botão no topo do menu (`Layout.tsx`) |
| Importar Excel e Lixeira dentro de Acordos | botão «Importar planilha» e aba «Excluídos» em `pages/Acordos` (a Lixeira ganhou `embutida`) |
| Núcleo num item só | `pages/Nucleo` (Painel + as quatro abas do Controle de Números, que ganhou a prop `aba`) |
| Abas técnicas do Painel Diretoria em Administração › Dados | `pages/AdminDados` (o Painel Diretoria ganhou `abaFixa` e `compacto`); os cards de banco e «Importar acordos» saíram de Configurações |
| — (da proposta) Auditoria | `pages/AdminAuditoria`: Trilha, Uso por tela, Uso por pessoa (com «sem acesso» como filtro), Adoção |
| — (da proposta) Pix Automático como item | `pages/PixAutomatico` |

## Fase 2 — Início e Analítico

| Pedido | Onde |
|---|---|
| Início absorve Gráfico recebimento, Desempenho do Dia e Visão geral | `pages/Inicio`: leituras Mês (o antigo Dashboard, que já traz a evolução diária), Hoje (o painel Desempenho do Dia embutido + Destaques), Formas e Empresa (Visão geral / painel da PaguePlay) |
| Analítico entrega Formas, Ranking, Destaques e Desafios | `PaginaAnalitico` ganhou `secao`; na rota `/analitico` ficam Recebimentos, Colchão e Ajustes. As outras partes são a mesma página, desenhada no Início e em Desempenho |
| PaguePlay ganha Acordos; Início igual nas duas | `Dashboard` ganhou `secao` (`inicio` / `acordos`); `/acordos` escolhe a tela por empresa (`RotaAcordos`) |

A gaveta Desempenho do Dia virou atalho para Início › Hoje; a do Desafio, para
Desempenho › Desafios (o componente `PainelDesafio` saiu).

## Fase 3 — Desempenho e Fechamento do mês

| Pedido | Onde |
|---|---|
| Painel Líder e o desempenho do Painel Diretoria viram Desempenho | `pages/Desempenho`: Equipes, Pessoas (Quartis, Ranking, Relatório 59 como filtro), Desafios, Plantão Elite |
| Uma noção só de equipe | quem tem o Painel Líder vê a versão da liderança (equipe da PESSOA); a leitura por subgrupo do 59 fica só para a diretoria sem o Painel Líder, e em Dados › Conferência |
| Fechamento + RH Gestão | `pages/FechamentoDoMes`: Fechamento e Premiação e comissão (Conferência e aprovação do RH / Relatório de pagamento) |

## Fase 4 — limpeza

| Pedido | Feito |
|---|---|
| Redirecionar as rotas antigas | todas, levando a busca junto — ver `Redirecionar` em `App.tsx` |
| Remapear as chaves de permissão | as chaves são as mesmas; o painel de permissões (`lib/permissoes-abas.ts`) renomeou os cards e as seções para os endereços novos e segue a ordem do menu |
| Modo TV | nenhuma referência às telas antigas existia na mesa nem no palco |
| Tour | passos novos para o menu por seções e o botão Novo acordo; a PaguePlay passou a mostrar filtros e tabela em `/acordos` |
| Documentação | este arquivo e a seção «Mapa de Abas» de `ARQUITETURA.md` |
| Código sem uso | `PainelDesafio` removido; `isPP` morto em `AcordosFilters` removido; cards de banco movidos para `components/admin/CardBancoDeDados.tsx` |

Outros ajustes: Configurações ficou com Empresa (Geral + Tags + Multiempresa),
Direto e Extra, Permissões e menu, Documentações; Pessoas (antigo Usuários)
juntou Setores e Equipes na aba Estrutura e chama Metas de «Metas e comissão»;
notificações de acordo da PaguePlay levam a `/acordos`; a lista de telas do
formulário de Tickets usa os nomes novos.

## Pendências — precisam de decisão ou de banco

1. **`painel_lider_sub_grafico_recebimento`**: a aba Gráfico recebimento saiu
   do menu (repetia a evolução diária do Início), mas a chave continua no
   catálogo do banco (`fn_permissoes_catalogo()`). Tirá-la é migration em
   produção — precisa de autorização explícita. Até lá o card de permissões a
   mostra como «Saiu do menu», e o código da aba continua em `PainelLider.tsx`,
   sem caminho que chegue nele.
2. **Pix Automático em três abas** (Registros · Pendências · Meta e premiação):
   o módulo tem ~2.900 linhas e foi movido inteiro para o item próprio, sem
   reorganização interna. É a próxima etapa natural.
3. **Um editor só para mensagens de WhatsApp** (modelos da empresa como ponto
   de partida das mensagens da pessoa, em Acordos): não feito. Os modelos
   continuam em Configurações › Empresa.
4. **Editar meta só em Pessoas › Metas e comissão**: a meta de contribuição do
   Receptivo continua editável dentro de Desempenho › Equipes.
5. **Regras do RH em Configurações**: a configuração do RH é um diálogo dentro
   do fluxo do RH, e ficou lá.
6. **Alcance Eu · Equipe · Setor · Empresa no Início**: o Início usa o filtro
   de escopo que o Dashboard já tinha, e a leitura Empresa é a Visão geral da
   Diretoria. Unificar os dois num filtro só mexe em `useAnalytics`.
