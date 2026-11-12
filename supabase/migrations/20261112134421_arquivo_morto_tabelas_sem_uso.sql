-- ============================================================================
-- 20261112134421_arquivo_morto_tabelas_sem_uso.sql
--
-- Tabelas que nada mais usa saem do `public` para o schema `arquivo_morto`
-- (12/11/2026, auditoria geral). NADA É APAGADO: as linhas, os índices, as FKs,
-- os triggers e as policies vão junto com a tabela. É o mesmo combinado do
-- `arquivo-morto/README.md` — arquivar não apaga dado; apagar é outra decisão.
--
-- Por que um schema e não DROP: o schema `arquivo_morto` não está entre os
-- expostos pela API (PostgREST só serve `public`), então o app deixa de
-- enxergar as tabelas, e voltar atrás é um `ALTER TABLE ... SET SCHEMA public`.
-- O advisor varre todos os schemas e continua listando-as como «RLS sem
-- policy» (agora com schema `arquivo_morto`) — inofensivo: sem USAGE no schema,
-- anon e authenticated não chegam nelas.
--
-- Conferido antes (12/11): nenhuma é citada pelo código do app, por edge
-- function, por função, view, policy ou cron do banco; nenhuma recebe FK; nenhuma
-- está na publicação do realtime.
--
--   permissoes_backup_20260822_* (9) .. cópias das chaves antes da conversão de
--                                       escopo de 22/08 (16 linhas cada)
--   composicao_mes_backup_2026_08 ..... 294 linhas, cópia de agosto
--   composicao_mes_equipe_backup_2026_08  25 linhas
--   rls_policies_backup_20260930 ...... 131 linhas, policies antes da 20260930160000
--   acordos_backup_transferencia ...... 642 linhas, cópia manual (sem migration)
--                                       feita no acerto das transferências
--   ouvidoria_atendimentos ............ vazia; era da Ouvidoria arquivada em
--                                       05/09 (arquivo-morto/ouvidoria)
--   tv_midias ......................... 2 linhas; era do Modo TV 1 arquivado em
--                                       13/10 (arquivo-morto/modo-tv)
--
-- Para restaurar uma: ALTER TABLE arquivo_morto.<tabela> SET SCHEMA public;
-- (e devolver os GRANTs de anon/authenticated que o projeto usa).
--
-- Reaplicável: tabela que já saiu é pulada.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

CREATE SCHEMA IF NOT EXISTS arquivo_morto;
COMMENT ON SCHEMA arquivo_morto IS
  'Tabelas que sairam do produto. Fora da API. Nada aqui e lido pelo app. Ver supabase/migrations/20261112134421_arquivo_morto_tabelas_sem_uso.sql.';

-- Só o dono do banco entra. Nem a API nem os papéis do app.
REVOKE ALL ON SCHEMA arquivo_morto FROM PUBLIC;
REVOKE ALL ON SCHEMA arquivo_morto FROM anon, authenticated;

DO $$
DECLARE
  t TEXT;
  movidas INT := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'permissoes_backup_20260822_acordos',
    'permissoes_backup_20260822_analitico',
    'permissoes_backup_20260822_dashboard',
    'permissoes_backup_20260822_diretoria',
    'permissoes_backup_20260822_faxina',
    'permissoes_backup_20260822_lixeira',
    'permissoes_backup_20260822_painel_lider',
    'permissoes_backup_20260822_pix',
    'permissoes_backup_20260822_usuarios',
    'composicao_mes_backup_2026_08',
    'composicao_mes_equipe_backup_2026_08',
    'rls_policies_backup_20260930',
    'acordos_backup_transferencia',
    'ouvidoria_atendimentos',
    'tv_midias'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA arquivo_morto', t);
      EXECUTE format('REVOKE ALL ON arquivo_morto.%I FROM anon, authenticated', t);
      movidas := movidas + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Tabelas movidas para arquivo_morto: %', movidas;
END $$;

COMMIT;

-- Conferência (rodar depois): 15 tabelas no arquivo_morto, nenhuma no public.
--
-- SELECT count(*) FILTER (WHERE schemaname = 'arquivo_morto') AS no_arquivo,
--        count(*) FILTER (WHERE schemaname = 'public')        AS ainda_no_public
--   FROM pg_tables
--  WHERE tablename ~ '^(permissoes_backup_20260822_|composicao_mes(_equipe)?_backup_2026_08$|rls_policies_backup_20260930$|acordos_backup_transferencia$|ouvidoria_atendimentos$|tv_midias$)';
