-- ============================================================================
-- Desafio: o setor alternativo conta a linha só no setor da pessoa
-- ============================================================================
--
-- O defeito (06/10/2026, «DESAFIO DOS LÍDERES — A NOITE DO PÓDIO»): Brunno
-- Piccolo lidera o Marília Digital (alternativo) e o desafio o media pelo setor,
-- como deve — mas com 112%, enquanto o Painel mostrava o setor em 107%.
--
-- A projeção (meta do setor e dias úteis) era a mesma. O que divergia era o
-- RECEBIDO do setor alternativo: aqui ele somava TODAS as linhas de quem está
-- cadastrado ou clonado no setor; o Painel soma pelo resumo por operador
-- (`fn_analitico_resumo_por_operador`), que desde 20260929211916 descarta, na
-- BookPlay a partir de set/2026, a linha carimbada num setor que não é da
-- pessoa. Thaynara Oliveira Santos, clonada no Marília Digital, tinha
-- R$ 1.432,83 carimbados no Play 4 (encerrado): o Painel tirava, o desafio
-- somava. 35.507,09 − 1.432,83 = 34.074,26 → 107%, o número do Painel.
--
-- A correção: no ramo ALTERNATIVO de `receb_setor`, a mesma condição do resumo
-- — conta se a linha não tem carimbo, se a pessoa não tem setor no mês, ou se o
-- carimbo é um dos setores dela (`fn_analitico_setores_no_mes`). Só BookPlay, a
-- partir de set/2026, como lá. Setor NORMAL continua pelo carimbo do relatório;
-- equipe continua por `fn_recebido_por_equipe`, que já tinha a regra.
--
-- O resto da função é letra por letra a versão em produção (conferida em
-- pg_get_functiondef em 06/10/2026, igual a 20260930192744).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_desafio_contexto_equipe(p_desafio_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_desafio      public.desafios%ROWTYPE;
  v_empresas     UUID[];
  v_ano          INT;
  v_mes          INT;
  v_ini          DATE;
  v_fim          DATE;
  v_mes_txt      TEXT;
  v_metas        JSONB;
  v_equipe_emp   JSONB;
  v_config       JSONB;
  v_receb_equipe JSONB;
  v_metas_setor  JSONB;
  v_setor_emp    JSONB;
  v_setores_alt  JSONB;
  v_receb_setor  JSONB;
  v_empresas_ho  JSONB;
BEGIN
  SELECT * INTO v_desafio FROM public.desafios WHERE id = p_desafio_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_empresas := public.fn_desafio_empresas(v_desafio.empresa_id, v_desafio.empresas);
  IF NOT public.fn_desafio_alcanca_empresa(v_empresas) THEN
    RETURN NULL;
  END IF;
  IF v_desafio.status = 'rascunho'
     AND NOT public.fn_user_tem('desafios_configurar')
     AND NOT public.fn_user_tem('desafios_configurar_setor') THEN
    RETURN NULL;
  END IF;
  IF NOT public.fn_desafio_no_meu_alcance(
           v_desafio.setor_id, v_desafio.regra, v_desafio.visibilidade) THEN
    RETURN NULL;
  END IF;
  v_ano     := EXTRACT(YEAR  FROM v_desafio.data_fim)::INT;
  v_mes     := EXTRACT(MONTH FROM v_desafio.data_fim)::INT;
  v_ini     := make_date(v_ano, v_mes, 1);
  v_fim     := (v_ini + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_mes_txt := to_char(v_ini, 'YYYY-MM');
  SELECT COALESCE(jsonb_object_agg(m.referencia_id, m.meta_valor), '{}'::JSONB)
    INTO v_metas
    FROM public.metas m
   WHERE m.empresa_id = ANY (v_empresas)
     AND m.tipo       = 'equipe'
     AND m.mes        = v_mes
     AND m.ano        = v_ano
     AND m.meta_valor > 0;
  SELECT COALESCE(jsonb_object_agg(m.referencia_id, m.meta_valor), '{}'::JSONB)
    INTO v_metas_setor
    FROM public.metas m
   WHERE m.empresa_id = ANY (v_empresas)
     AND m.tipo       = 'setor'
     AND m.mes        = v_mes
     AND m.ano        = v_ano
     AND m.meta_valor > 0;
  SELECT COALESCE(jsonb_object_agg(e.id, e.empresa_id), '{}'::JSONB)
    INTO v_equipe_emp
    FROM public.equipes e
   WHERE e.empresa_id = ANY (v_empresas);
  SELECT COALESCE(jsonb_object_agg(st.id, st.empresa_id), '{}'::JSONB),
         COALESCE(jsonb_agg(st.id) FILTER (WHERE st.alternativo IS TRUE), '[]'::JSONB)
    INTO v_setor_emp, v_setores_alt
    FROM public.setores st
   WHERE st.empresa_id = ANY (v_empresas);
  SELECT COALESCE(jsonb_object_agg(c.empresa_id, jsonb_build_object(
           'feriados',         COALESCE(c.feriados, '[]'::JSONB),
           'contar_dia_atual', COALESCE(c.contar_dia_atual, FALSE)
         )), '{}'::JSONB)
    INTO v_config
    FROM public.metas_config_mes c
   WHERE c.empresa_id = ANY (v_empresas)
     AND c.mes = v_mes
     AND c.ano = v_ano;
  SELECT COALESCE(jsonb_object_agg(r.equipe_id, jsonb_build_object(
           'total', r.total, 'total_ho', r.total_ho, 'qtd', r.qtd
         )), '{}'::JSONB)
    INTO v_receb_equipe
    FROM public.fn_recebido_por_equipe(v_empresas, v_mes_txt, v_ini, v_fim, FALSE) r;
  WITH
  setores_emp AS (
    SELECT st.id, COALESCE(st.alternativo, FALSE) AS alternativo
      FROM public.setores st
     WHERE st.empresa_id = ANY (v_empresas)
  ),
  linhas AS (
    SELECT ar.empresa_id, ar.operador_id, ar.setor_id, ar.valor_recebido,
           COALESCE(ar.total_ho, 0) AS ho
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis p ON p.id = ar.operador_id
     WHERE ar.empresa_id      = ANY (v_empresas)
       AND COALESCE(p.perfil, '') <> 'super_admin'
       AND ar.data_pagamento >= v_ini
       AND ar.data_pagamento <= v_fim
  ),
  conta_no_setor AS (
    SELECT p.setor_id, p.id AS operador_id
      FROM public.perfis p
     WHERE p.empresa_id  = ANY (v_empresas)
       AND p.setor_id   IS NOT NULL
    UNION
    SELECT e.setor_id, cl.operador_id
      FROM public.equipe_operadores_clones cl
      JOIN public.equipes e ON e.id = cl.equipe_id
     WHERE cl.empresa_id        = ANY (v_empresas)
       AND cl.conta_recebimento IS TRUE
       AND e.setor_id          IS NOT NULL
  ),
  -- Os setores de cada pessoa no mês — a régua de `fn_analitico_resumo_por_operador`
  -- (20260929211916): só BookPlay, a partir de set/2026. Fora disso, vazio, e a
  -- condição abaixo deixa tudo passar, como antes.
  casa AS (
    SELECT sm.operador_id, sm.setor_id
      FROM public.empresas em
     CROSS JOIN LATERAL public.fn_analitico_setores_no_mes(
             em.id, v_mes_txt,
             ARRAY(SELECT DISTINCT l.operador_id FROM linhas l
                    WHERE l.empresa_id = em.id AND l.operador_id IS NOT NULL)) sm
     WHERE em.id = ANY (v_empresas)
       AND em.slug = 'bookplay'
       AND v_mes_txt >= '2026-09'
  ),
  receb_setor AS (
    SELECT se.id AS setor_id, l.valor_recebido, l.ho
      FROM linhas l
      JOIN setores_emp se ON se.id = l.setor_id AND NOT se.alternativo
    UNION ALL
    -- ALTERNATIVO: os usuários que contam nele — cada linha só se o carimbo for
    -- um setor da pessoa (06/10/2026). Ver o cabeçalho.
    SELECT c.setor_id, l.valor_recebido, l.ho
      FROM linhas l
      JOIN conta_no_setor c  ON c.operador_id = l.operador_id
      JOIN setores_emp    se ON se.id = c.setor_id AND se.alternativo
     WHERE l.operador_id IS NOT NULL
       AND (l.setor_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM casa h WHERE h.operador_id = l.operador_id)
            OR EXISTS (SELECT 1 FROM casa h
                        WHERE h.operador_id = l.operador_id AND h.setor_id = l.setor_id))
    UNION ALL
    SELECT se.id, l.valor_recebido, l.ho
      FROM linhas l
      JOIN setores_emp se ON se.id = l.setor_id AND se.alternativo
     WHERE l.operador_id IS NULL
  )
  SELECT COALESCE(jsonb_object_agg(y.setor_id, jsonb_build_object(
           'total', y.total, 'total_ho', y.total_ho, 'qtd', y.qtd
         )), '{}'::JSONB)
    INTO v_receb_setor
    FROM (
      SELECT setor_id,
             SUM(valor_recebido)::NUMERIC AS total,
             SUM(ho)::NUMERIC             AS total_ho,
             COUNT(*)::BIGINT             AS qtd
        FROM receb_setor
       GROUP BY setor_id
    ) y;
  SELECT COALESCE(jsonb_object_agg(em.id, public.fn_pp_ho_percentual()), '{}'::JSONB)
    INTO v_empresas_ho
    FROM public.empresas em
   WHERE em.id = ANY (v_empresas)
     AND em.slug = 'pagueplay';
  RETURN jsonb_build_object(
    'mes',                 v_mes,
    'ano',                 v_ano,
    'empresas',            to_jsonb(v_empresas),
    'metas',               v_metas,
    'equipe_empresa',      v_equipe_emp,
    'config',              v_config,
    'recebido_mes_equipe', v_receb_equipe,
    'metas_setor',         v_metas_setor,
    'setor_empresa',       v_setor_emp,
    'setores_alternativos', v_setores_alt,
    'recebido_mes_setor',  v_receb_setor,
    'empresas_ho',         v_empresas_ho
  );
END;
$function$;

-- `CREATE OR REPLACE` mantém os grants; reafirmados por garantia.
REVOKE ALL ON FUNCTION public.fn_desafio_contexto_equipe(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_contexto_equipe(UUID) TO authenticated;

COMMIT;
