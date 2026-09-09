-- ═══════════════════════════════════════════════════════════════════════════
-- Pix Automático: o expurgo dos desaprovados deixa de depender de alguém abrir
-- a aba
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O defeito
--
-- `fn_pix_expurga_desaprovados(empresa)` apaga o desaprovado dois dias úteis
-- depois da avaliação, e o comentário dela dizia a verdade: «chamada ao abrir a
-- aba Pix Automático (não há job agendado)».
--
-- Enquanto ninguém abre a aba, nada acontece. E o desaprovado parado não é
-- inerte: ele OCUPA O NR (`fn_pix_nr_bloqueia_duplicado` conta qualquer linha
-- viva). Líder de férias, semana fraca, fim de semana emendado — e o operador
-- que precisa lançar aquele NR de novo bate numa porta que só abre quando
-- outra pessoa entra na tela.
--
-- ## A correção
--
-- Um trabalho diário no pg_cron. A função da aba continua existindo e continua
-- sendo chamada ao abrir — ela é barata, idempotente, e adianta o expurgo para
-- quem está olhando. O cron é a garantia de que ele acontece mesmo quando
-- ninguém olha.
--
-- ## Por que uma função nova, e não o cron chamando a que já existe
--
-- `fn_pix_expurga_desaprovados` começa checando `fn_can_access_empresa` e o
-- cargo do usuário. O cron roda SEM JWT: `auth.uid()` é NULL, a checagem
-- devolve falso e a função retornaria 0 para sempre — um trabalho agendado que
-- nunca apaga nada, e ninguém perceberia.
--
-- A função do cron não tem teste de cargo porque a proteção dela é outra: não
-- ser alcançável por quem tem um token. `REVOKE ... FROM anon, authenticated`,
-- o mesmo padrão de `fn_logs_retencao_aplicar` (20260817140000).

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A função do trabalho: todas as empresas, sem sessão
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_pix_expurga_desaprovados_job()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total INTEGER;
BEGIN
  /*
   * O mesmo critério da função da aba, e a mesma constante de dois dias úteis
   * (`fn_pix_dias_uteis_apos(..., 2)`). Se as duas discordassem, o prazo que a
   * tabela promete ao operador («exclusão em 2 dias») deixaria de ser o prazo
   * que o banco cumpre — e o número na tela vale pelo que acontece, não pelo
   * que está escrito.
   *
   * Um DELETE só para todas as empresas: o laço por empresa da versão da aba
   * existe por causa da checagem de acesso, que aqui não se aplica.
   */
  WITH apagados AS (
    DELETE FROM public.pix_automatico_acordos a
     WHERE a.status      = 'desaprovado'
       AND a.avaliado_em IS NOT NULL
       AND public.fn_pix_dias_uteis_apos(a.avaliado_em, 2) <= NOW()
       -- Pago não sai daqui. Desaprovado pago não deveria existir, mas basta um
       -- «Pagar» seguido de «Voltar para pendente» de uma versão antiga para
       -- haver um: sem este filtro o trigger `trg_pix_a_impede_pago` recusaria
       -- a linha e derrubaria o DELETE INTEIRO — uma transação, um trabalho
       -- perdido todas as noites.
       AND a.pago = FALSE
    RETURNING a.id
  )
  SELECT COUNT(*)::INTEGER INTO v_total FROM apagados;

  RETURN COALESCE(v_total, 0);
END;
$function$;

COMMENT ON FUNCTION public.fn_pix_expurga_desaprovados_job() IS
  'Expurgo diario dos desaprovados vencidos, em TODAS as empresas. Chamada '
  'pelo pg_cron, sem JWT; nao exposta ao PostgREST. A funcao da aba '
  '(fn_pix_expurga_desaprovados) continua valendo para quem abre a tela.';

-- Fora do alcance do REST: quem chama é o cron.
REVOKE ALL ON FUNCTION public.fn_pix_expurga_desaprovados_job() FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. O agendamento
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Diário, 05:20 UTC — 02:20 em São Paulo, fora do horário de operação. Os
-- vizinhos já ocupados: `composicao-mes-congelar` às 02:50, `logs-retencao`
-- às 03:40, `comemoracao-faxina` às 04:17, `uso-telas-expurgo` às 04:50.
--
-- Diário, e não mensal: o prazo aqui é de dois dias úteis, então adiar o
-- expurgo em semanas devolveria o defeito que esta migration corrige.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Reaplicar a migration não deve criar um segundo trabalho igual.
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pix-expurga-desaprovados') THEN
      PERFORM cron.unschedule('pix-expurga-desaprovados');
    END IF;

    PERFORM cron.schedule(
      'pix-expurga-desaprovados',
      '20 5 * * *',
      'SELECT public.fn_pix_expurga_desaprovados_job();'
    );
  ELSE
    RAISE NOTICE
      'pg_cron ausente: o expurgo do Pix segue dependendo da abertura da aba.';
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verificação — para ser lida, não só executada.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_job     RECORD;
  v_exposta INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_exposta
    FROM information_schema.role_routine_grants
   WHERE routine_schema = 'public'
     AND routine_name   = 'fn_pix_expurga_desaprovados_job'
     AND grantee IN ('anon', 'authenticated');

  IF v_exposta > 0 THEN
    RAISE EXCEPTION 'fn_pix_expurga_desaprovados_job continua exposta ao REST.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT * INTO v_job FROM cron.job WHERE jobname = 'pix-expurga-desaprovados';
    IF v_job IS NULL THEN
      RAISE EXCEPTION 'O trabalho pix-expurga-desaprovados nao foi agendado.';
    END IF;
    RAISE NOTICE 'Agendado: % — %', v_job.schedule, v_job.command;
  END IF;
END
$$;

COMMIT;
