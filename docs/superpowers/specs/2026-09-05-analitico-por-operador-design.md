# Analítico — Por operador, e o fim da aba Recebimento diário

**Data:** 2026-09-05
**Estado:** aprovado, aguardando plano de implementação
**Toca:** `pages/Analitico/index.tsx`, `pages/Dashboard/Analitico/AnaliticoLider.tsx`,
`pages/Dashboard/Analitico/AnaliticoOperador.tsx`, `pages/Analitico/Diario/*`
**Não toca:** banco. Nenhuma migration, nenhuma RPC nova, nenhum SQL.

---

## O problema

A aba "Por operador" é a porta de entrada do Analítico — é ela que abre quando
alguém clica no menu. E é a única parte da tela que ficou para trás.

### 1. Ela não parece do mesmo sistema

A vizinha direta, `Formas de pagamento`, já usa o calendário em popover que o
resto da plataforma usa há meses:

```tsx
// FormasPagamento.tsx:306 — o padrão
<DatePickerField value={inicio} onChange={setInicio}
  minDate={primeiroDiaDoMes(mes)} maxDate={fim || ultimoDiaDoMes(mes)} />
```

"Por operador" usa o campo cru do navegador, em dois lugares:

```tsx
// AnaliticoLider.tsx:930 e AnaliticoOperador.tsx:161 — o que sobrou
<input type="date" value={filtro?.inicio ?? ''} className="h-6 px-1.5 text-xs …" />
```

O `<input type="date">` desenha o que cada navegador quiser. No Chrome ele é
cinza e tem um ícone que não é o do sistema; no Firefox é outro. Duas abas
irmãs, dois calendários diferentes, na mesma tela.

O resto segue a mesma linha. Onde o Pix Automático usa um tile com profundidade,
o Analítico usa uma caixa chapada:

| Peça | Pix Automático | Analítico hoje |
|---|---|---|
| Card de número | `rounded-xl border bg-gradient-to-br p-4` + ícone em caixa colorida | `<Card>` + `<CardContent className="p-4">` |
| Régua de abas | grupo segmentado, ativo com fundo elevado | `border-b-2` sublinhado |
| Seletor | `Select` shadcn `h-9 rounded-lg` | `<select>` nu do HTML |
| Valor que muda | `ValorAnimado` | texto que salta |

Nada disso é defeito isolado. Junto, dá o efeito que a liderança descreveu: a
tela é quadrada.

### 2. Ela conta a mesma coisa que a aba ao lado

Analítico e Recebimento diário desenham as mesmas quatro peças, em arquivos
diferentes, com código diferente:

| Peça | Analítico | Recebimento diário |
|---|---|---|
| Grade de cards de resumo | `AnaliticoLider.tsx:678` | `DiarioLider.tsx:468` |
| Acordeão "Por operador" | `AnaliticoLider.tsx:820` | `DiarioLider.tsx:659` |
| Aba "Sem operador" | `AnaliticoLider.tsx` | `DiarioLider.tsx` |
| Importar + limpar | `ImportarModal` | `ImportarDiarioModal` |

Duas telas, uma pergunta: **quanto cada operador recebeu?** A única diferença é
o recorte — mês de um lado, dia do outro.

E o recorte por dia já existe no Analítico: `analitico_recebimentos.data_pagamento`
é uma DATE. A tela filtra por ela hoje mesmo, dentro de cada operador expandido
(`filtrarLinhasPorData`, em `agregacaoLider.ts`).

### 3. Mas o Diário não é só cópia

Três coisas só ele sabe, e nenhuma sai do analítico:

- **`import_index`** — quantos acordos entraram na última importação do dia. O
  relatório é importado várias vezes ao dia; sem isso, ninguém sabe o que é novo.
- **`prox_contato ≤ data do pagamento`** — os acordos ignorados. O valor soma no
  total do dia e sai das listas.
- **A frescura.** O mensal é importado uma vez; o diário, toda hora. Às 14h de
  uma terça, o diário sabe da terça e o analítico não.

Apagar a aba e jogar tudo no analítico perderia as três. O plano abaixo não faz
isso.

---

## A decisão central: uma fonte por pergunta

```
"quanto entrou no mês?"  → analitico_recebimentos   (o número fechado)
"quanto entrou hoje?"    → diario_recebimentos      (o número vivo)
```

As duas tabelas ficam. O que some é a **tela repetida**: uma lista de operadores,
um jeito de ler, uma casca — alimentada por qualquer das duas.

A regra é curta o bastante para caber num rótulo: **o analítico responde pelo
mês, o diário responde pelo dia.**

### O aviso que essa regra exige

Na PaguePlay os dois relatórios são importados em momentos diferentes, então
trocar de recorte pode mostrar totais que não batem para a mesma data. Isso não
é defeito — é a diferença entre um número fechado e um vivo. Mas precisa estar
escrito na tela, não subentendido:

- recorte Mês: *Relatório mensal · importado 04/09*
- recorte Dia: *Recebimento vivo · importação nº 3 · 14h22*

Sem esse rótulo, a lente vira armadilha: dois números, nenhuma explicação, e a
liderança cobrando a diferença de quem importou.

---

## A lente

Um tipo, puro, com teste próprio:

```ts
// src/pages/Analitico/recorte.ts
export type Recorte =
  | { modo: 'mes';     mes: string }                          // '2026-09'
  | { modo: 'dia';     dia: string }                          // '2026-09-05'
  | { modo: 'periodo'; mes: string; inicio: string; fim: string };
```

Ela substitui dois controles que hoje vivem separados: o seletor de mês de
`Analitico/index.tsx:407` e o seletor de dia de `Analitico/Diario/index.tsx:53`.

Um grupo segmentado no topo — **Mês · Dia · Período** — com o navegador que o
modo pede: setas de mês, setas de dia com "Hoje", ou dois `DatePickerField`.

### O contrato que as duas fontes preenchem

```ts
// src/pages/Analitico/linhaOperador.ts
export interface LinhaOperadorPainel {
  operador_id: string;
  usuario:     string;
  nome:        string | null;
  equipeId:    string | null;
  equipeNome:  string;
  valor:       number;
  /** null quando o recorte não tem HO — o diário não traz a coluna. */
  ho:          number | null;
  pagamentos:  number;
  /** Acordos vindos na última importação. Sempre 0 fora do recorte Dia. */
  novos:       number;
  porForma:    { kind: FormaKindDiario; valor: number }[];
  ajusteManual?: number;
}
```

Dois adaptadores puros, cada um com teste:

- `deResumoAnalitico(ResumoOperadorAnalitico[], AnaliticoDashboardLinha[])`
- `deResumoDiario(ResumoOperadorDiario[])`

O segundo é quase identidade — `agregarPorOperador` (`Diario/helpers.ts:196`) já
devolve `pix`/`boleto`/`cartao` e `novos`.

O primeiro precisa das formas por operador, que a RPC do resumo não traz. Elas
vêm de `fn_analitico_dashboard_mes` via `useAnaliticoDashboard` — a mesma fonte
que `Formas de pagamento` já usa. Sem consulta nova, sem padrão novo.

Um componente de lista. Duas fontes. **É aqui que a duplicação morre** — não em
apagar dado, em apagar tela repetida.

---

## A casca visual

Cinco trocas, todas com precedente no repositório.

**1. Régua de abas.** Do sublinhado para o grupo segmentado que o alternador
"Minha visão / Visão geral" já usa três linhas acima, no mesmo cabeçalho
(`Analitico/index.tsx:354`). Hoje a tela tem dois vocabulários de aba a 40px um
do outro.

**2. Cards de número.** Um componente novo, `KpiTile.tsx`, no molde do Pix
Automático (`PixAutomatico.tsx:2141`): `rounded-xl border bg-gradient-to-br p-4`,
ícone dentro de uma caixa `rounded-xl` tingida, valor em `ValorAnimado`. Ele
nasce compartilhado — o Analítico repete essa grade em quatro lugares.

**3. Datas.** `DatePickerField` em todo lugar, com chips rápidos (Hoje · 7 dias ·
Mês todo) como em `FormasPagamento.tsx:334`.

**4. Seletores.** `Select` do shadcn, `h-9 rounded-lg`, no lugar dos três
`<select>` nus (setor, equipe, e o do diário).

**5. Cabeçalho.** Ícone em tile gradiente `w-9 h-9 rounded-xl`, como
`PixAutomatico.tsx:1903`.

Nada aqui inventa estilo. Tudo copia de uma tela que já está no ar.

---

## Por operador — visão líder

### A faixa de pulso (só no recorte Dia)

Acima da lista, uma linha com o que só o diário sabe:

```
3 novos no último relatório  ·  R$ 4.280,00 ignorados  ·  importação nº 3 · 14h22
```

É a razão de o Diário ter existido. Ela sobrevive à aba.

### A linha do operador

Sai de `Card` + `CardHeader` (`AnaliticoLider.tsx:852`) e vira uma linha
`rounded-xl`:

```
[avatar]  Bruno Lima                  ▓▓▓▓▓▓▓░░░ 34%        R$ 12.480,00
          bruno.lima  ·  ⬤Pix ⬤Boleto ⬤Cartão               18 pgto.  +3 novos
```

A barra é a fatia do operador no total da **equipe**, não da empresa — a equipe é
o grupo em que ele já está desenhado, e é a comparação que o líder faz. Ela
responde "quem carrega o grupo" antes de qualquer número ser lido.

O avatar vem de `perfis.foto_url`. A RPC do resumo não devolve foto e **não
vamos mexer no banco**: uma consulta `.in()` traz `id, foto_url` dos operadores
visíveis, uma vez por carga.

Expandido, o painel mantém a tabela — ela é o registro, e registro se lê em
linha. Ganha cabeçalho grudento, zebra, cantos `rounded-b-xl` e o filtro em
`DatePickerField`.

### Lista × mapa

Um alternador no canto da lista troca o acordeão pelo mapa de calor operador ×
dia — o `DiaDetalhado.tsx`, hoje enterrado numa sub-aba do Diário e a melhor
peça que ele tem. Não é aba nova: é a mesma pergunta, outro desenho.

**Ele muda de fonte.** Hoje lê `buscarResumoMensalDiario`; passa a ler
`useAnaliticoDashboard`. Motivo: o mapa é mensal, e pela regra acima o mês é do
analítico. Hoje o mapa e o card "Total recebido" logo acima somam de tabelas
diferentes e podem discordar sem avisar — mais uma duplicação, dessa vez de
número, não de tela.

---

## Por operador — visão operador

Os três cards centralizados (`AnaliticoOperador.tsx:186`) viram `KpiTile`.

O contador "Tabulados 4/12" perde o formato de fração solta e vira barra de
progresso dentro do tile, com a contagem por cima. Fração exige aritmética
mental; barra, não.

Duas adições:

- **No recorte Dia, um tile "Hoje"** com o que entrou desde a última importação.
  Hoje o operador só vê isso trocando de aba.
- **Com `analitico_sub_ranking`, um tile fino "Sua posição: 4º de 23"**, com o
  quanto falta para o 3º. Sai do ranking que a aba já carrega — nenhuma consulta
  a mais.

---

## O que acontece com o Recebimento diário

| Peça | Destino |
|---|---|
| A aba, no menu | **Some.** Vira o recorte Dia |
| Lista "Por operador" | **Some.** Mesma lista, alimentada pelo adaptador |
| Lista "Por equipe" | **Some.** O Analítico já agrupa por equipe |
| "Dia detalhado" | **Move** para o alternador mapa |
| "Sem operador" | **Fica mensal.** A fusão era perigosa — ver abaixo |
| Importar / Limpar dia | **Movem** para as ações do Analítico, visíveis no recorte Dia |
| Aviso "importe o mensal primeiro" (PP) | **Fica**, no recorte Dia |
| `ImportarDiarioModal`, `helpers.ts`, `services/diario/*` | **Intactos.** Só perdem a casca |

`DiarioLider.tsx` (1.197 linhas) e `DiarioOperador.tsx` (229) deixam de existir.
A lógica deles que não era casca já morava em `helpers.ts` e em
`services/diario/` — testados, e não tocados aqui.

### Por que a aba "Sem operador" NÃO ganhou a lente

Era o plano original, e ele estava errado de um jeito que só apareceu na
implementação. Os dois botões da aba são do analítico e do mês:
`removerLinhaAnalitico(id)` apaga uma linha de `analitico_recebimentos`, e
`removerOrfaosDoMes(empresaId, mes, escopo)` varre o mês inteiro dessa tabela.

Alimentar a aba com linhas de `diario_recebimentos` no recorte Dia deixaria a
tela mostrando **um dia de uma tabela** enquanto "Remover todos" apagasse **o
mês inteiro de outra**. Em produção, sem desfazer.

Os tipos também não se encaixam sem gambiarra: `codigo` não existe no diário,
`forma_pagamento` é enum de um lado e texto cru do ERP do outro, `data_pagamento`
é anulável só de um lado, e `filtrarOrfaosDoSetor` escopa por `setor_id`, que o
diário não tem.

Então a aba continua sendo do mês, e diz isso na tela quando a lente está em Dia
ou Período. `removerOrfaosDoDia` e `removerLinhaDiario` ficam no serviço, sem
chamador: são o que uma versão futura desta aba precisaria para operar no dia,
na tabela certa.

### Permissão

`analitico_sub_recebimento_diario` deixa de abrir uma aba e passa a liberar **a
lente Dia** (e a faixa de pulso). Para quem administra permissões, a chave
continua significando o mesmo: quem tem, vê o recebimento diário. Sem migração
de catálogo, sem linha nova em `permissoes-catalogo.ts`.

`importar_diario` não muda.

### Links antigos

As notificações de importação do diário apontam `?aba=diario`
(`Analitico/index.tsx:86`). O `useEffect` que lê a query passa a traduzir:
`?aba=diario` → recorte Dia na aba Analítico, no dia da notificação. Link velho
continua caindo no lugar certo.

---

## Escopo, e o risco que ele carrega

O recorte Dia e o recorte Mês hoje decidem "o que este cargo enxerga" em dois
lugares diferentes: `escopoDoDiario` (`services/diario/escopoDiario.ts`) e
`perfilIdsDoSetor` + `filtrarResumos` (`Dashboard/Analitico/agregacaoLider.ts`).

**Eles não são fundidos aqui.** Cada adaptador chama o escopo da sua fonte, como
hoje. O que muda é o número de telas que os chamam: de duas para uma.

É o ponto de maior risco da mudança — um erro aqui vaza recebimento de um setor
para o líder de outro. Duas armadilhas apareceram na implementação, e valem
registro porque nenhuma das duas é óbvia lendo o código:

**Composição vazia não é composição "sem setor".** `escopoDoDiario` decide por
`totalDeSetores` e responde `'tudo'` quando o número é `<= 1` — regra que existe
para a PaguePlay, de um setor só. Mas os mapas de composição do `AnaliticoLider`
começam vazios (`[]`/`{}`), não `null` como no `DiarioLider`, e composição vazia
conta zero setores. Sem guarda, o líder de um setor veria o dia da empresa
inteira na janela entre abrir a tela e a composição chegar. Fechado com o
sentinela `composicaoCarregada`, que segura `escopoDia` em `null` até lá.

**A prop `temPermissaoImportar` é `importar_analitico`, não `importar_diario`.**
Os botões de importar e limpar o DIA leem `temPermissao('importar_diario')`
direto no componente. Usar a prop daria a quem só tem `importar_analitico` o
poder de apagar o dia, e tiraria de quem tem `importar_diario`.

**As linhas de `useAnaliticoDashboard` NÃO chegam escopadas.** O hook documenta
o próprio alcance: operador recebe as próprias linhas, líder recebe a empresa
inteira. Na lista isso não vaza, porque `deResumoAnalitico` só consulta as
linhas de operadores que os resumos já filtrados nomeiam. Mas o mapa de calor é
montado direto das linhas, e mostraria o mês de outros setores a um líder
escopado. A peneira do mapa é o conjunto de operadores que a lista já desenha
(`resumosPorEquipe`) — a mesma régua, não uma terceira. Linhas sem
`operador_id` passam de propósito: não têm dono para escopar, e são o que
alimenta a nota de rodapé. Por isso os adaptadores são puros e testados antes de
qualquer pixel, e os testes existentes de `escopoDiario` e `agregacaoLider`
continuam valendo sem alteração.

---

## Testes

Escritos antes da tela, todos puros:

- `recorte.ts` — navegação entre modos, virada de mês, teto em "hoje"
- `linhaOperador.ts` — os dois adaptadores, incluindo `ho: null` no diário e
  `novos: 0` fora do recorte Dia
- a fatia da barra — divisão por total de equipe zero, operador único, negativo
  vindo de ajuste manual

`npm run typecheck` e `npm test` verdes antes de qualquer alegação de pronto.

## Fora de escopo

- Fundir `escopoDiario` com `agregacaoLider`
- Redesenhar Ranking, Destaques do dia e Formas de pagamento (esta já está no
  padrão novo)
- Qualquer alteração de banco
