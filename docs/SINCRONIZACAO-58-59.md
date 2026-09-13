# Sincronizar o 58 com o 59 — o que já se sabe, e o que falta

> Registrado em 2026-09-08, ao fechar a fase 2 do Painel Diretoria.
> **Atualizado em 2026-09-13:** o filtro foi alinhado e está no ar.
>
> Este documento existe porque a análise que sustenta a sincronização levou
> várias sessões e mora hoje só na cabeça de quem participou dela. Ele não é o
> plano final: é o que já foi **medido**, o que já foi **descartado**, e as
> decisões que ainda não foram tomadas.
>
> Ver também: `relatorio-59-conferencia-2026-08-25.md` (a conferência que
> aprovou o 59 como fonte) e `REGRAS-DE-NEGOCIO.md`.

---

## O recorte do 58, resolvido — 2026-09-13

**O 58 de um setor é a fatia do 59 pela CARTEIRA, com duas exclusões e mais
nada.** Três regras, e não existe uma quarta:

1. `cod_grupo_filtro` → setor, via `mestre_grupos`. Não pela coluna `setor`,
   não pela pessoa que cobrou.
2. Colchão fora da janela sai — `fn_mestre_conta_na_meta`, que já era idêntica
   ao `colchaoContaNaMeta` do parser do 58.
3. Retenção sai — `mestre_equipes.destino = 'somente_geral'`, hoje marcando
   `RETENÇÃO` e `EQUIPE RETENÇÃO` da carteira 63, que é o mesmo conjunto que o
   `ehEquipeRetencao` derruba na importação do 58.

### A medição, agosto/2026

| Setor | 59 no recorte | 58 gravado | Δ | NRs divergentes |
|---|---|---|---|---|
| Play 3 | 934.550,07 | 934.550,07 | **0,00** | **0** em 1.280 |
| Play 4 | 165.045,89 | 165.045,89 | **0,00** | **0** |
| Play 5 | 360.873,55 | 360.873,55 | **0,00** | **0** |
| Play Mix Marília | 116.524,59 | 115.834,59 | +690,00 | 2 |
| Receptivo | 2.658.753,66 | 2.659.113,98 | −360,32 | 5 |

Os três zeros são **bijetivos nota a nota**, não compensação de erros: nenhum
NrDocumento com delta ≥ R$ 0,01 em nenhum dos dois lados.

### O que estava errado, e era uma coisa só

`mestre_comparavel` era `mestre_total − contrib_integral`. E `mestre_total` move
dinheiro **por pessoa**: quem é de um setor e cobrou na carteira de outro leva o
valor consigo (`emprestado_para` / `chegou`). O 58 não faz isso — o arquivo é da
carteira, e de que setor é quem cobrou não entra na conta.

Sozinho, o empréstimo respondia por:

| Setor | painel antes | alinhado | erro |
|---|---|---|---|
| Play 4 | 167.040,89 | 165.045,89 | +1.995,00 |
| Play 5 | 388.250,38 | 360.873,55 | +27.376,83 |
| Play Mix | 84.320,92 | 116.524,59 | −31.513,67 |
| Receptivo | 2.684.145,66 | 2.658.753,66 | +25.392,00 |

### O que a migration `20260913154346` mudou

`mestre_total` **não mudou** — segue sendo o número real do setor, com
empréstimo, contribuição e equipe movida. É o que a diretoria usa, e trocá-lo
por causa de uma conferência seria o contrário do pedido.

Mudou só a coluna que existe para comparar:

```
antes:  mestre_comparavel = mestre_total − contrib_integral
agora:  mestre_comparavel = recebido_proprio − saiu_somente_geral
```

Entraram `mestre_fora_do_58` (= `mestre_total − mestre_comparavel`, a ponte que
faz a subtração fechar na horizontal da tela) e `mestre_retencao`.

Em `fn_mestre_diferenca_detalhe`, três ajustes de consequência:

- o filtro `lower(tipo) <> 'extra'` **saiu**. O Extra **está** no 58 — em agosto
  são R$ 869.047,73 do Receptivo dentro dos R$ 2.658.753,66 conferidos. Mantê-lo
  fora fazia a lista de NR acusar como divergência quase um milhão de reais que
  os dois lados conhecem;
- as linhas `somente_geral` saem, para o lado do 59 somar exatamente
  `mestre_comparavel`;
- `emprestado_de` e `emprestado_para` saíram da conta do `nao_explicado` — não
  deslocam mais a diferença. Continuam no bloco `estrutura`, agora explicando
  por que `Mestre` e `Comparável` são números diferentes.

### As diferenças que sobraram são de DADO, não de filtro

**Play Mix, R$ 690,00** — dois NRs em que o 58 do Play Mix traz **menos valor**
que o 59, na mesma linha: mesma operadora, mesma data, valor menor.

| NR | 59, carteira 79 | 58 do Play Mix | falta |
|---|---|---|---|
| 12972071 | 889,66 (JULIANA_S_OLIVEIRA, 27/08, parcelas 5–10) | 389,66 (JULIANA_S_OLIVEIRA, 27/08) | 500,00 |
| 12842628 | 190,00 (ALLANA_BARBOSA, 21/08, parcela 8, Integral) | **0,00** (ALLANA_BARBOSA, 21/08) | 190,00 |

> ⚠️ **Correção de 2026-09-13.** A primeira leitura desta análise dizia que o 58
> «carimbou esses valores no Play 5». Está **errado**, e a mensagem do commit
> `eb234f4` repete o engano. O que havia era uma consulta que só perguntava «este
> NR aparece em outro setor?» — e aparece, por parcelas legítimas: o NR 12972071
> tem 700,00 na carteira do Play 5 (parcelas 1–4), que o 58 do Play 5 traz
> exatos. Nada foi carimbado no lugar errado. O 58 do Play Mix simplesmente
> reporta menos.

### A coluna `Setor` do 59 NÃO decide em qual 58 a linha cai

Vale registrar porque a pergunta é natural: se cada linha do 59 traz um `Setor`,
não seria ele o recorte? **Não.** Medido em agosto:

| Carteira | `Setor` que o ERP aponta | linhas | valor |
|---|---|---|---|
| MARILIA PLAY MIX | MARILIA - PLAY 5 | 169 | 42.714,78 |
| COB PLAY 1 - PAOLA | COB PLAY 2 - EDERLANDIA | 207 | 42.265,73 |
| JORNADAPLAY | ALCATEIAS PLAY | 53 | 25.892,75 |
| MARILIA - PLAY 4 | MARILIA - COFEN | 147 | 20.655,54 |
| MARILIA - PLAY 5 | MARILIA PLAY MIX | 71 | 10.511,11 |
| MARILIA - PLAY 5 | MARILIA - COFEN | 42 | 5.783,28 |

São R$ 150 mil apontando para fora da própria carteira — e **mesmo assim** Play 3,
Play 4 e Play 5 fecham em zero nota a nota contra o 58. O 58 do Play 5 contém os
R$ 10.511,11 cuja coluna `Setor` diz «MARILIA PLAY MIX», e contém os R$ 5.783,28
que dizem «MARILIA - COFEN».

Ou seja: o 58 segue **quem cobrou** (`NomeGrupoFiltro`), não para quem o ERP diz
que o dinheiro conta (`Setor`). Trocar o recorte para a coluna `Setor` quebraria
os três zeros de uma vez.

**Receptivo, R$ 360,32** — cinco NRs, duas causas opostas que quase se anulam:

- *R$ 338,11 que só o 59 tem:* NR 12987483 (205,00, ERIELE_MONTEIRO, 31/08) e
  NR 13019778 (133,11, GABRIEL_OLIVEIRA, 20/08). O 58 não os trouxe.
- *R$ 698,43 contados duas vezes no 58.* O Receptivo tem dois lotes em agosto: o
  principal (2026-09-08, 6.039 linhas, 2.658.415,55) e um de 2026-09-09 com
  **5 linhas somando exatamente 698,43** — três com valor, duas com R$ 0,00.
  Cada valor já estava dentro da linha consolidada do primeiro lote:

  | NR | linha do lote 1 | composição no 59 | o lote 2 acrescentou |
  |---|---|---|---|
  | 12984182 | 483,25 em 01/08 | 49,80 + 174,30 (colchão) + 259,15 | 259,15 de novo |
  | 13000560 | 470,69 em 01/08 | 74,70 + 136,95 (colchão) + 259,04 | 259,04 de novo |
  | 13012299 | 360,24 em 11/08 | 180,00 (colchão) + 180,24 | 180,24 de novo |

  `698,43 − 338,11 = 360,32`, ao centavo.

**Veio do relatório ou da importação? O log responde.** `logs_sistema` guardou o
resumo das duas importações:

| Quando | Resultado |
|---|---|
| 08/09 20:02 | 6.039 novas, 0 já existentes, 0 reconciliadas, **0 problemas** |
| 09/09 10:56 | 5 novas, 5.519 já existentes, 2 reconciliadas, **3 problemas** |

O arquivo do dia 09 tinha **5.524 linhas** contra 6.039 do dia 08 — é um recorte
diferente, não uma reexportação idêntica. E os três problemas são exatamente os
três NRs:

```
NR 12984182 (GABRIEL_OLIVEIRA): banco tem 742.40 em 2 linha(s),
  relatório diz 259.15 — ajuste manual necessário (use "Limpar mês" e reimporte).
NR 13000560 (KAUAN_TEIXEIRA): banco tem 729.73 em 2 linha(s), relatório diz 259.04 — …
NR 13012299 (LARISSA_PEREIRAA): banco tem 540.48 em 2 linha(s), relatório diz 180.24 — …
```

Então a sequência é esta, e cada elo tem um dono:

1. **O arquivo do dia 09 descreve os NRs de outro jeito** — traz só a última
   parcela como linha própria (259,15 em 03/08), onde o do dia 08 trazia o valor
   agregado (483,25 em 01/08). Isso é do relatório.
2. **A porta estava aberta.** `idx_analitico_unicidade` é
   `(empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario)` —
   sem valor e sem parcela. Data nova = chave nova = dinheiro novo. Isso é nosso.
3. **O alarme tocou e ninguém atendeu.** A reconciliação DETECTOU: comparou os
   742,40 do banco com os 259,15 do relatório. Só que corrigir daria valor
   negativo, e a guarda `novoValor < 0` impede escrever negativo — então ela
   registrou o aviso e seguiu. O aviso apareceu na tela da importação e no log.
   Ninguém rodou o «Limpar mês».

**O caso do cartão é só nosso.** No NR 13012299 a consolidação de cartão agrupa
por operador+código **ignorando a data** (`consolidar()` em `analiticoComum.ts`)
e carimba a linha com a data da primeira parcela — 180,00 de 11/08 + 180,24 de
31/08 viraram 360,24 em 11/08. Quando o arquivo seguinte trouxe a parcela de
31/08 sozinha, a chave não existia. Isso se repete sempre que um NR de cartão
tem parcelas em dias diferentes e o setor reimporta.

### A chave do pareamento por NR

`analitico_recebimentos.codigo` guarda o **NrDocumento**, apesar do nome e
apesar de o parser chamar `extrairCodigo(cliente)`: a coluna «Cliente» do 58 vem
com o número do documento na frente. Medido no Play 5 de agosto — 968 de 968
casam com `mestre_recebimentos.nr_documento`, e **zero** com `cod_cli`. O join
de `fn_mestre_diferenca_detalhe` está certo; não troque para `cod_cli`.

### A contribuição do Receptivo, agora medida

O Integral que o Receptivo cobra para outra carteira conta no 59 dos dois lados
e o 58 só tem a perna de quem cobrou — fica fora do comparável, e está correto.
Mas o 59 agora **mede** o que hoje é digitado à mão em `contribuicao_receptivo`:

| Destino | Integral medido no 59 | digitado | Δ |
|---|---|---|---|
| Play 1 | 604.561,52 | 535.224,43 | 69.337,09 |
| Play 2 | 155.539,12 | 41.961,04 | 113.578,08 |
| Play 3 | 124.113,85 | 125.300,00 | −1.186,15 |
| Play 4 | 35.746,23 | 34.347,23 | 1.399,00 |
| Play 5 | 37.710,01 | 35.395,54 | 2.314,47 |
| Jornada Play | 93.489,09 | — | nada digitado |

---

## Setembro/2026: o recorte confirmado no mês corrente — 2026-09-13

Conferido com o lote do 59 de 13/09 17:00 (21.838 linhas, até 14/09), cortando em
**10/09** para dar folga ao horário em que cada setor importa o 58:

| Setor | 59 no recorte | 58 | Δ | NRs comparados | divergentes |
|---|---|---|---|---|---|
| **Play 4** | 66.840,57 | 66.840,57 | **0,00** | 223 | **0** |
| **Play Mix Marília** | 35.442,85 | 35.442,85 | **0,00** | 53 | **0** |
| Play 5 | 135.804,35 | 136.022,75 | −218,40 | 390 | 1 |
| Receptivo | 981.293,97 | 982.546,05 | −1.252,08 | 2.064 | 1 |

No mês inteiro, com o 58 do Receptivo atualizado até 14/09, ele fecha em
**0,00 exato**: 1.167.350,54 dos dois lados.

> ⚠️ **Corte de data importa.** O lote anterior do 59 (10/09 20:36) tinha o dia 10
> pela metade, e comparar até o dia 10 contra ele dava −33.830,32 no Receptivo —
> diferença do lote, não do filtro. Antes de comparar, confira até onde o lote
> vigente vai (`max(dt_pgto)`).

### A REGRA DO COLCHÃO, definitiva — 2026-09-13

> Este bloco substitui tudo o que foi escrito sobre colchão mais abaixo neste
> documento. O que vem depois é o registro do caminho torto; a regra é esta.

**O Colchão entra no TOTAL DA EMPRESA e não conta para SETOR, equipe ou
operador.** Exatamente o tratamento que a Retenção já tinha
(`mestre_equipes.destino = 'somente_geral'`) — o Colchão é a segunda coisa com
esse comportamento.

Única exceção, preservada: o pago entre **01 e 14/08/2026**. Agosto foi fechado
com ela valendo.

| Onde a regra mora | |
|---|---|
| Parser do 58 | `colchaoContaNaMeta` (`analiticoComum.ts`) |
| Banco | `fn_mestre_conta_na_meta` |

As duas precisam dizer a mesma coisa. Foi elas se separarem que produziu todo o
problema de setembro.

**Quem aplica, e quem não aplica de propósito:**

| Função | Colchão |
|---|---|
| `fn_mestre_diretoria_visao_geral` | **entra** — é o total da empresa |
| `fn_mestre_diretoria_linhas` (e `_setores`, que a consome) | sai |
| `fn_mestre_diretoria_setor` (pelos dois caminhos) | sai |
| `fn_mestre_diretoria_alternativos` (mês atual e anterior) | sai |
| `fn_mestre_resumo_grupos`, `_setores`, `comparar_setores` | sai |

A diferença entre a Visão Geral e a soma dos setores passa a ser **colchão +
Retenção** — e isso é por desenho, não defeito. Em setembro/2026 o colchão são
R$ 163.876,90 (Receptivo 78.207,16 · Manutenção 34.322,98 · Play 1 24.410,11 ·
Play 2 11.000,93 · demais 15.935,72).

**No ERP:** exportar o 58 com ou sem a opção de colchão dá no mesmo para o setor
— o parser descarta de qualquer jeito. Medido em 13/09/2026 no Receptivo: o
arquivo "com" tem 616 linhas a mais, R$ 78.207,16, todas `Colchão? = Sim`, todas
PIX AUTOMÁTICO ou RECORRENTE, 610 delas parcela 2+. As 4.088 linhas comuns são
idênticas nos dois arquivos.

#### O caminho torto até aqui, para ninguém refazer

Em 10/09 a `20260910215830` fez o colchão **contar** de setembro em diante. O
motivo era real — três abas mostravam três totais para o mesmo arquivo —, mas a
solução tratou o sintoma: em vez de fazer todo mundo aplicar a regra, mudou a
regra para a divergência sumir. As cinco funções do painel que não consultavam
`fn_mestre_conta_na_meta` continuaram não consultando.

Em 13/09 a conta chegou: o comparável inflava em R$ 163.876,90. Foram três
tentativas no mesmo dia — `fn_mestre_esta_no_58` (`…172128`/`…172251`), depois
abolir a separação (`…173442`/`…173539`) — até a diretoria dizer o que de fato
queria. A correção final (`…200932` e as três irmãs) fecha a lacuna de 10/09.

**A lição, que vale além do colchão:** quando duas pontas discordam, a pergunta é
*«qual delas está errada»*, não *«como faço a diferença sumir»*.

---

### ~~O Colchão deixou de existir como categoria~~ — revertido em 2026-09-13

> ⚠️ **Este bloco está SUPERADO.** A decisão descrita aqui durou algumas horas e
> foi revertida no mesmo dia — ver «A REGRA DO COLCHÃO, definitiva», acima. Fica
> como registro de que a separação chegou a ser removida por engano, e do que
> isso custou: 639 linhas presas na tabela do Colchão e uma reimportação com
> arquivo antigo que apagou 413 linhas do Receptivo.

**Decisão da diretoria:** o Colchão era exceção de agosto/2026. O relatório passou
a trazer esses valores corretos, e de **01/09/2026** em diante uma linha marcada
`Colchão? = Sim` é **linha comum** — entra no Analítico como qualquer outra, sem
desvio, sem contador próprio, sem aba à parte.

Agosto/2026 fica exatamente como está, janela 01–14 inclusive. Meses anteriores
também. A regra agora é uma só, escrita dos dois lados da ponte:

| Onde | Função |
|---|---|
| Parser do 58 | `colchaoEhSeparado` + `colchaoContaNaMeta` (`analiticoComum.ts`) |
| Banco | `fn_mestre_conta_na_meta` |

`fn_mestre_esta_no_58`, criada horas antes para separar as duas perguntas, foi
**derrubada**: a divergência que a justificava era o colchão de setembro, e ela
acabou de ser abolida. Dois predicados idênticos são duas chances de divergir.

> ⚠️ **Setembro já importado precisa de reimportação.** A classificação é gravada
> na linha no momento da importação, não recalculada na leitura. O colchão de
> setembro que entrou antes desta mudança está em `analitico_colchao_fora_meta`,
> fora do Analítico:
>
> | Setor | linhas | valor |
> |---|---|---|
> | Receptivo | 603 | 76.351,76 |
> | Playmix | 17 | 2.592,72 |
> | Play 5 | 11 | 1.047,33 |
> | Play 3 | 5 | 721,31 |
> | Play 4 | 3 | 263,00 |
>
> Até cada setor reimportar setembro, a comparação acusa esse valor como NR «só
> no 59» — e está certa: o dinheiro ainda não está no analítico. Depois da
> reimportação, essas linhas continuam em `analitico_colchao_fora_meta` (a
> limpeza por mês não alcança essa tabela — pendência conhecida), e aí elas
> passam a aparecer nos dois lugares. A aba Colchão vai mostrar setembro como se
> ainda fosse categoria.

### O colchão quase repetiu o erro do começo

`mestre_comparavel` filtrava por `fn_mestre_conta_na_meta`, que desde a
20260910215830 conta colchão a partir de setembro. Mas o parser do 58 manda
colchão para `analitico_colchao_fora_meta` **sempre**, menos em 01–14/08/2026.
Em agosto as duas regras coincidem — por isso o defeito não apareceu na primeira
medição. Em setembro o comparável carregava:

| Setor | colchão que o 58 não tem |
|---|---|
| Receptivo | 77.450,26 |
| Play 5 | 857,33 |
| Play Mix | 300,00 |
| Play 4 | 263,00 |

Corrigido nas migrations `20260913172128` e `20260913172251`, com um predicado
próprio — que as `…173442` e `…173539` desfizeram horas depois, quando a decisão
acima aboliu a divergência. A lição que fica vale além do colchão: *«conta na
meta»* e *«está no 58»* são perguntas diferentes, e sempre que elas divergirem o
comparável precisa seguir a segunda. Hoje coincidem.

### A data do pagamento: o 58 empilha, o 59 distribui

O 58 carimba o valor **acumulado** do NR na data do **primeiro** pagamento.
Quando o cliente paga de novo dias depois, o arquivo não cria linha no dia novo —
aumenta o valor da linha antiga. Medido no Play 4 de setembro: 3 NRs de 223,
R$ 2.641,04 no dia errado, **líquido zero no mês**.

O caso mais limpo, NR 5747654 (ELISANDRA_RAQUEL):

| | 08/09 | 09/09 |
|---|---|---|
| 59 | 155,00 (parcela 2) | 32,77 (parcela 2, mesmo boleto) |
| 58 | **187,77** numa linha só | *nada* |

A linha de 187,77 datada de 08/09 foi **inserida em 09/09 às 10:49**. Como o
importador cria linha nova sempre que a data muda, se o arquivo trouxesse o
pagamento do dia 09 em separado teriam nascido duas linhas. Nasceu uma, já
somada: o dia não está no arquivo.

Consequências, e as duas são decisões já tomadas:

- **Não dá para corrigir na importação do 58.** O dado não existe lá; qualquer
  correção seria o sistema inventar a data.
- **Para valor por dia e por semana, a fonte é o 59** — ele guarda cada
  pagamento na sua data e por parcela. O 58 acerta o mês, não o dia.
- **A correção fica para quando a sincronização pelo 59 for implementada**, que é
  quando os dados dele passam a valer em produção (decisão de 13/09/2026).

---

### Três fragilidades que ficaram de pé

1. **Retenção depende de marcação manual.** No 58 é automático (o rótulo que
   contém «retencao» cai); no 59 alguém precisa marcar o `nome_subgrupo` exato
   em `mestre_equipes`. Rótulo novo → o 58 descarta sozinho, o 59 não, e a
   diferença aparece como divergência.
2. **`destino = 'outro_setor'` não tem contrapartida no 58** e por isso NÃO é
   descontado do comparável. Em agosto está zerado em toda a empresa, então essa
   regra nunca foi exercida contra o 58.
3. **Setores sem base de comparação em agosto:** Play 2 (879.216,61), Playmix
   (638.337,44), Jornada Play (406.418,47) e Manutenção (139.275,79) não têm 58
   importado. Play 1 está defasado: 1.977.410,41 no 58 contra 2.167.754,45 no 59.

---

## O objetivo, nas palavras de quem pediu

> "Vincular o recebimento do 58 com os operadores, vincular com o recebimento
> das equipes, que é a parte mais difícil, eu acho. E vincular o recebimento dos
> setores. Eu quero fazer isso de uma forma que seja **assertiva, não seja fácil
> de quebrar e que seja customizável**."

Objetivo maior: **acabar de vez com divergência de valores** entre o que o ERP
diz e o que o sistema mostra.

---

## Estado atual: nada é sincronizado

⚠️ **Isto é uma restrição em vigor, não uma etapa que ficou para trás.**

O 59 alimenta **apenas** o Painel Diretoria da BookPlay. Vincular uma carteira a
um setor muda o que aquele painel mostra — e nada mais. `analitico_recebimentos`,
meta, quartil e as outras abas seguem exatamente como estavam.

| Fase | O que é | Situação |
|---|---|---|
| 1 | Painel Diretoria · Visão geral (`fn_mestre_diretoria_visao_geral`) | ✅ no ar |
| 2 | Painel Diretoria · Setores e equipes (`fn_mestre_diretoria_setores`, `_setor`) | ✅ no ar |
| 3a | **Alinhar o recorte** — o 59 filtrado reproduz o 58 (`20260913154346`, `…172128`, `…172251`) | ✅ no ar, conferido em agosto e setembro |
| 3b | Corrigir os dados que sobraram (Play Mix 690,00 · Receptivo 698,43 + 338,11) | ⏳ aguarda decisão |
| 3c | Fechar a porta da duplicata (`idx_analitico_unicidade`) | ❌ não começou |
| 3d | Escrever no analítico a partir do 59 | ⛔ proibido, sem decisão |

A PaguePlay continua no painel antigo. A chave é
`usaPainel59 = tenant.slug === 'bookplay'` em `PainelDiretoria/index.tsx`.

---

## O que já foi medido

### O 59 não contém o 58 inteiro

Foi a primeira conclusão, e ela **estava errada**. O relatório do Cofen tem uma
linha que existe só no 58. A regra correta:

> Linha que está só no 58 é um retrato **mais novo**, não um erro de importação.

Comparação arquivo contra arquivo, agosto/2026, seis setores:

| | 58 | 59 |
|---|---|---|
| Linhas | 27.367 | 27.368 |
| Valor | R$ 6.790.938,83 | R$ 6.791.148,11 |

Saldo líquido **+R$ 209,28**. O resíduo são 3 linhas / R$ 466,94: Receptivo
−338,11 (só no 59) e Cofen +128,83 (só no 58). Quatro dos seis setores fecharam
em **zero exato**.

### A chave do join é a carteira, nunca o setor

`NomeGrupoFiltro` é a **carteira**. O dinheiro conta para o setor da **pessoa**,
não o da carteira. Ver a memória `mestre-59-carteira-nao-e-equipe`.

### O 58 é o retrato cadastral mais novo da equipe

O campo de equipe diverge em **6.357 dos 27.366 pares** (R$ 1.536.192, 55 de 244
operadores). E a divergência é sempre **1:1 por operador, zero misturado** — o
que descarta erro de linha e aponta para diferença de retrato cadastral. A
segunda exportação do Play 3 confirmou: **o 58 é o retrato mais novo**.

Consequência para o desenho da fase 3:

- **equipe** → o 58 manda
- **dinheiro** → o 59 manda

### A soma dos setores é maior que o total da empresa, e está certo

Quando um grupo cobra `Integral` para outro (a coluna `setor` vem como
`"Receptivo - Play 5"`), o dinheiro conta **nos dois**: é rateio de comissão,
não transferência. Estabelecido e medido em `20260904300000`.

Qualquer tela que mostre porcentagem por setor tem que usar **a soma dos
setores** como denominador, nunca o total da empresa — senão as fatias passam de
100%.

### Retenção é descartada de propósito

`ehEquipeRetencao` (`analiticoComum.ts`) derruba a linha **antes** de salvar.
R$ 100.111,73 em agosto. Não é bug, e a sincronização não deve "recuperar" isso
sem uma decisão explícita.

---

## Divergências sistema × 59 que sobraram

> ⚠️ **Superado pela medição de 2026-09-13** (bloco do topo). A tabela abaixo é
> de 2026-09-08, foi feita ANTES do alinhamento do recorte e antes das
> reimportações de 08 e 09/09 — os números dela não valem mais. Fica como
> registro de como o problema era lido na época. Play 3 e Receptivo, em
> particular, já não têm as causas descritas aqui.

Medidas depois de importar os fechamentos de agosto:

| Setor | Diferença | Causa |
|---|---|---|
| Play 4 | 0 | — |
| Play 5 | 0 | — |
| Play 3 | −792,98 | `analitico_colchao_fora_meta` não é limpa ao reimportar |
| Receptivo | −7.384,76 | idem (−7.722,87) · já descontado o descarte da Retenção |
| Play Mix | +690,00 | duas linhas carimbadas em Play 5 / Receptivo por importação antiga |

**A causa do Play 3 e do Receptivo é um defeito de código, não de dado:**
`limparDadosDoMes` e `limparDadosDoMesSetor` mexem só em
`analitico_recebimentos` e deixam `analitico_colchao_fora_meta` para trás. Toda
reimportação futura deixa resíduo novo. Ver a memória
`receptivo-retencao-e-colchao-residual`.

O Play Mix é diferente: limpeza por setor não alcança linha carimbada em outro
setor.

---

## Decisões que ainda não foram tomadas

- [x] ~~**Como o 59 é filtrado por setor.**~~ Resolvido em 2026-09-13: carteira,
  colchão e Retenção. Ver o bloco do topo.
- [ ] **Corrigir os R$ 698,43 duplicados do Receptivo.** São 3 linhas do lote
  `9649da48-13a2-4942-b781-4200467c6295`, de 2026-09-09. Apagar é escrita em
  produção sobre linha de gente real, e precisa de autorização própria.
- [ ] **Corrigir os R$ 690,00 do Play Mix**, carimbados no Play 5 (2 NRs).
- [ ] **Fechar a porta da duplicata.** `idx_analitico_unicidade` não vê a
  parcela nem o valor. Trocar a chave mexe na importação de todo mundo — não é
  mudança para fazer junto com uma correção de dado.
- [ ] **Corrigir a data do pagamento a partir do 59.** Adiado de propósito para
  quando a sincronização pelo 59 for implementada — é quando os dados dele
  passam a valer em produção (decisão de 13/09/2026). Até lá, o 58 segue
  empilhando o acumulado na data do primeiro pagamento.
- [ ] **Versionar o vínculo por mês.** `mestre_grupos` e `mestre_equipes` não têm
  mês: são um mapeamento único e atual, então mexer neles hoje muda como agosto
  é lido. O setor do operador, esse sim, já fica congelado por lote
  (`operador_setor_id`). Fechar um mês exige as três coisas congeladas.
- [ ] **O que acontece quando o 58 e o 59 discordam da equipe.** Regra proposta,
  não aprovada: equipe vem do 58, dinheiro vem do 59.
- [ ] **Alias de login.** `JOAO_FAUSTINO` (ERP) e `JADE_FAUSTINO` (sistema) são a
  mesma pessoa, que mudou de nome. Precisa de um mecanismo, não de um remendo —
  vai acontecer de novo. Ver a memória `jade-faustino-login-do-erp`.
- [ ] **Se a sincronização escreve ou só compara.** Escrever em
  `analitico_recebimentos` a partir do 59 é irreversível na prática, e hoje
  está proibido.

---

## Pendências menores, já levantadas

- [ ] `analitico_colchao_fora_meta` não é limpa na reimportação (defeito de
  código; gera resíduo novo a cada importação).
- [ ] 5 lotes `mestre_lotes` em estado `aberto` órfãos, 61.651 linhas. SQL de
  limpeza pronto (`delete from public.mestre_lotes where estado = 'aberto';`),
  **não autorizado**.
- [ ] Migration `20260908142410_chat_presenca_entre_empresas.sql` ainda não
  aplicada no banco.
- [ ] Play Mix: R$ 690,00 em duas linhas carimbadas fora do setor.
- [ ] Ajuste manual da Allana Barbosa em agosto (R$ 3.270,34) nunca reinserido
  depois do cancelamento.
- [ ] Colchão foi regra **exclusiva de agosto/2026** (`colchaoContaNaMeta`, dias
  01–14). Não generalizar.
