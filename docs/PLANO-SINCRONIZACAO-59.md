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

### Fase 5 — histórico e rollback

Tabela de lotes do **58** (hoje não existe — `lote_id` é só um agrupador) com
snapshot do que foi removido, e o histórico unificado dos dois relatórios com o
botão de voltar.

> Sem o snapshot não há rollback do 58: a importação apaga e nada guarda o que
> apagou.

### Fase 6 — travar o mês fechado

Ligar a trava sobre `composicao_mes` e fechar as portas de edição que não sejam
de super admin (regra 9).

### Fase 7 — sincronização horária

Automatizar. **Por último**, e só depois da fase 6: com o vínculo não versionado
e sem trava de mês, uma importação de hora em hora pode reescrever mês fechado
sem ninguém ver.

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

- [ ] `COBRANÇA - GERAL` (R$ 341 mil, 9 operadores): vincula a um setor, ou é
      «somente geral» como a Retenção?
- [ ] As 105 cobradoras sem perfil: são gente que saiu, de outra empresa, ou
      cadastro em falta? Muda se a solução é vincular ou rotular.
- [ ] O fechamento do mês é automático à meia-noite do dia 1º, ou tem um botão?
- [ ] `confirmado_em` em `analitico_recebimentos` ficou sem uso quando a
      pendência virou derivada. Ou a Fase 5 a aproveita para o histórico, ou ela
      sai num `drop column` — coluna de enfeite é dívida.
- [ ] **Jornada Play e Manutenção não importam o 58 nenhum dia** (R$ 197.401,20
      em setembro). Enquanto não importarem, o 59 é a única fonte daquele
      dinheiro: o valor conta, mas não há com o que conferir.
