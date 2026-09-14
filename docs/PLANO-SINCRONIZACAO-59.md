# Sincronização pelo 59 — o plano

> Escrito em 2026-09-13, ao fim da sessão que alinhou o recorte do 58 com o 59.
> Substitui a seção «Decisões que ainda não foram tomadas» de
> `SINCRONIZACAO-58-59.md` no que diz respeito ao futuro; aquele documento
> continua sendo o registro do que foi **medido**.
>
> Este aqui é o combinado: o que vai ser feito, em que ordem, e por quê.

---

## A ideia em uma frase

**O 59 é a fonte oficial. O 58 é a prévia.**

O 59 é importado de hora em hora e atualiza o recebimento de cada operador, de
cada setor e de cada equipe — **onde houver vínculo**. O 58 continua sendo
importado pela liderança a qualquer momento, e serve para ver antes o que o
próximo 59 vai trazer.

---

## As regras, como foram ditas

### 1. Setor

O recorte é `cod_grupo_filtro` → `mestre_grupos` → setor da planilha. Já está
alinhado e conferido (ver `SINCRONIZACAO-58-59.md`).

**Carteira sem vínculo não é erro.** É setor que ainda não foi cadastrado na
planilha, ou que está com outro nome. O Painel Diretoria **continua mostrando o
valor dela**, identificada pelo código do ERP. Vincular é o que torna aquele
valor **oficial** para um setor da planilha — não é o que o faz existir.

`MARILIA - COFEN` (cód. 72, R$ 757 mil em setembro) é da PaguePlay / Conecta
Play e vem junto no arquivo por acidente de exportação. **Fica de fora por
enquanto, de propósito.** Não é divergência.

### 2. Operador

O valor do operador é dividido pelas carteiras em que ele cobrou, e cada parte
vai para o setor daquela carteira. **Para o operador, exibe-se a parte do setor
dele.**

Mas no Painel Diretoria, filtrando por operador, vê-se **tudo**: cada grupo de
recebimento, para onde contou, para qual equipe, para qual setor — inclusive o
que passou a contar para outro operador.

Pessoa que aparece no 59 e não tem perfil na planilha **conta para o setor**,
agrupada sob um rótulo próprio — «recebimentos de operadores sem registro» — e
não sob um «sem operador» genérico que esconde de quem é.

### 3. Equipe

O 59 traz `subgrupo_equipe` com dezenas de nomes; o 58 traz o nome real da
equipe. O vínculo se faz de duas maneiras:

- **manual**, na tela que já existe;
- **automaticamente pelo 58**: quando um setor importa o 58, o sistema identifica
  de onde vem cada recebimento; se todos os recebimentos de um subgrupo chegam
  pelo 58 daquele setor, o subgrupo é vinculado àquela equipe/setor.

O 59 **só atualiza o valor da equipe se ela estiver vinculada**. Ao vincular
depois, o valor é atualizado no ato de salvar.

### 4. Importação e complementaridade

- O 59 entra de hora em hora e **substitui o retrato do mês**.
- Um 58 que entre depois traz **apenas o que o 59 ainda não tem**. Essas linhas
  ficam marcadas como **pendentes**.
- Pendente **continua contando** até aparecer no 59 ou ser removido à mão.
- Se não aparecer no 59 seguinte: aviso. Na segunda importação sem aparecer:
  **alerta crítico** para o super admin, visível no Painel Diretoria.
- Se o 59 trouxer o valor **em outro lugar** (outro setor, outro operador): o
  valor **muda de lugar** — sai de um, entra no outro — e gera alerta urgente.
  Nunca duplica.

### 5. O que é e o que não é divergência

**Não é divergência:** valor que existe só num dos dois lados **no dia corrente**.
Durante o dia os dois relatórios são importados em horários diferentes, e essa
defasagem é normal.

**É divergência:**
- valor que está num lugar num relatório e em outro lugar no outro;
- valor que existe só de um lado **em dias já fechados** (do dia anterior para
  trás).

⚠️ **«Dia corrente» precisou ser lido por setor, não pelo calendário.** Ao
implementar (Fase 2, 14/09/2026) ficou provado que a regra acima, tomada ao pé
da letra, produzia 1.090 «divergências» — quase todas de setor cujo 58 não
tinha chegado naquele dia, e do **último dia importado de cada setor, que é
parcial** porque o relatório foi exportado no meio do dia. O dia corrente de um
setor é o último dia do 58 *dele*. Com isso, sobram 6. Ver a Fase 2.

⚠️ A referência de data é **sempre a do 59**. O 58 empilha o acumulado na data do
primeiro pagamento (medido: Play 4, setembro, 3 NRs, R$ 2.641,04 no dia errado,
líquido zero no mês). Ele responde «existe / não existe», nunca «quando».

### 6. Divergências e correção manual

Aba no Painel Diretoria listando **toda** diferença, com filtro por operador e
por setor. Para cada uma, o super admin pode apontar o destino: setor, pessoa ou
equipe. **Nunca duplica** — sai de um lado, entra no outro.

Qualquer alteração entre importações é avisada: valor que sumiu, que foi para
outra pessoa, que passou a contar para outro setor.

### 7. Histórico e rollback

Histórico de importações dos **dois** relatórios, junto, no Painel Diretoria:
quem importou, quando, e o que deu errado. Com um botão para voltar a um ponto
do dia — o que foi importado depois é apagado.

Confirmação explícita, **irreversível**, e só para trás. Para avançar, importa-se
um relatório novo.

### 8. Armadilha de coluna

Se o cabeçalho de um relatório mudar em relação ao que costumava vir, avisar
**antes de confirmar** a importação.

### 9. Fechamento do mês

Fechamento é sobre **configuração**, não sobre relatório.

À meia-noite do dia 1º, a configuração do mês anterior congela: posicionamento
de pessoa, nome de equipe, nome de setor, quem estava onde. Alteração feita
depois vale só para o mês corrente. **Só super admin** pode editar um mês
fechado; se existe hoje alguma outra porta para isso, ela é fechada.

O relatório de fechamento continua sendo importado depois da virada e entra na
data correta — isso não é alteração de configuração.

> ✅ **Isto já existe.** `composicao_mes`, `composicao_mes_equipe`,
> `composicao_mes_lider` e `composicao_mes_setor` congelam operador → equipe →
> setor com nome, cargo, situação e até o flag `alternativo`, tudo por mês. O que
> falta é a **trava** e a ligação com o 59, não a estrutura.

---

## O estado hoje, medido em 01–10/09/2026

O que o 59 consegue atribuir sozinho:

| | valor | % |
|---|---|---|
| Total | 4.162.815,42 | 100% |
| Com setor resolvido | 3.056.774,99 | 73,4% |
| Com operador resolvido | 2.899.633,01 | 69,7% |
| Com equipe resolvida | 2.096.172,87 | 50,4% |
| **Resolvido nos três** | **2.096.172,87** | **50,4%** |

O gargalo é **equipe**: 77 subgrupos no 59, apenas **18 vinculados**. Dos 59 sem
vínculo, **37 já têm setor resolvido** (R$ 989.567,37) — dão para vincular hoje.

Carteiras sem vínculo (não são erro, são cadastro pendente):

| cód | carteira | operadores | valor |
|---|---|---|---|
| 72 | MARILIA - COFEN | 45 | 757.472,98 |
| 37 | COBRANÇA - GERAL | 9 | 341.761,12 |
| 12 | ATENDIMENTO | 4 | 5.785,88 |
| 58 | DIGITAL POS VENDA | 2 | 841,35 |
| 1 | COB PLAY 6 | 1 | 179,10 |

Cobradoras sem perfil: **105 de 368**, R$ 1.331.711,16 (31% das linhas).

Por operador, somando por pessoa: **246 de 337 batem ao centavo**, e **zero**
existem só no 58 — o 59 não desconhece nenhum recebimento do analítico.

---

## As fases

### Fase 0 — proteger a importação (pré-requisito)

Três travas. Nenhuma depende das outras, todas são baratas, e as três já teriam
evitado estrago real nesta semana.

| | O quê | Por quê |
|---|---|---|
| ✅ 0.1 | **Armadilha de cabeçalho** — guarda a assinatura de colunas por tipo de relatório e avisa no preview quando mudar (`20260913231913`, no ar) | Regra 8. Protege as duas de baixo |
| ✅ 0.2 | **Trava de arquivo curto** — o preview diz quantas linhas e quanto valor vão ser apagados, e de quais dias (`20260913235702`, no ar) | Em 13/09 um export antigo apagou 413 linhas e R$ 175.768,38 do Receptivo, sem aviso |
| ✅ 0.3 | **A remoção passa a usar a chave da LINHA**, igual à inserção (`20260914000757` + `idsAusentesDoRelatorioMensal`) | A assimetria deixou R$ 698,43 duplicados no Receptivo. Envenenaria o «pendente» da fase 2 |

**Por que antes de tudo:** a fase 2 marca linhas do 58 como pendentes e as
compara com o 59 seguinte. Com duplicata e remoção silenciosa na base, o
«pendente» vira ruído e ninguém confia na aba de divergências — que é o coração
do que você pediu.

### ✅ Fase 1 — o recebimento por pessoa (no ar em 13/09/2026)

Entregue: `fn_mestre_operadores_do_mes`, `fn_mestre_operador_detalhe` e a aba
**«Por pessoa»** no Painel Diretoria.

A soma é pela **cobradora**, atravessando carteira e subgrupo — que era o ponto.
Dois números convivem, e os dois estão certos:

| | |
|---|---|
| `total` | tudo o que a pessoa cobrou, em qualquer carteira |
| `no_setor_dele` | a parte que caiu no setor dela — **é este que bate com o 58** |

A validação que fecha a história, 01–10/09:

| Pessoa | total no 59 | no setor dela | 58 do setor |
|---|---|---|---|
| KAROLAINE_SILVA | 37.081,78 | **7.445,58** | 7.445,58 |
| HELTON_ROLDON | 30.281,46 | **1.743,78** | 1.743,78 |
| NANCI_MOREIRA | 34.814,42 | **33.067,14** | 33.067,14 |

**Os «18 operadores divergentes» não eram divergência.** A diferença era a parte
cobrada fora do setor da pessoa, que o 58 daquele setor nunca teve como ter. Ela
não some mais: abre no detalhe, dizendo para qual setor, carteira e equipe cada
parte foi.

Carteira sem vínculo aparece com o nome do ERP e o selo «sem vínculo». Pessoa
sem perfil aparece pelo login, com o selo «sem registro» — e conta para o setor
do mesmo jeito.

---

### ~~Fase 1 — a camada de resolução~~ (desenho original, entregue acima)

Uma função que, para um mês, resolve **cada linha do 59** para:

- **setor oficial** (via `mestre_grupos`) ou o código do ERP, quando não vinculado;
- **operador oficial** (via `operador_id` congelado no lote) ou o rótulo
  «sem registro na planilha»;
- **equipe oficial** (via `mestre_equipes`) ou o `subgrupo_equipe` cru;
- **procedência**: de onde veio, se é rateio, se é empréstimo, se é pendente do 58.

Tudo o que vem depois lê daqui. Nada é gravado — a resolução é calculada, o que
significa que vincular uma carteira ou uma equipe corrige o passado
automaticamente, sem reimportar.

Entregas:
- `fn_mestre_resolver_mes` — a camada;
- **aba por operador** no Painel Diretoria: total da pessoa, para onde cada grupo
  de recebimento contou, por setor, por equipe e por mês (regra 2).

### Fase 2 — pendências e divergências

- [x] **Aba de divergências** com filtro por operador e por setor (regra 6) —
      no ar em 14/09/2026, ver abaixo;
- [x] Regra do dia corrente (regra 5) — e ela precisou ser mais fina do que o
      combinado, ver abaixo;
- [x] Coluna de procedência em `analitico_recebimentos` — migration
      `20260914010002`, ver abaixo;
- [x] Marcar as linhas que o 58 traz e o 59 ainda não tem (regra 4);
- [x] Escalar o aviso: 1ª importação = pendente, 2ª = crítico.

**A Fase 2 está fechada.**

#### ✅ A aba «Conferência 58 × 59» (14/09/2026)

`fn_mestre_divergencias` + `fn_mestre_divergencias_resumo`, migration
`20260914005101`. Só leitura.

Os dois lados são agrupados por **setor + cobradora + NR**, cada um passado pelo
recorte provado em agosto (`docs/SINCRONIZACAO-58-59.md`): a carteira manda,
colchão e Retenção ficam fora do setor.

**A primeira versão não servia, e o número disse isso.** Com três classes
(`do_dia`, `estrutural`, `divergencia`), setembro dava **1.090 NRs e
R$ 375.193,73 de «divergência»** — exatamente o que tinha sido avisado: a aba
listando ausência de importação como se fosse divergência. Ninguém abre uma
lista dessas duas vezes.

Duas coisas estavam sendo chamadas de divergência sem ser:

1. **Setor cujo 58 não chegou naquele dia.** «Dos dias que já estão atualizados»
   é por setor, não do mês. Jornada Play e Manutenção não importam o 58 nenhum
   dia; o Play 1 estava no dia 11 enquanto o Receptivo já tinha o 14.
2. **O último dia importado é parcial.** Esta não estava à vista. As 198
   divergências do Play 1 caíam *todas* no dia 11 — o último dia do 58 dele. O
   relatório foi exportado no meio do dia, o 59 tem o dia inteiro. O último dia
   do 58 de cada setor é um dia aberto, igual a hoje, só que relativo à
   importação daquele setor e não ao calendário.

As cinco classes, e setembro/2026 nelas:

| classe | o que é | NRs | valor |
|---|---|---:|---:|
| `divergencia` | nada explica — **alguém olha** | 6 | R$ 1.174,08 |
| `estrutural` | o NR está do outro lado, noutro setor | 1 | R$ 179,10 |
| `dia_aberto` | hoje, ou o último dia do 58 do setor | 406 | R$ 160.574,51 |
| `aguardando_58` | o 58 do setor não chegou nesse dia | 171 | R$ 61.477,75 |
| `sem_58` | o setor não importou o 58 no mês | 629 | R$ 197.401,20 |

**Seis.** E as seis são `so_no_59` em dia que o 58 já cobria — pagamento lançado
no ERP depois da exportação daquele 58. É o caso que merece olho humano, e agora
ele aparece sozinho em vez de perdido em mil linhas.

A aba abre filtrada em `divergencia`. Os cartões do topo são filtros e carregam
a frase que explica cada classe, e uma faixa mostra **até que dia o 58 de cada
setor chegou** — sem ela, «R$ 61 mil aguardando» é número sem causa; com ela é
«o 58 do Play 1 está no dia 11».

#### ✅ A procedência de cada linha (14/09/2026)

Migration `20260914010002` — **a primeira desta sequência que muda estrutura de
tabela com dados reais**. Mostrada em SQL exato e aprovada antes de rodar.
`add column` com default constante é metadado no Postgres 11+: nenhuma das
48.550 linhas foi reescrita.

Duas colunas em `analitico_recebimentos`:

- `procedencia` (`relatorio_58` | `relatorio_59` | `manual`), com constraint;
- `confirmado_em` — ver a nota de honestidade abaixo.

**Para que `procedencia` serve, hoje:** `sincronizarAusentesDoSetor` trata o
arquivo do 58 como retrato completo do mês e **apaga** o que não está nele. Isso
já custou 413 linhas e R$ 175.768,38 num único import errado — e ali deu para
recuperar porque tudo era do 58. Quando o 59 escrever nesta tabela (Fase 7) e
quando houver correção manual (Fase 4), uma linha de outra procedência ausente
do arquivo não quer dizer «foi estornada»; quer dizer que o 58 nunca soube dela,
e apagá-la seria perda sem volta.

A trava está em três lugares, de propósito: o `select` da sincronização, a
função pura `idsAusentesDoRelatorioMensal` (onde é testada) e
`fn_analitico_remocao_prevista`, para que a prévia anuncie exatamente o que a
importação vai fazer.

#### ✅ As pendências do 58, com escalada (14/09/2026)

`fn_analitico_pendencias` + `fn_analitico_pendencias_resumo`, migration
`20260914010454`. Só leitura. Aparecem dentro da própria aba de Conferência — é
a mesma pergunta pelo outro lado, e 18 linhas não justificam uma aba própria que
ninguém abriria.

A escalada da regra 4 conta **quantas vezes o 59 rodou sem ver a linha**, não
horas — é o que separa «o 59 está atrasado» de «o 59 rodou e não trouxe», que
têm donos diferentes:

| promoções do 59 desde | severidade | significa |
|---|---|---|
| 0 | `aguardando` | o 59 não rodou desde que o 58 trouxe. Não cobra ninguém. |
| 1 | `pendente` | o 59 rodou uma vez e não viu. |
| 2+ | `critico` | rodou duas ou mais e continua sem ver. Alguém olha. |

Setembro/2026: 8.400 linhas do 58, **18 pendências, todas `aguardando`** — o 58
do Receptivo foi importado depois do último lote do 59.

#### ⚠️ Nota de honestidade: `confirmado_em` está sem uso

Eu propus `confirmado_em` com o desenho de carimbar a linha quando o 59 a visse,
por trigger na promoção do lote, e foi com esse argumento que a coluna foi
aprovada. Medido logo depois:

| | custo |
|---|---:|
| carimbar (semi join, dentro da promoção) | 289 ms |
| derivar (anti join, `fn_analitico_pendencias`) | 92 ms |

A derivação é mais barata **e mais correta**: se o ERP estornar um pagamento e o
lote novo do 59 não o trouxer, o carimbo continuaria dizendo «confirmado» para
sempre, enquanto a derivação volta a apontar a pendência.

Então `procedencia` está em uso e é load-bearing; `confirmado_em` ficou sem
função. A coluna é inofensiva (nullable, nada escreve nela), mas coluna de
enfeite é dívida. **Decisão pendente:** ou a Fase 5 a usa para o histórico, ou
ela sai num `drop column`.

### ✅ Fase 3 — vínculo de equipe sugerido pelas PESSOAS (no ar em 14/09/2026)

Entregue: `fn_mestre_equipes_sugeridas` e a aba **«Equipes a vincular»**.

> ⚠️ **O plano original desta fase estava errado, e foi medido antes de virar
> código.** O combinado era «o 58 do setor identifica as equipes e vincula» — o
> que na prática vira casar `subgrupo_equipe` com `equipes.nome`. Não funciona:
>
> | casamento | cobertura |
> |---|---|
> | nome exato, dentro do setor | 3 de 34 |
> | «contém» | 4 de 34 |
> | **pelas pessoas que receberam** | **18 de 34** |
>
> E os que casam por nome trazem armadilha: `EQUIPE DANIELE` tem **dois**
> candidatos (`DIGITAL (DANIELE)` e `MANUAL (DANIELE)`).

O sinal certo é quem recebeu: essas pessoas já têm equipe no sistema. O método
acerta onde o nome não tinha chance —

| Subgrupo no 59 | Equipe | Concentração |
|---|---|---|
| EQUIPE DOUGLAS | **HIBRIDO** | 100% |
| ELLEN 2°TURNO | SEGUNDO TURNO | 100% |
| EQUIPE DANIELE | MANUAL (DANIELE) | 100% |
| EQUIPE LUAN E GABRIELLY | Luan/ Gaby | 99,2% |

Cobre **R$ 745.618,13** dos R$ 934.860,88 sem equipe. A equipe de cada pessoa vem
de `composicao_mes` — congelada naquele mês.

**Sugestão não é vínculo.** A tela pré-marca só o que é seguro (mesmo setor, 2+
pessoas, concentração ≥ 90%); o resto aparece desmarcado com o motivo à vista.
Com uma pessoa só, «100%» significa apenas que existe uma pessoa — e em setembro
esses são todos casos de gente emprestada de outro setor, entre R$ 200 e R$ 600.

#### Resultado depois de rodar — 14/09/2026

Vínculos passaram de 18 para **30**, e a cobertura do 59 subiu:

| | antes | depois |
|---|---|---|
| Com equipe | 2.096.172,87 (50,4%) | **2.736.386,80 (65,7%)** |
| Resolvido nos três | 2.096.172,87 | **2.735.176,98** |

Ganho de **R$ 639.004,11** sem tocar em dado.

> ⚠️ **A tela oferecia uma ação que o banco sempre recusaria.**
> `fn_mestre_vincular_equipe` tem uma guarda que barra equipe de outro setor —
> e ela está certa: vincular mandaria o dinheiro daquela carteira para a equipe
> de outro setor. Mas a lista deixava marcar assim mesmo, e quem tentou levou
> erro. Corrigido: agora essas linhas vêm desabilitadas, com o motivo. Ver
> `podeVincular`.

**O que sobrou, e por quê:**

| Setor | Situação | Valor |
|---|---|---|
| Jornada Play | **não tem nenhuma equipe cadastrada** — DIGITAL, ACESSO/RECEBIMENTO, RETENÇÃO | ~119.900 |
| Play 5 / Playmix | equipe de outro setor, bloqueado pela guarda (gente emprestada) | 1.244 |
| vários | concentração abaixo de 80%, ou subgrupo que não é equipe | pequeno |

O maior bloco é **cadastro, não código**: criar as equipes do Jornada Play
destrava sozinho a maior parte do que falta.

### Fase 4 — correção manual

Redirecionar um valor para outro setor, pessoa ou equipe. Só super admin, nunca
duplicando, com registro de quem mudou e quando.

#### ⚠️ O redirecionamento já existia — e estava pela metade (14/09/2026)

Antes de construir qualquer coisa, medi o tamanho do problema e encontrei outro.

**O que a Fase 4 teria de mover é pequeno.** O caso que nenhum vínculo resolve é
gente emprestada — pessoa de um setor cobrando na carteira de outro. Em
setembro/2026: **R$ 4.810,91 em 35 linhas, 7 pessoas** — 0,14% dos R$ 3,3
milhões do mês. Construir uma máquina de exceção por NR, atravessando toda
função de leitura, para mover 0,14% seria risco desproporcional.

**E o mecanismo já existia.** `mestre_equipes.destino` é regra de três vias:

| destino | para onde o dinheiro conta |
|---|---|
| `proprio` | setor da carteira (padrão) |
| `outro_setor` | `destino_setor_id` |
| `somente_geral` | nenhum setor — só o total da empresa |

A tela `Mestre59Detalhe` deixa escolher as três. Mas **só 5 das 17 funções que
leem `mestre_equipes` honravam `destino_setor_id`.** As outras filtravam apenas
`<> 'somente_geral'` e deixavam `outro_setor` passar direto, caindo no setor da
CARTEIRA — o setor de onde o dinheiro deveria ter saído.

Quem usasse a opção veria o mesmo dinheiro num setor numa tela e noutro em
outra. **Pior que o recurso não existir, porque parece que funciona.**

Ninguém percebeu porque ninguém usou: das 124 linhas de `mestre_equipes` da
BookPlay, 122 são `proprio`, 2 são `somente_geral` (Retenção) e **nenhuma** tem
`destino_setor_id`. Armadilha armada, alcançável pela tela, nunca disparada.

#### ✅ O conserto: um lugar só decide (migrations 20260914012331 … 012656)

`fn_mestre_setor_resolvido(setor_do_grupo, destino, destino_setor_id)` — as três
vias num lugar só, `IMMUTABLE` para o Postgres inlinear e não custar nada por
linha. A regra estava repetida em 17 funções e só 5 a implementavam inteira; o
que trava isso agora é `setorResolvido.sql.test.ts`, que falha se alguém
reescrever `when 'outro_setor'` à mão dentro de uma função.

Ligado em quatro funções: `fn_mestre_operadores_do_mes`,
`fn_mestre_operador_detalhe`, `fn_mestre_divergencias`, `fn_analitico_pendencias`.

**A mudança é inerte hoje, e isso foi provado duas vezes.** Algebricamente: com
`destino ∈ {proprio, somente_geral}` em todas as linhas, o `case` de três vias
reduz exatamente ao filtro antigo. Empiricamente, agosto + setembro/2026:

| | |
|---|---:|
| linhas comparadas pela regra velha e pela nova | 69.737 |
| linhas em que as duas discordam | **0** |
| «no setor dele» pelos dois caminhos | R$ 13.149.666,99 |

E na conferência, onde a troca foi estrutural (dois filtros viraram um): 9.519
grupos, R$ 3.622.488,42, zero linhas só de um lado.

Uma quinta função, `fn_mestre_resumo_grupos`, **não precisava**: ela é resumo
por carteira, já tem `saiu_outro_setor` e subtrai do total, e nunca afirma para
onde o dinheiro foi.

#### ❌ Uma função ficou de fora, de propósito

`fn_mestre_diferenca_detalhe` (tela «Diferença», 12.154 caracteres) continua
seguindo a carteira na lista de NRs. Não a reescrevi, e a razão é risco:

- reescrever 12 mil caracteres à mão para mudar duas CTEs transcreve o resto, e
  é aí que erro se esconde;
- ela tem `if not fn_user_is_super_admin() then raise` logo na entrada, então
  não há como testá-la pelo MCP depois de aplicar — um erro de transcrição não
  seria pego por nada;
- os números de cabeçalho dela vêm de `fn_mestre_comparar_setores`, que **já
  honra** o redirecionamento. Só a lista de NRs ficaria seguindo a carteira.

O caminho certo para ela é uma mudança própria, revisada, ou aposentar a tela em
favor da «Conferência 58 × 59» — que responde a mesma pergunta e já está certa.
Fica registrado em «Em aberto».

### Fase 5 — histórico e rollback

- [x] **Histórico unificado dos dois relatórios** — no ar em 14/09/2026;
- [x] **Snapshot do que a importação do 58 remove** — migration `20260914021223`;
- [x] **O botão de voltar** — migration `20260914021354`.

**A Fase 5 está fechada.**

#### ✅ O histórico (migration 20260914014857)

`fn_importacoes_historico`, aba **«Histórico de importações»** no Painel
Diretoria, super_admin. Só leitura.

**O plano dizia «criar tabela de lotes do 58». Não precisou.** Ele supunha que
o histórico do 58 não existia, porque `lote_id` em `analitico_recebimentos` é só
um agrupador. Medido antes de construir, `logs_sistema` já guardava:

| | |
|---|---:|
| `importacao_concluida` | 1.416 eventos, desde 12/08/2026 |
| `importacao_falhou` | 34 eventos |
| linhas removidas, somadas | 2.659 |

Na BookPlay: **463 importações, 26 pessoas, 12 falhas.** Cada evento já tinha
quem, quando, o arquivo, as contagens e os erros.

Reconstruir lotes a partir de `analitico_recebimentos` teria sido **pior**:
mostraria só o que sobreviveu, não o que aconteceu — e lote cujas linhas foram
todas substituídas depois é justamente o que mais interessa olhar.

As duas origens entram na mesma linha do tempo sem fingir que têm a mesma forma:

| | 58 | 59 |
|---|---|---|
| unidade | uma importação, de um setor | um lote, do mês inteiro |
| frequência | várias por dia, por setor | uma por arquivo novo |
| versionamento | não tem | `aberto` → `vigente` → `substituido` |

Por isso o 58 traz inseridos/removidos e o 59 traz valor/estado. Onde a pergunta
não se faz àquela origem, a célula mostra «—» — **nunca zero**, que seria uma
afirmação falsa.

Importação do 58 que removeu **10 linhas ou mais** vem marcada em vermelho. É a
régua de `remocaoPrevista.ts`, e o caso que a fundou aparece na lista: 413
linhas e R$ 175.768,38 do Receptivo, 13/09/2026, por um export salvo da manhã do
dia 11.

#### ✅ O registro do que sai (migration 20260914021223)

Tabela `analitico_removidos`. **Nasceu vazia, nenhuma linha existente foi
tocada.** SQL mostrado e aprovado antes de rodar.

Até 14/09/2026 a remoção era um `delete` e ponto: **2.659 linhas se perderam
assim** entre 12/08 e 13/09, incluindo as 413 e R$ 175.768,38 do Receptivo
apagadas por um export salvo da manhã do dia 11. Naquele caso deu para recuperar
reimportando, porque tudo era do 58 e o ERP ainda tinha o dado. Não havia
garantia de que a próxima vez fosse assim.

A lixeira que já existe (`lixeira_acordos`) não servia: é moldada para acordo —
`acordo_id` obrigatório, campos de acordo — e expira em 3 dias.

Duas decisões que valem registro:

- **`conteudo` é jsonb, não 23 colunas espelhadas.** Assim a restauração
  sobrevive a mudança de coluna; duas foram adicionadas no mesmo dia. Restaurar
  é `jsonb_populate_record(null::analitico_recebimentos, conteudo)`.
- **Copiar e apagar viraram uma transação só**
  (`fn_analitico_remover_com_snapshot`). O cliente fazia `delete` direto; fazer
  a cópia como um segundo comando dele deixaria a janela aberta — falha entre os
  dois e o dado some sem registro.

Custo medido: ~2.600 linhas/mês, algo como 2 MB/mês. **Sem expiração** — apagar
o registro do que foi apagado tem que ser decisão consciente, não efeito de um
default que ninguém escolheu.

#### ✅ O botão de voltar (migration 20260914021354)

`fn_analitico_restaurar_remocao`, botão na linha do histórico. Super_admin,
com confirmação.

**Desfaz a remoção, não a importação inteira.** A regra 7 falava em «voltar a um
ponto do dia — o que foi importado depois é apagado». Implementei metade de
propósito, por assimetria de risco:

| | |
|---|---|
| o que a importação **removeu** | estava perdido para sempre — é o dano |
| o que a importação **inseriu** | reimportar o arquivo traz de volta |

Apagar o que uma importação inseriu tiraria linhas que o 58 atual diz que
existem, e a próxima importação as traria de novo. Muito barulho para desfazer o
lado que já se desfaz sozinho. Se depois de restaurar o estado ainda estiver
errado, o caminho é o que a própria regra 7 diz: «para avançar, importa-se um
relatório novo».

A restauração devolve **dois números**, não um: quantas voltaram e quantas outra
importação já tinha trazido de volta. Dizer «restaurei 413» quando 400 já
estavam lá seria número bonito e mentiroso, e mandaria alguém procurar 400
duplicatas que não existem.

**As importações anteriores a 14/09/2026 não têm botão**, e a tela explica o
porquê em vez de oferecer um botão que falharia.

### ✅ Fase 6 — travar o mês fechado (14/09/2026)

Migration `20260914022613`. **A Fase 6 está fechada.**

#### Quase tudo já estava certo — e medi antes de mexer

Auditoria das quatro tabelas `composicao_mes*` e das três funções que escrevem
nelas:

| | |
|---|---|
| RLS das tabelas | escrita só para super_admin ✅ |
| `fn_composicao_mes_congelar()` | só age no mês corrente ✅ |
| `fn_composicao_mes_snapshot()` | já tinha a trava: `p_mes < mês corrente` em America/Sao_Paulo, e aí só acrescenta o que falta ✅ |
| `fn_composicao_mes_completar_clones()` | **nenhuma trava** ❌ |

#### A porta

`fn_composicao_mes_completar_clones` é **SECURITY DEFINER** — passa por cima do
RLS super_admin-only — e aceita `gerencia`, `diretoria` e `administrador`.
Chamada com um mês já fechado, ela acrescentava ao retrato daquele mês os clones
de **hoje**.

Ela é cuidadosa: só cresce, nunca apaga, e o comentário dela mesmo diz «tirar
seria reescrever o mês». Mas crescer um retrato fechado também é alterá-lo, e
isso reescreve a atribuição histórica do dinheiro em silêncio.

A função continua inteira. O que mudou é **quem pode chamá-la para trás**.

#### O fechamento é derivado da data, não um flag

`fn_mes_fechado(mes)` — um lugar só decide. A regra 9 diz «à meia-noite do dia
1º», e isso é conta de calendário: não precisa de job, não precisa de coluna, e
não tem como dessincronizar. Um flag precisaria de alguém para ligá-lo, e o dia
em que esse alguém falhasse o mês ficaria aberto sem ninguém notar.

A mesma conta já estava escrita dentro de `fn_composicao_mes_snapshot`. Repeti-la
uma terceira vez seria o começo do defeito que a Fase 4 consertou — regra
copiada em N lugares, implementada inteira em alguns.

#### ⚠️ São dois cadeados, e eles NÃO são o mesmo

O sistema já tinha um fechamento de mês, em `lib/fechamentoMes.ts`: trava
criar/editar/excluir **acordo**, e admite exceção por cargo ou pela permissão
`ignorar_fechamento_mes`.

Este é outro, e mais estrito de propósito: reescrever quem estava em qual equipe
em agosto muda a **atribuição histórica do dinheiro**, que é mais grave que
editar um acordo. A guarda exige `super_admin` e **não honra**
`ignorar_fechamento_mes` — a regra 9 diz «só super admin», e é essa que vale
para configuração. Um teste trava essa distinção, para ninguém «uniformizar» os
dois sem perceber o que está afrouxando.

#### Verificado contra produção

```
fn_mes_fechado('2026-08') ......... true     (corrente: 2026-09)
fn_mes_fechado('2026-09') ......... false
fn_mes_fechado(null) / ('lixo') ... false

chamada em mês fechado, sem ser super_admin:
  composicao_mes de 2026-08 antes .... 326 linhas
  composicao_mes de 2026-08 depois ... 326 linhas
  erro ............................... MES_FECHADO: 2026-08 ja fechou.

chamada no mês corrente (em bloco revertido, sem deixar rastro):
  {"mes": "2026-09", "pessoas": 0, "equipes": 0, "setores": 0}
```

#### O que continua liberado, e é de propósito

Importar o 58 ou o 59 de um mês fechado. Isso é **dado**, não configuração, e
cai na data certa — exatamente como a regra 9 diz. `fn_composicao_mes_snapshot`
é chamada depois de cada importação e, em mês fechado, só acrescenta setor ou
equipe que faltava no retrato; nunca reescreve quem estava onde.

### Fase 7 — o 59 vira a fonte do sistema inteiro

O pedido, em 14/09/2026: **toda tela** — Dashboard, Painel Líder e suas
sub-abas, Analítico, comissão, desafios — deve mostrar o dado alinhado ao 59, e
não só o Painel Diretoria. E quando o 59 atualizar, todo mundo é avisado.

#### O inventário decidiu o desenho

| | alimenta |
|---|---|
| 58 (`analitico_recebimentos`) | ~30 módulos |
| 59 (`mestre_recebimentos`) | só o Painel Diretoria |

Reescrever 30 módulos para lerem o 59 seria caro, arriscado e ainda deixaria
duas verdades no sistema.

O caminho curto é o que a Fase 2 preparou sem saber: **o 59 passa a ESCREVER em
`analitico_recebimentos`**, com `procedencia = 'relatorio_59'`. Nenhuma das 30
telas muda de código — todas continuam lendo a mesma tabela e passam a ver o
número do 59. A coluna `procedencia` já existe e a trava de remoção já protege a
linha do 59 contra a importação do 58.

#### ✅ Passo 1 — a projeção (migration 20260914024100)

`fn_mestre_projecao_analitico` devolve exatamente o que o 59 escreveria, pela
chave de `idx_analitico_unicidade`, **sem gravar nada**. É o que permite medir a
troca antes de fazê-la.

O que a medição respondeu:

| | |
|---|---|
| H.O. na BookPlay | **zero** — nada se perde escrevendo pelo 59 |
| `tipo` × `tipo_comissao` | mesmo vocabulário (Integral/Extra) |
| linhas do 58 com `tipo_comissao` nulo | **4.750, R$ 1.542.372,87** — o 59 preenche |
| data divergente entre as fontes | só **44 de 7.584 NRs** (0,58%) |
| `RECORRENTE` | vai para `boleto_pix`, não cartão — R$ 156.609,84/mês que uma leitura apressada poria no balde errado |

E o impacto por setor, em setembro/2026:

| setor | hoje | com o 59 | Δ |
|---|---:|---:|---:|
| Jornada Play | 0 | 122.778 | **+122.778** |
| Play 1 | 873.308 | 976.815 | +103.508 |
| Manutenção | 0 | 74.623 | **+74.623** |
| Play 3 | 334.475 | 384.457 | +49.982 |
| Playmix | 229.389 | 257.871 | +28.482 |
| Play 2 | 355.837 | 379.843 | +24.006 |
| Play 4 | 67.024 | 73.053 | +6.029 |
| Play Mix Marília | 35.543 | 39.526 | +3.983 |
| Play 5 | 143.877 | 146.172 | +2.295 |
| Receptivo | 1.171.117 | 1.167.351 | −3.767 |
| **total** | **3.210.569** | **3.622.488** | **+411.919** |

5.834 linhas ganhariam `tipo_comissao`. Os R$ 197 mil de Jornada Play e
Manutenção são dinheiro que hoje **não aparece em nenhuma tela** fora do Painel
Diretoria.

**A caixa do login importa.** `idx_analitico_unicidade` é por
`operador_usuario` e é sensível a maiúsculas; o 58 tem 1.185 linhas em minúscula
e o 59, 5.063. Escrever `THALITA_ANGELO` onde o 58 gravou `Thalita_Angelo`
criaria linha gêmea em vez de colidir, e o dinheiro dobraria. A projeção reusa a
grafia que o 58 já usa para cada pessoa.

#### ✅ Passo 2 — a notificação (migrations 20260914024336 e 100309)

Gatilho em `mestre_lotes`: quando um lote passa a `vigente`, toda pessoa ativa
da empresa recebe «Dados analíticos atualizados», com o mês e quanto mudou.

Gatilho, e não chamada dentro de `fn_mestre_promover_lote`, porque aquela função
tem 200 linhas e já estourou o tempo uma vez — reescrevê-la para acrescentar
três linhas transcreveria o resto.

**Não avisa quando nada mudou**: reimportar o mesmo arquivo dá o mesmo total, e
avisar 301 pessoas de uma mudança que não houve é a forma mais rápida de ensinar
todo mundo a ignorar o aviso.

> ⚠️ **Revisar quando a importação virar automática.** Hoje o 59 entra ~1 vez
> por dia, o que dá ~300 notificações/dia. De hora em hora seriam ~3.000/dia, e
> aí é spam.

#### ❌ Passo 3 — a escrita, e o obstáculo que ela tem

Falta `fn_mestre_aplicar_no_analitico`: apagar (com snapshot da Fase 5) as
linhas do setor/mês e gravar a projeção.

**O obstáculo é a janela de contagem dupla.** Depois que o 59 escrever, a
próxima importação do 58 daquele setor vai reinserir as linhas dela — e, para
os 44 NRs em que as duas fontes discordam da data, isso é dinheiro contado duas
vezes até a promoção seguinte do 59 corrigir.

A trava de procedência (Fase 2) não resolve isso: ela impede o 58 de **apagar**
a linha do 59, mas não o impede de **inserir** a dele ao lado.

A saída é o que o próprio plano sempre disse — **o 58 vira prévia**. Para setor
cujo dado é do 59, a importação do 58 mostra o que veio e **não grava**. Isso
precisa de:

1. uma marca de «este setor é do 59» (por setor e mês);
2. a importação do 58 consultando essa marca antes de gravar;
3. a tela de importação dizendo, com todas as letras, que ali ela é conferência
   e não carga.

Enquanto o passo 3 não existir, a projeção serve para conferir e o Painel
Diretoria continua sendo o lugar onde o número do 59 aparece.

---

## A Fase 0 está fechada

As três travas estão no ar. O que a 0.3 revelou merece ficar escrito, porque o
diagnóstico inicial estava errado:

**O defeito não era a chave, era a ASSIMETRIA entre duas chaves.**

|  | chave |
|---|---|
| inserção | `idx_analitico_unicidade` — (empresa, codigo, **data**, forma, operador) |
| remoção | `chaveGrupoAnalitico` — (operador, codigo, mês) |

Uma linha cujo **dia** sumiu do arquivo sobrevivia — bastava outra linha do mesmo
NR no mesmo mês estar presente — e a linha nova, com a data nova, entrava do lado
dela. Duas linhas, o mesmo dinheiro.

Não era preciso mexer no índice nem acrescentar `parcela`: bastou a remoção
passar a comparar por linha. Medido antes de mudar: de **24.567 grupos** em
agosto e setembro, só **17** têm linhas em dias diferentes, e **3** deles são
exatamente os duplicados. Num arquivo completo, nada a mais é removido.

---

## O passo pendente agora

**Fase 4 — correção manual da divergência.** As fases 1, 2 e 3 estão fechadas.
A conferência mostra onde as duas fontes discordam e por quê; falta poder
resolver a divergência pela tela.

O que a Fase 4 precisa decidir antes de virar código:

1. **o que «corrigir» faz.** Apontar o destino certo (setor, pessoa ou equipe)
   sem nunca duplicar — sai de um lado, entra no outro. Isso é escrita em
   `analitico_recebimentos` com `procedencia = 'manual'`, e é a primeira vez que
   a tela grava recebimento;
2. **o que acontece na importação seguinte.** Uma correção manual sobrevive ao
   próximo 58 (a trava de procedência já garante) — mas e ao próximo 59? Se o 59
   passar a trazer a linha certa, a correção vira duplicata. Precisa de regra;
3. **quem pode.** Só super_admin, e com registro de quem fez e quando.

Antes dela, duas coisas menores que a Fase 2 deixou em aberto estão listadas em
«Em aberto» abaixo — inclusive o destino de `confirmado_em`.

### O que a conferência mostrou que é trabalho de cadastro, não de código

`sem_58` são **R$ 197.401,20** em dois setores que não importam o 58 nenhum dia:

| setor | NRs | valor |
|---|---:|---:|
| Jornada Play | 256 | R$ 122.371,19 |
| Manutenção | 371 | R$ 74.622,86 |

Enquanto eles não importarem, o 59 é a única fonte daquele dinheiro — o valor
conta normalmente, mas não há com o que conferir.

E o vínculo de equipe, que a Fase 3 destravou de 50,4% para 65,7%: o maior bloco
do que sobra continua sendo **Jornada Play sem nenhuma equipe cadastrada**,
quase R$ 120 mil. Criadas as equipes, a aba «Equipes a vincular» propõe o resto.

## Decisões tomadas nesta sessão

- Carteira e equipe sem vínculo **não são divergência** — são cadastro pendente,
  e o valor continua visível pelo código do ERP.
- `MARILIA - COFEN` fica de fora por enquanto (é PaguePlay).
- O valor histórico do operador segue o **setor congelado no lote**
  (`operador_setor_id`), não o setor de hoje — senão o mês fechado se altera
  sozinho quando alguém muda de setor.
- Pessoa sem perfil conta para o setor, sob rótulo próprio.
- A referência de data é sempre o 59.
- O 58 deixa de ser fonte e vira prévia.

## Em aberto

Tudo que ficou para trás, num lugar só. Cada item diz **o que é**, **por que
ficou** e **como verificar** se ainda importa — porque «em aberto» sem como
conferir vira lista que ninguém lê.

### Dívida técnica que eu deixei de propósito

#### 1. `fn_mestre_diferenca_detalhe` não segue o setor de destino

**O que é.** A tela «Diferença» (`Mestre59Diferenca.tsx`) lista os NRs seguindo
o setor da **carteira**, e não o setor de **destino** do subgrupo. As outras
quatro funções foram corrigidas na Fase 4; esta não.

**Por que ficou.** Três razões, e as três continuam valendo:
- são 12.154 caracteres, e a mudança real são duas CTEs — transcrever o resto é
  onde erro se esconde;
- ela começa com `if not fn_user_is_super_admin() then raise`, então não há como
  testá-la pelo MCP depois de aplicar: um erro de transcrição não seria pego por
  nada;
- os números de cabeçalho dela vêm de `fn_mestre_comparar_setores`, que **já
  honra** o redirecionamento. Só a lista de NRs ficaria torta.

**Como verificar se importa.** Só passa a importar quando alguém usar
`destino = 'outro_setor'`. Enquanto esta consulta devolver zero, o defeito é
teórico:

```sql
select count(*) from mestre_equipes
 where destino = 'outro_setor' or destino_setor_id is not null;
```

**As duas saídas.** Ou uma alteração própria e revisada, ou aposentar a tela em
favor da «Conferência 58 × 59», que responde a mesma pergunta e já está certa.

#### 2. `confirmado_em` está sem uso

**O que é.** Coluna em `analitico_recebimentos`, criada na `20260914010002`.

**Por que ficou.** Eu a propus para carimbar a confirmação do 59, e a medição
feita logo depois mostrou que derivar é mais barato (92 ms contra 289) **e** mais
correto — estorno no ERP faz a pendência voltar, e o carimbo diria «confirmado»
para sempre. A coluna é inofensiva: nullable, nada escreve nela.

**Como verificar.** `select count(*) from analitico_recebimentos where
confirmado_em is not null;` — se continuar zero depois da Fase 5, ela não achou
uso e deve sair num `drop column`. Coluna de enfeite é dívida.

#### 3. A exceção por NR da Fase 4 não foi construída

**O que é.** Redirecionar **uma linha** (não um subgrupo inteiro) para outro
setor, pessoa ou equipe.

**Por que ficou.** Medido: o caso que nenhum vínculo resolve — gente emprestada —
é **R$ 4.810,91 em 35 linhas, 7 pessoas**, 0,14% do mês. Uma máquina de exceção
por NR atravessando toda função de leitura, para mover 0,14%, é risco
desproporcional. O redirecionamento **por subgrupo** já funciona e cobre o caso
sistemático.

**Como verificar se cresceu.** A consulta de `fn_mestre_emprestados`, ou:

```sql
-- emprestado: pessoa cujo setor difere do setor da carteira onde cobrou
-- (setembro/2026: 35 linhas, 7 pessoas, R$ 4.810,91)
```

Se esse número virar dezenas de milhares de reais, a exceção por NR passa a se
pagar.

### Decisões de cadastro que são de quem manda

- [ ] `COBRANÇA - GERAL` (R$ 341 mil, 9 operadores): vincula a um setor, ou é
      «somente geral» como a Retenção?
- [ ] As 105 cobradoras sem perfil: são gente que saiu, de outra empresa, ou
      cadastro em falta? Muda se a solução é vincular ou rotular.
- [x] ~~O fechamento do mês é automático ou tem botão?~~ — **resolvido pela
      própria regra 9**, que diz «à meia-noite do dia 1º». Ficou automático e
      derivado da data (`fn_mes_fechado`), sem job e sem flag. Não há botão de
      fechar: não faz sentido fechar antes nem depois da virada, e um botão
      criaria um estado que pode divergir do calendário. O botão que existe,
      «Baixar fechamento» (`components/Fechamento`), é outra coisa — ele
      exporta o relatório, não muda o estado do mês.

### Resolvido — fica registrado para não voltar como dúvida

- [x] ~~Jornada Play e Manutenção não importam o 58~~ — **não era pendência.**
      Esses setores ainda não foram integrados ao sistema de gestão, então não
      existe 58 deles para importar. O 59 é a única fonte daquele dinheiro
      (R$ 197.401,20 em setembro): o valor conta normalmente, e não há com o que
      conferir até a integração acontecer. A aba de Conferência diz isso com
      essas palavras desde 14/09/2026 — classe «Setor não integrado», selo cinza
      e não âmbar.
