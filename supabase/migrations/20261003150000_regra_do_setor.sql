-- ============================================================================
-- A regra de negócio passa a ser do setor: Nosso produto ou Cofen
-- ============================================================================
--
-- ## Por que
--
-- Pedido do kauan em 02/10/2026. BookPlay e PaguePlay deixam de decidir a
-- regra de negócio: viram só o nome, dado pela cidade do setor (Birigui é
-- BookPlay, Marília é PaguePlay). A regra (tipo de relatório importado, tabela
-- de acordos, como o acordo é salvo) é escolhida por setor:
--
--   nosso_produto  a regra que a BookPlay usa hoje
--   cofen          a regra que a PaguePlay usa hoje
--
-- Um setor de Birigui pode ser Cofen, e um de Marília pode ser Nosso produto.
--
-- ## O que muda
--
-- 1. `setores.regra`, preenchida com a regra que cada setor já segue hoje: a
--    da variante da empresa (`empresas.variante`, 20261002230000). Nada muda
--    de comportamento no dia em que isto roda.
-- 2. Setor novo de empresa de cobrança nasce com a regra da empresa.
-- 3. Só o super admin troca a regra (mesma porta de manutenção do SQL Editor:
--    sem `auth.uid()`, passa).
--
-- Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 1. A coluna ─────────────────────────────────────────────────────────────

ALTER TABLE public.setores ADD COLUMN IF NOT EXISTS regra TEXT;

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.setores'::REGCLASS AND conname = 'setores_regra_check') THEN
    ALTER TABLE public.setores
      ADD CONSTRAINT setores_regra_check CHECK (regra IN ('nosso_produto', 'cofen'));
  END IF;
END
$check$;

COMMENT ON COLUMN public.setores.regra IS
  'Regra de negócio do setor: nosso_produto (a da BookPlay) ou cofen (a da '
  'PaguePlay). Independe da cidade. Só o super admin troca. Ver 20261003150000.';

-- ── 2. Cada setor com a regra que já segue ──────────────────────────────────

UPDATE public.setores s
   SET regra = CASE e.variante WHEN 'pagueplay' THEN 'cofen' ELSE 'nosso_produto' END
  FROM public.empresas e
 WHERE e.id = s.empresa_id
   AND e.variante IN ('bookplay', 'pagueplay')
   AND s.regra IS NULL;

-- ── 3. Setor novo nasce com a regra da empresa; só super admin troca ────────

CREATE OR REPLACE FUNCTION public.fn_setores_regra()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.regra IS NULL THEN
    SELECT CASE e.variante WHEN 'pagueplay' THEN 'cofen' WHEN 'bookplay' THEN 'nosso_produto' END
      INTO NEW.regra
      FROM public.empresas e
     WHERE e.id = NEW.empresa_id;
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL
     AND NEW.regra IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.regra END)
     AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'Só o super admin define a regra de negócio do setor.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_setores_regra ON public.setores;
CREATE TRIGGER trg_setores_regra
  BEFORE INSERT OR UPDATE OF regra ON public.setores
  FOR EACH ROW EXECUTE FUNCTION public.fn_setores_regra();

-- ── 4. Prova ────────────────────────────────────────────────────────────────

DO $prova$
DECLARE
  v_sem INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_sem
    FROM public.setores s JOIN public.empresas e ON e.id = s.empresa_id
   WHERE e.variante IN ('bookplay', 'pagueplay') AND s.regra IS NULL;
  IF v_sem > 0 THEN
    RAISE EXCEPTION '% setor(es) de cobrança ficaram sem regra.', v_sem;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_setores_regra' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Gatilho da regra do setor ausente.';
  END IF;
END
$prova$;

COMMIT;
