-- ═══════════════════════════════════════════════════════════════════════════
-- Fecha os dois backups de composição de agosto, abertos para `anon`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que estava errado
--
-- `composicao_mes_backup_2026_08` e `composicao_mes_equipe_backup_2026_08`
-- estavam com RLS DESLIGADA e com `anon` segurando SELECT, INSERT, UPDATE,
-- DELETE e TRUNCATE. A chave anônima vai no bundle do front por desenho, então
-- na prática qualquer pessoa com o endereço do projeto lia a composição das
-- equipes de agosto — e podia truncar o backup.
--
-- Eram as duas ÚNICAS tabelas do schema nessa situação: as outras 115 têm RLS
-- ligada com política. O `anon` com privilégio de tabela é o padrão do Supabase
-- (`GRANT ALL ... TO anon, authenticated` por default privileges); quem protege
-- é a RLS, e nestas duas ela nunca foi ligada.
--
-- ## Por que só nestas duas
--
-- As 9 `permissoes_backup_20260822_*` nasceram de migrations, e cada uma fez
-- `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL` na mesma passagem (ver
-- `20260822135235` e irmãs). Estas duas nasceram de um script avulso rodado à
-- mão — `sql_scripts/reconstruir_composicao_2026_08_pelos_logs.sql` —, com
-- `CREATE TABLE ... AS`, que não carrega o endurecimento. A diferença é o
-- caminho: o que passa por migration foi fechado, o que passou por script
-- ficou aberto.
--
-- ## O que estas tabelas guardam (e por que NÃO são apagadas aqui)
--
-- O retrato de agosto ANTES do reparo de 01/09. O script que as criou diz, com
-- todas as letras, que «o backup FICA depois que o script termina — é por ele
-- que se desfaz isto». São o desfazer daquela reconstrução, e apagá-las é
-- decisão de quem manda, não consequência de uma correção de segurança.
--
-- ## O que esta migration muda
--
--   • Nenhuma linha de dado. Zero INSERT, UPDATE ou DELETE.
--   • Liga RLS nas duas tabelas (2 tabelas).
--   • Revoga privilégios de PUBLIC, anon e authenticated nas duas.
--
-- `service_role` e `postgres` têm concessão PRÓPRIA (conferido antes de
-- escrever: não herdam de PUBLIC), e `postgres` é o dono — nenhum dos dois é
-- afetado. O cron e o backend continuam alcançando as tabelas.
--
-- Sem política de RLS de propósito: RLS ligada sem política nega tudo, que é
-- exatamente o desejado para um backup que ninguém deve ler pelo PostgREST. É
-- o mesmo desenho das 9 `permissoes_backup_*`.
--
-- Reversível: um `GRANT` devolve o acesso, se algum dia for preciso.

ALTER TABLE public.composicao_mes_backup_2026_08 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.composicao_mes_backup_2026_08
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.composicao_mes_backup_2026_08 IS
  'Snapshot de composicao_mes (2026-08) antes da reconstrucao de 01/09/2026. '
  'E o desfazer daquele reparo. Fechado ao PostgREST na 20260907223118.';

ALTER TABLE public.composicao_mes_equipe_backup_2026_08 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.composicao_mes_equipe_backup_2026_08
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.composicao_mes_equipe_backup_2026_08 IS
  'Snapshot de composicao_mes_equipe (2026-08) antes da reconstrucao de '
  '01/09/2026. Fechado ao PostgREST na 20260907223118.';

-- ── Verificação ─────────────────────────────────────────────────────────────
--
-- Levanta exceção se a migration não fez o que promete. Vale mais falhar aqui
-- do que passar e deixar a tabela aberta.
DO $$
DECLARE
  v_abertas INT;
  v_concessoes INT;
BEGIN
  SELECT count(*) INTO v_abertas
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('composicao_mes_backup_2026_08',
                       'composicao_mes_equipe_backup_2026_08')
     AND NOT c.relrowsecurity;

  IF v_abertas > 0 THEN
    RAISE EXCEPTION 'RLS continua desligada em % tabela(s) de backup', v_abertas;
  END IF;

  SELECT count(*) INTO v_concessoes
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('composicao_mes_backup_2026_08',
                        'composicao_mes_equipe_backup_2026_08')
     AND grantee IN ('anon', 'authenticated', 'PUBLIC');

  IF v_concessoes > 0 THEN
    RAISE EXCEPTION 'anon/authenticated ainda tem % privilegio(s) nos backups', v_concessoes;
  END IF;
END;
$$;
