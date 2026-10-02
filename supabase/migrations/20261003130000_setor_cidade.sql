-- ============================================================================
-- O setor ganha cidade
-- ============================================================================
--
-- ## Por que
--
-- A cidade (Birigui, Marília...) só existia no RH: `rh_celulas` é o cadastro
-- das cidades e `rh_config_setores.celula_id` dizia a cidade de cada setor, mas
-- só dos setores ligados ao RH, e só na tela do RH. A tela de Setores não sabia
-- onde o setor fica.
--
-- ## O que muda
--
-- 1. `setores.cidade_id`, apontando para `rh_celulas`. A FK é composta com
--    `empresa_id`, como as da fase 4: o banco recusa cidade de outra empresa.
--    Nulo = setor sem cidade definida.
-- 2. Preenchida a partir de `rh_config_setores.celula_id`, onde existir.
-- 3. As duas ficam em espelho por gatilho: trocar a cidade na tela de Setores
--    troca a do RH, e trocar no RH troca a do setor. O RH continua lendo
--    `rh_config_setores` como antes.
-- 4. Ver as cidades passa a valer para quem acessa a empresa (é nome de cidade,
--    não dado pessoal), e quem cria ou edita setor pode cadastrar cidade.
--    Remover cidade continua só com `rh_configurar`.
--
-- Uma cidade por setor. Setor com mais de uma cidade fica para quando o RH
-- souber em qual cidade cada pessoa do setor entra.
--
-- Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 1. A coluna e a FK composta ─────────────────────────────────────────────

DO $chave$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.rh_celulas'::REGCLASS AND conname = 'rh_celulas_id_empresa_key'
  ) THEN
    ALTER TABLE public.rh_celulas
      ADD CONSTRAINT rh_celulas_id_empresa_key UNIQUE (id, empresa_id);
  END IF;
END
$chave$;

ALTER TABLE public.setores ADD COLUMN IF NOT EXISTS cidade_id UUID;

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.setores'::REGCLASS AND conname = 'setores_cidade_fkey'
  ) THEN
    ALTER TABLE public.setores
      ADD CONSTRAINT setores_cidade_fkey FOREIGN KEY (cidade_id, empresa_id)
      REFERENCES public.rh_celulas (id, empresa_id) ON DELETE RESTRICT;
  END IF;
END
$fk$;

CREATE INDEX IF NOT EXISTS idx_setores_cidade ON public.setores (cidade_id)
  WHERE cidade_id IS NOT NULL;

COMMENT ON COLUMN public.setores.cidade_id IS
  'A cidade do setor (rh_celulas). Espelho de rh_config_setores.celula_id, '
  'nos dois sentidos, por gatilho. Ver 20261003130000.';

-- ── 2. Preenche com o que o RH já sabia ─────────────────────────────────────

UPDATE public.setores s
   SET cidade_id = c.celula_id
  FROM public.rh_config_setores c
 WHERE c.setor_id = s.id
   AND c.empresa_id = s.empresa_id
   AND s.cidade_id IS DISTINCT FROM c.celula_id;

-- ── 3. Espelho nos dois sentidos ────────────────────────────────────────────
--
-- SECURITY DEFINER: quem edita setor nem sempre pode escrever na configuração
-- do RH, e o contrário. O espelho só copia a cidade, nada mais. Cada lado só
-- escreve quando o valor difere, e isso encerra o vaivém.

CREATE OR REPLACE FUNCTION public.fn_setores_cidade_para_rh()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cidade_id IS NOT NULL THEN
    UPDATE public.rh_config_setores
       SET celula_id = NEW.cidade_id, atualizado_em = NOW()
     WHERE setor_id = NEW.id
       AND celula_id IS DISTINCT FROM NEW.cidade_id;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_setores_cidade_para_rh ON public.setores;
CREATE TRIGGER trg_setores_cidade_para_rh
  AFTER INSERT OR UPDATE OF cidade_id ON public.setores
  FOR EACH ROW EXECUTE FUNCTION public.fn_setores_cidade_para_rh();

CREATE OR REPLACE FUNCTION public.fn_rh_config_cidade_para_setor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.setores
     SET cidade_id = NEW.celula_id
   WHERE id = NEW.setor_id
     AND cidade_id IS DISTINCT FROM NEW.celula_id;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_rh_config_cidade_para_setor ON public.rh_config_setores;
CREATE TRIGGER trg_rh_config_cidade_para_setor
  AFTER INSERT OR UPDATE OF celula_id ON public.rh_config_setores
  FOR EACH ROW EXECUTE FUNCTION public.fn_rh_config_cidade_para_setor();

REVOKE ALL ON FUNCTION public.fn_setores_cidade_para_rh()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_rh_config_cidade_para_setor() FROM PUBLIC, anon, authenticated;

-- ── 4. Quem vê e quem cadastra cidade ───────────────────────────────────────

DROP POLICY IF EXISTS rh_celulas_select_empresa ON public.rh_celulas;
CREATE POLICY rh_celulas_select_empresa ON public.rh_celulas FOR SELECT TO authenticated
USING ((SELECT public.fn_can_access_empresa(empresa_id)));

DROP POLICY IF EXISTS rh_celulas_insert_setores ON public.rh_celulas;
CREATE POLICY rh_celulas_insert_setores ON public.rh_celulas FOR INSERT TO authenticated
WITH CHECK ((SELECT public.fn_can_access_empresa(empresa_id))
            AND (SELECT public.fn_user_tem('setores_criar_editar')));

-- ── 5. Registro e prova ─────────────────────────────────────────────────────

DO $prova$
DECLARE
  v_divergentes INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_divergentes
    FROM public.rh_config_setores c
    JOIN public.setores s ON s.id = c.setor_id
   WHERE s.cidade_id IS DISTINCT FROM c.celula_id;
  IF v_divergentes > 0 THEN
    RAISE EXCEPTION 'Ha % setor(es) com cidade diferente da do RH.', v_divergentes;
  END IF;

  IF (SELECT COUNT(*) FROM pg_trigger
       WHERE tgname IN ('trg_setores_cidade_para_rh', 'trg_rh_config_cidade_para_setor')
         AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'Gatilhos do espelho de cidade ausentes.';
  END IF;
END
$prova$;

COMMIT;
