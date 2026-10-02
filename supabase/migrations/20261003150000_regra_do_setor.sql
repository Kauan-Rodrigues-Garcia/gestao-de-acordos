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
-- A regra muda a visão inteira (abas, tipos de acordo), então é escolhida
-- na criação do setor e não muda mais (kauan, 02/10/2026). Quem escolhe é o
-- super admin; setor criado por outro cargo nasce com Nosso produto.
--
-- ## O que muda
--
-- 1. `setores.regra`, NOT NULL, padrão `nosso_produto`.
-- 2. Os setores de hoje: só o Conecta Play da PaguePlay é Cofen; todo o resto
--    é Nosso produto (kauan, 02/10/2026). A prova exige achar o Conecta Play
--    como Cofen, para um nome diferente do esperado não passar calado.
-- 3. Gatilho: na criação, só o super admin escolhe Cofen; depois de criado,
--    ninguém troca pelo app. Pelo SQL Editor (sem `auth.uid()`) passa: é a
--    porta de manutenção.
--
-- Esta migration só grava a regra. Telas e regras do app passam a ler dela
-- nas próximas, área por área.
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
  'Regra de negócio do setor: nosso_produto ou cofen. Independe da cidade. '
  'Escolhida na criação (só o super admin escolhe cofen) e não muda depois. '
  'Ver 20261003150000.';

-- ── 2. Cada setor com a regra que já segue ──────────────────────────────────

UPDATE public.setores s
   SET regra = CASE
                 WHEN e.slug = 'pagueplay'
                  AND regexp_replace(lower(s.nome), '[^a-z]', '', 'g') = 'conectaplay'
                 THEN 'cofen'
                 ELSE 'nosso_produto'
               END
  FROM public.empresas e
 WHERE e.id = s.empresa_id
   AND s.regra IS NULL;

ALTER TABLE public.setores ALTER COLUMN regra SET DEFAULT 'nosso_produto';
ALTER TABLE public.setores ALTER COLUMN regra SET NOT NULL;

-- ── 3. Setor novo nasce com a regra da empresa; só super admin troca ────────

CREATE OR REPLACE FUNCTION public.fn_setores_regra()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;   -- SQL Editor / service_role: manutenção
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.regra IS DISTINCT FROM 'nosso_produto' AND NOT public.fn_user_is_super_admin() THEN
      RAISE EXCEPTION 'Só o super admin escolhe a regra de negócio do setor.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.regra IS DISTINCT FROM OLD.regra THEN
    RAISE EXCEPTION 'A regra de negócio do setor é escolhida na criação e não muda depois.'
      USING ERRCODE = '42501';
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
  v_cofen INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_cofen
    FROM public.setores s JOIN public.empresas e ON e.id = s.empresa_id
   WHERE e.slug = 'pagueplay' AND s.regra = 'cofen'
     AND regexp_replace(lower(s.nome), '[^a-z]', '', 'g') = 'conectaplay';
  IF v_cofen <> 1 THEN
    RAISE EXCEPTION 'Esperava o Conecta Play da PaguePlay como Cofen e achei % setor(es) assim. Confira o nome do setor.', v_cofen;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_setores_regra' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Gatilho da regra do setor ausente.';
  END IF;
END
$prova$;

COMMIT;
