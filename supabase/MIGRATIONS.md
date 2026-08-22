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

Os 180 scripts anteriores foram preservados em `supabase/legacy_migrations/`
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

Resultado: 33 migrations locais, 33 no remoto, zero divergências. Nenhuma
tabela, função ou linha de dado foi alterada — o reparo mexe só em metadados.

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
`YYYYMMDDHHMMSS_nome_em_snake_case.sql`. A CI rejeita qualquer arquivo fora
desse padrão.

## Exposição pela Data API

O `config.toml` mantém a exposição automática de tabelas desativada. Toda nova
tabela ou RPC que precise ser acessada pelo frontend deve receber `GRANT`
explícito e proteção RLS adequada; criar a tabela em `public` não é suficiente.

## Validação da baseline

A baseline foi aplicada em um PostgreSQL 17.11 vazio, com apenas os papéis e
stubs padrão de Auth necessários. O resultado foi comparado ao remoto:

| Objeto | Total |
| --- | ---: |
| Tabelas | 62 |
| Views | 1 |
| Funções | 177 |
| Triggers | 79 |
| Policies | 236 |
| Índices | 216 |
| Constraints | 275 |

As definições foram comparadas por fingerprints normalizados; diferenças
puramente físicas, como numeração de colunas removidas e finais de linha, foram
desconsideradas.
