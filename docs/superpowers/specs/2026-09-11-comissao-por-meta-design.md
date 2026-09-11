# Comissão por meta

**Data:** 2026-09-11
**Estado:** desenho aprovado em quatro partes, aguardando revisão desta spec
**Toca:** banco (migration nova), `services/comissao/*` (novo), `components/Comissao/*`
(novo), `pages/MetasConfig.tsx`, `components/PainelMetas/*`, `hooks/usePainelMetas.ts`,
`pages/Dashboard/Analitico/DesempenhoEquipes.tsx`, `lib/permissoes-catalogo.ts`,
`docs/REGRAS-DE-NEGOCIO.md`
**Não toca:** RH Gestão, Quartis, Desempenho Equipes além da extração do acumulado do setor

---

## O pedido

A comissão do operador passa a nascer da meta. Cada operador tem faixas — 1ª Meta,
2ª Meta, 3ª Meta… —, cada faixa tem um percentual, e a comissão é o valor da faixa
vezes o percentual:

| Faixa | Meta | % | Comissão |
|---|---|---|---|
| 1ª Meta | R$ 34.000,00 | 1,75% | R$ 595,00 |
| 2ª Meta | R$ 37.000,00 | 2,11% | R$ 780,70 |
| 3ª Meta | R$ 40.000,00 | 3,30% | R$ 1.320,00 |
| 4ª Meta | R$ 43.000,00 | 4,03% | R$ 1.732,90 |

Vale a **maior faixa atingida**; as faixas não somam. Alguns setores aumentam o
percentual quando o próprio setor bate a meta.

> **Correção de 11/09/2026.** O percentual da maior faixa atingida incide sobre o
> **valor realizado**, e não sobre o valor da meta: meta de R$ 40.000,00 a 3,30% com
> R$ 42.000,00 realizados paga R$ 1.386,00. A coluna «Comissão» da tabela acima passou
> a ser o mínimo de cada faixa. A indireta separada segue a mesma regra, sobre o
> realizado indireto. O card do Dashboard saiu: o operador abre a comissão pelo botão
> Comissão do menu lateral, e o RH Gestão sugere e preenche a comissão nas linhas de
> setores do tipo Comissão.

Três exigências moldam o desenho:

1. **A comissão é mensal.** Valores e percentuais mudam todo mês. Setembro nasce
   vazio; "Importar configuração do mês anterior" copia agosto como ponto de
   partida, e depois disso os dois meses não têm vínculo nenhum.
2. **O histórico não se mexe.** Editar setembro não altera agosto.
3. **O operador entende de relance** quanto já recebe, em que faixa está, qual
   percentual vale e quanto falta para a próxima comissão.

---

## Decisões

| # | Pergunta | Decisão |
|---|---|---|
| 1 | De onde vem o valor de cada faixa | Das metas do operador: 1ª Meta = `metas.meta_valor`; 2ª em diante = `metas.metas_extras`. A configuração de comissão guarda só percentuais e regras. |
| 2 | Empresas | BookPlay e PaguePlay. |
| 3 | Unidade na PaguePlay | H.O.: degrau = meta bruta × 24,96%, comparado com o recebido H.O. A comissão sai em H.O. |
| 4 | Nível da configuração | Padrão do setor, com exceção por equipe. |
| 5 | Direta + indireta `[PP]` | A configuração do mês escolhe `junto` ou `separado` (detalhe em [Regra de cálculo](#regra-de-cálculo)). |
| 6 | Benefício do setor | Vale na direta e na indireta. |
| 7 | Como se sabe que o setor bateu | A liderança confirma, vendo o mesmo acumulado do card de setor. |
| 8 | Trava | A mesma da meta do setor (`metas_validacoes`). A confirmação do setor não passa por ela. |
| 9 | Clone | Tudo vem do usuário original: setor, equipe, meta, configuração e trava. |
| 10 | Onde a liderança consulta | Na tela de Metas, aba Comissão. |
| 11 | Abordagem | Tabelas por competência; cálculo no navegador; nada congelado. |

### Por que as faixas vêm das metas

A tela de Metas já cadastra, por operador e por mês, a meta e os degraus em cascata
(`metas_extras`, "2ª meta, 3ª meta" da BookPlay). Guardar outra "1ª Meta" na
configuração de comissão criaria dois valores para a mesma pergunta — e o
projeto já pagou esse preço antes (`projecaoMetas.ts`, `rhPercentual.ts`). A
configuração de comissão guarda o que só ela sabe: o percentual de cada posição.

Consequência: a PaguePlay passa a ter metas extras na tela de Metas. Quartis e
Desempenho Equipes continuam ignorando os degraus; só a comissão os lê.

### Por que a liderança confirma o setor

O operador comum não enxerga o analítico do setor: a policy `analitico_select`
só libera as próprias linhas, ou tudo para quem tem `fn_user_escopo('analitico') >= 2`.
Calcular "o setor bateu" no Dashboard dele exigiria uma RPC com a regra do
acumulado do setor escrita em SQL — exclusões de origem, setor alternativo,
Contribuição Receptivo, soma por operadores da PaguePlay. Seria uma segunda
cópia de uma regra que hoje vive no card de Desempenho Equipes, e as duas
divergiriam num caso de borda com dinheiro envolvido.

A liderança já enxerga esse número. A aba Comissão mostra o acumulado calculado
pelo **mesmo código** do card, e um clique grava a confirmação. O operador vê o
benefício assim que a confirmação existe.

### Por que nada é congelado

A comissão de agosto é sempre calculada com a configuração, as metas e o
recebido de agosto. Mudar setembro não alcança agosto, e a trava protege o mês
validado. Congelar o valor no fechamento pediria decidir quem fecha e quando, e
se sobreporia ao RH Gestão, que já congela valores para pagar. Fica fora do
escopo ([Fora do escopo](#fora-do-escopo)).

---

## Modelo de dados

### `comissao_config` — uma linha por competência

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `uuid` | PK |
| `empresa_id` | `uuid` | FK `empresas`, `ON DELETE CASCADE` |
| `setor_id` | `uuid` | FK `setores`, `ON DELETE CASCADE` |
| `equipe_id` | `uuid null` | `NULL` = padrão do setor; preenchido = exceção. FK `equipes`, `ON DELETE CASCADE` |
| `ano` | `int` | `>= 2024` |
| `mes` | `int` | `1..12` |
| `modo_indireta` | `text` | `'junto'` ou `'separado'`; padrão `'junto'` |
| `pct_indireta` | `numeric(6,3) null` | `>= 0`; usado só em `separado` |
| `pct_indireta_especial` | `numeric(6,3) null` | `>= 0`; usado só com `percentual_especial` |
| `regra_setor` | `text` | `'nenhuma'`, `'percentual_especial'` ou `'multiplicador'`; padrão `'nenhuma'` |
| `multiplicador` | `numeric(6,3) null` | `> 0`; usado só com `multiplicador` |
| `setor_meta_confirmada_em` | `timestamptz null` | a confirmação da liderança |
| `setor_meta_confirmada_por` | `uuid null` | quem confirmou |
| `setor_meta_confirmada_por_nome` | `text null` | o nome no momento da confirmação |
| `atualizado_por`, `atualizado_em`, `criado_em` | | auditoria |

- `UNIQUE NULLS NOT DISTINCT (empresa_id, setor_id, equipe_id, ano, mes)` — o
  Postgres do projeto é o 17.
- `CHECK`: exceção de equipe não carrega regra do setor
  (`equipe_id IS NULL OR (regra_setor = 'nenhuma' AND multiplicador IS NULL AND setor_meta_confirmada_em IS NULL)`).
  A regra e a confirmação moram só na linha do setor.
- Índice em `(empresa_id, ano, mes)`.

### `comissao_faixas` — uma linha por faixa

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `uuid` | PK |
| `config_id` | `uuid` | FK `comissao_config`, `ON DELETE CASCADE` |
| `ordem` | `smallint` | `1..20`; 1 = 1ª Meta |
| `pct` | `numeric(6,3)` | `>= 0` |
| `pct_especial` | `numeric(6,3) null` | `>= 0`; usado só com `percentual_especial` |

- `UNIQUE (config_id, ordem)`.

### Leitura e escrita

- RLS ligada nas duas tabelas. `SELECT` para `fn_can_access_empresa(empresa_id)`,
  a mesma régua de `metas` — o operador precisa ler a configuração do próprio
  setor para ver a comissão no Dashboard.
- Nenhuma policy de escrita. Tudo passa pelas RPCs abaixo.
- As duas tabelas entram na publicação `supabase_realtime`.

### RPCs

Todas `SECURITY DEFINER`, `SET search_path TO 'public'`, execução só para
`authenticated`. Todas conferem que o registro é da empresa de quem chama (com a
mesma exceção de `super_admin` que `fn_metas_upsert` tem).

| RPC | Chave | Trava | O que faz |
|---|---|---|---|
| `fn_comissao_salvar(p_config jsonb) → uuid` | `metas_comissao_editar` | sim | Grava a configuração (padrão ou exceção) e **substitui** as faixas. Recusa exceção de equipe que não pertence ao setor, e exceção sem o padrão do setor no mesmo mês. Não mexe na confirmação. |
| `fn_comissao_importar_mes_anterior(p_empresa_id, p_setor_id, p_ano, p_mes, p_substituir boolean default false) → integer` | `metas_comissao_editar` | sim | Copia padrão e exceções do mês anterior (janeiro busca dezembro do ano anterior) como **linhas novas**, com faixas novas. Não copia a confirmação. Pula exceção de equipe que saiu do setor. Mês de destino já preenchido só é substituído com `p_substituir = true`. Devolve quantas configurações copiou. |
| `fn_comissao_excluir_excecao(p_config_id uuid) → void` | `metas_comissao_editar` | sim | Apaga a exceção de uma equipe; a equipe volta ao padrão do setor. Recusa a linha do setor. |
| `fn_comissao_confirmar_meta_setor(p_empresa_id, p_setor_id, p_ano, p_mes, p_confirmado boolean) → void` | `metas_comissao_confirmar_setor` | **não** | Grava ou limpa `setor_meta_confirmada_*` na linha do setor. Exige a linha do setor existir. |

A trava usa `fn_metas_esta_validada(empresa, setor, mes, ano)`, que já existe.
Clone não muda nada aqui: a configuração que vale para ele é a do setor e da
equipe originais, e é isso que o cálculo lê.

A confirmação ignora a trava de propósito: a meta do mês é validada no começo do
mês, e o setor bate a meta no fim dele. Travar a confirmação impediria o
benefício justamente no mês em que a meta foi levada a sério.

---

## Regra de cálculo

Módulo puro `src/services/comissao/comissao.ts`, sem React e sem fetch, com
teste próprio. Entra número, sai número.

### A configuração que vale para um operador

1. A exceção da **equipe de origem** do operador naquele mês, se existir.
2. Senão, o padrão do **setor de origem**.
3. A regra do setor (`regra_setor`, `multiplicador`, confirmação) vem sempre da
   linha do setor de origem.

"Origem" é o `perfis.setor_id` e o `perfis.equipe_id` do usuário original — a
decisão 9.

### Degraus

`degraus = [meta_valor, ...metas_extras]`, ordenados do menor para o maior.

- **BookPlay:** em bruto, contra o recebido bruto.
- **PaguePlay:** cada degrau × `PP_HO_PERCENTUAL` (24,96%), contra o recebido
  H.O. (`analitico_recebimentos.total_ho`). O recebido indireto, que vem de
  acordos, é convertido pela mesma constante.

### Faixa atual e próxima

- Uma faixa está **atingida** quando `recebido >= degrau`.
- A **faixa atual** é a maior faixa atingida que tem percentual configurado.
- A **próxima** é a primeira faixa não atingida; `falta = degrau − recebido`.
- Faixa além das configuradas (o operador tem 5ª meta e o mês tem 4 percentuais)
  aparece como "sem % neste mês" e não gera comissão.

### Percentual efetivo

| Situação | % da faixa | % da indireta |
|---|---|---|
| Setor não confirmado, ou `regra_setor = 'nenhuma'` | `pct` | `pct_indireta` |
| Confirmado + `percentual_especial` | `pct_especial ?? pct` | `pct_indireta_especial ?? pct_indireta` |
| Confirmado + `multiplicador` | `pct × multiplicador` | `pct_indireta × multiplicador` |

### Comissão

`comissão da faixa = degrau × % efetivo ÷ 100`, arredondada em centavos
(`Math.round(degrau × %) ÷ 100`).

Com o benefício ativo, o resultado traz também a comissão e o percentual
**normais** da faixa atual — é o "anterior → atual" da tela.

### Direta e indireta `[PP]`

Só se aplica a operador com meta indireta ligada (`lerMetaIndiretaDaLinha`).

- **`junto`:** 1ª Meta = `meta_valor + meta_indireta_valor`; as metas extras são
  alvos do total. O recebido é direto + indireto. Mesma leitura dos Quartis
  (`combinarMetaDupla`).
- **`separado`:** as faixas medem só a direta. A indireta vale à parte: se o
  recebido indireto alcança a meta indireta, ela soma
  `meta_indireta × % efetivo da indireta`. **Comissão total = faixa atual + indireta.**

### Sem comissão

O resultado diz o motivo em vez de mostrar R$ 0,00:

- `sem_meta` — o operador não tem meta no mês;
- `sem_config` — o mês não tem configuração para o setor dele;
- `nenhuma_faixa` — tem meta e configuração, mas ainda não atingiu a 1ª Meta.
  Neste caso a próxima faixa e o valor que falta continuam no resultado.

### Exemplos que viram teste

| Caso | Entrada | Esperado |
|---|---|---|
| Tabela do pedido | 34.000/1,75%, 37.000/2,11%, 40.000/3,30%, 43.000/4,03% | 595,00 · 780,70 · 1.320,00 · 1.732,90 |
| Maior faixa, sem soma | recebido 38.450 | atual 2ª Meta (780,70); próxima 3ª, falta 1.550,00 |
| Benefício especial | 32.000 · 2,00% → especial 2,24% | 640,00 → 716,80 |
| Multiplicador 2x, separado | direta 37.000 · 2,11%; indireta 5.000 · 1,50% | 1.561,40 + 150,00 = 1.711,40 |
| PaguePlay H.O. | meta bruta 136.217,95 · 1,75% | degrau 34.000,00 · comissão 595,00 |

---

## Tela de Metas

### Duas abas

`Metas | Comissão`, logo abaixo do cabeçalho. O navegador de mês, o seletor de
setor e a faixa de validação valem para as duas. A aba Comissão só aparece com
`metas_comissao_ver`.

```
Configurar Metas                                  ◀ Setembro/2026 ▶
[ Metas ] [ Comissão ]                    Setor: Play 4 ▾   🔒 aberta
───────────────────────────────────────────────────────────────────
Comissão de setembro ainda não configurada.
[ Importar configuração de agosto ]   ou preencha abaixo

PADRÃO DO SETOR
  Faixa     % normal   % especial*          [+ Faixa]
  1ª Meta   1,75       2,00
  2ª Meta   2,11       2,24
  3ª Meta   3,30       3,60
  4ª Meta   4,03       4,40
  Quando o setor bate a meta: ( ) nada  (•) % especial  ( ) multiplicador [2,00]×
  Direta + indireta [PP]:  (•) junto  ( ) separado → % indireta [1,50] especial [3,00]

EXCEÇÕES POR EQUIPE                               [+ Exceção]
  Equipe Matheus — faixas próprias          [editar] [voltar ao padrão]

META DO SETOR
  Acumulado R$ 812.400 de R$ 800.000 (101%)   [Confirmar meta atingida]

COMISSÃO DOS OPERADORES                    Equipe: Todas ▾
  Ana Paula      2ª Meta · 2,11% · R$ 780,70 · faltam R$ 1.550 p/ 3ª  ›
  Bruno (clone)  1ª Meta · 1,75% · R$ 525,00 · faltam R$ 2.100 p/ 2ª  ›
```

### Estados do mês

- **Migration ausente:** a aba mostra "Comissão aguardando atualização do banco".
  A aba Metas segue igual.
- **Mês sem configuração:** o formulário aparece vazio, com o convite para
  preencher ou importar. Nada é copiado sozinho.
- **Setor validado:** campos, importação e exceções ficam desativados, com o
  mesmo aviso de trava da aba Metas. Confirmar a meta do setor continua possível.

### Importar configuração do mês anterior

- O botão nomeia o mês: "Importar configuração de agosto".
- Desativado quando o mês anterior não tem configuração para o setor.
- Com o mês atual já preenchido, abre uma confirmação ("substituir o que existe
  em setembro?") e chama a RPC com `p_substituir = true`.
- Depois de importar, tudo continua editável, e setembro não guarda referência a
  agosto.

### Padrão do setor

- Tabela de faixas com `% normal`; a coluna `% especial` aparece só com essa regra.
- `+ Faixa` acrescenta a próxima ordem; cada faixa pode ser removida, mantendo ao
  menos uma.
- A regra do setor e o modo da indireta (este só na PaguePlay) ficam abaixo.
- Grava sozinho, como o resto da tela: campo de número ao perder o foco; escolha
  de opção 800 ms depois da última mexida. A unidade de gravação é a configuração
  inteira (`fn_comissao_salvar`), com o selo de estado que as linhas de meta já usam.
- Aviso quando há operador com mais metas do que faixas configuradas:
  "3 operadores têm 5ª meta sem % neste mês".

### Exceções por equipe

- `+ Exceção` escolhe uma equipe do setor e cria a exceção já preenchida com o
  padrão, para ajustar.
- A exceção tem faixas, percentuais especiais e modo da indireta próprios. A
  regra do setor não aparece nela.
- `Voltar ao padrão` apaga a exceção (`fn_comissao_excluir_excecao`), com
  confirmação.

### Meta do setor

- Aparece só quando `regra_setor <> 'nenhuma'`.
- Mostra o acumulado e a meta do setor, com a porcentagem.
- `Confirmar meta atingida` libera só com acumulado ≥ meta e com
  `metas_comissao_confirmar_setor`.
- Confirmada, mostra "Confirmado por Fulano em 28/09 14:32" e `Desfazer`.

#### O acumulado é o do card

Hoje a conta do acumulado do setor vive dentro do JSX de `DesempenhoEquipes.tsx`
(relatório carimbado ou soma dos operadores conforme `setorSomaPorUsuarios`,
mais a Contribuição Receptivo). Ela sai para uma função pura
`acumuladoDoSetor`, com teste, e passa a ser usada pelo card **e** por esta seção.
A aba Comissão busca os dados pelas mesmas funções do Painel Líder
(`buscarExclusoesSetor`, `buscarTotalPorSetor`, `buscarResumoOperadoresAnalitico`,
`buscarEquipesComOperadores`, `buscarContribuicoesReceptivo`).

### Comissão dos operadores

- A consulta da liderança: Mês → Setor → Equipe → Operador são o navegador de
  mês, o seletor de setor, o filtro de equipe e a linha.
- Cada linha: faixa atual, % efetivo, comissão atual e quanto falta para a próxima.
- Clone aparece com selo e é calculado pela configuração, meta e recebido do
  usuário original.
- O clique abre **Ver comissão** com os dados daquele operador e daquele mês.
- Meses anteriores funcionam igual, cada um com os próprios registros.

### Metas extras na PaguePlay

- Os quatro pontos presos a `isBP` em `MetasConfig.tsx` — o payload de
  `metas_extras` e o botão `+` de setor, equipe e operador — passam a valer para
  as duas empresas.
- Na PaguePlay, cada meta extra ganha o par H.O./bruto que a meta principal já
  tem. O valor gravado continua em bruto.
- Texto de ajuda na seção de operadores: "1ª Meta = meta do operador; 2ª em
  diante = metas extras. A comissão usa estas faixas."

---

## Dashboard

### Card "Comissão"

Entra na mesma grade dos cards de projeção de `CardsMetas`, depois de "Análise
por quartil", com o mesmo `MetricCard`.

```
┌ Comissão · H.O. ─────────────── ✦ setor ┐
│ R$ 978,80                               │
│ 2ª Meta · 2,24% · + indireta R$ 150,00  │
│ Próxima: R$ 1.440,00 (3ª Meta)          │
│ Faltam R$ 1.550,00                      │
│                        [ Ver comissão ] │
└─────────────────────────────────────────┘
```

O valor grande é a comissão total — faixa atual mais indireta, quando há.

- **Quando aparece:** com o Dashboard mostrando uma pessoa só
  (`modo === 'eu'` em `usePainelMetas`). Para ver a própria comissão, basta
  `dashboard_comissao`; para ver a de outro operador filtrado, `metas_comissao_ver`.
- **De onde vêm os números:** recebido, meta e direta + indireta saem do mesmo
  `usePainelMetas` que desenha os cards vizinhos. `usePainelMetas` passa a expor
  os `metas_extras` da linha que já lê. Um hook novo, `useComissaoOperador`,
  busca só a configuração do mês e a confirmação do setor.
- **PaguePlay:** a comissão é sempre em H.O., mesmo com o alternador em bruto. O
  rótulo diz "· H.O.".
- **✦ setor:** só com o benefício ativo.
- **Estados:**
  - sem configuração no mês → sem card; uma linha discreta: "Comissão de
    setembro ainda não configurada";
  - sem meta → sem card (o aviso de meta ausente já existe);
  - nenhuma faixa → valor "Nenhuma faixa ainda", apoio "1ª Meta: faltam
    R$ 2.300,00 · comissão R$ 595,00";
  - mês fechado → "Comissão do mês", e "faltou" no lugar de "faltam".
- **Atualiza sozinho:** o recebido já chega em tempo real; `comissao_config` e
  `comissao_faixas` ganham assinatura (`assinarTabela`, como a Contribuição
  Receptivo). A confirmação do líder aparece para o operador sem recarregar.

### Ver comissão

Um `Dialog` grande dentro do Dashboard — o padrão de sobreposição do projeto.

```
Comissão — Ana Paula · setembro/2026 · H.O.        Recebido R$ 38.450,00
────────────────────────────────────────────────────────────────────────
 Comissão atual        Faixa atual            Próxima comissão
 R$ 978,80             2ª Meta · 2,24%        R$ 1.440,00 · faltam R$ 1.550,00

 ✦ Meta do setor atingida — benefício ativo (% especial)
   Percentual: 2,11% → 2,24%        Comissão: R$ 780,70 → R$ 828,80

 1ª Meta ──────── 2ª Meta ════════ 3ª Meta ──────── 4ª Meta
 ✓ Atingida       ★ ATUAL          → Próxima         ○ Não atingida
 R$ 34.000,00     R$ 37.000,00     R$ 40.000,00      R$ 43.000,00
 1,75% → 2,00%    2,11% → 2,24%    3,30% → 3,60%     4,03% → 4,40%
 R$ 680,00        R$ 828,80        R$ 1.440,00       R$ 1.892,00
                                   faltam 1.550,00   faltam 4.550,00

 Meta indireta (separado): R$ 5.000,00 · 1,50% → 3,00% · R$ 150,00 ✓
 Total: R$ 978,80
────────────────────────────────────────────────────────────────────────
 Comissão = valor da meta × %. Vale a maior faixa atingida — não soma.
```

- **Progressão:** horizontal em tela larga, vertical no celular. A faixa atual
  ganha o destaque: cartão maior, borda na cor, rótulo "Comissão atual".
- **Situação de cada faixa:** ícone e texto, nunca só cor — ✓ Atingida,
  ★ Atual, → Próxima, ○ Não atingida, "sem % neste mês".
- **Linha entre as faixas:** preenchida até o recebido.
- **Faixa do benefício:**
  - confirmado → percentual e comissão "anterior → atual" da faixa atual; nas
    faixas, o percentual normal riscado ao lado do novo;
  - regra configurada e não confirmada → uma linha discreta: "Se o setor bater a
    meta: 2ª Meta passa a 2,24% (R$ 716,80)";
  - sem regra → a faixa não existe.
- **Indireta:** só no modo `separado`; o total soma as duas partes.
- **Um componente, dois lugares:** `components/Comissao/VerComissao.tsx` abre
  pelo card do Dashboard e pela linha do operador na aba Comissão da tela de Metas.
  O card mora ao lado, em `components/Comissao/CardComissao.tsx`.

---

## Permissões

Quatro chaves novas, nas duas empresas, em `permissoes-catalogo.ts` **e** em
`fn_permissoes_catalogo()` (o teste de contrato `permissoes-catalogo.sql.test.ts`
confere os dois lados). Nenhuma lista de cargo no código.

| Chave | Libera | Padrão proposto |
|---|---|---|
| `metas_comissao_ver` | Aba Comissão e a consulta dos operadores | líder, elite, gerência |
| `metas_comissao_editar` | Percentuais, regras, exceções e importação | gerência |
| `metas_comissao_confirmar_setor` | Confirmar e desfazer "meta do setor atingida" | gerência |
| `dashboard_comissao` | Card e Ver comissão no próprio Dashboard | todos os cargos |

Administrador e super_admin nascem com as quatro ligadas. Os padrões ficam
gravados em `cargos_permissoes` onde a chave ainda não existe, e o painel ajusta
depois.

---

## Migration e publicação

Arquivo `supabase/migrations/20260911190000_comissao_por_meta.sql`, na ordem:

1. `comissao_config` e `comissao_faixas`, com CHECKs, unicidade e índice;
2. RLS ligada, policy de `SELECT`, nenhuma de escrita;
3. as quatro RPCs, com `REVOKE` de `PUBLIC`/`anon` e `GRANT` para `authenticated`;
4. as duas tabelas na publicação `supabase_realtime` (guardado por
   `pg_publication_tables`, como em `contribuicao_receptivo`);
5. extensão de `fn_permissoes_catalogo()` com as quatro chaves e os padrões em
   `cargos_permissoes`, no molde de `20260911150000_numeros_lixeira.sql`;
6. bloco `DO $prova$` que falha se tabela, RLS, função ou chave não existir.

**Produção:** o arquivo é escrito e commitado. Aplicar no banco
(`vfrvvoetidtsqbbhdkmj`) só com autorização explícita, mostrando o SQL exato
antes. Aplicada pelo MCP ou pelo editor, a migration não entra em
`schema_migrations`; o commit registra isso, como nas anteriores.

**Código tolerante:** a Vercel publica no push, antes de a migration existir.
Consulta a tabela ausente devolve erro de relação, e o código trata como
"comissão indisponível" — sem card no Dashboard, aviso na aba Comissão — no mesmo
molde de `getMetasConfig` e da Contribuição Receptivo.

---

## Testes

| Arquivo | O que prova |
|---|---|
| `services/comissao/comissao.test.ts` | Os exemplos da seção de cálculo; maior faixa sem soma; próxima e falta; % especial e multiplicador na direta e na indireta; `junto` × `separado`; H.O. da PaguePlay; faixa sem %; `sem_meta`, `sem_config`, `nenhuma_faixa`; centavos. |
| `acumuladoDoSetor.test.ts` | Relatório carimbado, soma da PaguePlay, setor alternativo, Contribuição Receptivo. Os testes existentes de Desempenho Equipes seguem verdes. |
| `comissaoPorMeta.sql.test.ts` | No molde de `*.sql.test.ts`: RLS ligada; nenhuma policy de escrita; cada RPC checa a própria chave; salvar, importar e excluir checam a trava; confirmar não checa; importar insere linhas novas e não copia `setor_meta_confirmada_*`. |
| `permissoes-catalogo.sql.test.ts` | Contrato TS × SQL com as quatro chaves. |
| Componentes | Card nos quatro estados; Ver comissão com situação por texto e ícone, faixa atual destacada e indireta; aba Comissão com importar desativado sem mês anterior e com trava, e confirmar só com acumulado ≥ meta; metas extras visíveis na PaguePlay. |

Antes de cada commit: suíte inteira, typecheck e lint.

---

## Ordem de entrega

Um commit por passo, sem push:

1. `acumuladoDoSetor` extraído, sem mudança visível.
2. `comissao.ts` e testes.
3. Migration, testes SQL e chaves no catálogo TS.
4. Metas extras na PaguePlay.
5. Aba Comissão na tela de Metas.
6. Card e Ver comissão no Dashboard.
7. `REGRAS-DE-NEGOCIO.md` ganha a seção 12.4, "Comissão por meta".

Antes do push: autorização para aplicar a migration em produção.

---

## Riscos conhecidos

- **Percentuais legíveis pela empresa inteira.** Pela API, um operador consegue
  ler a configuração de outro setor — a mesma exposição que `metas` tem hoje.
- **Mês reaberto muda a comissão daquele mês.** É o comportamento esperado de
  quem reabre com motivo registrado; nada é congelado.
- **Benefício depende do clique.** Sem confirmação, o operador vê a linha "se o
  setor bater a meta…", e não o benefício ativo.
- **Reimportar o analítico muda o recebido do mês**, e a comissão acompanha.

## Fora do escopo

- Lançar a comissão no RH Gestão automaticamente. A liderança continua
  preenchendo o lançamento.
- Congelar a comissão no fechamento do mês.
- Avisar o operador quando ele sobe de faixa.
