# `supabase migration repair` — o passo a passo

> **Já foi feito em 15/09/2026**, com autorização — e não pela CLI. Este
> arquivo virou as duas coisas: o registro do que foi corrigido (e como ficou
> provado) e o roteiro para a próxima vez. Ver «O que foi feito» logo abaixo.

---

## O que foi feito, em 15/09/2026

**Resultado: 248 de 248 arquivos locais registrados. `db push` não reaplicaria
nenhum.** Antes eram 226 de 248.

A CLI não pôde ser usada — `supabase projects list` respondeu
`LegacyPlatformAuthRequiredError`, e `supabase login` abre navegador. O repair
foi feito pelo MCP, com o `INSERT` que é exatamente o que
`repair --status applied` grava: `version` e `name`, `statements` nulo. Nenhum
SQL de migration foi reexecutado, nenhuma tabela de aplicação foi tocada,
`ON CONFLICT (version) DO NOTHING` em tudo.

Foram **36 versões**, em duas levas:

| leva | quantas | o que era |
|---|---|---|
| Comercial | 14 | `20260915100000`…`20260915230000`, as Fases 1–9 |
| anteriores | 22 | `20260908150000`…`20260914220000` — Mestre 59, Números, Assistente ADM, Comissão, Tickets, Chat |

### As 22 apareceram por acaso, e é a parte que importa

A conferência depois do primeiro repair perguntou «que arquivo local o banco
ainda não conhece?» — e voltou com 22 de sessões anteriores que ninguém tinha
mapeado. A tabela do §3 do estado só cobria o Comercial.

**Nenhuma delas foi marcada no escuro.** Marcar como aplicada uma migration que
nunca rodou é o erro pior desta operação: ela não roda nunca mais, e o erro só
aparece quando alguém clica num botão que depende dela. A prova veio em duas
formas:

- **8 casaram por NOME** com uma versão carimbada pela hora — mesmo nome,
  timestamp de aplicação. É a assinatura do MCP.
- **14 não tinham par de nome**, e para essas a prova foi o OBJETO no schema,
  como manda a regra da casa: `to_regprocedure`, `to_regclass`, `pg_proc`,
  `pg_constraint`, `information_schema.columns`. As 14 voltaram `true`.

Duas ciladas nessa conferência, as duas reais:

1. **Três arquivos escrevem o SQL em minúsculas** (`create or replace function`),
   e um `grep` por `CREATE` passou direto por elas. Um agente apressado
   concluiria «não cria objeto nenhum» e marcaria sem prova.
2. **`contribuicao_receptivo_no_analitico` não cria função nova em cima**: ela
   troca um `CHECK` e acrescenta uma coluna. A primeira tentativa procurou
   colunas com nomes que eu **chutei**, e voltou `false` — o que, aceito sem
   desconfiança, teria dito que a migration não rodou. A prova certa foi ler o
   `ALTER TABLE` do arquivo: `analitico_recebimentos.contribuicao_de_setor_id`
   e o valor `contribuicao_59` dentro do `CHECK`. As duas estavam no banco.

### Os 90 registros órfãos ficaram

São versões carimbadas pela hora que duplicam um arquivo (`20260915124540` é a
Fase 1, `20260915173729` é a metade da Fase 6 aplicada em segunda chamada), mais
resíduo de sessões antigas. **Não foram apagados.** Apagar é `DELETE` no
histórico de produção, e o ganho seria cosmético: `db push` compara arquivo
local contra versão remota, e registro a mais nunca fez ele reaplicar nada.

---

## Por que isto precisa existir

*(Escrito antes do repair, e mantido no presente porque a causa continua de
pé: a próxima migration aplicada pelo MCP recria o mesmo desencontro.)*

O histórico em `supabase_migrations.schema_migrations` fica **defasado** a
cada aplicação pelo **MCP**, que carimba a versão com a **hora da aplicação**,
e não com o nome do arquivo:

```
arquivo  20260915100000_vendas_fase1.sql
gravado  20260915124540
```

Para a CLI, `20260915100000` **nunca rodou**. Um `supabase db push` hoje
reaplicaria os 14 arquivos, do começo.

Reaplicar não é neutro. A maioria é `CREATE OR REPLACE` e sobreviveria, mas
`20260915220000` (Fase 8) carrega `INSERT INTO ausencias_tipos`, `cron.schedule`
e a redefinição de `fn_permissoes_catalogo()` — e **a cadeia do catálogo se
parte em silêncio** quando os elos chegam fora de ordem (§2.5 do estado). Já
aconteceu: `tickets_excluir` sumiu do catálogo inteiro sem um erro.

---

## Antes de começar

1. **A CLI está logada?**

   ```bash
   supabase projects list
   ```

   Se pedir login, `supabase login`. Se listar o projeto `vfrvvoetidtsqbbhdkmj`,
   siga.

2. **O projeto está linkado?**

   ```bash
   supabase link --project-ref vfrvvoetidtsqbbhdkmj
   ```

3. **Leia o que o banco acha que rodou.** Este é o passo que ninguém pode
   pular, porque o comando do passo 4 é escrito *a partir* desta lista:

   ```bash
   supabase migration list
   ```

   A coluna `Local` são os arquivos; `Remote`, as versões gravadas. O que
   aparece só em `Local` é o que `db push` reaplicaria.

---

## O comando

```bash
supabase migration repair --status applied \
  20260915100000 20260915110000 20260915120000 20260915130000 \
  20260915140000 20260915150000 20260915160000 20260915170000 \
  20260915180000 20260915190000 20260915200000 20260915210000 \
  20260915220000 20260915230000
```

**O que ele faz:** grava uma linha em `supabase_migrations.schema_migrations`
para cada versão, dizendo «esta já rodou». **Não executa SQL nenhum** dos
arquivos — é só o registro.

**Quantas linhas:** 14 inserções na tabela de histórico. Nenhuma outra tabela é
tocada.

> ⚠️ **A regra que vale para toda versão desta lista:** só marque como aplicada
> a que você PROVOU que rodou. Marcar no escuro é pior do que não marcar —
> `db push` passa por cima dela para sempre, e o objeto que ela cria nunca
> existe. Em 15/09 a prova foi nome casado ou objeto no schema; ver «O que foi
> feito» no topo.

---

## As versões órfãs

```
20260915173729   vendas_fechamento_do_setor_com_portao_de_escopo
```

Ela **não tem arquivo**: é um segundo `apply_migration` cujo conteúdo foi
dobrado dentro de `20260915160000_vendas_fase6_a_conta_do_setor_fecha.sql`.

E não está sozinha — são **90** assim no histórico, quase todas o par
carimbado-pela-hora de um arquivo que também está registrado pelo nome dele.

**Decidido em 15/09: ficam.** Apagar é `DELETE` no histórico de produção, e o
ganho seria cosmético — `db push` compara arquivo local contra versão remota,
e registro a mais nunca fez ele reaplicar nada.

Se um dia alguém quiser a limpeza, o comando é este, uma versão por vez:

```bash
supabase migration repair --status reverted 20260915173729
```

**Isto não desfaz nada no banco.** `--status reverted` mexe só no registro; a
função `fn_vendas_fechamento_do_setor` continua onde está. Se ficar em dúvida,
**deixe como está**: uma linha órfã no histórico é ruído, e ruído não quebra
nada.

---

## Conferir depois

```bash
supabase migration list
```

Todo arquivo deve aparecer com `Local` **e** `Remote` preenchidos. Em 15/09,
conferido fora da CLI: **248 de 248**.

E então, e só então:

```bash
supabase db push --dry-run
```

**`--dry-run` primeiro, sempre.** Ele imprime o que faria sem fazer. A resposta
certa é *nada a aplicar*. Se ele listar arquivos, **pare** — o repair não pegou,
e rodar sem o `--dry-run` reaplicaria o que ele listou.

---

## Se algo der errado

- **`migration repair` recusa uma versão** — provavelmente ela já está gravada.
  Confira em `migration list`; se estiver lá, é só tirá-la do comando.
- **`db push --dry-run` ainda lista arquivos** — compare o nome do arquivo com
  a versão gravada. O MCP carimbou pela hora: pode haver uma versão que ninguém
  mapeou. A tabela do §3 de
  [`COMERCIAL-ESTADO-E-PENDENCIAS.md`](COMERCIAL-ESTADO-E-PENDENCIAS.md) tem o
  de-para.
- **Alguma tela do Comercial parou depois disso** — a suspeita número um é a
  cadeia do catálogo. Rode, com autorização:

  ```sql
  SELECT COUNT(*) FROM fn_permissoes_catalogo()
   WHERE chave IN ('tickets_excluir', 'editar_metas_vendas',
                   'excluir_indicacoes', 'ver_acompanhamento');
  ```

  Tem de voltar **4**. Menos que isso, a cadeia se partiu, e o conserto é
  reaplicar o elo do topo — hoje `20260915220000`.
