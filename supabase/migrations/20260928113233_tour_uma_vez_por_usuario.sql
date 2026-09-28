-- ============================================================================
-- Tutorial de boas-vindas: uma vez por usuário, e não uma vez por navegador
-- ============================================================================
--
-- O tour de 4 etapas (`OnboardingTour.tsx`) guardava o «já vi» só no
-- `localStorage` do navegador. Trocou de PC, entrou por outro navegador ou
-- limpou os dados — o tutorial voltava, como se o sistema não lembrasse de nada.
--
-- Mesmo remédio das boas-vindas do chat (`chat_boas_vindas_em`, 20260825240000):
-- uma data em `perfis`. `NULL` = ainda não viu. A tela grava a data quando o
-- tour abre; o `localStorage` continua como atalho para não perguntar de novo.
--
-- ## Quem já entrou não vê mais
--
-- Pedido de 28/09/2026: daqui para frente o tutorial é só para quem NUNCA
-- acessou. Quem já tem `last_sign_in_at` em `auth.users` entrou pelo menos uma
-- vez — recebe a data desse último acesso e o tour não aparece mais para ele.
-- Conta criada e nunca usada (os 21 operadores de hoje, por exemplo) segue com
-- `NULL` e vê o tour no primeiro login.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS tour_visto_em TIMESTAMPTZ;

COMMENT ON COLUMN public.perfis.tour_visto_em IS
  'Quando a pessoa viu o tutorial de boas-vindas. NULL = ainda nao viu, e o tour '
  'aparece no proximo acesso. Conferido na tela, nao na RLS. Ver 20260928130000.';

-- ── A auditoria não precisa de uma linha por «viu o tutorial» ──────────────
--
-- `trg_log_perfis` grava em `logs_sistema` todo UPDATE de perfil, menos os que
-- só mexem nas colunas da lista de ignorados (5º argumento de
-- `fn_log_auditoria`). Sem `tour_visto_em` ali, o backfill abaixo escreveria
-- uma linha de log por usuário, e cada primeiro acesso depois, mais uma.
--
-- O gatilho é recriado a partir da definição ATUAL (`pg_get_triggerdef`), não
-- de uma cópia: só o 5º argumento ganha a coluna nova.
DO $gatilho$
DECLARE
  v_def  TEXT;
  v_novo TEXT;
BEGIN
  SELECT pg_get_triggerdef(t.oid)
    INTO v_def
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.perfis'::regclass
     AND t.tgname  = 'trg_log_perfis'
     AND NOT t.tgisinternal;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'trg_log_perfis nao encontrado em public.perfis';
  END IF;

  IF position('tour_visto_em' IN v_def) > 0 THEN
    RETURN;  -- já ignorada
  END IF;

  v_novo := regexp_replace(
    v_def,
    '(fn_log_auditoria\((''[^'']*'',\s*){4}'')',
    '\1tour_visto_em,');

  IF v_novo = v_def OR position('tour_visto_em' IN v_novo) = 0 THEN
    RAISE EXCEPTION 'nao consegui acrescentar tour_visto_em aos ignorados de: %', v_def;
  END IF;

  DROP TRIGGER trg_log_perfis ON public.perfis;
  EXECUTE v_novo;
END
$gatilho$;

-- ── Quem já entrou alguma vez não vê mais ──────────────────────────────────
--
-- `trg_perfis_updated` fica desligado só durante este UPDATE, na mesma
-- transação: marcar o tutorial não é alterar o perfil, e sem isso o
-- `atualizado_em` de todo mundo viraria «agora».
ALTER TABLE public.perfis DISABLE TRIGGER trg_perfis_updated;

UPDATE public.perfis p
   SET tour_visto_em = u.last_sign_in_at
  FROM auth.users u
 WHERE u.id = p.id
   AND u.last_sign_in_at IS NOT NULL
   AND p.tour_visto_em IS NULL;

ALTER TABLE public.perfis ENABLE TRIGGER trg_perfis_updated;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.perfis'::regclass
       AND tgname = 'trg_perfis_updated' AND tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'trg_perfis_updated precisa voltar ligado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.perfis'::regclass
       AND t.tgname = 'trg_log_perfis' AND t.tgenabled = 'O'
       AND position('tour_visto_em' IN pg_get_triggerdef(t.oid)) > 0
  ) THEN
    RAISE EXCEPTION 'trg_log_perfis precisa estar ligado e ignorando tour_visto_em';
  END IF;
END
$prova$;

COMMIT;
