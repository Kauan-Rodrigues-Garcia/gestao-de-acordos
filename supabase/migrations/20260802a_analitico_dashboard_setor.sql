-- ═══════════════════════════════════════════════════════════════════════════
-- 20260802a — O dashboard passa a enxergar o SETOR de cada recebimento
-- ═══════════════════════════════════════════════════════════════════════════
-- Problema: `fn_analitico_dashboard_mes_json` agrupava por
--   (dia, operador, forma, forma_detalhe, status)
-- e não devolvia `setor_id`. Sem esse campo o dashboard não tinha como aplicar
-- a regra de acumulado que a aba Analítico usa desde a 20260724a:
--
--   • setor NORMAL      → total = soma das linhas CARIMBADAS com aquele setor
--                          (operadores + órfãos). Clone não altera o total.
--   • setor ALTERNATIVO → total = soma dos usuários do setor (membros + clones)
--                          + os órfãos carimbados nele.
--
-- Sem o carimbo, o dashboard só sabia somar por operador. Resultado: para um
-- setor normal ele somava os clones (que não são dele) e descartava os órfãos
-- (que são), e o número nunca fechava com o card "Total recebido" da aba
-- Analítico nem com o Desempenho Equipes. Este é o mesmo dado, em duas telas,
-- com duas contas diferentes.
--
-- Correção: incluir `setor_id` na saída, já resolvido:
--   COALESCE(ar.setor_id, perfil_de_quem_importou.setor_id)
-- que é exatamente `setorDaLinha()` do cliente (analitico.service.ts). Linhas
-- anteriores à 20260712a não têm carimbo próprio e caem no setor de quem
-- importou — a mesma regra do backfill daquela migration.
--
-- O GROUP BY ganha uma coluna, então o número de grupos pode crescer; como o
-- retorno é UM JSONB (20260729b), não há risco de corte por max_rows.
--
-- Escopo e permissões seguem idênticos: operador vê as próprias linhas,
-- líder+ vê a empresa. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_analitico_dashboard_mes_json(
  p_empresa_id UUID,
  p_mes        TEXT   -- 'yyyy-MM'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_lider BOOLEAN;
  v_inicio   DATE := (p_mes || '-01')::DATE;
  v_fim      DATE := (DATE_TRUNC('month', (p_mes || '-01')::DATE)
                      + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_out      JSONB;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN '[]'::JSONB;
  END IF;

  v_is_lider := public.fn_user_has_any_role(
                  ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
                );

  SELECT COALESCE(jsonb_agg(t), '[]'::JSONB)
    INTO v_out
    FROM (
      SELECT
        ar.data_pagamento               AS dia,
        ar.operador_id,
        -- Setor da linha: o carimbado na importação; na falta dele (linhas
        -- anteriores à 20260712a) o setor de quem importou.
        COALESCE(ar.setor_id, imp.setor_id) AS setor_id,
        ar.forma_pagamento,
        ar.forma_detalhe,
        ar.status_tabulacao,
        SUM(ar.valor_recebido)::NUMERIC AS total,
        SUM(ar.total_ho)::NUMERIC       AS total_ho,
        COUNT(*)::BIGINT                AS qtd
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis imp ON imp.id = ar.importado_por_id
      WHERE ar.empresa_id     = p_empresa_id
        AND ar.data_pagamento BETWEEN v_inicio AND v_fim
        AND (v_is_lider OR ar.operador_id = (SELECT auth.uid()))
      GROUP BY ar.data_pagamento, ar.operador_id,
               COALESCE(ar.setor_id, imp.setor_id),
               ar.forma_pagamento, ar.forma_detalhe, ar.status_tabulacao
    ) t;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_analitico_dashboard_mes_json(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_analitico_dashboard_mes_json(UUID, TEXT) IS
  'Agregado mensal do analítico para o dashboard, em um único JSONB. Devolve '
  'setor_id (carimbo da importação, com fallback no setor de quem importou) '
  'para o dashboard aplicar a MESMA regra de acumulado da aba Analítico: setor '
  'normal soma pelo carimbo, setor alternativo soma pelos usuários. Escopo: '
  'operador vê as próprias linhas, líder+ vê a empresa.';
