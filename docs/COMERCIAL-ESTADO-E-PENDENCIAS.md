# Comercial / Vendas — estado e pendências

> **Escrito para quem pega isto do zero**, humano ou agente. Fechado em
> **15/09/2026** e reescrito no mesmo dia, duas vezes: com a continuação da
> Fase 7 e a Fase 8 (aplicadas em produção pelo MCP, §3) e depois com a
> **Fase 9** — painéis e herança, commit `d6ce7ee`, **código no repo e
> migration ainda NÃO aplicada** (§6.3). O plano original continua em
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

Topo atual: **`fn_permissoes_catalogo_antes_acompanhamento_20260915`**
(migration `20260915220000`, Fase 8). Chave nova encadeia a partir desta.

A Fase 6 **não tocou** o catálogo de propósito — não havia chave nova a pedir,
e o jeito mais seguro de não partir a cadeia é não tocá-la.

---

## 3. Migrations — o que existe e o que está mal registrado

14 arquivos no repo, **todos aplicados**. Das 11 primeiras há **12 versões
registradas**; as três últimas (Fases 7/8/9) não tiveram a versão conferida —
`list_migrations` também é consulta ao banco e pede o seu próprio «pode».

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
| `20260915210000_vendas_fase7_corrigir_indicacao` | aplicada 15/09 pelo MCP — versão carimbada **não conferida** |
| `20260915220000_vendas_fase8_feedback_e_ausencias` | aplicada 15/09 pelo MCP — versão carimbada **não conferida** |
| `20260915230000_vendas_fase9_placar_e_paineis` | aplicada 15/09 pelo MCP — versão carimbada **não conferida** |

As duas foram aplicadas na ordem dos nomes, e as duas terminaram o bloco de
verificação sem erro (cadeia do catálogo inteira, 14 abas, 10 chaves novas).
A versão com que o MCP as registrou não foi lida: `list_migrations` também é
consulta ao banco e pede o seu próprio «pode».

O MCP do Supabase **carimba a versão com a hora da aplicação, não com o nome do
arquivo**. `20260915173729` (`vendas_fechamento_do_setor_com_portao_de_escopo`)
não tem arquivo próprio: é um segundo `apply_migration` cujo conteúdo foi
dobrado dentro do arquivo da Fase 6.

### ⚠️ Antes de qualquer `supabase db push`

O passo a passo completo, com o que conferir entre um comando e o outro, está
em [`COMERCIAL-MIGRATION-REPAIR.md`](COMERCIAL-MIGRATION-REPAIR.md).

Sem reconciliar, ele reaplica os 13 arquivos.

```bash
supabase migration repair --status applied \
  20260915100000 20260915110000 20260915120000 20260915130000 \
  20260915140000 20260915150000 20260915160000 20260915170000 \
  20260915180000 20260915190000 20260915200000 20260915210000 \
  20260915220000 20260915230000
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

### Fase 7 — continuação: corrigir e cadastrar por outro

`20260915210000`, aplicada. A chave `editar_indicacoes` prometia
«corrigir uma indicação e cadastrar em nome de outra pessoa» e só a segunda
metade existia no banco — e nenhuma das duas na tela: o lote gravava sempre em
nome de quem estava logado.

- **`fn_indicacao_corrigir`** — instituição, gestora, telefone, data,
  observação e **quem indicou**. Setor e equipe só são recalculados quando o
  operador muda (o congelamento de `vendas` continua valendo). Nome que colide
  com outra linha volta recusado com quem e quando.
- **Tela:** seletor «em nome de» acima da lista e lápis em cada linha, os dois
  atrás de `editar_indicacoes`. Robôs e desligados ficam fora do seletor.

### Fase 8 — feedback e ausências

`20260915220000`, aplicada. Rota `/vendas/acompanhamento`, menu
«Acompanhamento».

| | |
|---|---|
| `feedbacks` | operador, autor, **`autor_nome` congelado**, data, texto (≤ 5.000) |
| `ausencias` | operador, tipo, início, fim (inclusive), meio período, observação |
| `ausencias_tipos` | 10 tipos com `abate_meta` — referência global |
| Permissões | 10: aba + 4 escopos, `ver_/registrar_/excluir_feedbacks`, `registrar_/excluir_ausencias` |
| Escopo | aba própria `acompanhamento` em `fn_abas_escopo()` — 14 abas |

**Quatro decisões, todas de 15/09/2026:**

1. **Férias: a ausência manda, `perfis` espelha.** Lançar/corrigir/excluir
   férias que cobrem hoje atualiza `perfis.situacao/ferias_desde/ferias_ate`
   na hora (`fn_ausencias_espelhar_ferias`). Férias futuras começam sozinhas às
   00:20 de SP (`ausencias-iniciar-ferias`, cinco minutos depois do
   `ferias-encerrar-vencidas` de 20260901100000, que continua fazendo o
   retorno). O espelho só desfaz o que ele pôs: reverte `perfis` apenas se as
   datas de lá forem exatamente as da ausência que saiu. ⚠️ Marcar férias pela
   tela de **Usuários** continua mexendo só em `perfis` e **não** cria ausência.
2. **Feedback é da liderança.** Operador fora de `ver_acompanhamento` e de
   `ver_feedbacks` por padrão. `ver_feedbacks` é separada da aba: quem lança
   atestado não precisa ler coaching.
3. **Alcance pela equipe de HOJE**, ao contrário de `vendas` e `indicacoes`:
   o líder que recebe um transferido lê o histórico dele desde o início. As
   tabelas não guardam setor nem equipe; `fn_acompanhamento_alcancados()` é a
   única cópia da regra (as duas policies, as quatro RPCs e a lista de pessoas).
4. **Sem desconto na meta ainda.** `abate_meta` já está gravado por tipo para a
   ligação futura — ver §6.5.

**Travas que valem registro:**

- Sobreposição de ausência para a mesma pessoa é recusada. A corrida é fechada
  com `FOR UPDATE` na linha de `perfis`, porque `EXCLUDE USING gist` exigiria
  `btree_gist`, que nenhuma migration instala.
- As RPCs perguntam o alcance com `NOT EXISTS`. `x NOT IN (conjunto com NULL)`
  dá NULL, o `IF` lê como falso e a recusa não acontece — há teste que proíbe.
- Feedback é sobre **outra** pessoa, sem data futura, e corrigido só pelo autor.
  Excluir é de gerência; ausência lançada errada, o líder exclui.
- `fn_acompanhamento_pessoas` é DEFINER e por isso escreve a trava de
  `ver_feedbacks` dentro dela: sem a chave, a contagem de feedback vem nula.

**O que a planilha tinha e ficou de fora da ausência, de propósito:** FERIADO
(é do calendário) e SAIU / TRANSFERIDO / DESPENSADO / REMANEJADA (movimentação
de cadastro). A planilha **não foi importada** — nem feedback, nem ausência.

### Fase 9 — painéis e herança

`20260915230000`, **aplicada em produção pelo MCP em 15/09/2026**, com o bloco
de verificação passando: as 10 chaves do catálogo intactas e `ausencias_tipos`
no lugar. Commits `d6ce7ee` (telas) e `072a340` (o defeito abaixo).

> **O defeito que a leitura pegou.** A função nasceu com uma subconsulta que
> expunha `setor_id_resolvido`; ao simplificar o `FROM`, a referência foi
> trocada no SELECT e **não no WHERE**. Como ela é `LANGUAGE sql`, o Postgres
> teria recusado a criação — é a diferença que §2.4 descreve. O mesmo descuido
> num corpo `plpgsql` teria aplicado com sucesso e esperado o clique de
> alguém. O teste novo não mira a digitação: exige que a MESMA expressão
> decida o setor que a tela mostra e o setor que o alcance usa.

| rota | o que responde |
|---|---|
| `/` | **Dashboard do Comercial** — era `ProdutoEmMontagem`. É o rodapé da planilha de agosto escrito uma vez: as duas réguas juntas, ritmo, ranking, destaque do dia, estados, formas de pagamento |
| `/vendas/painel-lider` | **o que o líder faz hoje** — a meta com a ausência descontada, a fila de assinatura pessoa a pessoa, e quem NÃO vendeu |
| `/vendas/painel-diretoria` | **o mês contra o anterior**, inclusive por dia útil |
| `/vendas/lixeira` | `lixeira_vendas` — existia desde a Fase 1 e nenhuma tela a chamava |
| `/vendas/desafios` | a aba do Analítico com porta própria |
| `/tickets` | agora nas duas operações |

**Os quatro números que a Fase 6 prometeu e não entregou.** Ranking por
operador com % de devolução e cancelamento, destaque do dia, vendas por estado
e formas de pagamento estavam no plano e nunca saíram dele. Moram em
`src/lib/vendasPlacar.ts`, **em memória**, sobre a lista que a RLS já recortou
— 140 vendas no mês do setor cabem na mão, e uma RPC por recorte criaria cinco
lugares onde a régua «confirmada E assinada» poderia ser esquecida. 27 testes.

**A migration tem uma função só.** `fn_vendas_placar_pessoas(empresa, mês)`
responde as duas perguntas que a lista de vendas não responde: quem é robô, e
quantos dias úteis a pessoa perdeu em ausência que abate meta.

- Alcance por `fn_vendas_alcanca` — o **mesmo da policy `vendas_select`**, e
  não `fn_acompanhamento_alcancados`. Tem de ser: esta lista existe para dar
  nome e equipe às vendas que já chegaram na tela. Mais estreito deixaria
  linhas sem cadastro (viram «Sem nome», e o robô vira gente); mais largo
  entregaria nomes de graça num painel.
- **Os robôs entram**, ao contrário de `fn_acompanhamento_pessoas`. Aquela é de
  gente a acompanhar, e robô não recebe feedback; esta é o cadastro do
  dinheiro, e o robô vendeu.
- Devolve o **número** de dias, nunca o tipo. `ver_acompanhamento` e
  `ver_feedbacks` existem porque atestado e INSS são dado de saúde, e a meta
  proporcional não precisa saber a doença de ninguém para dividir por 21. Há
  teste que varre o `RETURNS` e falha se `tipo` aparecer ali.
- Dias **úteis**, não corridos — `diasDaAusencia` responde outra pergunta
  («INSS de 30 dias é de 30 dias»); aqui a pergunta é quanto do mês de trabalho
  se perdeu. Segunda a sexta, o mesmo calendário de `diasUteisDoMes`.

**A meta proporcional.** Uma equipe de 5 com 21 dias úteis tem 105 dias de
trabalho; se dois atestados comeram 10, ela teve 95, e cobrar 100% da meta é
cobrar por um trabalho que ninguém podia fazer. O número cheio fica na tela,
**riscado ao lado do ajustado** — meta que desce sem explicação se lê como
defeito, e a primeira pessoa a notar vai perguntar se o sistema está somando
direito.

`fatorDePresenca` devolve `null`, e nunca `1`, quando não dá para saber: «não
perguntei» virando «ninguém faltou» seria uma migration não aplicada
produzindo, em silêncio, um mês de presença perfeita.

Quem conta na capacidade é **o cadastro, não quem vendeu**. A diferença
aparece em quem passou o mês inteiro de férias: pelo cadastro ela entra com 21
de capacidade e 21 de ausência, líquido zero — a resposta certa. Contando só
quem vendeu, ela sairia do denominador e os 21 dias dela seriam descontados da
capacidade dos colegas.

**O desligado que vendeu continua na lista do Painel Líder.** Seria mais
simples tirar todo desligado, mas as vendas dele somam no total lá em cima, e
uma tela que mostra um total maior do que a soma da lista abaixo é o defeito
que o Fechamento existe para tornar impossível. Ele aparece com o rótulo
«desligado · a venda continua contando».

**A caixa do robô.** Usuários → editar → «Função e lotação». Só no Comercial:
mandar `robo` da cobrança gravaria `false` em toda edição de perfil, apagando
em silêncio a marcação feita do outro lado. Atrás de `usuarios_editar_cargo`,
porque dizer que um login é automação é decidir se ele disputa o placar.

**Tickets herdado com uma correção de vocabulário.** A tela não tem palavra de
produto — chamado, fila, atendente e chat. O que tinha eram duas categorias:
«erro em acordo / tabulação» e «divergência de recebimento» ganharam
`produtos: ['cobranca']`, e o Comercial ganhou «erro em venda» e «divergência
no fechamento». O **filtro** da lista continua mostrando todas de propósito: o
formulário decide o que se pode abrir hoje, o filtro precisa alcançar o que já
foi aberto.

### Correções dentro da sessão

| commit | o que |
|---|---|
| `bc59e9b` | Fase 6 |
| `e40f801` | o conserto da equipe valia só para metade dos caminhos — `fn_venda_salvar` ainda lia `perfis.equipe_id` |
| `493c4d7` | três defeitos de ter redigitado a projeção |
| `232375c` | o relatório sempre trouxe o cliente, o parser é que não lia |
| `484922f` | Fase 7 |
| — | Fase 7 (corrigir) e Fase 8 — **sem commit** até a revisão |

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

### 6.0 Depois de aplicar as duas migrations novas

- [x] `20260915210000_vendas_fase7_corrigir_indicacao.sql` — aplicada 15/09.
- [x] `20260915220000_vendas_fase8_feedback_e_ausencias.sql` — aplicada 15/09.
- [x] **Commit** do código — 568c2f8 (Fases 7/8) e d6ce7ee (Fase 9).
- [ ] **Abrir a aba** logado como líder e como gerência: lançar uma ausência,
      registrar um feedback, corrigir uma indicação. Nada disso foi exercido
      contra o banco — só os testes estáticos do SQL.
- [ ] **`supabase migration repair`** das duas versões novas junto com as de §3.

Falta conferir se `pg_cron` agendou `ausencias-iniciar-ferias`
(`SELECT jobname, schedule FROM cron.job`) — o `DO` pula o agendamento em
silêncio quando a extensão não existe.

### 6.1 Precisa de um clique seu (não de código)

- [ ] **Reimportar o CSV e reprojetar.** As 140 vendas estão com `cliente`
      nulo porque foram carregadas **antes** de a coluna existir. Não fiz
      backfill de propósito: na atualização, quem digitou vence, e o caminho
      normal preenche o que está vazio.
- [ ] **Importar agosto** (`Prospeccao_202608.csv`). É o único mês onde a
      franquia `6701` aparece.
- [ ] **Configurar as metas** do setor e das 3 equipes. A Fase 5 está pronta e
      vazia — `/vendas/metas`.

### 6.2 Fase 8 — o que sobrou

Código entregue (§4). Falta:

- [x] **Aplicar a migration** — feito 15/09.
- [x] **Ligar ausência à meta proporcional.** Entregue na Fase 9: a conta de
      dias úteis abatidos vem de `fn_vendas_placar_pessoas`, e
      `fatorDePresenca` / `ajustarMetaPorPresenca` (`@/lib/vendasMeta`) fazem o
      desconto — com o número cheio riscado ao lado, para meta que desce não se
      ler como defeito. A leitura de `abate_meta` (§6.5) **continua a
      confirmar**: se a operação disser que falta e suspensão descontam, é um
      `UPDATE` em `ausencias_tipos` mais a lista em `src/lib/ausencias.ts`
      (há teste que compara as duas).
- [ ] **Importar o histórico da planilha**, se a operação quiser. Não foi feito:
      as abas por operador trazem autores que não são contas do sistema
      («Karina», «Priscila», «Gabrieli», «Carla») — por isso `autor_nome`
      existe e aceita texto livre, mas `autor_id` ficaria nulo. O vocabulário
      das células está no cabeçalho da migration.
- [ ] **Férias marcadas pela tela de Usuários não viram ausência.** Aceito na
      decisão; se incomodar, o conserto é a tela de Usuários chamar
      `fn_ausencia_salvar` em vez de gravar `perfis` direto.

A planilha usada foi `Downloads\Vendas\Planilha De Feedback.xlsx` desta
máquina. `Planilha Mensal.xlsx` **não** foi relida — o plano já a descrevia.

### 6.3 Fase 9 — painéis e herança

**Código entregue** em 15/09/2026, commit `d6ce7ee`. Falta:

- [x] **Aplicar `20260915230000_vendas_fase9_placar_e_paineis.sql`** — feito
      15/09, com autorização, verificação passando.
- [ ] **Ligar Desafios às vendas.** A aba abre, configura e lista participantes
      no Comercial, mas o ranking vem zerado: `fn_desafio_dados` calcula sobre
      `analitico_recebimentos`, que é a tabela da cobrança. A tela diz isso em
      cima, em vez de mostrar um pódio de zeros. Ver §6.4.
- [ ] **Ligar as chaves nos cargos do Comercial.** `ver_painel_lider`,
      `ver_painel_diretoria`, `ver_lixeira`, `ver_tickets` e
      `analitico_sub_desafios` são **reusadas** da cobrança: existem no
      catálogo, mas podem estar desligadas nos cargos desta empresa — o seed
      usa `ON CONFLICT DO NOTHING`, e empresa nova já nasceu com
      `cargos_permissoes` vazio antes. É clique em Configurações →
      Permissões, não código.

**A decisão que estrutura a fase: rota própria, chave compartilhada.**

Painel Líder, Painel Diretoria, Lixeira e Desafios existem nas duas operações.
A ROTA é própria (`/vendas/painel-lider`, `/vendas/lixeira`, …) porque a tela é
outra de verdade — `/painel-lider` desenha recebimento e quartil, e
`/admin/lixeira` restaura acordo, que é outra tabela e outra RPC. A CHAVE é a
mesma porque a pergunta que ela faz — «esta pessoa enxerga o painel da
liderança?» — é a mesma dos dois lados.

Chave nova exigiria encostar na cadeia de `fn_permissoes_catalogo()`, que
congela o catálogo a cada elo e já se partiu uma vez aqui (§2.5). O topo
continua sendo `fn_permissoes_catalogo_antes_acompanhamento_20260915`.

`menuLateral.test.ts` passou a conferir por **rota**, e não por rótulo: com
«Painel Líder» existindo nos dois produtos, a conferência por nome aprovaria
exatamente o vazamento que ela existe para impedir. A lista de telas de
cobrança sai de `NAV_ITEMS`, não escrita à mão — aba de cobrança criada amanhã
já nasce coberta.

### 6.4 Dívida conhecida

- [x] **Tela para marcar alguém como robô** — entregue na Fase 9. Caixa
      «este login é de automação» em Usuários → editar, dentro de «Função e
      lotação». Só aparece no Comercial, e atrás de `usuarios_editar_cargo`.
      Mandá-la da cobrança gravaria `robo: false` em toda edição de perfil,
      apagando em silêncio a marcação feita do outro lado. O prefixo `ia_` do
      login vira **dica em amarelo** ao lado da caixa, nunca cadastro.
- [ ] **O placar do desafio não conta venda.** `fn_desafio_dados` lê
      `analitico_recebimentos`. Ensiná-la a ler `vendas` é mudança numa função
      de produção que a cobrança usa todo dia — precisa de migration própria,
      com o caminho da cobrança saindo byte a byte igual. Ver §2.4: para mudar
      duas linhas de uma função, **edite as duas**; redigitar trocou um diff de
      2 linhas por um de 200 e saiu com três defeitos.
- [x] **`src/lib/database.types.ts` regenerado** em 15/09 (`f666ce1`). As 10
      tabelas do Comercial entraram, mais `perfis.robo`,
      `vendas_relatorio.cliente`, `metas.regua` e as RPCs das nove fases.
- [ ] **Migrar os serviços de `rpcSemTipo` para o cliente tipado.** Agora dá:
      o tipo existe. Não foi feito junto — é arquivo por arquivo, com a suíte
      verificando cada um, e misturá-lo num commit de 3.000 linhas de tipo
      geradas tornaria impossível revisar qualquer uma das duas coisas.
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
| Quem manda nas férias: `ausencias` ou `perfis`? | **Decidido: `ausencias` manda**, `perfis` espelha (§4, Fase 8) |
| Operador lê os próprios feedbacks? | **Decidido: não**, por padrão. Liga em Permissões (`ver_acompanhamento` + escopo individual + `ver_feedbacks`) |
| Ausência desconta da meta já? | **Decidido: ainda não.** Só cadastro e tela |
| Quais tipos descontam da meta? | **Leitura minha, a confirmar.** Descontam: férias, atestado, INSS, banco de horas, abono, declaração, licença. Não descontam: falta, suspensão, outros. Mudar = `UPDATE ausencias_tipos` + `TIPOS_AUSENCIA` em `src/lib/ausencias.ts` (há teste que compara os dois) |
| Declaração vale dia inteiro? | Hoje sim, salvo quem marcar meio período. Declaração de comparecimento costuma cobrir horas — confirmar |

---

## 7. Onde as coisas moram

```
supabase/migrations/20260915*.sql      as 14 migrations (cabeçalhos longos, leia-os)

src/lib/vendas.ts                      régua, gavetas, pareceLoginDeIa
src/lib/vendasMeta.ts                  progresso, ritmo e a meta proporcional à presença
src/lib/vendasPlacar.ts                ranking, estados, formas, destaque do dia, série diária
src/lib/vendasFechamento.ts            as 4 igualdades que têm que fechar
src/lib/indicacoes.ts                  parse da colagem, repetidas
src/lib/ausencias.ts                   tipos (espelho de ausencias_tipos), dias, sobreposição

src/services/vendas/
  prospeccaoParser.ts                  CSV geral — formato por coluna
  prospeccaoSetorParser.ts             XLSX do setor — chave é grupo+nome
  vendas.service.ts
  importacaoVendas.service.ts
  metasVendas.service.ts
  fechamentoSetor.service.ts
  indicacoes.service.ts                inclui corrigir e «quem pode indicar»
  acompanhamento.service.ts            pessoas, feedbacks, ausências
  placar.service.ts                    quem é robô + dias úteis abatidos no mês
  erroDoBanco.ts                       separa «tabela ausente» de «vínculo ausente»
  __tests__/vendas.sql.test.ts         contrato SQL das 9 fases
  __tests__/insertsBatem.sql.test.ts   aridade de todo INSERT

src/pages/Vendas/
  index.tsx  FormularioVenda  FilaDoLider  Importacao  Projecao
  Conciliacao  Metas  AndamentoDasMetas  FechamentoDoSetor  Indicacoes
  Acompanhamento  AcompanhamentoPessoa
  DashboardComercial  PainelLiderComercial  PainelDiretoriaComercial
  LixeiraVendas  DesafiosComercial  componentes.tsx (Bloco, Faixa, Barra…)

src/hooks/useVendasPlacar.ts           o cadastro + a presença de cada recorte
```

**Rotas:** `/` (Dashboard) · `/vendas` · `/vendas/importar` · `/vendas/metas` ·
`/vendas/fechamento` · `/vendas/indicacoes` · `/vendas/acompanhamento`.

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
- **`numerosSituacoesPrazo.sql.test.ts`** falhava por `core.autocrlf=true` na
  máquina da sessão anterior. Nesta máquina passa.
  Suíte após a Fase 9: **6.436 de 6.436 verdes**, `tsc` e `eslint` limpos.
