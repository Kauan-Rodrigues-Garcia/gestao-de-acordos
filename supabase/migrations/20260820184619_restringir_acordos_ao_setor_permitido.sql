-- A visao de acordos tem tres degraus independentes:
--   1. sem `ver_acordos_gerais`: somente os proprios;
--   2. com visao geral e sem `ver_todos_setores`: terceiros do proprio setor;
--   3. com as duas chaves: toda a empresa permitida.
--
-- A policy anterior implementava apenas os degraus 1 e 3. Isso fazia
-- `ver_todos_setores = false` ser ignorado na tabela de acordos.
BEGIN;

DROP POLICY IF EXISTS permissoes3_acordos_select_allow ON public.acordos;
DROP POLICY IF EXISTS permissoes3_acordos_select_gate ON public.acordos;

CREATE POLICY permissoes3_acordos_select_allow
ON public.acordos AS PERMISSIVE FOR SELECT TO authenticated
USING (
  empresa_id IN (
    SELECT public.fn_acordos_empresas_permitidas(
      ARRAY['ver_dashboard','ver_acordos']::TEXT[],false
    )
  )
  AND (
    operador_id=(SELECT auth.uid())
    OR (
      empresa_id IN (
        SELECT public.fn_acordos_empresas_permitidas(
          ARRAY['ver_dashboard','ver_acordos']::TEXT[],true
        )
      )
      AND (
        empresa_id IN (
          SELECT public.fn_acordos_empresas_permitidas(
            ARRAY['ver_todos_setores']::TEXT[],false
          )
        )
        OR setor_id=(SELECT public.fn_user_setor_id())
        OR (
          setor_id IS NULL
          AND public.fn_operador_setor_id(operador_id)=(SELECT public.fn_user_setor_id())
        )
        OR public.fn_operador_clonado_no_setor(
          operador_id,(SELECT public.fn_user_setor_id())
        )
      )
    )
  )
);

-- RESTRICTIVE e deliberadamente igual a permissiva: policies legadas podem
-- conceder acesso, mas nunca ampliar o escopo definido pela matriz atual.
CREATE POLICY permissoes3_acordos_select_gate
ON public.acordos AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  empresa_id IN (
    SELECT public.fn_acordos_empresas_permitidas(
      ARRAY['ver_dashboard','ver_acordos']::TEXT[],false
    )
  )
  AND (
    operador_id=(SELECT auth.uid())
    OR (
      empresa_id IN (
        SELECT public.fn_acordos_empresas_permitidas(
          ARRAY['ver_dashboard','ver_acordos']::TEXT[],true
        )
      )
      AND (
        empresa_id IN (
          SELECT public.fn_acordos_empresas_permitidas(
            ARRAY['ver_todos_setores']::TEXT[],false
          )
        )
        OR setor_id=(SELECT public.fn_user_setor_id())
        OR (
          setor_id IS NULL
          AND public.fn_operador_setor_id(operador_id)=(SELECT public.fn_user_setor_id())
        )
        OR public.fn_operador_clonado_no_setor(
          operador_id,(SELECT public.fn_user_setor_id())
        )
      )
    )
  )
);

DO $verify$
DECLARE
  v_allow TEXT;
  v_gate TEXT;
BEGIN
  SELECT pg_get_expr(p.polqual,p.polrelid) INTO v_allow
    FROM pg_policy p
    JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='acordos'
     AND p.polname='permissoes3_acordos_select_allow';

  SELECT pg_get_expr(p.polqual,p.polrelid) INTO v_gate
    FROM pg_policy p
    JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='acordos'
     AND p.polname='permissoes3_acordos_select_gate'
     AND NOT p.polpermissive;

  IF v_allow IS NULL OR v_gate IS NULL THEN
    RAISE EXCEPTION 'Policies de escopo dos acordos nao foram criadas';
  END IF;
  IF position('ver_todos_setores' IN v_allow)=0
     OR position('fn_user_setor_id' IN v_allow)=0
     OR position('fn_operador_clonado_no_setor' IN v_allow)=0 THEN
    RAISE EXCEPTION 'Policy permissiva perdeu o recorte por setor: %',v_allow;
  END IF;
  IF position('ver_todos_setores' IN v_gate)=0
     OR position('fn_user_setor_id' IN v_gate)=0
     OR position('fn_operador_clonado_no_setor' IN v_gate)=0 THEN
    RAISE EXCEPTION 'Policy restritiva perdeu o recorte por setor: %',v_gate;
  END IF;
END;
$verify$;

COMMIT;
