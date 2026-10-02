-- ============================================================================
-- A cidade do setor é do super admin
-- ============================================================================
--
-- ## Por que
--
-- 20261003130000 deu cidade ao setor, mas deixou três portas abertas: quem
-- edita setor (`setores_criar_editar`) trocava a cidade e cadastrava cidade
-- nova, e o RH (`rh_configurar`) fazia o mesmo pela tela dele, com o espelho
-- levando a troca para o setor. A regra é outra: cidade é configuração do
-- super admin, e o RH só usa.
--
-- ## O que muda
--
-- 1. Cadastro de cidades (`rh_celulas`): criar, renomear e apagar só super
--    admin. Ver continua para quem acessa a empresa.
-- 2. `setores.cidade_id` só muda pela mão do super admin (gatilho
--    `fn_setores_cidade_so_super_admin`).
-- 3. `rh_config_setores.celula_id` só pode ser a cidade do setor, a não ser
--    pelo super admin (gatilho `fn_rh_config_cidade_do_setor`). O RH continua
--    ligando e desligando setor e escolhendo premiação ou comissão.
--
-- Sem sessão de usuário (SQL Editor, service_role, `auth.uid()` nulo) passa:
-- é a porta de manutenção.
--
-- Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 1. Cadastro de cidades ──────────────────────────────────────────────────

DROP POLICY IF EXISTS rh_celulas_write         ON public.rh_celulas;
DROP POLICY IF EXISTS rh_celulas_insert_setores ON public.rh_celulas;

DROP POLICY IF EXISTS rh_celulas_write_super_admin ON public.rh_celulas;
CREATE POLICY rh_celulas_write_super_admin ON public.rh_celulas FOR ALL TO authenticated
USING ((SELECT public.fn_user_is_super_admin()))
WITH CHECK ((SELECT public.fn_user_is_super_admin()));

-- ── 2. A cidade do setor ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_setores_cidade_so_super_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.cidade_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.cidade_id END)
     AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'Só o super admin define a cidade do setor.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_setores_cidade_so_super_admin ON public.setores;
CREATE TRIGGER trg_setores_cidade_so_super_admin
  BEFORE INSERT OR UPDATE OF cidade_id ON public.setores
  FOR EACH ROW EXECUTE FUNCTION public.fn_setores_cidade_so_super_admin();

-- ── 3. O RH usa a cidade do setor ───────────────────────────────────────────

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
     AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'A cidade do setor é definida pelo super admin em Configurações > Setores.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_rh_config_cidade_do_setor ON public.rh_config_setores;
CREATE TRIGGER trg_rh_config_cidade_do_setor
  BEFORE INSERT OR UPDATE OF celula_id ON public.rh_config_setores
  FOR EACH ROW EXECUTE FUNCTION public.fn_rh_config_cidade_do_setor();

-- ── 4. Prova ────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy
              WHERE polrelid = 'public.rh_celulas'::REGCLASS
                AND polname IN ('rh_celulas_write', 'rh_celulas_insert_setores')) THEN
    RAISE EXCEPTION 'Policies antigas de escrita em rh_celulas continuam de pé.';
  END IF;
  IF (SELECT COUNT(*) FROM pg_trigger
       WHERE tgname IN ('trg_setores_cidade_so_super_admin', 'trg_rh_config_cidade_do_setor')
         AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'Gatilhos da cidade do setor ausentes.';
  END IF;
END
$prova$;

COMMIT;
