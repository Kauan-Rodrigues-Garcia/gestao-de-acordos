# Banco e migrations

O schema remoto de referência é o projeto Supabase `vfrvvoetidtsqbbhdkmj`
(PostgreSQL 17). A pasta executável `supabase/migrations/` começa em uma única
baseline oficial:

- `20260813225412_remote_schema_baseline.sql`

Essa baseline é um snapshot **somente do schema `public`**, extraído depois das
correções P1 de 2026-08-13. Ela inclui as extensões `uuid-ossp` e `pg_trgm`,
tabelas, tipos, funções, views, índices, constraints, triggers, políticas RLS e
permissões existentes no remoto naquela data. Dados de produção não fazem parte
do arquivo.

## Histórico legado

Os 181 scripts anteriores foram preservados em `supabase/legacy_migrations/`
apenas para auditoria. Eles usam convenções antigas de nome, têm sobreposição
com objetos já presentes em produção e **não podem ser copiados de volta para
`supabase/migrations/`, passados à CLI ou reaplicados**.

O histórico remoto da CLI foi reconciliado para considerar a baseline já
aplicada. Isso altera somente os metadados de migrations; não reaplica a
baseline nem modifica tabelas ou dados de produção.

## Reconciliação de 2026-08-22

O histórico remoto tinha divergido da pasta ativa: das 33 migrations do repo,
apenas 3 constavam no banco. As 30 de 15/08 a 19/08 haviam sido aplicadas por
fora da CLI (SQL Editor / MCP), então o schema estava lá mas sem registro em
`supabase_migrations.schema_migrations`. Um `supabase db push` teria tentado
reaplicar as 30.

Antes do reparo foi verificado que as 11 tabelas e 53 funções criadas por essas
30 migrations existiam no remoto — todas existiam. Só então elas foram marcadas
com `supabase migration repair --status applied`.

No sentido inverso, o banco guardava 5 registros de 20/08 sem arquivo
correspondente: as 4 migrations daquele dia mais o `rollback_all_changes_20260820`
que as desfez. Como o commit `c953f04` removeu os arquivos do repo e o rollback
já havia revertido os efeitos no banco, os 5 foram marcados com
`--status reverted`. O SQL do rollback foi preservado em
`legacy_migrations/20260820232302_rollback_all_changes_20260820.sql`; ele não
entra na pasta ativa porque não é reexecutável e quebraria o `db reset`.

Resultado, **naquela data**: 33 migrations locais, 33 no remoto, zero
divergências. Nenhuma tabela, função ou linha de dado foi alterada — o reparo
mexe só em metadados.

## Reconciliação de 2026-09-07

A divergência voltou, e maior: **143 arquivos no repo, 117 registros no banco**,
com 82 arquivos sem registro e 56 registros sem arquivo. Um `supabase db push`
teria tentado reaplicar 82 migrations em produção.

### Por que voltou

Duas causas, e nenhuma é "esqueceram de rodar":

1. **Timestamp inventado à mão.** O fluxo abaixo manda usar
   `supabase migration new`, que gera o timestamp. Boa parte dos arquivos
   recebeu número redondo escrito à mão, e 36 deles têm **hora que não existe**
   — `20260904700000` é "hora 70". Quando a mesma migration foi aplicada pela
   CLI, ela entrou no banco com o timestamp real: a mesma mudança passou a ter
   duas identidades, uma no arquivo e outra no registro.

2. **Migration dividida ou renomeada na aplicação.** `chat_grupos_e_monitor`
   é um arquivo no repo e virou dois registros no banco
   (`_1_schema_e_policies` e `_2_rpcs_lista_catalogo`).

### O que foi conferido antes de reparar

Objeto a objeto, como manda a seção «Histórico legado» — não por nome de
migration. Dos 82 arquivos sem registro foram extraídas as tabelas, funções,
índices, políticas, gatilhos e colunas que cada um cria, e a existência de cada
uma foi checada no catálogo (`to_regclass`, `pg_proc`, `pg_policy`,
`pg_trigger`, `information_schema.columns`).

**387 objetos conferidos, zero ausentes.** As duas únicas ausências aparentes
tinham explicação:

- `analitico_ajustes_solicitacoes` e seus 2 índices e 3 políticas: a tabela é
  criada pela `20260823150000` e **derrubada de propósito** pela
  `20260825120000_ajuste_card_por_operador.sql`. Ausência é o estado correto.
- 8 políticas de anexo (`chat_anexo_*`, `chat_grupo_foto_*`, `tv_midia_*`):
  existem, mas em `storage.objects`, não em `public`. Erro da consulta, não do
  banco — ao conferir política, não filtre por `schemaname='public'`.

### O reparo

`INSERT` de 82 linhas em `supabase_migrations.schema_migrations` (só `version`
e `name`, `statements` nulo — é o que `supabase migration repair --status
applied` grava). Nenhuma linha de dado, nenhum objeto de schema tocado.

Resultado: **143 arquivos, 199 registros, 0 arquivos sem registro.** É esse
zero que importa: `db push` só reaplica arquivo que não tem registro.

### Por que os arquivos NÃO foram renomeados

Renomear os 36 de timestamp inventado para o timestamp do banco pareceria mais
limpo, e é armadilha: **vários timestamps inválidos já SÃO os registrados**.
`20260818240000` ("hora 24"), `20260903500000` e `20260903600000` estão no
banco com esse número. Renomear quebraria correspondências que hoje funcionam.

Os 56 registros sem arquivo ficam como estão. São o outro lado dos gêmeos, e
`db push` não olha para eles — ele reaplica arquivo sem registro, não o
contrário.

### O que continua em aberto

A CI valida o nome da migration com `^[0-9]{14}_[a-z0-9_]+\.sql$`, que conta 14
dígitos e não confere se formam uma data — foi assim que "hora 70" passou.
Endurecer isso exige decidir o que fazer com os 36 arquivos já commitados que
reprovariam.

## Fluxo obrigatório daqui para a frente

1. Crie cada arquivo com `supabase migration new <nome_descritivo>`; nunca
   invente manualmente o timestamp.
2. Escreva uma mudança pequena e reversível por migration.
3. Revise RLS, permissões, funções privilegiadas e os advisors do Supabase.
4. Execute `supabase db reset` antes do commit para reconstruir um banco local
   do zero com toda a cadeia ativa.
5. Confira `supabase migration list` antes de `supabase db push`.
6. Regenere `database.types.ts` quando o schema público mudar.

Os nomes ativos devem obedecer a
`YYYYMMDDHHMMSS_nome_em_snake_case.sql`. A CI confere a FORMA — 14 dígitos,
underscore, snake_case — e **não** confere se os 14 dígitos são uma data
válida. É por isso que 36 arquivos com hora inexistente estão commitados. Ler
esta linha como "a CI garante o timestamp" foi parte do que produziu a
divergência de 07/09.

## Exposição pela Data API

O `config.toml` mantém a exposição automática de tabelas desativada. Toda nova
tabela ou RPC que precise ser acessada pelo frontend deve receber `GRANT`
explícito e proteção RLS adequada; criar a tabela em `public` não é suficiente.

## Validação da baseline

A baseline foi aplicada em um PostgreSQL 17.11 vazio, com apenas os papéis e
stubs padrão de Auth necessários. O resultado foi comparado ao remoto:

| Objeto | Na baseline (2026-08-13) | No remoto hoje (2026-09-07) |
| --- | ---: | ---: |
| Tabelas | 62 | 124 |
| Views | 1 | 1 |
| Funções | 177 | 379 |
| Triggers | 79 | 112 |
| Policies | 236 | 316 |
| Índices | 216 | 359 |
| Constraints | 275 | — |

A coluna da direita é o schema de hoje, não a baseline. Ela existe porque a
tabela sozinha já foi lida como «o que a baseline reproduz», e a distância
entre as duas colunas é justamente o que as 142 migrations posteriores fizeram.

As definições foram comparadas por fingerprints normalizados; diferenças
puramente físicas, como numeração de colunas removidas e finais de linha, foram
desconsideradas.
