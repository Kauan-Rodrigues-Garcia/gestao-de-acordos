-- ============================================================================
-- Retrato do mês: a carteira do 59 inteira, com cidade e regra
-- ============================================================================
--
-- Auditoria do fechamento de outubro (31/10/2026). Tem de estar no banco antes
-- do último congelamento de outubro (23:50 e 23:59 São Paulo).
--
-- `composicao_mes_config.carteiras` (20261029200000) guardava quatro colunas de
-- cada carteira (`cod_grupo_filtro`, `nome_grupo_filtro`, `setor_id`, `estado`)
-- e cinco de cada equipe do 59. O Painel Diretoria usa mais que isso: a
-- CIDADE e a REGRA da carteira (`mestre_grupos.cidade_id`, `regra` — «só conta
-- o que tem cidade», decisão do Cleber de 04/10/2026). Sem elas o mês fechado
-- não tem como ser recontado como foi.
--
-- Agora vai a linha inteira (`to_jsonb`) das duas tabelas, no formato que
-- `jsonb_populate_recordset(NULL::public.mestre_grupos, ...)` devolve como
-- linha da própria tabela — é assim que as funções da Diretoria leem o mês
-- fechado (20261031230100).
--
-- Corpo de `fn_composicao_mes_snapshot` partindo do vigente no banco em
-- 31/10/2026 (= 20261031200000, conferido por leitura); só o bloco
-- `carteiras` mudou. Prova no fim: o mês corrente regravado, com a carteira
-- completa. Nenhuma linha de mês fechado muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.fn_composicao_mes_snapshot(p_empresa_id uuid, p_mes text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_linhas          INTEGER;
  v_equipes         INTEGER;
  v_lideres         INTEGER;
  v_setores         INTEGER;
  v_antes_operador  INTEGER;
  v_antes_equipe    INTEGER;
  v_mes_corrente    TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM');
  v_fechado         BOOLEAN;
  -- Mês fechado: o que esta chamada acrescenta (vazio no mês corrente).
  v_novos           UUID[] := '{}';
  v_equipes_novas   UUID[] := '{}';
  v_setores_novos   UUID[] := '{}';
  v_inicio          DATE;
  v_fim             DATE;
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NOT public.fn_can_access_empresa(p_empresa_id)
    OR NOT (
      public.fn_user_is_super_admin()
      OR public.fn_user_has_any_role(
        ARRAY['lider','elite','gerencia','diretoria','administrador']
      )
    )
  ) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: usuário não pode gerar este retrato'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NULL
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: sessão ausente' USING ERRCODE = '42501';
  END IF;

  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'mes invalido: % (esperado yyyy-MM)', p_mes;
  END IF;

  SELECT count(*) INTO v_antes_operador
    FROM public.composicao_mes
   WHERE empresa_id = p_empresa_id AND mes = p_mes;
  SELECT count(*) INTO v_antes_equipe
    FROM public.composicao_mes_equipe
   WHERE empresa_id = p_empresa_id AND mes = p_mes;

  v_fechado := p_mes < v_mes_corrente AND v_antes_operador > 0;

  IF NOT v_fechado THEN
    DELETE FROM public.composicao_mes        WHERE empresa_id = p_empresa_id AND mes = p_mes;
    DELETE FROM public.composicao_mes_equipe WHERE empresa_id = p_empresa_id AND mes = p_mes;
    DELETE FROM public.composicao_mes_lider  WHERE empresa_id = p_empresa_id AND mes = p_mes;
    DELETE FROM public.composicao_mes_setor  WHERE empresa_id = p_empresa_id AND mes = p_mes;
  ELSE
    -- Quem recebeu no mês e não está na foto. É o único caso que justifica
    -- mexer num mês fechado: o relatório trouxe dinheiro de alguém que o
    -- retrato não tinha, e sem a pessoa esse dinheiro cairia fora de todo card.
    v_inicio := (p_mes || '-01')::DATE;
    v_fim    := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_novos := ARRAY(
      SELECT DISTINCT ar.operador_id
        FROM public.analitico_recebimentos ar
        JOIN public.perfis p ON p.id = ar.operador_id AND p.empresa_id = p_empresa_id
       WHERE ar.empresa_id = p_empresa_id
         AND ar.data_pagamento BETWEEN v_inicio AND v_fim
         AND NOT EXISTS (
           SELECT 1 FROM public.composicao_mes cm
            WHERE cm.empresa_id = p_empresa_id AND cm.mes = p_mes
              AND cm.operador_id = ar.operador_id)
    );
  END IF;

  -- ── Pessoas ───────────────────────────────────────────────────────────────
  INSERT INTO public.composicao_mes
    (empresa_id, mes, operador_id, equipe_id, equipe_nome, setor_id,
     situacao, equipes_clone,
     nome, usuario, email, cargo, foto_url, ativo, desligado_em,
     conta_no_recebimento, robo, subgrupo_id)
  SELECT p_empresa_id, p_mes, p.id, v.equipe_id,
         COALESCE(e.nome, 'Sem equipe'), COALESCE(e.setor_id, p.setor_id),
         COALESCE(p.situacao, 'ativo'),
         -- As OUTRAS equipes em que a pessoa está: as que lidera além da do
         -- rótulo, e os clones que contam. O app soma o recebimento em todas
         -- (`equipesExtrasPorOperador`) sem duplicar setor nem geral.
         COALESCE((
           SELECT array_agg(DISTINCT x.equipe_id)
             FROM (
               SELECT el.equipe_id
                 FROM public.equipe_lideres el
                WHERE el.empresa_id = p_empresa_id AND el.lider_id = p.id
               UNION
               SELECT c.equipe_id
                 FROM public.equipe_operadores_clones c
                WHERE c.empresa_id = p_empresa_id
                  AND c.operador_id = p.id
                  AND COALESCE(c.conta_recebimento, TRUE)
             ) x
            WHERE x.equipe_id IS DISTINCT FROM v.equipe_id
         ), '{}'::UUID[]),
         p.nome, p.usuario, p.email, p.perfil::TEXT, p.foto_url,
         COALESCE(p.ativo, TRUE), p.desligado_em,
         cg.conta_no_recebimento, COALESCE(p.robo, FALSE), p.subgrupo_id
    FROM public.perfis p
    LEFT JOIN public.cargos cg ON cg.slug = p.perfil::TEXT
    -- A equipe do RÓTULO: a de membro; sem ela, a primeira que lidera. No
    -- cargo `lider` o `perfis.equipe_id` é resíduo e não conta (20260929120000).
    LEFT JOIN LATERAL (
      SELECT el.equipe_id
        FROM public.equipe_lideres el
       WHERE el.empresa_id = p_empresa_id AND el.lider_id = p.id
       ORDER BY el.criado_em, el.equipe_id
       LIMIT 1
    ) l ON TRUE
    LEFT JOIN LATERAL (
      SELECT CASE
               WHEN p.perfil = 'lider' THEN l.equipe_id
               ELSE COALESCE(p.equipe_id, l.equipe_id)
             END AS equipe_id
    ) v ON TRUE
    LEFT JOIN public.equipes e ON e.id = v.equipe_id
   WHERE p.empresa_id = p_empresa_id
     AND (NOT v_fechado OR p.id = ANY(v_novos))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  IF v_fechado THEN
    -- As equipes das pessoas acrescentadas agora, que faltam na foto.
    v_equipes_novas := ARRAY(
      SELECT DISTINCT x.eq
        FROM public.composicao_mes cm
       CROSS JOIN LATERAL unnest(
         array_append(COALESCE(cm.equipes_clone, '{}'::UUID[]), cm.equipe_id)
       ) AS x(eq)
       WHERE cm.empresa_id = p_empresa_id AND cm.mes = p_mes
         AND cm.operador_id = ANY(v_novos)
         AND x.eq IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.composicao_mes_equipe ce
            WHERE ce.empresa_id = p_empresa_id AND ce.mes = p_mes AND ce.equipe_id = x.eq)
    );
  END IF;

  -- ── Equipes ───────────────────────────────────────────────────────────────
  INSERT INTO public.composicao_mes_equipe
    (empresa_id, mes, equipe_id, nome, setor_id, treinamento, treinamento_inicio)
  SELECT p_empresa_id, p_mes, e.id, e.nome, e.setor_id,
         COALESCE(e.treinamento, FALSE), e.treinamento_inicio
    FROM public.equipes e
   WHERE e.empresa_id = p_empresa_id
     AND (NOT v_fechado OR e.id = ANY(v_equipes_novas))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_equipes = ROW_COUNT;

  -- ── Liderança ─────────────────────────────────────────────────────────────
  -- Mês fechado: só das equipes acrescentadas agora. Equipe que já estava na
  -- foto mantém a liderança que tinha — inclusive nenhuma.
  INSERT INTO public.composicao_mes_lider (empresa_id, mes, equipe_id, lider_id, ordem)
  WITH explicitos AS (
    SELECT el.equipe_id, el.lider_id, el.criado_em
      FROM public.equipe_lideres el
      JOIN public.perfis p ON p.id = el.lider_id AND p.perfil = 'lider'
     WHERE el.empresa_id = p_empresa_id
  ),
  ja_lidera AS (SELECT DISTINCT lider_id FROM explicitos),
  reserva AS (
    SELECT e.id AS equipe_id, p.id AS lider_id, p.nome
      FROM public.equipes e
      JOIN public.perfis p ON p.equipe_id = e.id AND p.perfil = 'lider'
     WHERE e.empresa_id = p_empresa_id
       AND p.id NOT IN (SELECT lider_id FROM ja_lidera)
       AND NOT EXISTS (SELECT 1 FROM explicitos x WHERE x.equipe_id = e.id)
    UNION
    SELECT c.equipe_id, p.id, p.nome
      FROM public.equipe_operadores_clones c
      JOIN public.perfis p ON p.id = c.operador_id AND p.perfil = 'lider'
     WHERE c.empresa_id = p_empresa_id
       AND p.id NOT IN (SELECT lider_id FROM ja_lidera)
       AND NOT EXISTS (SELECT 1 FROM explicitos x WHERE x.equipe_id = c.equipe_id)
  ),
  lista AS (
    SELECT equipe_id, lider_id,
           row_number() OVER (PARTITION BY equipe_id ORDER BY criado_em, lider_id)::INTEGER AS ordem
      FROM explicitos
    UNION ALL
    SELECT equipe_id, lider_id,
           (100 + row_number() OVER (PARTITION BY equipe_id ORDER BY nome, lider_id))::INTEGER
      FROM reserva
  )
  SELECT p_empresa_id, p_mes, l.equipe_id, l.lider_id, l.ordem
    FROM lista l
   WHERE NOT v_fechado OR l.equipe_id = ANY(v_equipes_novas)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_lideres = ROW_COUNT;

  IF v_fechado THEN
    -- Os setores das pessoas e das equipes acrescentadas agora.
    v_setores_novos := ARRAY(
      SELECT DISTINCT s.sid
        FROM (
          SELECT cm.setor_id AS sid
            FROM public.composicao_mes cm
           WHERE cm.empresa_id = p_empresa_id AND cm.mes = p_mes
             AND cm.operador_id = ANY(v_novos)
          UNION
          SELECT ce.setor_id
            FROM public.composicao_mes_equipe ce
           WHERE ce.empresa_id = p_empresa_id AND ce.mes = p_mes
             AND ce.equipe_id = ANY(v_equipes_novas)
        ) s
       WHERE s.sid IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.composicao_mes_setor cs
            WHERE cs.empresa_id = p_empresa_id AND cs.mes = p_mes AND cs.setor_id = s.sid)
    );
  END IF;

  -- ── Setores ───────────────────────────────────────────────────────────────
  INSERT INTO public.composicao_mes_setor
    (empresa_id, mes, setor_id, nome, ativo, alternativo, regra, cidade_id, tipo)
  SELECT p_empresa_id, p_mes, s.id, s.nome,
         COALESCE(s.ativo, TRUE), COALESCE(s.alternativo, FALSE),
         s.regra, s.cidade_id, s.tipo
    FROM public.setores s
   WHERE s.empresa_id = p_empresa_id
     AND (NOT v_fechado OR s.id = ANY(v_setores_novos))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_setores = ROW_COUNT;

  -- ── Configuração do mês ───────────────────────────────────────────────────
  -- Só no mês corrente (ou no fechado que nunca teve retrato, que é regravado
  -- inteiro como antes). Mês fechado com retrato NÃO recebe a config de hoje.
  IF NOT v_fechado THEN
    DELETE FROM public.composicao_mes_config WHERE empresa_id = p_empresa_id AND mes = p_mes;
    INSERT INTO public.composicao_mes_config
      (empresa_id, mes, empresa_config, cargos, ranking, pix_config, carteiras,
       subgrupos, rh_setores, direto_extra, pix_bonus)
    SELECT p_empresa_id, p_mes,
           COALESCE((SELECT em.config FROM public.empresas em WHERE em.id = p_empresa_id), '{}'::JSONB),
           COALESCE((SELECT jsonb_object_agg(cg.slug, jsonb_build_object(
                       'conta_no_recebimento', cg.conta_no_recebimento,
                       'lidera_equipe',        cg.lidera_equipe,
                       'pertence_a_setor',     cg.pertence_a_setor,
                       'nivel',                cg.nivel))
                       FROM public.cargos cg), '{}'::JSONB),
           COALESCE((SELECT jsonb_agg(to_jsonb(rc) ORDER BY rc.setor_id)
                       FROM public.analitico_ranking_config rc
                      WHERE rc.empresa_id = p_empresa_id), '[]'::JSONB),
           COALESCE((SELECT jsonb_agg(to_jsonb(pc) ORDER BY pc.setor_id)
                       FROM public.pix_automatico_config pc
                      WHERE pc.empresa_id = p_empresa_id), '[]'::JSONB),
           jsonb_build_object(
             -- Linha inteira (20261031230000): a Diretoria lê também cidade e regra da carteira.
             'grupos', COALESCE((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.cod_grupo_filtro)
                         FROM public.mestre_grupos g
                        WHERE g.empresa_id = p_empresa_id), '[]'::JSONB),
             'equipes', COALESCE((SELECT jsonb_agg(to_jsonb(me) ORDER BY me.cod_grupo_filtro, me.nome_subgrupo)
                         FROM public.mestre_equipes me
                        WHERE me.empresa_id = p_empresa_id), '[]'::JSONB)
           ),
           -- 20261031200000: subgrupos, remuneração do RH, Direto/Extra e o
           -- bônus de Pix que cai no mês.
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
                       'id', sg.id, 'equipe_id', sg.equipe_id, 'nome', sg.nome)
                       ORDER BY sg.equipe_id, sg.nome)
                       FROM public.equipe_subgrupos sg
                      WHERE sg.empresa_id = p_empresa_id), '[]'::JSONB),
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.setor_id)
                       FROM public.rh_config_setores r
                      WHERE r.empresa_id = p_empresa_id), '[]'::JSONB),
           COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.escopo, d.referencia_id)
                       FROM public.direto_extra_config d
                      WHERE d.empresa_id = p_empresa_id), '[]'::JSONB),
           COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.inicio, b.id)
                       FROM public.pix_automatico_bonus b
                      WHERE b.empresa_id = p_empresa_id
                        AND b.inicio <= ((p_mes || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE
                        AND b.fim    >= (p_mes || '-01')::DATE), '[]'::JSONB);
  END IF;

  PERFORM public.fn_log_registrar(
    p_acao       => 'composicao_mes_regerado',
    p_categoria  => 'importacao',
    p_severidade => 'info',
    p_descricao  => CASE WHEN v_fechado THEN format(
      'Completou a composição do mês fechado %s — %s operador(es) com recebimento no mês, %s equipe(s), %s liderança(s) e %s setor(es) que faltavam',
      p_mes, v_linhas, v_equipes, v_lideres, v_setores
    ) ELSE format(
      'Regerou a composição do mês %s — %s operador(es), %s equipe(s), %s liderança(s) e %s setor(es)',
      p_mes, v_linhas, v_equipes, v_lideres, v_setores
    ) END,
    p_empresa_id => p_empresa_id,
    p_tabela     => 'composicao_mes',
    p_alvo_tipo  => 'composicao_mes',
    p_alvo_rotulo=> p_mes,
    p_detalhes   => jsonb_build_object(
      'mes', p_mes, 'preservado', v_fechado,
      'operadores', v_linhas, 'equipes', v_equipes,
      'lideres', v_lideres, 'setores', v_setores,
      'operadores_antes', v_antes_operador, 'equipes_antes', v_antes_equipe,
      'config', NOT v_fechado
    ),
    p_origem     => 'automatico'
  );

  RETURN v_linhas;
END;
$function$;

DO $prova$
DECLARE
  v_mes TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM');
  v_emp RECORD;
  v_dif BIGINT;
BEGIN
  FOR v_emp IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_composicao_mes_snapshot(v_emp.id, v_mes);
  END LOOP;

  SELECT count(*) INTO v_dif
    FROM public.empresas e
    LEFT JOIN public.composicao_mes_config c ON c.empresa_id = e.id AND c.mes = v_mes
   WHERE c.empresa_id IS NULL
      OR jsonb_array_length(c.carteiras->'grupos')  <> (SELECT count(*) FROM public.mestre_grupos g  WHERE g.empresa_id = e.id)
      OR jsonb_array_length(c.carteiras->'equipes') <> (SELECT count(*) FROM public.mestre_equipes m WHERE m.empresa_id = e.id)
      OR EXISTS (
        SELECT 1 FROM jsonb_populate_recordset(NULL::public.mestre_grupos, c.carteiras->'grupos') x
          JOIN public.mestre_grupos g ON g.id = x.id
         WHERE (x.cidade_id, x.regra, x.setor_id) IS DISTINCT FROM (g.cidade_id, g.regra, g.setor_id));
  IF v_dif > 0 THEN
    RAISE EXCEPTION 'PROVA: carteira do mês incompleta em % empresa(s) — nada foi aplicado', v_dif;
  END IF;
  RAISE NOTICE 'PROVA: carteira de % gravada inteira', v_mes;
END
$prova$;

COMMIT;
