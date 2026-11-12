-- ============================================================================
-- 20261111170500_plantao_elite_historico_fotos_metas.sql
--
-- Plantão Elite › Histórico (pedido de 11/11/2026):
--
--   1. A FOTO de cada um. «Quem mais recebeu» mostrava só as iniciais porque
--      `pessoas` não trazia `foto_url`. Agora traz (`foto`). Vem pela função
--      (SECURITY DEFINER): ler `perfis` direto do navegador esbarra na RLS de
--      quem tem escopo pequeno — a mesma armadilha do ranking do operador
--      (20261023120000).
--
--   2. A META INDIVIDUAL de cada mês e quanto cada um FECHOU no mês. Novo
--      bloco `metas`, um item por mês × pessoa que esteve de plantão no mês:
--
--        mes      'YYYY-MM'
--        id       a pessoa
--        meta     `metas.meta_valor` (tipo operador) — a 1ª meta; nulo sem meta
--        extras   `metas.metas_extras` — a 2ª, 3ª… meta, como gravadas
--        fechado  o recebido do MÊS INTEIRO (todo dia, não só os de plantão),
--                 na régua da aba Fechamento: `analitico_recebimentos` da
--                 pessoa no mês (`fn_analitico_resumo_por_operador`) + o
--                 ajuste manual de operador (`fn_ajustes_recebimento`).
--
--      Quem bateu qual meta a tela conta (`metaAtingida`, a mesma leitura da
--      Comissão e do Fechamento): degraus = meta + extras, em ordem.
--
-- Quem vê: a gerência vê todos. Quem é de uma dupla continua vendo só os dias
-- em que esteve de plantão, e nas metas só a PRÓPRIA — a meta e o fechamento
-- do mês inteiro do colega não são do plantão.
--
-- O que NÃO muda: assinatura, chave (`painel_lider_sub_elite`), `dias`,
-- `inicio/de/ate/hoje/sou_da_dupla/setor`. O front antigo ignora `foto` e
-- `metas`; o front novo sem esta migration mostra as iniciais e esconde o
-- painel das metas.
--
-- Reverter: reaplicar `fn_elite_plantao_historico` de 20261105160000.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.fn_elite_plantao_historico(
  p_empresa_id UUID,
  p_de         DATE DEFAULT NULL,
  p_ate        DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje      DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_inicio    DATE;
  v_de        DATE;
  v_ate       DATE;
  v_mes_ini   DATE;
  v_mes_fim   DATE;
  v_setor     UUID;
  v_sou       BOOLEAN;
  v_resultado JSONB;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('painel_lider_sub_elite') THEN
    RAISE EXCEPTION 'Sem permissão para o Plantão Elite.' USING ERRCODE = '42501';
  END IF;

  SELECT min(x.desde) INTO v_inicio
    FROM public.elite_plantao_escala x WHERE x.empresa_id = p_empresa_id;
  IF v_inicio IS NULL THEN
    SELECT min((ep.criado_em AT TIME ZONE 'America/Sao_Paulo')::DATE) INTO v_inicio
      FROM public.elite_plantao ep WHERE ep.empresa_id = p_empresa_id;
  END IF;
  v_inicio := COALESCE(v_inicio, v_hoje);

  v_de  := GREATEST(COALESCE(p_de, v_inicio), v_inicio);
  v_ate := LEAST(COALESCE(p_ate, v_hoje), v_hoje);
  IF v_ate - v_de > 400 THEN
    v_de := v_ate - 400;
  END IF;

  -- O fechamento é do mês inteiro: do dia 1 do primeiro mês ao último do último.
  v_mes_ini := date_trunc('month', v_de)::DATE;
  v_mes_fim := (date_trunc('month', v_ate) + INTERVAL '1 month - 1 day')::DATE;

  -- Quem já esteve numa dupla vê só os dias em que esteve de plantão.
  v_sou := EXISTS (SELECT 1 FROM public.elite_plantao_escala x
                    WHERE x.empresa_id = p_empresa_id AND x.perfil_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.elite_plantao ep
                    WHERE ep.empresa_id = p_empresa_id AND ep.perfil_id = auth.uid());

  -- O setor das Elites: o da maioria de quem já esteve na escala.
  SELECT p.setor_id INTO v_setor
    FROM public.perfis p
   WHERE p.setor_id IS NOT NULL
     AND p.id IN (SELECT x.perfil_id FROM public.elite_plantao_escala x WHERE x.empresa_id = p_empresa_id
                  UNION
                  SELECT ep.perfil_id FROM public.elite_plantao ep WHERE ep.empresa_id = p_empresa_id)
   GROUP BY p.setor_id
   ORDER BY count(*) DESC, p.setor_id
   LIMIT 1;

  WITH
  dias AS (
    SELECT g::DATE AS data,
           CASE WHEN extract(day FROM g)::INT % 2 = 1 THEN 'impar' ELSE 'par' END AS plantao
      FROM generate_series(v_de::TIMESTAMP, v_ate::TIMESTAMP, INTERVAL '1 day') g
     WHERE v_de <= v_ate
  ),
  escala AS (
    SELECT d.data, e.perfil_id, e.ordem
      FROM dias d
      CROSS JOIN LATERAL public.fn_elite_escala_no_dia(p_empresa_id, d.data) e
     WHERE e.plantao = d.plantao
  ),
  visiveis AS (
    SELECT d.*
      FROM dias d
     WHERE NOT v_sou
        OR EXISTS (SELECT 1 FROM escala x WHERE x.data = d.data AND x.perfil_id = auth.uid())
  ),
  rec AS (
    SELECT ar.data_pagamento AS data, ar.operador_id,
           sum(ar.valor_recebido) AS total, count(*) AS qtd
      FROM public.analitico_recebimentos ar
      JOIN escala x ON x.data = ar.data_pagamento AND x.perfil_id = ar.operador_id
     WHERE ar.empresa_id = p_empresa_id
       AND ar.data_pagamento BETWEEN v_de AND v_ate
     GROUP BY ar.data_pagamento, ar.operador_id
  ),
  -- Mesma regra de origem do quadro do dia, somada por dia e origem antes de
  -- tirar as origens excluídas do mês.
  setor_origem AS (
    SELECT ar.data_pagamento AS data,
           CASE
             WHEN ar.contribuicao_de_setor_id IS NOT NULL THEN ar.contribuicao_de_setor_id
             WHEN ar.operador_id IS NULL THEN NULL
             ELSE COALESCE(eq.setor_id, op.setor_id)
           END AS origem,
           sum(ar.valor_recebido) AS total, count(*) AS qtd
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis  op ON op.id = ar.operador_id
      LEFT JOIN public.equipes eq ON eq.id = op.equipe_id
     WHERE v_setor IS NOT NULL
       AND ar.empresa_id = p_empresa_id
       AND ar.setor_id   = v_setor
       AND ar.data_pagamento BETWEEN v_de AND v_ate
     GROUP BY 1, 2
  ),
  setor_dia AS (
    SELECT so.data, sum(so.total) AS total, sum(so.qtd) AS qtd
      FROM setor_origem so
     WHERE NOT EXISTS (
       SELECT 1 FROM public.analitico_exclusoes_setor x
        WHERE x.empresa_id = p_empresa_id
          AND x.setor_id   = v_setor
          AND x.mes        = to_char(so.data, 'YYYY-MM')
          AND x.setor_origem_id IS NOT DISTINCT FROM so.origem)
     GROUP BY so.data
  ),
  -- ── 20261111170500: as metas do mês ─────────────────────────────────────
  -- Cada pessoa que esteve de plantão num dia visível do mês. Quem é de dupla:
  -- só ela mesma.
  pessoa_mes AS (
    SELECT DISTINCT to_char(x.data, 'YYYY-MM') AS mes, x.perfil_id
      FROM escala x
      JOIN visiveis v ON v.data = x.data
     WHERE NOT v_sou OR x.perfil_id = auth.uid()
  ),
  rec_mes AS (
    SELECT to_char(ar.data_pagamento, 'YYYY-MM') AS mes, ar.operador_id,
           sum(ar.valor_recebido) AS total
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id = p_empresa_id
       AND ar.operador_id IN (SELECT pm.perfil_id FROM pessoa_mes pm)
       AND ar.data_pagamento BETWEEN v_mes_ini AND v_mes_fim
     GROUP BY 1, 2
  ),
  ajuste_mes AS (
    SELECT to_char(a.dia, 'YYYY-MM') AS mes, a.operador_id, sum(a.valor) AS total
      FROM public.fn_ajustes_recebimento(ARRAY[p_empresa_id], v_mes_ini, v_mes_fim) a
     WHERE a.alvo = 'operador'
       AND a.operador_id IN (SELECT pm.perfil_id FROM pessoa_mes pm)
     GROUP BY 1, 2
  ),
  -- Uma meta por pessoa e mês: a gravada por último, se houver repetida.
  meta_mes AS (
    SELECT DISTINCT ON (m.referencia_id, m.ano, m.mes)
           m.referencia_id, to_char(make_date(m.ano, m.mes, 1), 'YYYY-MM') AS mes,
           m.meta_valor, m.metas_extras
      FROM public.metas m
     WHERE m.empresa_id = p_empresa_id
       AND m.tipo = 'operador'
       AND m.referencia_id IN (SELECT pm.perfil_id FROM pessoa_mes pm)
       AND make_date(m.ano, m.mes, 1) BETWEEN v_mes_ini AND v_mes_fim
     ORDER BY m.referencia_id, m.ano, m.mes, m.updated_at DESC NULLS LAST, m.created_at DESC NULLS LAST
  )
  SELECT jsonb_build_object(
    'inicio',       v_inicio,
    'de',           v_de,
    'ate',          v_ate,
    'hoje',         v_hoje,
    'sou_da_dupla', v_sou,
    'setor', (SELECT jsonb_build_object('id', s.id, 'nome', s.nome)
                FROM public.setores s WHERE s.id = v_setor),
    'pessoas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'nome', p.nome, 'usuario', p.usuario, 'foto', p.foto_url) ORDER BY p.nome)
        FROM public.perfis p
       WHERE p.id IN (SELECT x.perfil_id FROM escala x JOIN visiveis v ON v.data = x.data)
    ), '[]'::JSONB),
    'dias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'data',    v.data,
               'plantao', v.plantao,
               'membros', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'id', x.perfil_id,
                          'valor', COALESCE(r.total, 0),
                          'qtd', COALESCE(r.qtd, 0)) ORDER BY x.ordem, x.perfil_id)
                   FROM escala x
                   LEFT JOIN rec r ON r.data = x.data AND r.operador_id = x.perfil_id
                  WHERE x.data = v.data), '[]'::JSONB),
               'setor_total', COALESCE(sd.total, 0),
               'setor_qtd',   COALESCE(sd.qtd, 0)
             ) ORDER BY v.data)
        FROM visiveis v
        LEFT JOIN setor_dia sd ON sd.data = v.data
    ), '[]'::JSONB),
    'metas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'mes',     pm.mes,
               'id',      pm.perfil_id,
               'meta',    NULLIF(mm.meta_valor, 0),
               'extras',  CASE WHEN jsonb_typeof(mm.metas_extras) = 'array' THEN mm.metas_extras ELSE '[]'::JSONB END,
               'fechado', ROUND(COALESCE(rm.total, 0) + COALESCE(am.total, 0), 2)
             ) ORDER BY pm.mes, pm.perfil_id)
        FROM pessoa_mes pm
        LEFT JOIN meta_mes   mm ON mm.referencia_id = pm.perfil_id AND mm.mes = pm.mes
        LEFT JOIN rec_mes    rm ON rm.operador_id   = pm.perfil_id AND rm.mes = pm.mes
        LEFT JOIN ajuste_mes am ON am.operador_id   = pm.perfil_id AND am.mes = pm.mes
    ), '[]'::JSONB)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_elite_plantao_historico(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_elite_plantao_historico(UUID, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.fn_elite_plantao_historico(UUID, DATE, DATE) IS
  'Plantao Elite, historico: por dia, a dupla de plantao (escala do dia), o '
  'recebido de cada um e o total do setor; a foto de cada um e, por mes, a meta '
  'individual e o fechado do mes inteiro. Exige painel_lider_sub_elite; quem '
  'e de dupla ve so os dias em que esteve de plantao e so a propria meta. '
  '20261105160000 + 20261111170500.';

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261111170500', 'plantao_elite_historico_fotos_metas', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
