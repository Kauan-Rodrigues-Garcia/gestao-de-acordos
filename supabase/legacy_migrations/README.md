# Migrations legadas

Esta pasta preserva os 180 scripts anteriores à baseline oficial apenas para
auditoria histórica.

- Não execute estes arquivos.
- Não mova arquivos daqui para `supabase/migrations/`.
- Não altere o conteúdo dos scripts arquivados.
- Toda nova mudança deve nascer com `supabase migration new <nome>` e ficar na
  pasta ativa `supabase/migrations/`.

O estado reproduzível do projeto começa em
`../migrations/20260813225412_remote_schema_baseline.sql`.

## Exceção: o rollback de 2026-08-20

`20260820232302_rollback_all_changes_20260820.sql` é posterior à baseline, e não
anterior. Ele está arquivado aqui pelo mesmo motivo dos demais — não pode ser
reexecutado — mas por uma razão específica: o script exige que
`public.permissoes_backup_20260820` exista e dropa essa tabela no final, então
um `supabase db reset` abortaria nele.

É o SQL que reverteu no banco as oito migrations de 2026-08-20, pareando com o
commit `c953f04`. Está aqui para auditoria: o histórico remoto não guarda mais
esse registro.
