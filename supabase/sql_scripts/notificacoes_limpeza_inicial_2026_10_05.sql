-- ============================================================================
-- Limpeza inicial das notificações — APAGA PARA SEMPRE (Cleber, 05/10/2026)
-- ============================================================================
--
-- Apaga toda notificação criada antes de hoje (meia-noite de São Paulo). Daqui
-- em diante quem faz isso é o pg_cron (`notificacoes-faxina`, migration
-- 20261005190000), todo dia às 00:05.
--
-- Contagem em 05/10/2026 ~12h30: 130.456 no total, 2.451 de hoje — este
-- DELETE leva ~128.005. Não há chave estrangeira apontando para
-- `notificacoes`; o gatilho de sinal manda um «recarregar» por pessoa.
--
-- Não tem volta. Rodar só com o «pode» do Cleber.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

DELETE FROM public.notificacoes
 WHERE criado_em < date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';

COMMIT;

SELECT count(*) AS restantes, min(criado_em) AS mais_antiga FROM public.notificacoes;
