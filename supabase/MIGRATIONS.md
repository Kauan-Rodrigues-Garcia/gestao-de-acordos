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
