-- ============================================================================
-- Notificações enxutas: índice por pessoa, faxina diária e estatísticas em dia
-- ============================================================================
--
-- ## O que a auditoria de 05/10/2026 achou
--
-- `notificacoes` não tinha índice por `usuario_id`. O sino de cada pessoa
-- (`fetchNotificacoes`: `usuario_id = $1 ORDER BY criado_em DESC LIMIT n`)
-- varria a tabela inteira: 38.913 varreduras e 4,7 BILHÕES de linhas lidas em
-- cinco dias, numa tabela de 130 mil linhas que nunca tinha passado por
-- autovacuum. Era o maior consumo evitável de CPU e de memória do banco.
--
-- ## A regra nova (Cleber, 05/10/2026)
--
-- Notificação é aviso do momento — o histórico de verdade está nos logs. Fica
-- só a do DIA (fuso de São Paulo): às 00:05 o pg_cron apaga todas as de antes.
-- A limpeza das que já existem vai num script à parte, confirmado antes de
-- rodar (`supabase/sql_scripts/notificacoes_limpeza_inicial_2026_10_05.sql`).
--
-- O gatilho `fn_notificacoes_sinal` já agrupa apagamentos grandes: quem perde
-- mais de 10 notificações recebe UM aviso «recarregar», não um por linha.
--
-- ## Estatísticas
--
-- `profissionais` tem 253 mil linhas e o planejador achava que eram 142 — ela
-- e outras tabelas grandes nunca tinham sido analisadas. ANALYZE só lê.
--
-- Nenhuma linha de dado muda nesta migration. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── O índice do sino ────────────────────────────────────────────────────────
-- Tabela pequena e escrita rara: o CREATE INDEX comum leva segundos e bloqueia
-- só as escritas nela durante esse tempo.
CREATE INDEX IF NOT EXISTS notificacoes_usuario_criado
  ON public.notificacoes (usuario_id, criado_em DESC);

-- ── A faxina diária ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notificacoes_faxina()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  -- Meia-noite de hoje em São Paulo, como instante.
  v_corte  timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_quantas integer;
BEGIN
  DELETE FROM public.notificacoes WHERE criado_em < v_corte;
  GET DIAGNOSTICS v_quantas = ROW_COUNT;
  RETURN v_quantas;
END;
$function$;

COMMENT ON FUNCTION public.fn_notificacoes_faxina() IS
  'Apaga as notificações de antes de hoje (São Paulo). Roda às 00:05 pelo pg_cron. '
  'Ver 20261005190000.';

REVOKE ALL ON FUNCTION public.fn_notificacoes_faxina() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('notificacoes-faxina')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notificacoes-faxina');
  -- 03:05 UTC = 00:05 em São Paulo.
  PERFORM cron.schedule('notificacoes-faxina', '5 3 * * *', 'SELECT public.fn_notificacoes_faxina();');
END;
$$;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regclass('public.notificacoes_usuario_criado') IS NULL THEN
    RAISE EXCEPTION 'índice notificacoes_usuario_criado não criado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notificacoes-faxina' AND active) THEN
    RAISE EXCEPTION 'agenda notificacoes-faxina não ficou ativa';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_notificacoes_faxina()', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_notificacoes_faxina ficou aberta ao app';
  END IF;
END
$prova$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261005190000', 'notificacoes_enxutas')
ON CONFLICT DO NOTHING;

COMMIT;

-- Fora da transação: só lê e atualiza as estatísticas do planejador.
ANALYZE public.notificacoes;
ANALYZE public.profissionais;
ANALYZE public.logs_sistema;
ANALYZE public.diario_recebimentos;
ANALYZE public.historico_acordos;
ANALYZE public.pp_relatorio_pagamentos;
ANALYZE public.analitico_removidos;

SELECT
  to_regclass('public.notificacoes_usuario_criado') IS NOT NULL                    AS indice,
  EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notificacoes-faxina' AND active) AS faxina_agendada,
  (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'profissionais')     AS profissionais_estimadas;
