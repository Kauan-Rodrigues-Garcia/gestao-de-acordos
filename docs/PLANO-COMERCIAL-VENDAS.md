# Comercial — o plano de Vendas

> Escrito em 2026-09-14, a partir de `Vendas - prompt .docx`, das quatro
> planilhas em `Desktop/relatórios vendas`, e dos relatórios de prospecção
> `Prospeccao_202608.csv` e `Prospeccao_202609.csv`.
>
> **Revisão 2** — as oito decisões foram respondidas. O que era pergunta virou
> regra. Nada foi implementado.

---

## A ideia em uma frase

**A cobrança persegue dinheiro que já foi prometido. O comercial persegue a
promessa.**

Um acordo existe porque alguém deve; uma venda existe porque alguém comprou. O
acordo vive em parcelas e volta todo mês; a venda acontece uma vez, é
confirmada ou não é, e acabou. Por isso não há tabulação, não há agendamento
para o mês seguinte, não há colchão e não há analítico.

O que sobra é o coração do Comercial: **a venda entrou? o contrato foi
assinado? conta para a meta de quem, e em que mês?**

---

## As regras, como foram ditas

### 1. A régua é confirmação **e** assinatura

Tudo o que importa para operador, equipe e setor — meta e valor — exige as duas
coisas:

```sql
Situacao = 'Confirmada' AND ContratoAssinado = 'Sim'
```

O que for diferente disso **não some: fica separado**, como informação. São
duas populações distintas na tela, nunca somadas.

Em setembro isso significa 2.497 vendas na régua, e três grupos apartados:

| Fora da régua | Vendas | Faturamento | Onde aparece |
|---|---:|---:|---|
| Confirmada sem assinatura | 109 | 536.355,71 | Pendente de assinatura — cobrança do líder |
| Devolvida (ainda assinada) | 187 | 877.917,32 | Devolvidas — entra no % de devolução |
| Cancelada | 44 | 220.770,80 | Canceladas — entra no % de cancelamento |

A assinatura não se desfaz na devolução: 187 vendas devolvidas continuam
marcadas como assinadas. Por isso a régua precisa das duas condições, nunca só
da assinatura.

### 2. O que conta é a data de confirmação

**Data de confirmação** é o eixo oficial: define o mês, a meta e o valor.

**Data da venda** serve para uma coisa só: puxar as vendas **ainda em aberto**.

E isso tem consequência direta na importação, porque os dois relatórios não
recortam pelo mesmo eixo:

| | Relatório **geral** | Relatório **do setor** |
|---|---|---|
| Recorte | data de confirmação | data da venda |
| Traz venda «Aberta»? | **Nunca** | Sim |
| Papel | **oficial** | **prévia** |
| Espelha | o 59 | o 58 |

Medido nos dois meses inteiros: o geral de agosto traz Confirmada 6.131,
Devolvida 564, Cancelada 260 — e **zero Aberta**. Setembro, o mesmo: 2.606,
188, 44, zero Aberta. Para ter data de confirmação, a venda precisou ser
confirmada; venda em aberto é invisível ao geral, por construção.

**Logo, a mesma arquitetura do 58/59 se aplica, com uma camada a mais.** São
três níveis de adiantamento:

```
1. lançamento do operador   →  o mais adiantado, digitado na hora
2. relatório do setor       →  prévia; traz as Abertas
3. relatório geral          →  oficial; fecha o mês pela confirmação
```

Cada nível confirma ou corrige o anterior. Nenhum apaga o anterior em silêncio.

### 3. Entrada é oportunista

A entrada entra **se existir em um dos dois relatórios**, conforme o filtro
usado na exportação. Não é informação crítica e não trava nada.

A regra de cálculo continua a do prompt: venda de R$ 5.000,00 com R$ 2.000,00
pagos → a entrada é 2.000, **mas a meta conta 5.000**. A entrada nunca muda o
valor da venda.

Nota: em janeiro a planilha media `PAG ENTRADA` como **quantidade** de vendas
com entrada — 40, ou 21,05% — não como valor. Vale reproduzir as duas leituras.

### 4. Vale sempre o total recebido

`Total_Recebido` é a régua do recebimento, **independente da forma de
pagamento**. As três colunas de decomposição (`Pix`, `Cartao_Padrao`,
`Cartao_Recorrente`) não servem para somar — foi medido:

```
soma Total_Recebido        605.866,47
soma das três colunas      633.304,20     excesso 27.437,73
linhas divergentes            100 de 2.838
```

Das 100, 66 estão marcadas `SEM RECEBIMENTO` e mesmo assim têm valor na
decomposição. E boleto — R$ 4.782,20 recebidos — não tem coluna própria.

`TipoRecebimento` fica como **classificação** (para a tela de formas de
pagamento), nunca como fonte de valor.

> **Atenção à leitura:** recebimento e meta são medidas diferentes.
> `Total_Recebido` é quanto o cliente pagou; a meta conta o **valor da venda**
> (`Valor_Faturamento`), como o prompt determinou. As duas aparecem, lado a
> lado, sem se misturar.

### 5. Reversão tira do recebimento e fica registrada

Venda confirmada que, no relatório seguinte, apareça como **devolvida ou
cancelada** sai do recebimento. O registro da reversão fica guardado para
acompanhamento — quem, quando, de qual valor, e de qual estado para qual.

Isso não é caso raro, e não é só dentro do mês:

**Dentro do arquivo.** Devolução seguida de reconfirmação com troca de produto
gera duas linhas do mesmo NR. Agosto tem 19 casos, setembro 4. Somar sem
deduplicar infla o faturamento em R$ 70.156,60 e R$ 18.584,00 respectivamente.

```
13075361  Devolvida   PEC 4 PÓS  28×249,00 = 6.972,00
13075361  Confirmada  PEC 1 PÓS  16×175,00 = 2.800,00
```

**Entre meses — e este é o caso que ninguém viu.** 99 NRs aparecem em agosto
**e** em setembro:

| Transição agosto → setembro | NRs |
|---|---:|
| Cancelada → Confirmada | 76 |
| Confirmada → Confirmada | **16** |
| Cancelada → Devolvida | 5 |
| Devolvida → Confirmada | 1 |
| Confirmada → Devolvida | 1 |

A venda cancelada em agosto e reconfirmada em setembro **migra de mês**: some
do mês antigo e nasce no novo, com nova data de confirmação. O vendedor é o
mesmo em 99 de 99 casos.

**Somar agosto e setembro sem dedupe entre meses conta R$ 432.714,40 de
faturamento duas vezes.** No recebido o risco é pequeno — R$ 1.384,00, dois
NRs — mas no faturamento, que é a régua da meta, é grande.

**E há uma armadilha de retrato.** O arquivo de agosto, exportado em 31/08,
traz **zero** devolução ou cancelamento datado de setembro. Ele é um retrato
congelado no instante do download. Para captar uma reversão do mês anterior é
preciso **reexportar o mês anterior** — o arquivo antigo nunca se atualiza
sozinho. Isso é exatamente o que `mestre_lotes` resolve no 59: o lote é um
retrato, e retratos se substituem inteiros.

### 6. IA tem área própria

Vendas de IA ficam numa área específica, com os recebimentos separados **por
qual IA**. Não se misturam ao placar humano.

Hoje são 21 logins com prefixo `ia_` entre os 358 vendedores —
`ia_rafael_comum`, `ia_ana_ligia`, `ia_camila`, `ia_erich`. O prefixo é a pista,
mas o vínculo precisa ser cadastro explícito, não heurística de string: um
operador humano chamado `ian_` não pode virar robô por acidente.

### 7. O filtro de cada setor precisa ser alinhado

Da mesma forma que foi feito entre o 58 e o 59 na cobrança: é preciso descobrir
e registrar **qual filtro o relatório de cada setor aplica**, para que a fatia
do setor e o geral falem do mesmo conjunto.

Isso é trabalho de conferência com a operação, não de código — e o código
depende dele.

### 8. O recorte é por setor, e setor é um conjunto de franquias

Cada setor cuida de franquias específicas. O de-para franquia → setor é o
equivalente exato de `mestre_grupos`.

**E a chave é melhor do que a do 59.** Medido nos dois meses:

```
códigos de franquia distintos      80
códigos com mais de um nome         0
nomes com mais de um código         0
```

`Codigo_Franquia` é estável e não ambíguo — ao contrário de `cod_grupo_filtro`,
que no 59 sobreviveu a trocas de nome mas exigiu tratar o nome como mero
rótulo. Aqui o código é chave e o nome é rótulo, pela mesma razão, com menos
risco.

Franquia sem vínculo **não é erro** — é franquia que ainda não foi cadastrada.
O valor dela aparece identificado pelo código, e vincular é o que o torna
oficial para um setor.

---

## O que foi analisado

| Arquivo | O que é de verdade |
|---|---|
| `Prospeccao_202609.csv` | Geral, empresa toda, 2.838 vendas × 60 colunas, eixo confirmação. |
| `Prospeccao_202608.csv` | O mesmo, agosto: 6.955 vendas. Usado para medir reversão entre meses. |
| `Antonio.xlsx` | O geral em XLSX, versão de 119 colunas. Traz o que o CSV não traz. |
| `Planilha Mensal (1).xlsx` | O controle diário real. Uma aba por mês, um bloco por operador. |
| `Planilha De Feedback (1).xlsx` | Contagem por dia + histórico narrativo por pessoa. |
| `Planilha e Gráficos Individual (1).xlsx` | Matriz mês × operador, quantidade de vendas, um ano por aba. |

### A planilha mensal mudou no meio do ano

| | Janeiro | Agosto |
|---|---|---|
| Colunas por operador | `QTD · DATA · NR · CONTRATO · PAGAMENTO` | `QTD · CONTRATO · NR · FATURAMENTO` |
| Meta | no título do bloco — «OP BEATRIZ SANCHEZ META 10» | global, no rodapé |
| Régua | só quantidade | quantidade **e** faturamento |
| Extra | `PAG ENTRADA 40 · 21,05%` | projeção, meta do dia, dias trabalhados |

Perdeu-se a **data da venda** e a **forma de pagamento**; ganhou-se o valor. E o
rodapé de agosto já é um painel de meta completo, com duas réguas rodando ao
mesmo tempo — 161 vendas **e** R$ 962.136,00 — mais projeção e meta do dia.
Não é ideia nova: é conta que a liderança já faz na mão.

Ruído a não copiar: aba `Página9` vazia, quatro blocos `ADMINISTRATIVO` zerados
nas linhas 96–107 de julho, coluna `ADM` com iniciais soltas (`PRI`, `OTON`,
`MANU`) sem cadastro, e a lista de operadores mudando todo mês — 22 em janeiro,
17 em agosto — sem registro de quem entrou ou saiu.

### A ausência está escondida dentro da contagem

```
Qt  Operadores        3  4  5  6  7  10 11 …
1   BEATRIZ SANCHES   0  0  0  0  1  0  1
5   FLAVIA            0  0  0  0  0  1  0  … ATESTADO ATESTADO
8   JESSICA          INSS INSS INSS INSS INSS INSS INSS
12  LYRA              1  0  1  0  0  0  1  … BANCO DE HORAS
13  MARIA CECILIA   FÉRIAS FÉRIAS FÉRIAS FÉRIAS …
```

A mesma célula responde «quantos feedbacks» e «por que a pessoa não estava».
O mesmo vício está nos gráficos individuais, onde a célula da quantidade de
vendas carrega `Atestado`, `Ferias`, `--` e `Ferias/1`. E onde há número às
vezes há lixo: `GRAF 2026 / JULHO / CARINA = 46144` é uma data serial do Excel
colada no lugar de uma quantidade, desde julho.

As abas por operador, essas, são bem feitas — histórico narrativo por mês com
autor, data e texto. É o modelo da aba Feedback quase pronto.

---

## O que o relatório entrega de graça

Setembro, empresa toda: **R$ 13.526.536,45** de faturamento, **R$ 605.866,47**
recebido, 69 franquias, **27 UFs**, 358 logins de vendedor.

**Estados** — a separação pedida já está no dado:

```
SP  413 vendas   1.903.686,61      BA  188   947.480,26
PA  261 vendas   1.354.353,24      RJ  189   923.160,90
MG  233 vendas   1.055.851,57      MA  123   594.934,80
AM  191 vendas     989.072,31      MT  120   559.519,00
```

**Motivos** — e o maior motivo de cancelamento é operacional:

```
cancelamento   FALTA DE ASSINATURA DO CONTRATO   27 de 44
devolução      CANCELADO 105 · A PEDIDO DO FRANQUEADO 34 · FINANCEIRO 16
```

Mais: `TipoVenda` (PEC 1.852, PRO 865, Coleção 106), `Categoria`, `VendaLead`
(596 vendas, 21%, vieram de lead), dez formas de `Tipo_Documento`,
`ScoreClasse` e `Prob. Inadimplência`.

**Duas coisas não vêm.** `Mailing_Avanti` está vazio em 2.815 das 2.838 linhas
— a aba Indicações não nasce dali. E setor não existe no relatório: o recorte é
franquia.

---

## O que vale somar

**A esteira de assinatura.** O export de 119 colunas traz `Geração`,
`Visualização` e `Assinatura` com data e hora. É um funil pronto — gerou → viu
→ assinou — com tempo médio de cada passo. Vale porque «falta de assinatura do
contrato» é 27 dos 44 cancelamentos, e porque a régua da regra 1 deixa 109
vendas confirmadas esperando assinatura. Um alerta de «contrato gerado há 3
dias, não assinado» resolve dinheiro real.

**Ausências como registro próprio.** Atestado, INSS, férias e banco de horas já
são acompanhados — mal, dentro da célula da contagem. Sem eles a meta
proporcional mente: um operador de férias metade do mês aparece como quem não
vendeu.

**Motivo com taxonomia fechada.** O relatório já classifica (`CANCELADO`, `A
PEDIDO DO FRANQUEADO`, `FINANCEIRO`, `RECLAME AQUI`, `JURÍDICO`, `TROCA`,
`FALTA DE INTERESSE`). Aproveitar essa lista em vez de inventar outra.

**Origem da venda.** `VendaLead` e `Mais vendas` são duas dimensões prontas.

**Projeção e meta do dia.** A conta do rodapé de agosto, assumida pelo sistema.

---

## O pedido, em ordem de dependência

**A · O que é uma venda**
NR do documento · valor total · entrada · forma de pagamento · estado (UF) ·
operador · data da venda · data de confirmação.

**B · O ciclo dela**
Operador lança → fica **pendente** → líder confirma ou recusa → contrato
assinado → **conta para a meta**. Cancelada, devolvida ou não aprovada →
**lixeira**. Reversão vinda do relatório tira do recebimento e fica registrada.
O operador acompanha o próprio status sem depender do líder.

**C · Onde ela aparece**
Aba **Vendas**, com **fechamento por dia**: o dia 07 guarda as vendas do dia 07;
quando o dia vira, a tela abre limpa e o anterior fica salvo.

**D · O que se mede**
Meta em **duas réguas** — quantidade de vendas ou valor de faturamento,
escolhida na configuração, por setor e por equipe. Mais: % de cancelamento e
devolução por operador, vendas por estado, ranking, destaque do dia, total por
operador, formas de pagamento.

**E · Indicações**
Cadastro **manual**: instituição, gestora, telefone, data. Vários por vez.
Ranking de quem mais indicou, com gráfico.

**F · Feedback**
Um registro por operador. Clicou no operador, vê só os feedbacks dele. Filtro
por equipe e setor. Foto para o líder localizar rápido.

**G · O que se herda**
Tickets · Desafios · Lixeira, com lógica nova · Configurações (Geral,
Permissões, Logs, Documentações, Multiempresas) · Usuários, mesmo padrão ·
Painel Líder e Painel Diretoria, adaptados.

**H · O que morre**
Tabular acordo · Analítico · Colchão · Agendamento para o mês seguinte ·
Campanha Fácil · Controle de Números · Meus Chips · RH Gestão · Fechamento.

---

## As fases

### Fase 0 — o que já está de pé

Nada a fazer.

- `src/lib/produto.ts` — `'cobranca' | 'comercial' | 'rh'` com lista branca.
- `src/lib/menuLateral.ts` — cada aba declara em que produtos existe.
- `src/pages/ProdutoEmMontagem.tsx` — a tela de espera atual.
- `src/lib/permissoes-catalogo.ts` — `TODA_OPERACAO` com 34 permissões.
- `metas` — **já tem `meta_valor` e `meta_acordos` na mesma linha**, por
  setor/equipe/operador, por mês. A régua dupla precisa de uma coluna dizendo
  qual das duas vale, não de tabela nova.
- `mestre_lotes`, `mestre_grupos`, `mestre_eventos` — o molde inteiro da
  importação do 59, pronto para ser espelhado.

### ✅ Fase 1 — a aba Vendas (escrita em 14/09/2026, **migration não aplicada**)

O operador precisa trabalhar desde o primeiro dia, antes de qualquer
importação existir.

**O que existe no código:**

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/20260915100000_vendas_fase1.sql` | `vendas`, `vendas_eventos`, `lixeira_vendas`, RLS, 11 permissões e as 4 RPCs |
| `src/lib/vendas.ts` | A régua — `contaNaMeta`, `classificarVenda`, `resumirVendas`, os dois eixos |
| `src/lib/vendas.test.ts` | 35 testes que travam a régua com os números medidos do relatório |
| `src/services/vendas/vendas.service.ts` | Leitura e as quatro escritas, todas por RPC |
| `src/hooks/useVendas.ts` | Mês, eixo, fila e tempo real |
| `src/pages/Vendas/` | A aba: pilha de dias, fila do líder, formulário |

**Duas decisões de implementação que valem registro:**

A régua **não mora numa consulta**. `vendas.conta_na_meta` e
`vendas.valor_na_meta` são colunas **geradas** pelo Postgres. Uma tela futura
que some `valor_total` erra; somando `valor_na_meta` acerta sem conhecer a
regra. É a mesma lição das quatro listas de cargo que `PERFIS_*` documenta.

**Uma linha por NR**, com `UNIQUE (empresa_id, nr_documento)`, e o histórico em
`vendas_eventos`. É o que impede os R$ 432.714,40 de faturamento dobrado
medidos entre agosto e setembro, e é o que cumpre a regra 5 sem inventar uma
segunda tabela de valores.

**Confirmar é chave própria** (`confirmar_vendas`), separada de
`editar_vendas`. Se fossem a mesma, o operador com permissão de corrigir a
própria venda poderia dá-la como confirmada e assinada — que é exatamente a
régua da meta.

⚠️ **A migration não foi aplicada.** Enquanto não for, a aba abre e avisa que
não está instalada, em vez de mostrar erro cru. Aplicar exige o «pode» —
ver `CLAUDE.md`.

### ✅ Fase 2 — o lote e o de-para (escrita em 15/09/2026, **migration não aplicada**)

A fundação da importação, espelhando `mestre_*`.

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/20260915110000_vendas_fase2_lote_e_depara.sql` | `vendas_lotes`, `vendas_relatorio`, `vendas_franquias`, RLS, 3 permissões e 5 RPCs |
| `src/services/vendas/prospeccaoParser.ts` | O arquivo vira linhas, sem tocar em rede |
| `src/services/vendas/prospeccaoParser.test.ts` | 39 testes sobre o formato real |
| `src/services/vendas/importacaoVendas.service.ts` | Abrir → enviar em blocos → promover |
| `src/pages/Vendas/Importacao.tsx` | Carregar, vincular franquia, histórico de cargas |

**A armadilha que o parser existe para desarmar: o formato do número é por
coluna.** Medido nas 2.868 linhas de setembro:

```
pt-BR (3.816,00)  Valor_Faturamento, Pix, Cartao_Padrao, Cartao_Recorrente
en    (159.0)     Valor_Parcela, Total_Recebido, Porcentagem_Recebido
int   (13075529)  Codigo_Venda, NrDocumento, Codigo_Franquia, QTDE_Parcela
```

Nenhuma coluna mistura as duas convenções dentro de si, e por isso não há um
`numero()` que adivinhe: adivinhação erra em silêncio no dia em que um
faturamento vier `1.234` sem centavos — pt-BR lê mil duzentos e trinta e
quatro, en lê um vírgula dois.

**O parser foi validado contra os dois arquivos reais:**

| | setembro | agosto |
|---|---:|---:|
| Linhas após dedupe | 2.864 | 6.934 |
| NRs duplicados resolvidos | 4 | 19 |
| Linhas recusadas | 0 | **1** (sem `Data_Confirmacao`) |
| Franquias | 69 | 80 |
| Na régua | 2.523 · R$ 12.028.887,36 | 6.009 · R$ 28.636.899,97 |

**O que o parser não traz, de propósito:** CPF, telefone, e-mail, escolaridade,
idade e etnia — o sistema expurgou CPF em `20260728b` e reintroduzi-lo por uma
importação nova desfaria a decisão pela porta dos fundos. E a decomposição de
pagamento (`Pix`, `Cartao_Padrao`, `Cartao_Recorrente`), que **não fecha** com
`Total_Recebido`: guardar três números que não somam é convidar alguém a
somá-los.

⚠️ **Esta migration não escreve nada em `vendas`.** A projeção do relatório
sobre a venda — com o dedupe entre meses e a reversão — é a Fase 3. Importar é
seguro por construção: o pior que acontece é um retrato errado do relatório, que
a próxima importação substitui.

### ✅ Fase 3 — o geral vira venda (escrita em 15/09/2026, **migration não aplicada**)

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/20260915120000_vendas_fase3_projecao_do_geral.sql` | `vendas.lote_id`, 4 funções, a permissão `projetar_vendas` |
| `src/pages/Vendas/Projecao.tsx` | A prévia obrigatória e o lançamento |
| `src/services/vendas/__tests__/vendas.sql.test.ts` | 32 testes travando as regras das três fases no SQL |

**O dedupe entre meses não precisou de código.** `vendas` tem
`UNIQUE (empresa_id, nr_documento)` desde a Fase 1: o NR cancelado em agosto e
reconfirmado em setembro não vira uma segunda linha — a linha existente muda de
`data_confirmacao` e, com ela, de mês. Os R$ 432.714,40 de dobra são impossíveis
por construção, não por cuidado de quem escreve a consulta.

**A armadilha era a outra ponta: reimportar agosto depois de setembro.** O
arquivo de agosto foi exportado em 31/08 e não sabe da reconfirmação de 02/09 —
projetá-lo por cima puxaria a venda de volta ao mês errado. Por isso
`vendas.lote_id` guarda quem escreveu a linha, e a projeção só sobrescreve
quando o lote dela foi importado **depois**. O resto é contado como
`preservadas` e aparece na tela.

**A projeção só escreve o que tem dono** — franquia vinculada a um setor e login
vinculado a uma pessoa (`perfis.usuario`). Login ambíguo devolve `NULL` em vez
de escolher por sorte. O que fica de fora é contado e os logins são listados: é
cadastro que falta, não defeito.

**Setor vem da franquia, e a divergência fica visível.** Medido em setembro:

```
356 de 359 logins vendem para UMA franquia só
  3 logins espalham por 2+ franquias         R$ 961.659,16  (7,0% do total)
  fora da franquia principal do vendedor     R$ 534.107,80  (3,90%)
```

`camila45` sozinha aparece em quatro franquias. A função grava o setor da
franquia, como decidido em 15/09, e devolve `divergencia_setor` com quantas
linhas e quanto dinheiro discordam do cadastro da pessoa. Escolher calado seria
repetir o defeito que o de-para do 59 existe para não cometer.

**A prévia é obrigatória.** Projetar pode reverter venda que estava contando;
o botão de escrever só aparece depois de a prévia ser lida.

⚠️ `projetar_vendas` é chave separada de `importar_vendas`. Importar troca o
retrato do relatório, que não conta para meta nenhuma; projetar escreve no
placar do operador.

### ✅ Fase 4 — a prévia do setor e a conciliação (escrita em 15/09/2026, **migration não aplicada**)

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/20260915130000_vendas_fase4_previa_do_setor.sql` | Colunas nuláveis, de-para por nome, 2 funções de conciliação |
| `src/services/vendas/prospeccaoSetorParser.ts` | O XLSX de 119 colunas vira linhas |
| `src/services/vendas/prospeccaoSetorParser.test.ts` | 32 testes sobre o formato real |
| `src/pages/Vendas/Conciliacao.tsx` | As três camadas lado a lado |

**Os dois relatórios não têm nada em comum além do assunto:**

| | geral | setor |
|---|---|---|
| Formato | CSV, 60 colunas | **XLSX, 119 colunas** |
| Cabeçalho | uma linha | **duas — grupo e nome** |
| Recorte | data de confirmação | data da venda |
| Traz «Aberta»? | nunca | **sim — 23 de 203** |
| Franquia | código + nome | **só o nome** |
| Datas | `2026-09-08` | **serial do Excel (46266)** |

**O nome da coluna não é chave neste arquivo.** Medido nas 119 colunas: `Data`
aparece **cinco vezes** — venda, link de pagamento, confirmação, cancelamento e
devolução. `Observação` sete, `Número` seis, `#` sete, `Setor` e `Informação`
duas cada.

Um parser que mapeasse por nome leria a data da venda onde deveria ler a da
confirmação, **sem erro nenhum**. A chave é grupo + nome: a linha 1 traz o
grupo, preenchido só na primeira coluna de cada bloco, e vale até o próximo
aparecer.

**Validado contra o `prospecção.xlsx` real:** 0 colunas faltando, 203 linhas
após dedupe, 23 em aberto, 44 sem data de confirmação, 3 franquias EXTREME,
R$ 963.804,24 na régua. `Valor PIX Entrada` existe e vem **vazia nas 203** — a
regra 3 se cumpre sozinha.

**Franquia nova continua sendo descoberta do geral.** O do setor traz nome, que
é rótulo; cadastrar por rótulo criaria uma segunda franquia no dia em que o ERP
renomeasse, e o faturamento se partiria entre duas linhas do de-para sem
ninguém ver. O lote de setor **casa** com o que existe e reporta o que não
casou.

**A conciliação classifica cada NR pelo trabalho que dá:**

```
divergente — prévia e geral discordam em situação, assinatura ou valor
pendente   — a prévia tem, o geral ainda não. CONTINUA CONTANDO, marcado
so_manual  — lançado na aba e nenhum relatório viu
so_geral   — só o oficial tem. Normal: o mês de VENDA é outro
conforme   — os dois concordam
```

Pendente não é erro: é a mesma regra que o 58 tem com o 59. O relatório do setor
é exportado num horário e o geral noutro, e tratar a defasagem do dia como
divergência produziria um alarme diário que ninguém mais leria.

### Fase 5 — metas em duas réguas

Coluna de régua em `metas` (`quantidade` | `valor`), por setor e por equipe.
Meta proporcional já existe — ligar às ausências. Projeção, meta do dia e dias
trabalhados.

### Fase 6 — a medida, e a área de IA

Percentual de cancelamento e devolução por operador · vendas por estado ·
ranking adaptado · destaque do dia · formas de pagamento (`Total_Recebido` como
valor, `TipoRecebimento` como classificação) · total por operador.

E a **área de IA**: cadastro explícito de quais logins são robôs, qual robô é
qual, e os recebimentos separados por robô, fora do placar humano.

### ✅ Fase 7 — indicações

Tabela `indicacoes` — instituição, gestora, telefone, data, operador — com
cadastro **manual** em lote, ranking e gráficos. Aplicada (`20260915200000`).
Corrigir e cadastrar por outro: `20260915210000`, aplicada 15/09/2026.

### ✅ Fase 8 — feedback e ausências (escrita e aplicada em 15/09/2026)

`feedbacks` (operador, autor, data, texto) e `ausencias` (operador, tipo,
período: atestado, INSS, férias, banco de horas). Tela por operador, com foto,
filtrada por equipe e setor. Migration `20260915220000`, rota
`/vendas/acompanhamento`. Férias: a ausência manda e `perfis` espelha. O estado
e as decisões estão em
[`COMERCIAL-ESTADO-E-PENDENCIAS.md`](COMERCIAL-ESTADO-E-PENDENCIAS.md) §4.

### Fase 9 — painéis e herança

Painel Líder e Painel Diretoria adaptados · Tickets · Desafios · Configurações ·
Usuários.

---

## O registro de migrations precisa ser reconciliado

As quatro foram aplicadas em 15/09/2026 pelo MCP do Supabase, e ele **carimba a
versão com a hora da aplicação, não com o nome do arquivo**:

| arquivo | registrado como |
|---|---|
| `20260915100000_vendas_fase1` | `20260915124540` |
| `20260915110000_vendas_fase2_lote_e_depara` | `20260915124723` |
| `20260915120000_vendas_fase3_projecao_do_geral` | `20260915124945` |
| `20260915130000_vendas_fase4_previa_do_setor` | `20260915125039` |

Para o `supabase_migrations.schema_migrations` os quatro arquivos continuam sem
registro, e um `supabase db push` tentaria **reaplicá-los**. A Fase 1
sobreviveria (`CREATE TABLE IF NOT EXISTS`), mas a Fase 4 faria `ADD CONSTRAINT`
num constraint que já existe e quebraria no meio.

Antes do próximo `db push`, com a CLI logada:

```bash
supabase migration repair --status applied \
  20260915100000 20260915110000 20260915120000 20260915130000
```

⚠️ **A distorção não é nossa.** `20260914175008` e `20260914175050` no registro
são o Fechamento (`20260914170000`) e o Tickets (`20260914200000`) com o mesmo
problema, e há 26 arquivos no repositório sem registro — todos conferidos em
15/09/2026 e **todos aplicados**, cada um pelo objeto no schema. O registro é
que está incompleto, como o `CLAUDE.md` avisa.

E em 15/09/2026 `20260909100000_pix_expurgo_desaprovados_agendado.sql` foi
renumerado para `20260909100100`: ele dividia a versão com
`20260909100000_diretoria_setores_e_equipes.sql`, e versão repetida não é chave
válida. As duas já estavam aplicadas, então a mudança é só de arquivo.

---

## O que ainda depende de gente, não de código

1. **O filtro de cada setor** (regra 7). Sem saber o que cada relatório de setor
   filtra, a prévia e o oficial não conversam. É a mesma conferência que o
   58/59 exigiu.
2. **Quais franquias pertencem a qual setor** (regra 8). São 80 códigos. O
   de-para é cadastro.
3. **Quais logins são robôs** (regra 6). O prefixo `ia_` é pista, não cadastro.

---

## Leitura que assumi e vale confirmar

O prompt diz que a meta conta o **valor da venda** — «caso ele pague
R$ 2.000,00 será considerado como entrada, porém o que irá entrar para a meta
do operador será o valor de R$ 5.000,00». A regra 4 diz que vale sempre o
`Total_Recebido`.

Li as duas como medidas diferentes que convivem: **a meta conta
`Valor_Faturamento`; `Total_Recebido` é quanto o cliente pagou e alimenta
entrada, formas de pagamento e a reversão da regra 5.** Se a intenção era que a
meta contasse o recebido, isso muda a Fase 5 inteira.
