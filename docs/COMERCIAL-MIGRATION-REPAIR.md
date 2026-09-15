# `supabase migration repair` — o passo a passo

> Escrito em 15/09/2026, para ser executado por uma pessoa com a CLI logada.
> Um agente não consegue: `supabase login` abre navegador, e `db push` escreve
> em produção. O que está aqui é o roteiro, com o que conferir entre um passo e
> o outro.

---

## Por que isto precisa existir

O histórico em `supabase_migrations.schema_migrations` está **defasado**. As
migrations do Comercial foram aplicadas pelo **MCP**, que carimba a versão com
a **hora da aplicação**, e não com o nome do arquivo:

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

> ⚠️ Só inclua `20260915230000` **depois** de a migration da Fase 9 ter sido
> aplicada de verdade. Marcá-la como aplicada sem ter rodado é pior do que não
> marcar: `db push` passaria por cima dela para sempre, e
> `fn_vendas_placar_pessoas` nunca existiria.

---

## A versão órfã

```
20260915173729   vendas_fechamento_do_setor_com_portao_de_escopo
```

Ela **não tem arquivo**. É um segundo `apply_migration` cujo conteúdo foi
dobrado dentro de `20260915160000_vendas_fase6_a_conta_do_setor_fecha.sql`.

O provável certo é marcá-la revertida — o conteúdo vive na Fase 6, e deixá-la
no histórico faz `migration list` mostrar uma linha remota sem par local para
sempre:

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

Todo arquivo `20260915*` deve aparecer com `Local` **e** `Remote` preenchidos.

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
