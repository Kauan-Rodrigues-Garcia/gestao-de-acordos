# Painel de metas na PaguePlay — design

*Data: 2026-08-15 · Status: aprovado, aguardando plano de implementação*

## Objetivo

Levar para a PaguePlay a mesma estrutura de dashboard que a BookPlay recebeu em
`de5d5da` — o `PainelMetas` como **corpo** do bloco "Dados Analíticos" — sem
quebrar nenhuma regra própria da operação, com destaque para o H.O.

A PaguePlay hoje continua no caminho antigo: `PPMetrics` (11 cards soltos) mais
`ChartsSection` (dois gráficos). O hook `usePainelMetas` **já aceita** a
PaguePlay (`const ativo = tenant.isPaguePlay || tenant.slug === 'bookplay'`);
o que falta é renderizá-lo e ensiná-lo a falar H.O.

### Não faz parte deste trabalho

- Mudar a unidade das metas no banco. `metas.meta_valor` continua em bruto.
- Mexer no `MetaProgressoHeader` (a barra abaixo da saudação). Ele é
  compartilhado com a BookPlay e continua em bruto.
- Tocar no painel da BookPlay. O alternador de unidade não aparece lá.
- Preencher `tipo_comissao` retroativamente na PaguePlay.

---

## 1. A descoberta que orienta o resto

`docs/REGRAS-DE-NEGOCIO.md` §1.4 afirma que **"o H.O. é a base de cálculo das
metas — não o valor bruto"**. O código diz o contrário em dois lugares:
`MetaProgressoHeader.tsx:38` ("a lógica é toda em bruto") compara `bruto` contra
a meta, e o `AnalyticsPanel` faz as duas coisas ao mesmo tempo — card grande em
H.O., barra de % da meta em bruto.

O banco desempata. Metas de operador da PaguePlay em agosto/2026:

| | |
|---|---|
| `meta_valor` (igual para todos) | R$ 72.115,38 |
| × `PP_HO_PERCENTUAL` (24,96%) | **R$ 18.000,00** |
| Recebido bruto do 1º colocado | R$ 37.282,69 → 52% da meta |
| H.O. do 1º colocado | R$ 9.320,72 → 13% da meta |

A meta é **pensada** como 18 mil de H.O. e **gravada em bruto**. Comparar bruto
contra a meta está correto; comparar H.O. contra a meta gravada faria ninguém
bater meta nunca.

**Consequência para o design:** a matemática de meta, projeção e quartil não
muda. O que muda é a unidade de **exibição**, e a meta exibida em modo H.O. é a
meta gravada convertida pela constante.

`REGRAS-DE-NEGOCIO.md` §1.4 será corrigido no mesmo trabalho: a frase induz ao
erro que este documento acabou de desfazer.

### H.O. é exclusivo da PaguePlay

Soma de `analitico_recebimentos` no mês corrente:

| Empresa | Bruto | H.O. | % |
|---|---:|---:|---:|
| pagueplay | R$ 1.036.638,78 | R$ 259.162,33 | 25,00 % |
| bookplay | R$ 1.415.043,93 | R$ 0,00 | 0,00 % |

Duas conclusões:

1. O alternador de unidade é **PaguePlay-only**. Na BookPlay ele não é
   renderizado — um botão que alterna entre um número e zero seria pior que
   nenhum botão.
2. `total_ho` vem **gravado linha a linha pelo relatório**, não derivado da
   constante — 25,00% reais contra 24,96% da constante. Por isso o percentual em
   modo H.O. fica ~0,16 ponto acima do percentual em bruto. É diferença
   verdadeira, não erro de arredondamento, e não deve ser "corrigida".

---

## 2. A unidade é um parâmetro, nunca uma segunda conta

A regra que o `PainelMetas` estabeleceu é que a matemática mora num lugar só
(`lib/projecaoMetas.ts`) porque duas cópias divergem. O alternador **não pode**
reintroduzir isso.

Portanto: nada é recalculado. `usePainelMetas` ganha um parâmetro e escolhe
**qual campo já existente** lê.

```ts
export type UnidadeValor = 'ho' | 'bruto';

interface ParametrosPainelMetas {
  // …
  /** PaguePlay: qual lado do recebimento a tela exibe. BookPlay ignora. */
  unidade?: UnidadeValor;
}
```

`agregarAnalitico` já devolve os dois lados na maior parte:
`bruto`/`ho`, `porDia[n].bruto`/`.ho`, `naoTabuladoBruto`/`naoTabuladoHO`.

Faltam dois pontos, ambos pequenos e contidos:

| Onde | Hoje | Passa a ser |
|---|---|---|
| `agregarAnalitico` → `porForma` | só `{ bruto, qtd }` | `{ bruto, ho, qtd }` |
| `diretoExtra.service` | soma `valor_recebido` | soma `valor_recebido` **e** `total_ho` |

`TotaisDiretoExtra` passa a carregar os dois lados (`direto`/`diretoHO`,
`extra`/`extraHO`, `naoTabulado`/`naoTabuladoHO`), e quem exibe escolhe. A
invariante existente — `direto + extra + naoTabulado = total do analítico no
mesmo escopo` — precisa valer nas **duas** unidades.

### Conversão da meta

```ts
// lib/unidadeValor.ts
export function metaNaUnidade(meta: number | null, unidade: UnidadeValor): number | null {
  if (meta === null) return null;
  return unidade === 'ho' ? meta * (PP_HO_PERCENTUAL / 100) : meta;
}
```

Aplica-se à meta, ao esperado até hoje, à meta diária e ao "quanto falta" —
todos derivados da meta. O recebido **não** é convertido: vem de `total_ho`,
que é dado do relatório.

---

## 3. O alternador

Componente novo, `PainelMetas/SeletorUnidade.tsx`, renderizado na faixa
"Dados Analíticos", ao lado do seletor de mês. É o lugar mais fácil de achar e
já é o cabeçalho que controla o recorte do painel.

- Padrão: **H.O.** — vale para quem nunca escolheu, e para navegador novo
- Persistência: `localStorage`, chave por id de usuário
  (`painel-metas:unidade:<perfil.id>`). Sem a chave o padrão volta a valer, e a
  escolha de uma pessoa não vaza para outra que use a mesma máquina
- Só aparece quando `tenant.isPaguePlay`

**Substitui** o alternador H.O. ⇄ Total que hoje existe só para a linha verde do
gráfico (`ChartsSection.tsx:43`). Dois alternadores de H.O. na mesma tela, um
governando um gráfico e outro governando o painel, permitiriam duas verdades
simultâneas — o mesmo defeito que o commit `de5d5da` removeu ao matar o segundo
alternador de escopo.

**Alcance:** tudo dentro do `PainelMetas` — cards, donut, evolução diária e o
banner de não tabulado.
**Fora do alcance:** `MetaProgressoHeader`, que continua em bruto.

---

## 4. O que a PaguePlay passa a ver

| Bloco | Conteúdo |
|---|---|
| Faixa de dias úteis | Sem mudança |
| Card principal | Valor da unidade ativa em destaque, com barra e % contra a meta na mesma unidade. A linha secundária mostra **a outra** unidade: em modo H.O. exibe bruto e meta bruta; em modo bruto exibe H.O. e meta em H.O. |
| Direto / Extra | `tipo_comissao` com fallback para `acordos.tipo_vinculo` |
| Projeção · esperado · diferença · quartil | Mesma `lib/projecaoMetas.ts`, na unidade escolhida |
| Donut | % da meta, com breakdown por forma (PP consolida Boleto/PIX × Cartão) |
| Evolução diária | Recebido + Agendado + meta diária, na unidade escolhida |
| Recolhível | Os 11 cards do `PPMetrics`, como "Ver agendamentos e conversão" |

### Sai de cena

- `ChartsSection` no fluxo da PaguePlay. A evolução diária do painel novo já
  traz Recebido, Agendado e meta diária no mesmo gráfico.
- Card "Projeção do mês". Ele projeta ritmo sobre dias **corridos**, enquanto o
  painel projeta contra meta e dias **úteis**. Dois números chamados "projeção"
  na mesma tela discordariam por construção — mesma decisão tomada na BookPlay.

Nenhum dos dois é apagado do repositório: deixam de ser renderizados no caminho
da PaguePlay. `ChartsSection` continua existindo enquanto houver consumidor.

---

## 5. Direto/Extra na PaguePlay tem cobertura parcial

Estado do mês corrente, medido:

| Empresa | Linhas | Com `tipo_comissao` | Tabuladas |
|---|---:|---:|---:|
| pagueplay | 1.849 | **0** | 783 (42%) |
| bookplay | 3.697 | 399 | 387 |

A migration `20260813a` acrescentou a coluna e o alias no parser, mas a
PaguePlay ainda não reimportou um relatório desde então — e o arquivo de origem
não é guardado, então linha antiga fica `NULL` para sempre.

Consequência: na PaguePlay os cards Direto/Extra caem no **caminho 2** do
serviço (`acordos.tipo_vinculo` via `acordo_id`), cobrindo 42% do mês. O resto
aparece como "sem vínculo definido", que é exatamente o que o
`BannerNaoTabulado` do painel já anuncia.

**Isto é comportamento correto, não pendência deste trabalho.** Reimportar o
relatório do mês na PaguePlay preenche `tipo_comissao` e a cobertura sobe
sozinha, sem deploy.

---

## 6. Regras da PaguePlay que o desenho preserva

- **Meta gravada em bruto.** A conversão é só de exibição; a aba Metas continua
  lendo e gravando bruto.
- **Receptivo não entra.** É BookPlay-only — o `AnalyticsPanel` já barra por
  slug, e o `usePainelMetas` nunca somou Receptivo.
- **Formas consolidadas.** PP agrupa boleto+pix contra cartão;
  `agregarAnalitico` já resolve pelo fallback de `forma_detalhe`.
- **Escopo idêntico ao do resto da tela.** Sai de `useEscopoAnalitico`: operador
  vence equipe, que vence setor. O painel não ganha filtro próprio.

---

## 7. Arquivos

**Novos**

```
src/lib/unidadeValor.ts                        # tipo, conversão, rótulos
src/lib/unidadeValor.test.ts
src/components/PainelMetas/SeletorUnidade.tsx
src/components/PainelMetas/SeletorUnidade.test.tsx
```

**Alterados**

```
src/hooks/useAnaliticoDashboard.ts             # porForma ganha `ho`
src/hooks/usePainelMetas.ts                    # parâmetro `unidade`
src/services/analitico/diretoExtra.service.ts  # soma total_ho
src/components/PainelMetas/CardsMetas.tsx      # destaque + linha secundária
src/components/PainelMetas/EvolucaoDiaria.tsx  # série na unidade escolhida
src/components/AnalyticsPanel/index.tsx        # ramo PP passa a usar PainelMetas
docs/REGRAS-DE-NEGOCIO.md                      # corrige §1.4
```

## 8. Testes

- `unidadeValor`: conversão, rótulo, ida e volta.
- `SeletorUnidade`: padrão H.O., persistência, ausência na BookPlay.
- `usePainelMetas` em modo H.O. com dados no formato da PaguePlay.
- **Concordância entre unidades:** trocar a unidade não pode mudar quem está
  acima ou abaixo do esperado, nem o quartil. O percentual pode variar na casa
  decimal (25,00% real × 24,96% da constante), e o teste fixa essa tolerância em
  vez de exigir igualdade — no espírito do `concordanciaPaineis.test.tsx`.
- Invariante `direto + extra + naoTabulado = total` verificada **nas duas**
  unidades.
- Suíte inteira (2.322 testes) e `npm run typecheck` limpos ao fim.
