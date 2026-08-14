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
