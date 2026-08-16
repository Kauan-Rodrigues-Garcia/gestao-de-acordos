# Solicitar Atendimento 2.0 + ajustes de Dashboard e lista de acordos

Data: 2026-08-16
Status: aguardando revisão

Três pedidos independentes chegaram juntos. Os dois pequenos já foram
entregues e estão registrados aqui para o histórico; o grande é o desenho
que este documento defende.

---

## 1. Solicitar Atendimento 2.0 (PaguePlay)

### O que o banco diz

Levantamento de 16/08/2026, empresa PaguePlay:

| | |
|---|---|
| Solicitações no total | 195 |
| Pendentes | 8 |
| Em andamento | 59 |
| Concluídas | 128 |
| Falta informação | **0** |
| Solicitantes com pedido em aberto | 15 (média 4,5 cada) |
| Pessoas que atendem | **3** (média 19,7 cada) |

Dois números decidem o desenho:

**Os 59 em andamento estão parados há 7 dias em média, e 32 deles já
passaram do prazo de 5 dias.** A tag "Não concluído" hoje pinta mais da
metade da lista em aberto. Uma marca que aparece em metade da tela não
aponta nada — vira o fundo.

**Três pessoas carregam 59 atendimentos.** A lista atual não mostra isso
em lugar nenhum: os 59 aparecem misturados aos 8 pendentes numa fila só,
sem dono visível.

### O defeito que motivou o pedido

`agruparPorOperador = temVisaoGeral && equipeSel !== TODOS`

O agrupamento por pessoa só liga quando uma equipe é escolhida no filtro.
Sem filtro — que é como a aba abre — os 67 pedidos em aberto viram uma
lista corrida de 15 solicitantes diferentes. O comentário no código
justifica isso com "agrupar a empresa inteira por pessoa daria dezenas de
blocos de uma linha cada", o que os números desmentem: são 15 blocos de
4,5 linhas.

### Estrutura: quatro blocos empilhados

Não abas. Com 8 pendentes e 32 atrasados, esconder a fila atrás de um
clique é o oposto do que a tela precisa — o valor está em ver as quatro
coisas na mesma rolagem. Os dois blocos frios nascem recolhidos, que é o
que abas dariam sem o custo de esconder o resto.

**1 · Comigo agora** — o que eu assumi e ainda não fechei. Lista corrida,
sem agrupar. É a minha mesa, e agrupar a própria mesa por mim mesmo não
diz nada.

**2 · Aguardando alguém** — os pendentes, **sempre agrupados por
solicitante**, com filtro de equipe ou sem. É a correção do defeito acima.

**3 · Com outra pessoa** — em andamento de terceiros. Recolhido, agrupado
por **responsável**. É aqui que os 32 atrasados deixam de ser uma parede
vermelha e viram "fulano está com 20, oito deles vencidos".

**4 · Concluídos** — recolhido, linha enxuta, **últimos 30 dias** com
"carregar mais".

### Os dois papéis usam o mesmo componente, em eixos diferentes

Quem **só vê os próprios pedidos** não tem os blocos 1 e 3. Tem "Meus
pedidos em andamento", agrupado por **quem está atendendo** — "João está
com 3 pedidos seus".

Quem **atende** vê os quatro blocos.

O que muda entre os dois é apenas o eixo do agrupamento: `solicitante_id`
ou `responsavel_id`. Isso é uma função pura sobre a lista, não um ramo de
componente — vive em `agrupamento.ts`, ao lado de `ordenacao.ts`, e é
testável sem montar tela.

### Faixa de contadores no topo

Comigo · Na fila · Com outros · Atrasados.

O contador de atrasados é o único colorido, e some quando é zero — senão
vira mais um número cinza entre quatro.

### Correção de escala

`buscarSolicitacoes` e a contagem de mensagens leem a empresa inteira sem
`limit` e sem janela de data. Hoje passa (195 e 208 linhas, contra o teto
de 1000 do PostgREST), mas os concluídos só crescem: 128 em duas semanas.
No ritmo atual a lista **começa a truncar em silêncio em cerca de quatro
meses** — sem erro, sem aviso, só pedidos que somem.

O bloco 4 carregando 30 dias por vez resolve os dois de uma vez: a
listagem passa a ter janela, e a contagem de mensagens passa a ser
recortada pelos pedidos efetivamente carregados.

### Decisões de detalhe

`falta_info` tem **zero linhas** em produção, mas o status existe, o botão
existe, e ele conta como "em aberto". Não ganha bloco próprio: vive dentro
do bloco 1 ou do 3, conforme quem atende, com selo próprio. Dar um quinto
bloco a um estado que nunca aconteceu seria desenhar para o código em vez
de para a operação.

O aviso de "até 10 pendentes" hoje só aparece para quem **não** tem visão
geral (`{!temVisaoGeral && ...}`), mas o trigger `fn_wpp_limite_pendentes`
vale para qualquer um que cria. Passa a aparecer para todo mundo que pode
abrir pedido.

### O que não muda

As permissões. `permissoes.ts` espelha as policies da migration 20260730b
e continua sendo a única fonte — o front esconde botões, a RLS é quem
garante. Nenhuma migration nova neste item.

---

## 2. Dashboard

### 2a. Saudação sem meta, ranking e quartil — **feito**

O componente `MetaProgressoHeader` mostrava três barras abaixo do
"Boa tarde, fulano": meta do mês com valor por dia útil, posição no
ranking, e quartil com projeção.

Removido e o arquivo apagado. A saudação é a porta de entrada da tela, e
as três barras empurravam todo o resto para baixo repetindo o que o Painel
de Metas já mostra com mais espaço e melhor recorte.

Dois comentários que apontavam para o componente (`CardsMetas.tsx` e
`usePainelMetas.ts`) foram atualizados — ambos diziam "isso não fica aqui
porque fica no MetaProgressoHeader", uma justificativa que passou a
apontar para o vazio.

### 2b. Recebimento extra da PaguePlay

**O problema.** `analitico_recebimentos.tipo_comissao` está **100% nulo**
na PaguePlay — 0 de 1.859 linhas em agosto/2026. A coluna existe para a
BookPlay, cujo relatório traz "Tipo comissão" linha a linha. O relatório
da PaguePlay não traz.

Sem ela, `buscarDiretoExtraDoMes` cai no caminho reserva (`acordo_id` →
`acordos.tipo_vinculo`), que só alcança 792 das 1.859 linhas. O resto vira
"não tabulado", e o card de extra fica errado por construção.

**A regra nova, só para a PaguePlay.** O card passa a somar os acordos
marcados como extra, ignorando o analítico:

- `tipo_vinculo = 'extra'`
- `vencimento` dentro do mês — mesma régua do card "Recebimento direto"
  ao lado e do gráfico de agendado, para que os dois números sejam
  comparáveis
- `status = 'pago'` — o card se chama *recebimento*
- recortado pelo escopo do painel, pela mesma coluna `operador_id` /
  `setor_id` que o resto já usa

Agosto/2026 daria 27 acordos pagos de 29 marcados como extra.

O lado H.O. sai de `valor × PP_HO_PERCENTUAL` (0,2496), que é a conta que
`useAnalytics`, `AnalyticsPanel` e `EvolucaoDiaria` já fazem. Nenhuma
régua nova.

**O extra da PaguePlay não entra em meta.** Não soma no total recebido,
não entra na projeção, não mexe no quartil. Existe para acompanhamento. O
card diz isso em uma linha, senão alguém vai somar de cabeça e estranhar a
diferença.

Confirmado no banco: os 29 extras da PaguePlay têm `vinculo_operador_id`
nulo — são extras próprios do operador que tabulou, não vínculos apontando
para terceiros. O recorte por escopo funciona pela coluna de sempre.

A BookPlay não muda: lá `tipo_comissao` vem preenchido e o caminho atual
está certo.

---

## 3. Coluna Operador na lista de acordos (BookPlay) — **feito**

`AcordosTableBody.tsx` mostrava `nome.split(' ')[0]` no ramo da BookPlay —
só o primeiro nome, o que torna indistinguíveis dois operadores homônimos.

Passou a usar `<OperadorCell>`, exatamente como o ramo da PaguePlay já
fazia: nome completo e, quando o acordo tem vínculo, o segundo operador na
linha de baixo. `operadoresMap` já era carregado nos dois tenants, então
não houve consulta nova.

---

## Testes

**Puros, sem montar tela:**

- `agrupamento.ts` — agrupar por solicitante e por responsável; ordem
  estável por nome; pedido sem responsável não some
- a divisão nos quatro baldes a partir de `(status, responsavel_id, eu)`,
  incluindo `falta_info` caindo no balde certo conforme quem atende
- o extra da PaguePlay: filtro de mês, filtro de pago, conversão H.O.

**De contrato:**

- o extra da PaguePlay **não** entra no total recebido nem na projeção —
  é o erro fácil de cometer e o que o usuário pediu explicitamente

**De componente:**

- solicitante e atendente veem estruturas diferentes a partir da mesma
  lista
- os blocos 3 e 4 nascem recolhidos
