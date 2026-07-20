-- ============================================================
-- Fix: resolução de "setor dono" do analítico ficava sem o fallback pro
-- importador (2026-07-21)
--
-- fn_relatorio_status_validacao / fn_relatorio_validar_setor resolviam o
-- setor de uma linha de analitico_recebimentos só por
-- COALESCE(ar.setor_id, operador->perfis.setor_id) — mas linhas órfãs (sem
-- operador resolvido, comum na PaguePlay) não têm nem uma coisa nem outra,
-- então ficavam de fora de QUALQUER setor e nunca apareciam como "pendente"
-- nem "validado" — pareciam simplesmente não existir.
--
-- diario_recebimentos já resolvia isso certo (trigger fn_diario_preencher_setor,
-- 20260721b): operador->setor, senão quem importou->setor. Esse fix só alinha
-- o analítico com o mesmo critério: operador->setor, senão importador->setor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_relatorio_status_validacao(
  p_empresa_id UUID, p_setor_id UUID, p_mes INTEGER, p_ano INTEGER
) RETURNS TABLE(
  origem TEXT, dias_com_dado INTEGER, dias_validados INTEGER,
  valor_atual NUMERIC, valor_validado NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio DATE := make_date(p_ano, p_mes, 1);
  v_fim    DATE := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;

  RETURN QUERY
  WITH atual_analitico AS (
    SELECT ar.data_pagamento AS dia, SUM(ar.valor_recebido) AS total
    FROM public.analitico_recebimentos ar
    LEFT JOIN public.perfis p_op  ON p_op.id  = ar.operador_id
    LEFT JOIN public.perfis p_imp ON p_imp.id = ar.importado_por_id
    WHERE ar.empresa_id = p_empresa_id
      AND COALESCE(ar.setor_id, p_op.setor_id, p_imp.setor_id) = p_setor_id
      AND ar.data_pagamento BETWEEN v_inicio AND v_fim
    GROUP BY ar.data_pagamento
  ),
  valid_analitico AS (
    SELECT dia_referencia AS dia, valor_validado AS total
    FROM public.relatorio_validacoes_dia
    WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id AND origem = 'analitico'
      AND dia_referencia BETWEEN v_inicio AND v_fim
  ),
  atual_diario AS (
    SELECT dia_referencia AS dia, SUM(valor_recebido) AS total
    FROM public.diario_recebimentos
    WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id
      AND dia_referencia BETWEEN v_inicio AND v_fim
    GROUP BY dia_referencia
  ),
  valid_diario AS (
    SELECT dia_referencia AS dia, valor_validado AS total
    FROM public.relatorio_validacoes_dia
    WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id AND origem = 'diario'
      AND dia_referencia BETWEEN v_inicio AND v_fim
  )
  SELECT 'analitico'::TEXT,
         (SELECT COUNT(*) FROM atual_analitico)::INTEGER,
         (SELECT COUNT(*) FROM atual_analitico a JOIN valid_analitico v ON v.dia = a.dia AND v.total = a.total)::INTEGER,
         (SELECT COALESCE(SUM(total), 0) FROM atual_analitico),
         (SELECT COALESCE(SUM(total), 0) FROM valid_analitico)
  UNION ALL
  SELECT 'diario'::TEXT,
         (SELECT COUNT(*) FROM atual_diario)::INTEGER,
         (SELECT COUNT(*) FROM atual_diario a JOIN valid_diario v ON v.dia = a.dia AND v.total = a.total)::INTEGER,
         (SELECT COALESCE(SUM(total), 0) FROM atual_diario),
         (SELECT COALESCE(SUM(total), 0) FROM valid_diario);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_relatorio_validar_setor(
  p_empresa_id UUID, p_setor_id UUID, p_mes INTEGER, p_ano INTEGER, p_origem TEXT DEFAULT NULL
) RETURNS TABLE(ok BOOLEAN, erro TEXT, dias_validados INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_inicio  DATE := make_date(p_ano, p_mes, 1);
  v_fim     DATE := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_count_a INTEGER := 0;
  v_count_d INTEGER := 0;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
     OR NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN QUERY SELECT false, 'sem_permissao'::TEXT, 0; RETURN;
  END IF;
  IF p_origem IS NOT NULL AND p_origem NOT IN ('analitico','diario') THEN
    RETURN QUERY SELECT false, 'origem_invalida'::TEXT, 0; RETURN;
  END IF;

  IF p_origem IS NULL OR p_origem = 'analitico' THEN
    INSERT INTO public.relatorio_validacoes_dia
      (empresa_id, setor_id, origem, dia_referencia, valor_validado, qtd_registros_validados, validado_por, validado_em)
    SELECT p_empresa_id, p_setor_id, 'analitico', ar.data_pagamento,
           SUM(ar.valor_recebido), COUNT(*), v_uid, NOW()
    FROM public.analitico_recebimentos ar
    LEFT JOIN public.perfis p_op  ON p_op.id  = ar.operador_id
    LEFT JOIN public.perfis p_imp ON p_imp.id = ar.importado_por_id
    WHERE ar.empresa_id = p_empresa_id
      AND COALESCE(ar.setor_id, p_op.setor_id, p_imp.setor_id) = p_setor_id
      AND ar.data_pagamento BETWEEN v_inicio AND v_fim
    GROUP BY ar.data_pagamento
    ON CONFLICT (empresa_id, setor_id, origem, dia_referencia) DO UPDATE
      SET valor_validado           = EXCLUDED.valor_validado,
          qtd_registros_validados  = EXCLUDED.qtd_registros_validados,
          validado_por             = EXCLUDED.validado_por,
          validado_em              = NOW();
    GET DIAGNOSTICS v_count_a = ROW_COUNT;
  END IF;

  IF p_origem IS NULL OR p_origem = 'diario' THEN
    INSERT INTO public.relatorio_validacoes_dia
      (empresa_id, setor_id, origem, dia_referencia, valor_validado, qtd_registros_validados, validado_por, validado_em)
    SELECT p_empresa_id, p_setor_id, 'diario', d.dia_referencia,
           SUM(d.valor_recebido), COUNT(*), v_uid, NOW()
    FROM public.diario_recebimentos d
    WHERE d.empresa_id = p_empresa_id AND d.setor_id = p_setor_id
      AND d.dia_referencia BETWEEN v_inicio AND v_fim
    GROUP BY d.dia_referencia
    ON CONFLICT (empresa_id, setor_id, origem, dia_referencia) DO UPDATE
      SET valor_validado           = EXCLUDED.valor_validado,
          qtd_registros_validados  = EXCLUDED.qtd_registros_validados,
          validado_por             = EXCLUDED.validado_por,
          validado_em              = NOW();
    GET DIAGNOSTICS v_count_d = ROW_COUNT;
  END IF;

  INSERT INTO public.logs_sistema (usuario_id, empresa_id, acao, tabela, registro_id, detalhes)
  VALUES (v_uid, p_empresa_id, 'RELATORIO_VALIDADO', 'relatorio_validacoes_dia', p_setor_id::TEXT,
          jsonb_build_object('setor_id', p_setor_id, 'mes', p_mes, 'ano', p_ano, 'origem', COALESCE(p_origem, 'ambas')));

  RETURN QUERY SELECT true, NULL::TEXT, v_count_a + v_count_d;
END;
$$;

-- ── fn_pet_discrepancias_validacao usa diario_recebimentos.setor_id direto,
-- esse já estava certo (o diário nunca teve o problema); nada a mudar lá.
