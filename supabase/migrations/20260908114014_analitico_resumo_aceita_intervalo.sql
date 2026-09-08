-- A lente "Periodo" do Analitico nao filtrava nada.
--
-- O componente ate calculava as pontas do recorte (`pisoDoRecorte` e
-- `tetoDoRecorte`), mas elas so alimentavam o detalhe de UM operador e os
-- limites do date picker. A lista principal e os cards de metrica vinham de
-- fn_analitico_resumo_por_operador(empresa, mes) — que so sabia somar por MES.
-- Escolher 03/09 a 07/09 devolvia setembro inteiro, sem erro nenhum na tela:
-- o filtro parecia funcionar e mentia.
--
-- A correcao e dar um intervalo a funcao. `p_inicio` e `p_fim` entram com
-- DEFAULT NULL e, quando nulos, COALESCE reconstroi exatamente o mes de
-- p_mes — entao toda chamada antiga continua com o mesmo resultado.
--
-- Por que BETWEEN e nao o `>= inicio AND < inicio + 1 mes` de antes: agora o
-- teto e uma data escolhida na tela, e o usuario que marca "ate 07/09" espera
-- o dia 07 dentro do resultado. `data_pagamento` e DATE, sem hora, entao
-- BETWEEN fecha nos dois lados sem o risco de cortar o ultimo dia.
--
-- O resto do corpo (escopo por clone, o ARRAY resolvido uma vez, a exclusao do
-- super_admin) e o de 20260828115344, sem alteracao.

CREATE OR REPLACE FUNCTION public.fn_analitico_resumo_por_operador(
  p_empresa_id UUID,
  p_mes TEXT,
  p_inicio DATE DEFAULT NULL,
  p_fim DATE DEFAULT NULL
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
  v_de DATE;
  v_ate DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('ver_analitico')
     OR NOT public.fn_user_tem('analitico_sub_analitico')
     OR NOT public.fn_user_tem('analitico_sub_ranking') THEN
    RETURN;
  END IF;

  -- Sem intervalo, o mes inteiro de p_mes: o comportamento de antes, intacto.
  v_de  := COALESCE(p_inicio, (p_mes || '-01')::DATE);
  v_ate := COALESCE(
    p_fim,
    ((p_mes || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE
  );

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
    AND ar.data_pagamento BETWEEN v_de AND v_ate
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

-- A versao de 2 argumentos sai de cena. Deixa-la viva criaria uma sobrecarga
-- ambigua para quem chama com 2 parametros nomeados, e o PostgREST escolheria
-- por assinatura — o filtro de periodo voltaria a ser ignorado sem aviso.
DROP FUNCTION IF EXISTS public.fn_analitico_resumo_por_operador(UUID, TEXT);

REVOKE ALL ON FUNCTION public.fn_analitico_resumo_por_operador(UUID, TEXT, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_analitico_resumo_por_operador(UUID, TEXT, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_analitico_resumo_por_operador(UUID, TEXT, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.fn_analitico_resumo_por_operador(UUID, TEXT, DATE, DATE) IS
  'Resumo do Analitico por operador. Sem p_inicio/p_fim soma o mes de p_mes; '
  'com eles, o intervalo fechado (a lente Periodo da tela). Alcance individual '
  've a propria equipe; setor e todos_setores seguem fn_user_escopo(analitico). '
  'Setor e equipe incluem os operadores clonados por equipe_operadores_clones.';

-- Prova de que a assinatura antiga saiu e a nova esta no lugar.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_analitico_resumo_por_operador'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, text'
  ) THEN
    RAISE EXCEPTION 'A sobrecarga de 2 argumentos continua viva';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_analitico_resumo_por_operador'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, text, date, date'
  ) THEN
    RAISE EXCEPTION 'A versao com intervalo nao foi criada';
  END IF;
END $$;
