-- ============================================================================
-- Halloween: a escolha de cada pessoa e a mensagem de boas-vindas
-- ============================================================================
--
-- O tema de Halloween vale para todos em outubro (depois de validado), com
-- duas coisas que são da PESSOA, não da máquina:
--
--   halloween_desligado        desligou os enfeites no botão de tema
--   halloween_boas_vindas_em   quando viu a mensagem que abre outubro
--
-- Mesmo molde de `tour_visto_em` (20260928113233): uma coluna em `perfis`,
-- com o `localStorage` como atalho. Sem esta migration a tela funciona só pelo
-- navegador — trocar de PC mostraria a mensagem de novo.
--
-- As duas colunas entram na lista de ignoradas do `trg_log_perfis`: ligar e
-- desligar enfeite não é alteração de cadastro, e cada clique viraria uma
-- linha de auditoria.
--
-- Só colunas novas, com padrão. Nenhuma linha de dado muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS halloween_desligado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS halloween_boas_vindas_em TIMESTAMPTZ;

COMMENT ON COLUMN public.perfis.halloween_desligado IS
  'A pessoa desligou os enfeites de Halloween no botão de tema. Conferido na tela.';
COMMENT ON COLUMN public.perfis.halloween_boas_vindas_em IS
  'Quando a pessoa viu a mensagem de boas-vindas de outubro. NULL = ainda não viu.';

-- ── Fora da auditoria ──────────────────────────────────────────────────────
-- O gatilho é recriado a partir da definição ATUAL, só com o 5º argumento de
-- `fn_log_auditoria` acrescido — mesma técnica de 20260928113233.
DO $gatilho$
DECLARE
  v_def  TEXT;
  v_novo TEXT;
  v_col  TEXT;
BEGIN
  FOREACH v_col IN ARRAY ARRAY['halloween_desligado', 'halloween_boas_vindas_em'] LOOP
    SELECT pg_get_triggerdef(t.oid)
      INTO v_def
      FROM pg_trigger t
     WHERE t.tgrelid = 'public.perfis'::regclass
       AND t.tgname  = 'trg_log_perfis'
       AND NOT t.tgisinternal;

    IF v_def IS NULL THEN
      RAISE EXCEPTION 'trg_log_perfis nao encontrado em public.perfis';
    END IF;

    CONTINUE WHEN position(v_col IN v_def) > 0;  -- já ignorada

    v_novo := regexp_replace(
      v_def,
      '(fn_log_auditoria\((''[^'']*'',\s*){4}'')',
      '\1' || v_col || ',');

    IF v_novo = v_def OR position(v_col IN v_novo) = 0 THEN
      RAISE EXCEPTION 'nao consegui acrescentar % aos ignorados de: %', v_col, v_def;
    END IF;

    DROP TRIGGER trg_log_perfis ON public.perfis;
    EXECUTE v_novo;
  END LOOP;
END
$gatilho$;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.perfis'::regclass
       AND t.tgname = 'trg_log_perfis' AND t.tgenabled = 'O'
       AND position('halloween_desligado' IN pg_get_triggerdef(t.oid)) > 0
       AND position('halloween_boas_vindas_em' IN pg_get_triggerdef(t.oid)) > 0
  ) THEN
    RAISE EXCEPTION 'trg_log_perfis precisa estar ligado e ignorando as colunas do Halloween';
  END IF;
END
$prova$;

COMMIT;
