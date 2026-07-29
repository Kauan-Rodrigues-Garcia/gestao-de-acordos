-- ═══════════════════════════════════════════════════════════════════════════
-- 20260729b — Dashboard do analítico em UMA chamada (JSON), sem re-agregar
-- ═══════════════════════════════════════════════════════════════════════════
-- Problema: `fn_analitico_dashboard_mes` devolve uma LINHA por grupo
-- (dia × operador × forma × forma_detalhe × status). Num mês cheio isso passa
-- de 1000 grupos, o PostgREST corta em max_rows=1000, e a 20260726b resolveu
-- isso paginando por range no cliente.
--
-- A correção funcionou, mas custa caro: o PostgREST envelopa a chamada em
--     SELECT * FROM fn_analitico_dashboard_mes(...) ORDER BY ... LIMIT 1000 OFFSET n
-- e a função plpgsql (RETURN QUERY) MATERIALIZA o resultado inteiro em cada
-- chamada. Ou seja: 3 páginas = 3 agregações completas do mês, não um terço
-- cada. O custo cresce com o número de páginas.
--
-- Solução: devolver o conjunto agregado como um único JSONB. Uma linha só,
-- então max_rows nunca corta, a paginação desaparece e a agregação roda UMA vez.
-- Sem ORDER BY: a ordem existia apenas para tornar o range determinístico, e o
-- cliente agrega tudo em memória (a ordem nunca importou para o resultado).
--
-- ⚠️  A função antiga é PRESERVADA de propósito. O frontend novo tenta esta
--     primeiro e cai na antiga se ela não existir, então a ordem entre aplicar
--     a migration e publicar o build não importa. Depois que o build novo
--     estiver em produção, `fn_analitico_dashboard_mes` pode ser removida.
--
-- Mesma semântica de escopo da anterior: operador vê só as próprias linhas;
-- líder+ vê a empresa toda. Idempotente.

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
  -- Mesmo gate de empresa da função original. Devolve array vazio (não NULL)
  -- para o cliente não precisar distinguir "sem acesso" de "sem dados".
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
        ar.forma_pagamento,
        ar.forma_detalhe,
        ar.status_tabulacao,
        SUM(ar.valor_recebido)::NUMERIC AS total,
        SUM(ar.total_ho)::NUMERIC       AS total_ho,
        COUNT(*)::BIGINT                AS qtd
      FROM public.analitico_recebimentos ar
      WHERE ar.empresa_id     = p_empresa_id
        AND ar.data_pagamento BETWEEN v_inicio AND v_fim
        AND (v_is_lider OR ar.operador_id = (SELECT auth.uid()))
      GROUP BY ar.data_pagamento, ar.operador_id, ar.forma_pagamento,
               ar.forma_detalhe, ar.status_tabulacao
    ) t;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_analitico_dashboard_mes_json(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_analitico_dashboard_mes_json(UUID, TEXT) IS
  'Agregado mensal do analítico para o dashboard, em um único JSONB. Substitui '
  'fn_analitico_dashboard_mes (que exigia paginação por range no cliente e, com '
  'isso, re-executava a agregação a cada página). Escopo: operador vê as '
  'próprias linhas, líder+ vê a empresa.';
