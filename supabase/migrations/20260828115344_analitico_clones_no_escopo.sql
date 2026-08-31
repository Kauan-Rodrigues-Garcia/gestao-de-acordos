-- O resumo por operador e consumido pelo Ranking e pelo Painel Lider.
-- Em setores alternativos, os operadores pertencem ao setor por meio dos
-- vinculos de clone; comparar apenas perfis.setor_id eliminava todo o analitico
-- e deixava visivel somente o ajuste manual, que ja era clone-aware desde
-- 20260825120000 (fn_ajuste_no_meu_alcance).
--
-- Por que a lista de operadores vem em um ARRAY e nao de um EXISTS com
-- fn_setores_do_operador(ar.operador_id): aquela funcao e SECURITY DEFINER, o
-- planner nao faz inline, e o EXISTS correlacionado a executaria uma vez por
-- LINHA de analitico_recebimentos — nao por operador distinto. Um mes com
-- dezenas de milhares de pagamentos e algumas dezenas de operadores pagaria
-- dezenas de milhares de chamadas, cada uma varrendo equipe_operadores_clones
-- (que so tem indice com equipe_id na frente). Resolvendo o conjunto UMA vez, a
-- comparacao vira `= ANY(...)` e volta a usar idx_analitico_empresa_op_data.
-- E o mesmo padrao de 20260818200000.
--
-- A consulta do ARRAY e a inversa exata de fn_setores_do_operador: setor do
-- perfil UNION setor das equipes onde a pessoa e clone. O `IS NOT NULL` que
-- aquela funcao faz e dispensavel aqui — v_setor_id ja nao e nulo, e igualdade
-- nunca casa com NULL.

CREATE OR REPLACE FUNCTION public.fn_analitico_resumo_por_operador(
  p_empresa_id UUID,
  p_mes TEXT
)
RETURNS TABLE(
  operador_id UUID,
  operador_usuario TEXT,
  operador_nome TEXT,
  total_recebido NUMERIC,
  total_ho NUMERIC,
  total_pagamentos BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_escopo INTEGER;
  v_equipe_id UUID;
  v_setor_id UUID;
  v_ops_setor UUID[] := '{}';
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('ver_analitico')
     OR NOT public.fn_user_tem('analitico_sub_analitico')
     OR NOT public.fn_user_tem('analitico_sub_ranking') THEN
    RETURN;
  END IF;

  v_escopo := public.fn_user_escopo('analitico');

  SELECT p.equipe_id, p.setor_id
    INTO v_equipe_id, v_setor_id
  FROM public.perfis p
  WHERE p.id = auth.uid();

  -- Quem esta no meu setor: por perfil ou por clone. Resolvido uma vez so.
  IF v_escopo = 2 AND v_setor_id IS NOT NULL THEN
    v_ops_setor := ARRAY(
      SELECT pf.id
        FROM public.perfis pf
       WHERE pf.setor_id = v_setor_id
      UNION
      SELECT c.operador_id
        FROM public.equipe_operadores_clones c
        JOIN public.equipes e ON e.id = c.equipe_id
       WHERE e.setor_id = v_setor_id
    );
  END IF;

  RETURN QUERY
  SELECT
    ar.operador_id,
    MIN(ar.operador_usuario) AS operador_usuario,
    p.nome AS operador_nome,
    SUM(ar.valor_recebido)::NUMERIC AS total_recebido,
    SUM(ar.total_ho)::NUMERIC AS total_ho,
    COUNT(*)::BIGINT AS total_pagamentos
  FROM public.analitico_recebimentos ar
  LEFT JOIN public.perfis p ON p.id = ar.operador_id
  WHERE ar.empresa_id = p_empresa_id
    AND ar.operador_id IS NOT NULL
    AND COALESCE(p.perfil, '') <> 'super_admin'
    AND ar.data_pagamento >= (p_mes || '-01')::DATE
    AND ar.data_pagamento < ((p_mes || '-01')::DATE + INTERVAL '1 month')
    AND (
      v_escopo >= 3
      -- Array vazio quando o escopo nao e de setor: `= ANY('{}')` e falso.
      OR (v_escopo = 2 AND ar.operador_id = ANY(v_ops_setor))
      OR (
        v_escopo < 2
        AND v_equipe_id IS NOT NULL
        AND (
          p.equipe_id = v_equipe_id
          OR EXISTS (
            SELECT 1
            FROM public.equipe_operadores_clones c
            WHERE c.operador_id = ar.operador_id
              AND c.equipe_id = v_equipe_id
          )
        )
      )
      OR (
        v_escopo < 2
        AND v_equipe_id IS NULL
        AND ar.operador_id = auth.uid()
      )
    )
  GROUP BY ar.operador_id, p.nome
  ORDER BY total_recebido DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_analitico_resumo_por_operador(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_analitico_resumo_por_operador(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_analitico_resumo_por_operador(UUID, TEXT) IS
  'Resumo mensal controlado pelo Analitico. Alcance individual ve a propria '
  'equipe; setor e todos_setores seguem fn_user_escopo(analitico). Setor e '
  'equipe incluem os operadores clonados por equipe_operadores_clones.';
