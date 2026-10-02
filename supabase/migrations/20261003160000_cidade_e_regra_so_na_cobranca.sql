-- ============================================================================
-- Cidade e regra do setor são só da cobrança
-- ============================================================================
--
-- ## Por que
--
-- kauan, 02/10/2026: «essas mudanças são apenas para cobrança, nada de
-- comercial e RH». 20261003140000 e 20261003150000 valeram para todas as
-- empresas: os 2 setores do Comercial ganharam regra Nosso produto, e a cidade
-- (setor e cadastro de cidades) ficou só com o super admin também fora da
-- cobrança.
--
-- ## O que muda
--
-- 1. `fn_empresa_e_cobranca(empresa)`: `empresas.produto = 'cobranca'`.
-- 2. `setores.regra` volta a aceitar nulo, e fica nula fora da cobrança. Na
--    cobrança continua obrigatória (nasce Nosso produto) e fixa.
-- 3. A trava «cidade só pelo super admin» (setor e RH) passa a valer só para
--    setor da cobrança.
-- 4. Cadastro de cidades: fora da cobrança volta a regra de antes
--    (`rh_configurar`, a policy `rh_celulas_write` de 20260823091000).
--
-- Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 1. A empresa é da cobrança? ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_empresa_e_cobranca(p_empresa UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa AND produto = 'cobranca')
$$;

REVOKE ALL ON FUNCTION public.fn_empresa_e_cobranca(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_empresa_e_cobranca(UUID) TO authenticated;

-- ── 2. Regra só na cobrança ─────────────────────────────────────────────────

ALTER TABLE public.setores ALTER COLUMN regra DROP NOT NULL;

COMMENT ON COLUMN public.setores.regra IS
  'Regra de negócio do setor da cobrança: nosso_produto ou cofen. Nula fora '
  'da cobrança. Escolhida na criação (só o super admin escolhe cofen) e não '
  'muda depois. Ver 20261003150000 e 20261003160000.';

CREATE OR REPLACE FUNCTION public.fn_setores_regra()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.fn_empresa_e_cobranca(NEW.empresa_id) THEN
      NEW.regra := NULL;   -- Comercial e RH não têm regra de setor
      RETURN NEW;
    END IF;
    NEW.regra := COALESCE(NEW.regra, 'nosso_produto');
    IF auth.uid() IS NOT NULL AND NEW.regra <> 'nosso_produto'
       AND NOT public.fn_user_is_super_admin() THEN
      RAISE EXCEPTION 'Só o super admin escolhe a regra de negócio do setor.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;   -- SQL Editor / service_role: manutenção
  END IF;
  IF NEW.regra IS DISTINCT FROM OLD.regra THEN
    RAISE EXCEPTION 'A regra de negócio do setor é escolhida na criação e não muda depois.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

UPDATE public.setores s
   SET regra = NULL
  FROM public.empresas e
 WHERE e.id = s.empresa_id
   AND e.produto <> 'cobranca'
   AND s.regra IS NOT NULL;

-- ── 3. Cidade só pelo super admin: só na cobrança ───────────────────────────

CREATE OR REPLACE FUNCTION public.fn_setores_cidade_so_super_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.cidade_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.cidade_id END)
     AND public.fn_empresa_e_cobranca(NEW.empresa_id)
     AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'Só o super admin define a cidade do setor.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.fn_rh_config_cidade_do_setor()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.celula_id IS NOT DISTINCT FROM OLD.celula_id THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL
     AND NEW.celula_id IS DISTINCT FROM (SELECT s.cidade_id FROM public.setores s WHERE s.id = NEW.setor_id)
     AND public.fn_empresa_e_cobranca((SELECT s.empresa_id FROM public.setores s WHERE s.id = NEW.setor_id))
     AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'A cidade do setor é definida pelo super admin em Configurações > Setores.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

-- ── 4. Cadastro de cidades fora da cobrança: como era ───────────────────────

DROP POLICY IF EXISTS rh_celulas_write ON public.rh_celulas;
CREATE POLICY rh_celulas_write ON public.rh_celulas FOR ALL TO authenticated
USING (NOT (SELECT public.fn_empresa_e_cobranca(empresa_id))
       AND (SELECT public.fn_can_access_empresa(empresa_id))
       AND (SELECT public.fn_rh_pode('rh_configurar')))
WITH CHECK (NOT (SELECT public.fn_empresa_e_cobranca(empresa_id))
       AND (SELECT public.fn_can_access_empresa(empresa_id))
       AND (SELECT public.fn_rh_pode('rh_configurar')));

-- ── 5. Prova ────────────────────────────────────────────────────────────────

DO $prova$
DECLARE
  v_fora INTEGER;
  v_sem  INTEGER;
  v_cofen INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_fora
    FROM public.setores s JOIN public.empresas e ON e.id = s.empresa_id
   WHERE e.produto <> 'cobranca' AND s.regra IS NOT NULL;
  IF v_fora <> 0 THEN
    RAISE EXCEPTION 'Ainda há % setor(es) fora da cobrança com regra.', v_fora;
  END IF;

  SELECT COUNT(*) INTO v_sem
    FROM public.setores s JOIN public.empresas e ON e.id = s.empresa_id
   WHERE e.produto = 'cobranca' AND s.regra IS NULL;
  IF v_sem <> 0 THEN
    RAISE EXCEPTION 'Há % setor(es) da cobrança sem regra.', v_sem;
  END IF;

  SELECT COUNT(*) INTO v_cofen
    FROM public.setores s JOIN public.empresas e ON e.id = s.empresa_id
   WHERE e.slug = 'pagueplay' AND s.regra = 'cofen'
     AND regexp_replace(lower(s.nome), '[^a-z]', '', 'g') = 'conectaplay';
  IF v_cofen <> 1 THEN
    RAISE EXCEPTION 'O Conecta Play da PaguePlay deixou de ser Cofen (% achado).', v_cofen;
  END IF;
END
$prova$;

COMMIT;
