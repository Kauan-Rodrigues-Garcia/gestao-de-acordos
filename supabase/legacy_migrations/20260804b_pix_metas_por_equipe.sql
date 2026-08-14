-- ═══════════════════════════════════════════════════════════════════════════
-- PIX AUTOMÁTICO — meta por EQUIPE (BookPlay)
-- ═══════════════════════════════════════════════════════════════════════════
-- A meta de Pix do setor não é digitada: ela é a SOMA das metas das equipes.
-- No Receptivo, Bryan, Luciana e Matheus têm cada um a sua, e o setor é o
-- total — é assim que a operação acompanha, equipe a equipe.
--
-- `20260804c` criou a tabela com uma linha por setor/mês. Aqui ela passa a
-- aceitar uma linha por EQUIPE/mês, e o setor deixa de ser um valor guardado
-- para virar uma soma calculada na leitura.
--
-- Continua valendo o que a v3 já dizia: esta meta NÃO é meta de recebimento.
-- O valor do Pix já entra no recebimento pelo analítico; contá-lo de novo em
-- `metas` somaria o mesmo dinheiro duas vezes. Esta é de acompanhamento.
--
-- Idempotente.

-- ─── 1. Coluna da equipe ─────────────────────────────────────────────────────
ALTER TABLE public.pix_automatico_metas
  ADD COLUMN IF NOT EXISTS equipe_id UUID REFERENCES public.equipes(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.pix_automatico_metas.equipe_id IS
  'Equipe dona da meta. NULL = linha antiga, de quando a meta era do setor inteiro (20260804c); a UI nova grava sempre com equipe.';

-- ─── 2. Unicidade ────────────────────────────────────────────────────────────
-- A UNIQUE original era (empresa, setor, mês, ano): com ela, a segunda equipe
-- do mesmo setor já não entraria. Ela sai, e no lugar entram dois índices
-- parciais — um para as linhas por equipe, outro para as linhas de setor que
-- porventura já existam.
ALTER TABLE public.pix_automatico_metas
  DROP CONSTRAINT IF EXISTS pix_automatico_metas_empresa_id_setor_id_mes_ano_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pix_metas_equipe_periodo
  ON public.pix_automatico_metas (empresa_id, equipe_id, mes, ano)
  WHERE equipe_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pix_metas_setor_periodo
  ON public.pix_automatico_metas (empresa_id, setor_id, mes, ano)
  WHERE equipe_id IS NULL;

-- Leitura do painel: todas as equipes de um setor no mês.
CREATE INDEX IF NOT EXISTS idx_pix_metas_setor_equipe
  ON public.pix_automatico_metas (empresa_id, setor_id, ano, mes);

-- ─── 3. A equipe tem de ser do setor da própria linha ────────────────────────
-- Sem isto, uma meta poderia apontar para o setor A e para uma equipe do setor
-- B — e o total do setor A sairia contando dinheiro que não é dele. É o tipo de
-- inconsistência que ninguém percebe até os números não fecharem.
CREATE OR REPLACE FUNCTION public.fn_pix_meta_equipe_do_setor()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_setor UUID;
BEGIN
  IF NEW.equipe_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.setor_id INTO v_setor FROM public.equipes e WHERE e.id = NEW.equipe_id;

  IF v_setor IS NULL THEN
    -- Equipe sem setor: a linha assume o setor informado, sem contradição.
    RETURN NEW;
  END IF;

  IF v_setor IS DISTINCT FROM NEW.setor_id THEN
    RAISE EXCEPTION
      'Equipe % pertence ao setor %, não ao setor % informado na meta de Pix',
      NEW.equipe_id, v_setor, NEW.setor_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pix_meta_equipe_do_setor ON public.pix_automatico_metas;
CREATE TRIGGER trg_pix_meta_equipe_do_setor
  BEFORE INSERT OR UPDATE ON public.pix_automatico_metas
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_meta_equipe_do_setor();

COMMENT ON TABLE public.pix_automatico_metas IS
  'Meta de Pix automático por EQUIPE/mês (valor e quantidade). O total do setor é a soma das equipes, calculado na leitura. Separada de `metas`: o recebimento do Pix já entra no analítico e não pode ser contado duas vezes.';
