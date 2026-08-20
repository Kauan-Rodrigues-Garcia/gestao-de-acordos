-- Dashboard incremental: elimina a avaliação de permissões por linha em
-- `acordos`, preserva old/new completos no realtime e mantém o analítico
-- agregado com decisões de permissão calculadas uma vez por chamada.
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_acordos_empresas_permitidas(
  p_chaves TEXT[],
  p_exigir_visao_geral BOOLEAN DEFAULT false
)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT e.id
    FROM public.empresas e
   WHERE public.fn_can_access_empresa(e.id)
     AND EXISTS (
       SELECT 1
         FROM unnest(p_chaves) AS chave
        WHERE public.fn_tem_permissao(chave,e.id)
     )
     AND (
       NOT p_exigir_visao_geral
       OR public.fn_tem_permissao('ver_acordos_gerais',e.id)
     );
$function$;

REVOKE ALL ON FUNCTION public.fn_acordos_empresas_permitidas(TEXT[],BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_acordos_empresas_permitidas(TEXT[],BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_acordos_empresas_permitidas(TEXT[],BOOLEAN)
  TO authenticated, service_role;

-- A migration anterior criou duas policies `permissoes3_*` por operação e
-- ambas chamavam a função de permissão por linha. As policies legadas são
-- mantidas: a permissiva abaixo concede o que a matriz ligou, e a restritiva
-- impede que uma regra antiga amplie o que a matriz desligou.
DROP POLICY IF EXISTS permissoes3_acordos_select_allow ON public.acordos;
DROP POLICY IF EXISTS permissoes3_acordos_select_gate ON public.acordos;
DROP POLICY IF EXISTS permissoes3_acordos_insert_allow ON public.acordos;
DROP POLICY IF EXISTS permissoes3_acordos_insert_gate ON public.acordos;
DROP POLICY IF EXISTS permissoes3_acordos_update_allow ON public.acordos;
DROP POLICY IF EXISTS permissoes3_acordos_update_gate ON public.acordos;
DROP POLICY IF EXISTS permissoes3_acordos_delete_allow ON public.acordos;
DROP POLICY IF EXISTS permissoes3_acordos_delete_gate ON public.acordos;

ALTER TABLE public.acordos ENABLE ROW LEVEL SECURITY;

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
    OR empresa_id IN (
      SELECT public.fn_acordos_empresas_permitidas(
        ARRAY['ver_dashboard','ver_acordos']::TEXT[],true
      )
    )
  )
);

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
    OR empresa_id IN (
      SELECT public.fn_acordos_empresas_permitidas(
        ARRAY['ver_dashboard','ver_acordos']::TEXT[],true
      )
    )
  )
);

CREATE POLICY permissoes3_acordos_insert_allow
ON public.acordos AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
  empresa_id IN (
    SELECT public.fn_acordos_empresas_permitidas(
      ARRAY['criar_acordos','restaurar_lixeira']::TEXT[],false
    )
  )
  AND (
    operador_id=(SELECT auth.uid())
    OR empresa_id IN (
      SELECT public.fn_acordos_empresas_permitidas(
        ARRAY['criar_acordos','restaurar_lixeira']::TEXT[],true
      )
    )
  )
);

CREATE POLICY permissoes3_acordos_insert_gate
ON public.acordos AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  empresa_id IN (
    SELECT public.fn_acordos_empresas_permitidas(
      ARRAY['criar_acordos','restaurar_lixeira']::TEXT[],false
    )
  )
  AND (
    operador_id=(SELECT auth.uid())
    OR empresa_id IN (
      SELECT public.fn_acordos_empresas_permitidas(
        ARRAY['criar_acordos','restaurar_lixeira']::TEXT[],true
      )
    )
  )
);

CREATE POLICY permissoes3_acordos_update_allow
ON public.acordos AS PERMISSIVE FOR UPDATE TO authenticated
USING (
  empresa_id IN (
    SELECT public.fn_acordos_empresas_permitidas(ARRAY['editar_acordos']::TEXT[],false)
  )
  AND (
    operador_id=(SELECT auth.uid())
    OR empresa_id IN (
      SELECT public.fn_acordos_empresas_permitidas(ARRAY['editar_acordos']::TEXT[],true)
    )
  )
)
WITH CHECK (
  empresa_id IN (
    SELECT public.fn_acordos_empresas_permitidas(ARRAY['editar_acordos']::TEXT[],false)
  )
  AND (
    operador_id=(SELECT auth.uid())
    OR empresa_id IN (
      SELECT public.fn_acordos_empresas_permitidas(ARRAY['editar_acordos']::TEXT[],true)
    )
  )
);

CREATE POLICY permissoes3_acordos_update_gate
ON public.acordos AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  empresa_id IN (
    SELECT public.fn_acordos_empresas_permitidas(ARRAY['editar_acordos']::TEXT[],false)
  )
  AND (
    operador_id=(SELECT auth.uid())
    OR empresa_id IN (
      SELECT public.fn_acordos_empresas_permitidas(ARRAY['editar_acordos']::TEXT[],true)
    )
  )
)
WITH CHECK (
  empresa_id IN (
    SELECT public.fn_acordos_empresas_permitidas(ARRAY['editar_acordos']::TEXT[],false)
  )
  AND (
    operador_id=(SELECT auth.uid())
    OR empresa_id IN (
      SELECT public.fn_acordos_empresas_permitidas(ARRAY['editar_acordos']::TEXT[],true)
    )
  )
);

CREATE POLICY permissoes3_acordos_delete_allow
ON public.acordos AS PERMISSIVE FOR DELETE TO authenticated
USING (
  empresa_id IN (
    SELECT public.fn_acordos_empresas_permitidas(ARRAY['excluir_acordos']::TEXT[],false)
  )
  AND (
    operador_id=(SELECT auth.uid())
    OR empresa_id IN (
      SELECT public.fn_acordos_empresas_permitidas(ARRAY['excluir_acordos']::TEXT[],true)
    )
  )
);

CREATE POLICY permissoes3_acordos_delete_gate
ON public.acordos AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  empresa_id IN (
    SELECT public.fn_acordos_empresas_permitidas(ARRAY['excluir_acordos']::TEXT[],false)
  )
  AND (
    operador_id=(SELECT auth.uid())
    OR empresa_id IN (
      SELECT public.fn_acordos_empresas_permitidas(ARRAY['excluir_acordos']::TEXT[],true)
    )
  )
);

-- Igualdade da empresa, intervalo do mês e desempate usado pela paginação.
CREATE INDEX IF NOT EXISTS idx_acordos_empresa_vencimento_id
  ON public.acordos(empresa_id,vencimento,id);

-- UPDATE/DELETE do realtime precisam da imagem anterior para retirar o valor
-- antigo do card/gráfico antes de somar o novo.
ALTER TABLE public.acordos REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.fn_analitico_dashboard_mes_json(
  p_empresa_id UUID,
  p_mes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         UUID := auth.uid();
  v_pode_modulo BOOLEAN;
  v_visao_ampla BOOLEAN;
  v_inicio      DATE := (p_mes||'-01')::DATE;
  v_fim         DATE := (date_trunc('month',(p_mes||'-01')::DATE)
                          + interval '1 month' - interval '1 day')::DATE;
  v_out         JSONB;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN '[]'::JSONB;
  END IF;

  v_pode_modulo := public.fn_tem_permissao('ver_dashboard',p_empresa_id)
    OR public.fn_tem_permissao('ver_analitico',p_empresa_id);
  IF NOT v_pode_modulo THEN RETURN '[]'::JSONB; END IF;

  v_visao_ampla := public.fn_tem_permissao('ver_analiticos_global',p_empresa_id)
    OR public.fn_tem_permissao('ver_acordos_gerais',p_empresa_id);

  SELECT COALESCE(jsonb_agg(t),'[]'::JSONB)
    INTO v_out
    FROM (
      SELECT
        ar.data_pagamento AS dia,
        ar.operador_id,
        COALESCE(ar.setor_id,imp.setor_id) AS setor_id,
        ar.forma_pagamento,
        ar.forma_detalhe,
        ar.status_tabulacao,
        sum(ar.valor_recebido)::NUMERIC AS total,
        sum(ar.total_ho)::NUMERIC AS total_ho,
        count(*)::BIGINT AS qtd
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis imp ON imp.id=ar.importado_por_id
      WHERE ar.empresa_id=p_empresa_id
        AND ar.data_pagamento BETWEEN v_inicio AND v_fim
        AND (v_visao_ampla OR ar.operador_id=v_uid)
      GROUP BY ar.data_pagamento,ar.operador_id,
               COALESCE(ar.setor_id,imp.setor_id),ar.forma_pagamento,
               ar.forma_detalhe,ar.status_tabulacao
      ORDER BY ar.data_pagamento,ar.operador_id NULLS LAST,
               ar.forma_pagamento NULLS LAST,ar.forma_detalhe NULLS LAST,
               ar.status_tabulacao NULLS LAST
    ) t;
  RETURN v_out;
END;
$function$;

-- Mantém a assinatura legada sem `setor_id`; o app usa a versão JSON acima,
-- mas instalações em transição continuam funcionando sem custo por linha.
CREATE OR REPLACE FUNCTION public.fn_analitico_dashboard_mes(
  p_empresa_id UUID,
  p_mes TEXT
)
RETURNS TABLE(
  dia DATE,operador_id UUID,forma_pagamento TEXT,forma_detalhe TEXT,
  status_tabulacao TEXT,total NUMERIC,total_ho NUMERIC,qtd BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         UUID := auth.uid();
  v_pode_modulo BOOLEAN;
  v_visao_ampla BOOLEAN;
  v_inicio      DATE := (p_mes||'-01')::DATE;
  v_fim         DATE := (date_trunc('month',(p_mes||'-01')::DATE)
                          + interval '1 month' - interval '1 day')::DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;
  v_pode_modulo := public.fn_tem_permissao('ver_dashboard',p_empresa_id)
    OR public.fn_tem_permissao('ver_analitico',p_empresa_id);
  IF NOT v_pode_modulo THEN RETURN; END IF;
  v_visao_ampla := public.fn_tem_permissao('ver_analiticos_global',p_empresa_id)
    OR public.fn_tem_permissao('ver_acordos_gerais',p_empresa_id);

  RETURN QUERY
  SELECT ar.data_pagamento,ar.operador_id,ar.forma_pagamento,ar.forma_detalhe,
         ar.status_tabulacao,sum(ar.valor_recebido)::NUMERIC,
         sum(ar.total_ho)::NUMERIC,count(*)::BIGINT
    FROM public.analitico_recebimentos ar
   WHERE ar.empresa_id=p_empresa_id
     AND ar.data_pagamento BETWEEN v_inicio AND v_fim
     AND (v_visao_ampla OR ar.operador_id=v_uid)
   GROUP BY ar.data_pagamento,ar.operador_id,ar.forma_pagamento,
            ar.forma_detalhe,ar.status_tabulacao
   ORDER BY ar.data_pagamento,ar.operador_id NULLS LAST,
            ar.forma_pagamento NULLS LAST,ar.forma_detalhe NULLS LAST,
            ar.status_tabulacao NULLS LAST;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_analitico_dashboard_mes_json(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_analitico_dashboard_mes(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_analitico_dashboard_mes_json(UUID,TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_analitico_dashboard_mes(UUID,TEXT)
  TO authenticated, service_role;

ANALYZE public.acordos;
COMMIT;
