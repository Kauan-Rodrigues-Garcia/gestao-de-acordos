# Comercial / Vendas — estado e pendências

> **Escrito para quem pega isto do zero**, humano ou agente. Fechado em
> **15/09/2026** e reescrito no mesmo dia, três vezes: com a continuação da
> Fase 7 e a Fase 8, com a **Fase 9** (painéis e herança) e, por último, com a
> **reforma do Dashboard** (§4, Fase 10) — pedida na mesma noite, depois de a
> tela da Fase 9 ser vista em uso. **As nove migrations estão aplicadas e
> registradas** (§3); a Fase 10 não tem migration. O plano original continua em
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

14 arquivos no repo, **todos aplicados e todos registrados**. O de-para abaixo
está completo: as três últimas linhas, que este arquivo dava como «versão não
conferida», foram lidas em 15/09 com autorização.

> **O repair foi feito** em 15/09 — e não só o do Comercial: a conferência
> descobriu **22 arquivos de sessões anteriores** também sem registro, e as 22
> foram provadas no schema antes de marcar. Resultado: **248 de 248** arquivos
> do repo registrados, zero que `db push` reaplicaria. Ver
> [`COMERCIAL-MIGRATION-REPAIR.md`](COMERCIAL-MIGRATION-REPAIR.md).

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
| `20260915210000_vendas_fase7_corrigir_indicacao` | `20260915195145` |
| `20260915220000_vendas_fase8_feedback_e_ausencias` | `20260915195452` |
| `20260915230000_vendas_fase9_placar_e_paineis` | `20260915213958` |

As três foram aplicadas na ordem dos nomes, e as três terminaram o bloco de
verificação sem erro (cadeia do catálogo inteira, 14 abas, as chaves novas).

O MCP do Supabase **carimba a versão com a hora da aplicação, não com o nome do
arquivo**. `20260915173729` (`vendas_fechamento_do_setor_com_portao_de_escopo`)
não tem arquivo próprio: é um segundo `apply_migration` cujo conteúdo foi
dobrado dentro do arquivo da Fase 6.

### `supabase db push` já pode rodar

**O repair foi feito em 15/09**, com autorização, e conferido: **248 de 248**
arquivos do repo registrados. `db push` não reaplicaria nenhum.

A CLI não pôde ser usada (`LegacyPlatformAuthRequiredError` — `supabase login`
abre navegador), então foi pelo MCP, com o `INSERT` que é exatamente o que
`repair --status applied` grava. **36 versões**: as 14 do Comercial e 22 de
sessões anteriores que a conferência descobriu e que ninguém tinha mapeado.

Nenhuma foi marcada no escuro — 8 casaram por nome com a versão carimbada pela
hora, e as outras 14 tiveram o objeto que criam encontrado no schema. O roteiro,
a prova de cada uma e as duas ciladas do caminho estão em
[`COMERCIAL-MIGRATION-REPAIR.md`](COMERCIAL-MIGRATION-REPAIR.md).

Os **90 registros órfãos** — versões carimbadas pela hora que duplicam um
arquivo, como `20260915173729` — **ficaram**. Apagar é `DELETE` no histórico de
produção, e `db push` compara arquivo local contra versão remota: registro a
mais nunca fez ele reaplicar nada.

> ⚠️ A causa continua de pé. Toda migration nova aplicada pelo MCP nasce com
> versão carimbada pela hora, e recria o desencontro — o repair vira rotina de
> fim de fase, não conserto de uma vez.

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

### Indicações — vários telefones por contato (18/09)

`20260918130000`, **aplicada 18/09** (MCP `execute_sql`, bloco de verificação
passou; versão ainda não registrada em `schema_migrations`). Pedido: a gestora de uma escola aponta
vários números; a primeira linha vem completa (escola, gestora, telefone) e os
outros números vêm embaixo, no mesmo contato. **Cada telefone é uma indicação**
e um ponto no ranking.

- **A chave trocou:** sai `uq_indicacoes_instituicao`; entra
  `uq_indicacoes_telefone` (dígitos do número, único na empresa, em qualquer
  escola) e `uq_indicacoes_instituicao_sem_telefone`. Sem número, a escola é o
  contato — e as RPCs a recusam se ela já tiver qualquer linha.
- **`fn_indicacao_telefone_chave`** normaliza (só dígitos, sem zero à esquerda,
  sem o 55 do país). `chaveDoTelefone` em `src/lib/indicacoes.ts` repete a
  regra, e há teste que prende as duas juntas.
- **Colar:** respeita as aspas do Excel (célula com Alt+Enter não vira várias
  escolas), herda escola/gestora/data da linha de cima quando a instituição vem
  em branco, e trata linha só de números como mais telefones do contato. Colar
  a linha inteira funciona também dentro da grade.
- **Grade por contato** (escola, gestora, data + campos de telefone) e lista
  gravada em blocos de contato.
- A migration **para** se dois registros já tiverem o mesmo número, e lista
  quais — escolher qual fica é decisão de gente.
- Sem esta migration, a tela nova funciona com o banco velho, mas o 2º número
  da mesma escola volta como «já foi indicada».

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

### Fase 10 — o Dashboard refeito (sem migration)

Pedido na noite de 15/09/2026, com a Fase 9 já no ar: *«painel líder, dashboard,
vendas mostram quase exatamente as mesmas informações… já existe um dashboard no
projeto, para BookPlay e PaguePlay — quero a mesma estética, com informações do
Comercial»*.

**Os dois defeitos eram reais e mediram-se na tela:**

1. **Estética.** O Dashboard da Fase 9 era `KpiTile` chapado, `Bloco` de borda
   fina e barra de `div`. O da cobrança tem anel de meta em recharts, gráfico
   composto, cards com barra de acento e gradiente, animação de entrada e
   número que anda até o valor novo.
2. **Repetição.** Os quatro números do topo eram **os mesmos** da aba Vendas
   (`Faturamento`, `Vendas na meta`, `Recebido`, `Devolução/cancelamento`), e o
   ranking de doze linhas era a lista do Painel Líder cortada, sem as ações.

**A regra da reforma: usar as PEÇAS do painel da cobrança, nunca copiá-las.**
`MetricCard`, `DonutChart`, `AnelProjecao`, `FaixaDiasUteis`, `MiniSparkline`,
`SkeletonCard`, `opacidadeDaBarra`, `ALTURA_CARD_PROGRESSO`, `corDaMeta`,
`BREAKDOWN_COLORS` e `containerVariants` são importados de
`@/components/AnalyticsPanel` e `@/components/PainelMetas`. Uma cópia visual
começaria idêntica e divergiria no primeiro ajuste de lá.

**O que cada tela responde agora**, que é a parte que resolve a repetição:

| tela | a pergunta |
|---|---|
| **Dashboard** | como o mês está indo, no conjunto |
| Painel Líder | o que eu faço agora — fila de assinatura, pessoa a pessoa, com as ações |
| aba Vendas | o que entrou hoje — a lista por dia |
| Fechamento | a conta fecha? |

**Trocas concretas:**

- Ranking de 12 linhas → **pódio de 3**, com barra de distância entre os
  degraus e «ver todos (N)» para o Painel Líder. A versão cortada de uma tela
  que existe inteira noutro lugar não é resumo, é repetição.
- Bloco «Automação» com parágrafo → **faixa de uma linha** (quantos robôs,
  quanto, que fração do mês).
- «Fora da meta» como fileira de etiquetas → **anel «Onde as vendas pararam»**,
  onde a fatia tem o tamanho do dinheiro. 9 pendentes e 131 na régua ocupavam o
  mesmo espaço visual antes.
- Barras de `div` do dia a dia → **`EvolucaoVendas`**: barra do dia + linha do
  acumulado **em eixo próprio** (um dia bom faz R$ 80 mil, o mês fecha em
  R$ 740 mil — no mesmo eixo a linha achata as barras) + régua tracejada na
  meta diária.

**Contas novas, em `src/lib/vendasDashboard.ts`** — nenhuma delas aparece em
outra aba, que é o ponto: `ticketMedio`, `aproveitamento`
(quanto do confirmado ficou de pé), `coberturaDeRecebimento` (faturado × o que
entrou de verdade — 6% em 15/09, e sem essa linha alguém acha que um dos dois
cards está quebrado), `serieDoMes` (preenche o dia vazio e acumula) e
`variacao`.

**As setas de tendência são de verdade.** No painel da cobrança `trend="up"`
está escrito na mão em todo card. Aqui a seta só existe quando há o mesmo
número no mês anterior — e `variacao()` devolve `null` contra base zero, senão
todo card abriria em «+100%» contra um agosto que ninguém importou.

**Sem meta, o anel abre na régua e convida a configurar.** O Comercial tem
**zero metas configuradas** (§6.1): um anel em 0% com «R$ 0,00 de R$ 0,00» se lê
como mês ruim, não como configuração faltando.

**O banco não foi tocado.** Nenhuma migration, nenhuma escrita — tudo o que a
tela mostra já vinha de `useVendas`, `fn_vendas_placar_pessoas` e
`buscarMetasDoMes`. A leitura de conferência mostrou também que a pendência de
permissões de §6.3 **já não existe**: `ver_vendas`, `ver_painel_lider`,
`ver_metas_vendas` e `ver_indicacoes` estão ligadas nos cargos do Comercial
(`operador` sem `ver_painel_lider`, que é o certo).

`src/pages/Vendas/__tests__/DashboardComercial.test.tsx` prende as decisões que
regridem sem aparecer: o pódio de três, o «ver todos» que some sem a chave, o
robô fora do pódio e o convite de meta no lugar do 0%.

> ⚠️ **Cilada do arquivo de teste.** Mockar `recharts` com um `Proxy` que
> responde a qualquer nome faz o módulo responder a `then` — e um módulo com
> `then` é um *thenable*: o `await import()` do vitest espera para sempre e a
> suíte trava **sem mensagem nenhuma**. Liste as peças.

### Fase 11 — correções de 16/09/2026 (sem migration)

Pedido em `Downloads\Vendas.docx`, quatro itens. **O banco não foi tocado.**

1. **Bolinhas da legenda cortadas** — no Comercial, na BookPlay e na
   PaguePlay. O ponto era `ring-2 ring-offset-1`, que desenha 3px FORA do
   elemento, e a lista rola por dentro (`overflow-y-auto`), o que corta também
   na horizontal. Virou `PontoDaLegenda` (`components/PainelMetas`), com o halo
   dentro da caixa. Usado em `CardMetaDonut` (cobrança) e `CardDoMes`.
2. **Menu: de 14 itens para 10**, no desenho da BookPlay. Quatro telas viraram
   aba de outra, e as rotas antigas redirecionam:

   | era item de menu | agora | chave |
   |---|---|---|
   | Metas de Vendas | Usuários › Metas (`?tab=metas`) | `ver_metas_vendas` |
   | Acompanhamento | Usuários › Acompanhamento | `ver_acompanhamento` |
   | Fechamento | Importar Vendas › Fechamento do setor | `ver_vendas` |
   | Desafios | Painel Líder › Desafios | `analitico_sub_desafios` |

   De quebra: a aba Metas de Usuários mostrava a Metas **da cobrança** dentro
   do Comercial para quem tivesse `ver_metas` — `metasComoAba` olhava só o slug
   do site, e o Comercial abre pelo site da BookPlay. Agora exige `ehCobranca`.

   ⚠️ **Quem perde o caminho:** Usuários pede cargo de liderança +
   `ver_usuarios`; Importar Vendas pede `ver_importacoes_vendas`. Um `operador`
   com `ver_metas_vendas`, ou alguém com `ver_vendas` sem a chave de
   importação, deixa de alcançar Metas ou Fechamento. É o mesmo recorte da
   BookPlay; se incomodar, liga-se a chave da tela de destino.
3. **Painel Líder** refeito sobre o esqueleto de `pages/PainelLider.tsx`:
   navegador de mês, abas sublinhadas (Desempenho Equipes · Pessoas · Gráfico
   de vendas · Desafios), um recorte de equipe (`FiltrosEscopo`) e o
   **`CardEquipe` da cobrança** — o mesmo componente, que ganhou a prop
   `formatar` para escrever «12 vendas» quando a régua é quantidade. A aba
   Pessoas é o lugar dos Quartis: fila de assinatura no aviso âmbar do alto,
   tabela por pessoa, distribuição por gaveta ao lado.
4. **Painel Diretoria** refeito sobre `pages/PainelDiretoria`: cabeçalho
   executivo, abas Visão geral · Setores e equipes · Por pessoa, e a regra do
   **mesmo corte** — o mês anterior é medido até o mesmo dia
   (`FiltroDePeriodo`, extraído de `DiretoriaVisaoGeral` para as duas telas
   usarem). Projeção e quartil dos cards usam a régua da meta, com a ausência
   descontada e `QUARTIS_PADRAO`.

`equipeDaVenda` saiu de dentro de `placarPorEquipe` para `vendasPlacar.ts`:
os dois painéis recortam por equipe com a mesma regra do placar.

Testes: `src/pages/Vendas/__tests__/PaineisComercial.test.tsx` (9) e
`menuLateral.test.ts` («o Comercial não tem item próprio para o que virou aba
interna»). **Não foi visto no navegador** — abrir exige sessão no banco de
produção.

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
- [x] **`supabase migration repair`** — feito 15/09, e alcançou 36 versões (as 14 do Comercial + 22 anteriores). Ver §3.

- [x] `20260918130000_indicacoes_varios_telefones_por_contato.sql` — aplicada 18/09.
- [ ] Registrar a versão `20260918130000` em `schema_migrations`, senão
      `db push` a reaplica.

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
- [x] **Ligar as chaves nos cargos do Comercial.** Conferido no banco em
      15/09/2026 (leitura autorizada, na sessão do Dashboard): **já estão
      ligadas**. `ver_vendas`, `ver_painel_lider`, `ver_metas_vendas` e
      `ver_indicacoes` valem `true` em `administrador`, `diretoria`, `elite`,
      `gerencia`, `lider` e `super_admin`; `operador` tem tudo menos
      `ver_painel_lider`, que é o recorte certo. `assistente_adm` e
      `ouvidoria` estão fora do Comercial por desenho. O medo era o
      `ON CONFLICT DO NOTHING` do seed — ele não mordeu aqui.

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
- [x] **`supabase migration repair`** — feito 15/09. Ver §3 e [`COMERCIAL-MIGRATION-REPAIR.md`](COMERCIAL-MIGRATION-REPAIR.md).
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
src/lib/vendasDashboard.ts             ticket médio, aproveitamento, cobertura, acumulado, variação
src/lib/vendasFechamento.ts            as 4 igualdades que têm que fechar
src/lib/indicacoes.ts                  parse da colagem (aspas do Excel, contato com vários telefones), repetidas
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
  ImportarVendas                       Importação + Fechamento em abas (Fase 11)

src/pages/Vendas/dashboard/            só a Fase 10 — nada aqui calcula
  CardsDoMes.tsx                       a grade de MetricCard
  CardDoMes.tsx                        o anel de 3 vistas (meta / régua / formas)
  EvolucaoVendas.tsx                   barra do dia + acumulado + meta diária
  ComposicaoDoMes.tsx                  pódio, equipes, estados, faixa da automação

src/hooks/useVendasPlacar.ts           o cadastro + a presença de cada recorte
src/hooks/useVendasMesAnterior.ts      só o resumo do mês passado, para as setas
```

**Rotas:** `/` (Dashboard) · `/vendas` · `/vendas/importar` (`?tab=fechamento`) ·
`/vendas/indicacoes` · `/vendas/painel-lider` (`?tab=desafios`) ·
`/vendas/painel-diretoria` · `/vendas/lixeira` · `/admin/usuarios`
(`?tab=metas`, `?tab=acompanhamento`). `/vendas/metas`, `/vendas/fechamento`,
`/vendas/acompanhamento` e `/vendas/desafios` só redirecionam (Fase 11).

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
  Suíte após a Fase 10: **6.465 de 6.465 verdes** em 379 arquivos, `tsc`,
  `eslint` e `npm run build` limpos.
