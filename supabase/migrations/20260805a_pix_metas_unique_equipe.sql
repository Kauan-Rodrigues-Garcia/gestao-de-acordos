-- ═══════════════════════════════════════════════════════════════════════════
-- PIX AUTOMÁTICO — corrige a unicidade da meta por equipe
-- ═══════════════════════════════════════════════════════════════════════════
-- `20260804b` criou a unicidade como ÍNDICE PARCIAL
-- (`... WHERE equipe_id IS NOT NULL`). O Postgres não infere `ON CONFLICT
-- (empresa_id, equipe_id, mes, ano)` a partir de um índice parcial, e salvar a
-- meta falhava com:
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- Aqui o índice parcial dá lugar a uma CONSTRAINT UNIQUE comum, que o
-- `ON CONFLICT` reconhece.
--
-- As linhas antigas de setor (`equipe_id IS NULL`) não são afetadas: no
-- Postgres NULLs são distintos entre si numa UNIQUE, então elas continuam
-- convivendo, e a unicidade delas segue no índice parcial próprio criado em
-- `20260804b` (`uq_pix_metas_setor_periodo`).
--
-- Idempotente.

DROP INDEX IF EXISTS public.uq_pix_metas_equipe_periodo;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pix_automatico_metas'::regclass
       AND conname  = 'uq_pix_metas_equipe'
  ) THEN
    ALTER TABLE public.pix_automatico_metas
      ADD CONSTRAINT uq_pix_metas_equipe
      UNIQUE (empresa_id, equipe_id, mes, ano);
  END IF;
END $$;

COMMENT ON CONSTRAINT uq_pix_metas_equipe ON public.pix_automatico_metas IS
  'Uma meta de Pix por equipe/mês. Constraint (e não índice parcial) porque o upsert da tela usa ON CONFLICT, que só reconhece constraint ou índice total.';
