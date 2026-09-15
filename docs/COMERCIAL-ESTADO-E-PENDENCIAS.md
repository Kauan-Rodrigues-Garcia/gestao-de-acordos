# Comercial / Vendas — estado e pendências

> **Escrito para quem pega isto do zero**, humano ou agente. Fechado em
> **15/09/2026**, fim da sessão. O plano original continua em
> [`PLANO-COMERCIAL-VENDAS.md`](PLANO-COMERCIAL-VENDAS.md) — este arquivo diz
> o que daquilo virou realidade, o que mudou de ideia pelo caminho e o que
> falta, com detalhe suficiente para continuar sem reabrir a investigação.

---

## 0. Leia isto antes de tocar no banco

O Supabase deste projeto (`vfrvvoetidtsqbbhdkmj`) **é produção**, e o
`CLAUDE.md` da raiz proíbe rodar qualquer coisa contra ele — inclusive
`SELECT` — sem autorização explícita, por operação. As operações descritas aqui
já rodaram; **descrevê-las não autoriza repeti-las**.

`.mcp.json` está com `read_only=false`. `execute_sql` executa `DROP`, `DELETE`
e `ALTER` de verdade.

---

## 1. O que existe hoje, em uma tela

| | |
|---|---|
| Empresa | `COMERCIAL` — `9efd4fee-2a26-4049-b146-921a6046e54a`, slug `comercial` |
| Setor | `Vendas Bookplay` — `58b170fc-f579-4727-a917-fa1fde2c3269` |
| Perfis | **49** — 34 operadores, 11 líderes, 3 robôs, 1 desligada |
| Equipes | 3 · `PEC 2 - GRUPO PRESENCIAL` `8709e12c-af15-4bf5-97d0-4f524389c1e5` · `PEC 4 - GRUPO SEGUNDO TURNO` `053fec39-33f6-431f-ab2f-cfb7f280723f` · `PEC 5 - GRUPO HOME OFFICE` `370fc17e-2b1b-478e-b82a-2f2073cf91d0` |
| Vínculos de liderança | 8 em `equipe_lideres` (3 líderes não lideram equipe nenhuma) |
| Franquias | 70 cadastradas, **5 vinculadas** ao setor |
| Vendas | **140** projetadas, 131 na régua, **R$ 740.166,80** |
| Indicações | 0 — tabela criada, nada cadastrado |
| Metas | **0 configuradas** |

**Contas de acesso.** Senha `comercial@001` nas 45 contas de gente; e-mail
`{login}@interno.sistema`, já confirmado. As 4 restantes (3 robôs +
`lyra_oliveira`) têm `banned_until` em 2099 e senha aleatória — existem só para
o dinheiro ter dono, e ninguém entra nelas.

---

## 2. As cinco coisas que custaram caro para descobrir

Estas não estão em lugar nenhum além dos cabeçalhos das migrations. São o que
um agente novo levaria horas para redescobrir.

### 2.1 O código da franquia não é o prefixo do nome

```
6701  17-BOOKPLAY MUNDIAL - VENDA PURA 1   ← só aparece no geral de AGOSTO
7131  18-BOOKPLAY MUNDIAL - VENDA PURA 2
7601  23-BOOKPLAY MUNDIAL - VENDA PURA 4
8181  24-BOOKPLAY MUNDIAL - VENDA PURA 5 - HOME
8281  25-BOOKPLAY MUNDIAL - VENDA PURA CARTÃO
```

O `18-` é **rótulo**. O código é `7131`. Confundir os dois deixa o de-para sem
casar nenhuma linha, em silêncio.

A `6701` não aparece no geral de setembro porque as 9 linhas dela na prévia do
setor estão **todas canceladas**, e cancelada antes de confirmar nunca ganha
data de confirmação. Foi semeada à mão para a carga de agosto já encontrá-la
vinculada.

Medido nos dois arquivos do ERP: **as contas deste setor vendem somente dentro
dessas cinco.** Zero linha fora. É o que torna o recorte exato.

### 2.2 O relatório do setor é fatia EXATA do geral

Cortando em 14/09 (dia fechado): 135 NRs em comum, **0 divergências** em
situação, assinatura e valor. R$ 764.055,92 nos dois, **diferença R$ 0,00**.

As 47 do setor ausentes do geral têm explicação única: **zero confirmadas** —
35 canceladas, 12 abertas. O geral recorta por data de confirmação, e venda
cancelada antes de confirmar ou ainda aberta nunca ganha essa data.

Mesma relação que o 58 tem com o 59 na cobrança
([`analitico-2-relatorio-59`](PLANO-COMERCIAL-VENDAS.md)).

### 2.3 Líder credita a equipe que LIDERA, nunca `perfis.equipe_id`

Regra da casa, escrita em `20260909160000` e viva em
`services/equipes/equipeDoLider.ts`. Os 11 líderes do Comercial têm
`equipe_id` **nulo por desenho**.

`fn_vendas_equipe_que_credita(perfil_id)` (migration `20260915160000`) é a
terceira cópia dessa regra, e as três se citam. Lê `equipe_lideres` quando a
liderança é **única** — quem lidera três equipes não tem "a sua equipe" —, e
cai para `perfis.equipe_id` como reserva.

Quem escrever caminho novo que precise de equipe: **use essa função.** Há teste
que varre as RPCs de vendas e falha se alguma voltar a ler `p.equipe_id INTO`.

### 2.4 `plpgsql` não valida o corpo na criação

`CREATE OR REPLACE FUNCTION ... LANGUAGE plpgsql` aceita `INSERT` com 12
colunas e 11 valores. A migration aplica com sucesso, a verificação passa, e o
erro só aparece quando alguém clica.

Aconteceu nesta sessão: `fn_vendas_projetar` foi **redigitada inteira** para
mudar duas linhas, e saiu com três defeitos — aridade errada, `tipo =
'importada'` (que o CHECK recusa) e `cliente`/`criado_por` fora do INSERT.

**Regra que ficou:** para mudar duas linhas de uma função, edite as duas.
Redigitar troca um diff de 2 linhas por um de 200, e nenhuma revisão lê 200
linhas com a atenção que lê 2.

`src/services/vendas/__tests__/insertsBatem.sql.test.ts` fecha essa porta:
conta colunas e valores de todo `INSERT ... VALUES` das migrations de vendas e
confere o `tipo` do evento contra o CHECK.

### 2.5 A cadeia de `fn_permissoes_catalogo()` se parte em silêncio

Cada migration que acrescenta chave cria um `_antes_X()` que **congela** o
catálogo atual, e redefine `fn_permissoes_catalogo()` como
`_antes_X() UNION novas`.

Chegar pelo elo errado **derruba as chaves do elo pulado, sem erro nenhum**.
Já aconteceu uma vez aqui (`tickets_excluir` sumiu).

Topo atual: **`fn_permissoes_catalogo_antes_indicacoes_20260915`**
(migration `20260915200000`).

A Fase 6 **não tocou** o catálogo de propósito — não havia chave nova a pedir,
e o jeito mais seguro de não partir a cadeia é não tocá-la.

---

## 3. Migrations — o que existe e o que está mal registrado

11 arquivos no repo, **12 versões registradas**. Todas aplicadas.

| arquivo | registrado como |
|---|---|
| `20260915100000_vendas_fase1` | `20260915124540` |
| `20260915110000_vendas_fase2_lote_e_depara` | `20260915124723` |
| `20260915120000_vendas_fase3_projecao_do_geral` | `20260915124945` |
| `20260915130000_vendas_fase4_previa_do_setor` | `20260915125039` |
| `20260915140000_vendas_fase5_meta_com_duas_reguas` | `20260915141051` |
| `20260915150000_vendas_lote_importado_por_tem_fk` | `20260915160349` |
| `20260915160000_vendas_fase6_a_conta_do_setor_fecha` | `20260915173229` **e** `20260915173729` |
| `20260915170000_venda_manual_credita_a_equipe_que_lidera` | `20260915181730` |
| `20260915180000_projetar_o_insert_que_eu_redigitei_errado` | `20260915183032` |
| `20260915190000_o_relatorio_sempre_trouxe_o_cliente` | `20260915184604` |
| `20260915200000_vendas_fase7_indicacoes` | `20260915185605` |

O MCP do Supabase **carimba a versão com a hora da aplicação, não com o nome do
arquivo**. `20260915173729` (`vendas_fechamento_do_setor_com_portao_de_escopo`)
não tem arquivo próprio: é um segundo `apply_migration` cujo conteúdo foi
dobrado dentro do arquivo da Fase 6.

### ⚠️ Antes de qualquer `supabase db push`

Sem reconciliar, ele reaplica os 11 arquivos.

```bash
supabase migration repair --status applied \
  20260915100000 20260915110000 20260915120000 20260915130000 \
  20260915140000 20260915150000 20260915160000 20260915170000 \
  20260915180000 20260915190000 20260915200000
```

E decidir o que fazer com `20260915173729`, que não tem arquivo — o provável é
marcá-la `reverted`, já que o conteúdo dela vive na Fase 6.

**Não rodei.** Precisa de autorização e de alguém com a CLI logada.

---

## 4. O que foi entregue

### Fases 1–5 (sessões anteriores)

| | |
|---|---|
| **1** | `vendas`, `vendas_eventos`, `lixeira_vendas`, 11 permissões, RPCs de lançar/confirmar/excluir/restaurar. A régua (`confirmada E assinada`) mora em **colunas geradas** `conta_na_meta` / `valor_na_meta` — nenhuma consulta pode esquecê-la |
| **2** | `vendas_lotes` (retrato substituível), `vendas_relatorio`, `vendas_franquias` (de-para) |
| **3** | Projeção do geral sobre `vendas`, com dedupe entre meses e reversão |
| **4** | Prévia do setor e conciliação das três camadas |
| **5** | Meta com **duas réguas** (quantidade **ou** valor) — `metas.regua` |

### Fase 6 — a conta do setor fecha

`20260915160000`. Três coisas:

1. **`fn_vendas_projetar` era INNER JOIN em `vendas_franquias`.** Linha de
   franquia não vinculada sumia sem deixar número. Medido: **2.897 de 3.038
   linhas** caem nesse caso, R$ 12.004.091,04. Virou LEFT JOIN e a função
   devolve 5 colunas de descarte com valor.
2. **`perfis.robo`** — marcação explícita. **Não muda régua nenhuma**: a venda
   do robô é confirmada, assinada, entrou no caixa do setor e **soma**. Serve
   para separar o card e tirar o robô do placar por cabeça.
3. **`fn_vendas_fechamento_do_setor`** — cinco destinos exclusivos que somam o
   retrato, mais equipe e natureza somando a parcela do setor, mais o que está
   gravado em `vendas`. Exige escopo de setor ou mais (`plpgsql`, não `sql`,
   porque função SQL não sabe recusar).

Tela em `/vendas/fechamento`. Mostra os faróis **antes** dos números, e separa
"as parcelas não somam" (defeito de código) de "o gravado não bate" (a projeção
não rodou).

### Fase 7 — indicações

`20260915200000`. Tabela `indicacoes`, 8 permissões, escopo **próprio**, tela
em `/vendas/indicacoes` com colar em lote, ranking e gráfico de barras em CSS.

**Decisão de produto com trava técnica:** `UNIQUE (empresa_id, LOWER(BTRIM(instituicao)))`.
A mesma instituição não pode ser indicada duas vezes — sem isso o ranking
premia quem cadastrou mais rápido, não quem prospectou melhor. **Se a regra for
outra** (reindicar a cada campanha), troque o índice por `(empresa, instituicao, mês)`.

### Correções dentro da sessão

| commit | o que |
|---|---|
| `bc59e9b` | Fase 6 |
| `e40f801` | o conserto da equipe valia só para metade dos caminhos — `fn_venda_salvar` ainda lia `perfis.equipe_id` |
| `493c4d7` | três defeitos de ter redigitado a projeção |
| `232375c` | o relatório sempre trouxe o cliente, o parser é que não lia |
| `484922f` | Fase 7 |

---

## 5. A conta que tem que fechar

É a prova de que o setor sabe o que entrou nele. Medida em 15/09:

```
retrato do mês       3.038 linhas   R$ 12.747.345,04 na régua
  sem franquia       2.897          R$ 12.004.091,04
  DESTE SETOR          140          R$    740.166,80
  sem operador           1          R$      3.087,20
                     ─────          ────────────────
                     3.038          R$ 12.747.345,04   diferença R$ 0,00

gravado em vendas      140          R$    740.166,80   ← bate com «deste setor»

dentro do setor, por equipe     PEC 2 71 · PEC 5 48 · PEC 4 10 · sem equipe 9 = 138*
dentro do setor, por natureza   pessoas 135 · automação 3                    = 138*
```

\* medido antes da última carga, que subiu para 140.

`src/lib/vendasFechamento.test.ts` usa **esses números reais**, não fixtures. Se
a régua, a gaveta de destino ou a equipe que credita mudarem, o teste diz onde.

**`sem_operador` = `juliacris_morais`** — venda de 25/05 confirmada em 15/09,
R$ 3.087,20, de alguém que não está na listagem. É o caso que a gaveta existe
para mostrar: o geral traz vendas antigas cujo vendedor já não está no setor.

---

## 6. PENDENTE

### 6.1 Precisa de um clique seu (não de código)

- [ ] **Reimportar o CSV e reprojetar.** As 140 vendas estão com `cliente`
      nulo porque foram carregadas **antes** de a coluna existir. Não fiz
      backfill de propósito: na atualização, quem digitou vence, e o caminho
      normal preenche o que está vazio.
- [ ] **Importar agosto** (`Prospeccao_202608.csv`). É o único mês onde a
      franquia `6701` aparece.
- [ ] **Configurar as metas** do setor e das 3 equipes. A Fase 5 está pronta e
      vazia — `/vendas/metas`.

### 6.2 Fase 8 — feedback e ausências

Não começou. Do plano:

> `feedbacks` (operador, autor, data, texto) e `ausencias` (operador, tipo,
> período: atestado, INSS, férias, banco de horas). Tela por operador, com
> foto, filtrada por equipe e setor.

Referência em `C:\Users\multiplay\Desktop\relatórios vendas\`:
`Planilha De Feedback (1).xlsx` e `Planilha Mensal (1).xlsx`. **Não foram
analisadas em detalhe** — a análise da pasta parou nas colunas do prospecção.

Independente das outras fases. Ao criar as permissões, **chain a partir de
`fn_permissoes_catalogo_antes_indicacoes_20260915`** (ver §2.5).

Cuidado: `perfis` já tem `ferias_desde` / `ferias_ate` e `situacao='ferias'`.
Uma tabela `ausencias` que também guarde férias cria **duas verdades** sobre a
mesma coisa. Decidir qual manda antes de escrever.

### 6.3 Fase 9 — painéis e herança

Não começou. Desbloqueada agora que a projeção rodou.

> Painel Líder e Painel Diretoria adaptados · Tickets · Desafios ·
> Configurações · Usuários.

### 6.4 Dívida conhecida

- [ ] **Não existe tela para marcar alguém como robô.** A coluna
      `perfis.robo` existe; marquei os 3 por SQL. Ninguém consegue marcar o 4º.
      É pequeno e destrava o cadastro.
- [ ] **`src/lib/database.types.ts` nunca foi regenerado.** Zero tabelas de
      vendas ali — é por isso que todo serviço usa `rpcSemTipo` /
      `tabelaSemTipo` de `src/lib/supabaseSemTipo.ts`. Funciona, mas sem tipo
      de verdade. `perfis.robo` e `vendas_relatorio.cliente` também não estão.
- [ ] **`supabase migration repair`** — ver §3.
- [ ] **64 franquias em estado `novo`**, de outros setores e operações. Não é
      erro: é franquia que ninguém vinculou. Aparecem na gaveta `sem_franquia`
      do Fechamento, com valor.

### 6.5 Decisões em aberto

| pergunta | estado |
|---|---|
| `natiele` ou `natieli`? | O ERP escreve `natiele`; a listagem e o Cleber escreveram `natieli`. **Decidido: fica `natiele`**, que é o que a importação casa |
| Instituição única para sempre, ou por campanha? | Implementado **para sempre**. Trocar = mudar o índice único (§4) |
| Os robôs deveriam herdar a equipe do líder? | **Não** — ficaram sem equipe, para não inflar o número da equipe. O pedido era card separado |
| `lyra_oliveira` | Saiu da empresa. Perfil existe como `desligado` só para a venda dela ter dono |

---

## 7. Onde as coisas moram

```
supabase/migrations/20260915*.sql      as 11 migrations (cabeçalhos longos, leia-os)

src/lib/vendas.ts                      régua, gavetas, pareceLoginDeIa
src/lib/vendasMeta.ts                  progresso e ritmo do mês
src/lib/vendasFechamento.ts            as 4 igualdades que têm que fechar
src/lib/indicacoes.ts                  parse da colagem, repetidas

src/services/vendas/
  prospeccaoParser.ts                  CSV geral — formato por coluna
  prospeccaoSetorParser.ts             XLSX do setor — chave é grupo+nome
  vendas.service.ts
  importacaoVendas.service.ts
  metasVendas.service.ts
  fechamentoSetor.service.ts
  indicacoes.service.ts
  erroDoBanco.ts                       separa «tabela ausente» de «vínculo ausente»
  __tests__/vendas.sql.test.ts         contrato SQL das 7 fases
  __tests__/insertsBatem.sql.test.ts   aridade de todo INSERT

src/pages/Vendas/
  index.tsx  FormularioVenda  FilaDoLider  Importacao  Projecao
  Conciliacao  Metas  AndamentoDasMetas  FechamentoDoSetor  Indicacoes
```

**Rotas:** `/vendas` · `/vendas/importar` · `/vendas/metas` ·
`/vendas/fechamento` · `/vendas/indicacoes`.

---

## 8. Armadilhas menores, todas verificadas

- **PostgREST precisa de FOREIGN KEY para embutir.** `tabela:coluna ( ... )`
  falha com *"could not find a relationship"* sem FK — e essa frase contém
  "could not find" **e** "schema cache", que é o que fazia `erroDoBanco.ts`
  mandar aplicar uma migration já aplicada. Há teste que varre os `select` dos
  serviços e exige FK para cada coluna embutida.
- **Formato de número é POR COLUNA no CSV geral.** pt-BR (`3.816,00`) em
  `Valor_Faturamento`/`Pix`/`Cartao_*`; en (`159.0`) em
  `Valor_Parcela`/`Total_Recebido`. "1.234" vale mil ou vale um.
- **O XLSX do setor tem nomes de coluna repetidos.** `Data` aparece 5×,
  `Observação` 7×. A chave é **grupo + nome**. O parser sobreviveu ao arquivo
  mudar de 119 para 116 colunas sem uma linha de ajuste.
- **`MIN(uuid)` não existe no Postgres.** Use `(ARRAY_AGG(id))[1]`, ou
  `MIN(x::TEXT)::UUID`.
- **Cor de gráfico nunca é `hsl(var(--x))`.** As variáveis são `oklch` e o
  gráfico apaga sem erro. Por isso o gráfico de Indicações é CSS puro.
- **Um teste falha e não é desta frente:**
  `src/services/numeros/__tests__/numerosSituacoesPrazo.sql.test.ts`, por
  `core.autocrlf=true`. Pré-existente e independente.
  Suíte: **6.343 de 6.344 verdes.**
