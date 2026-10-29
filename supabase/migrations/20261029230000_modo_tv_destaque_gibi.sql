-- ============================================================================
-- Modo TV: o destaque do dia, para a cena em gibi
-- 29/10/2026 · pedido do Cleber
-- ============================================================================
--
-- A cena «Destaque» (src/pages/ModoTV, template `destaque`) mostra quem mais
-- recebeu num dia (hoje, o dia anterior com recebimento, um dia escolhido) ou
-- no mês até agora, no setor do painel ou numa equipe dele. Vem do analítico,
-- como o ranking.
--
-- `fn_tv_numeros_calcular` ganha quatro campos no pacote; o resto do corpo é o
-- de 20261028100000, sem mudança:
--
--   destaques  [{escopo, dia, id, nome, foto, valor, valor_ho, pagamentos}]
--              escopo = 'setor' ou o id da equipe; dia = 'YYYY-MM-DD' ou
--              'mes'. Só o 1º de cada (escopo, dia) com recebimento.
--   equipes    [{id, nome}] as equipes do setor (o editor escolhe por aqui).
--   equipe_id  a equipe do painel (nulo = painel do setor).
--   setor_nome o nome do setor (num painel de equipe, `alvo_nome` é a equipe).
--
-- Nenhuma tabela muda. O cache de 60 s (`tv_numeros_cache`) e o congelamento
-- do mês guardam o pacote inteiro, com os campos novos; o cache é esvaziado
-- no fim para as TVs pegarem os campos novos na próxima pergunta.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_tv_numeros_calcular(p_setor uuid, p_equipe uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_setor       public.setores%ROWTYPE;
  v_emp         UUID;
  v_hoje        DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_mes         DATE;
  v_fim         DATE;
  v_mes_txt     TEXT;
  v_total       NUMERIC := 0;
  v_total_ho    NUMERIC := 0;
  v_qtd         BIGINT  := 0;
  v_hoje_total  NUMERIC := 0;
  v_hoje_ho     NUMERIC := 0;
  v_meta        NUMERIC := 0;
  v_dias        JSONB;
  v_ranking     JSONB;
  v_serie       JSONB;
  v_membros     UUID[];
  v_alvo_nome   TEXT;
  v_alternativo BOOLEAN;
  v_destaques   JSONB;
  v_equipes     JSONB;
BEGIN
  v_mes     := date_trunc('month', v_hoje)::DATE;
  v_fim     := (v_mes + INTERVAL '1 month - 1 day')::DATE;
  v_mes_txt := to_char(v_hoje, 'YYYY-MM');

  SELECT * INTO v_setor FROM public.setores WHERE id = p_setor;
  IF v_setor.id IS NULL THEN
    RETURN NULL;
  END IF;
  v_emp := v_setor.empresa_id;
  v_alternativo := COALESCE(v_setor.alternativo, FALSE);

  IF p_equipe IS NULL THEN
    v_alvo_nome := v_setor.nome;

    SELECT COALESCE(r.total, 0), COALESCE(r.total_ho, 0), COALESCE(r.qtd, 0)
      INTO v_total, v_total_ho, v_qtd
      FROM public.fn_recebido_por_setor(ARRAY[v_emp], v_mes_txt, v_mes, v_fim) r
     WHERE r.setor_id = p_setor;

    SELECT COALESCE(r.total, 0), COALESCE(r.total_ho, 0)
      INTO v_hoje_total, v_hoje_ho
      FROM public.fn_recebido_por_setor(ARRAY[v_emp], v_mes_txt, v_hoje, v_hoje) r
     WHERE r.setor_id = p_setor;

    SELECT COALESCE(MAX(m.meta_valor), 0) INTO v_meta
      FROM public.metas m
     WHERE m.empresa_id = v_emp AND m.tipo = 'setor' AND m.referencia_id = p_setor
       AND m.mes = EXTRACT(MONTH FROM v_mes)::INT AND m.ano = EXTRACT(YEAR FROM v_mes)::INT;
  ELSE
    SELECT e.nome INTO v_alvo_nome FROM public.equipes e WHERE e.id = p_equipe;

    SELECT COALESCE(r.total, 0), COALESCE(r.total_ho, 0), COALESCE(r.qtd, 0)
      INTO v_total, v_total_ho, v_qtd
      FROM public.fn_recebido_por_equipe(ARRAY[v_emp], v_mes_txt, v_mes, v_fim, TRUE, NULL, NULL) r
     WHERE r.equipe_id = p_equipe;

    SELECT COALESCE(r.total, 0), COALESCE(r.total_ho, 0)
      INTO v_hoje_total, v_hoje_ho
      FROM public.fn_recebido_por_equipe(ARRAY[v_emp], v_mes_txt, v_hoje, v_hoje, TRUE, NULL, NULL) r
     WHERE r.equipe_id = p_equipe;

    SELECT COALESCE(MAX(m.meta_valor), 0) INTO v_meta
      FROM public.metas m
     WHERE m.empresa_id = v_emp AND m.tipo = 'equipe' AND m.referencia_id = p_equipe
       AND m.mes = EXTRACT(MONTH FROM v_mes)::INT AND m.ano = EXTRACT(YEAR FROM v_mes)::INT;
  END IF;

  -- A régua de dia útil do sistema (a mesma de lib/diasUteis.ts).
  v_dias := public.fn_tv_metricas_setor(v_emp, p_setor, v_mes);

  -- Quem é do alvo: membro, líder e clone que conta no recebimento. Uma vez,
  -- para o ranking e para a série.
  v_membros := ARRAY(
    SELECT p.id FROM public.perfis p
     WHERE p.empresa_id = v_emp
       AND ((p_equipe IS NULL AND p.setor_id = p_setor) OR p.equipe_id = p_equipe)
    UNION
    SELECT el.lider_id FROM public.equipe_lideres el
      JOIN public.equipes e ON e.id = el.equipe_id
     WHERE (p_equipe IS NULL AND e.setor_id = p_setor) OR el.equipe_id = p_equipe
    UNION
    SELECT cl.operador_id FROM public.equipe_operadores_clones cl
      JOIN public.equipes e ON e.id = cl.equipe_id
     WHERE cl.conta_recebimento IS TRUE
       AND ((p_equipe IS NULL AND e.setor_id = p_setor) OR cl.equipe_id = p_equipe)
  );

  -- O ranking: quem conta no recebimento, dentro do alvo. No setor normal só
  -- as linhas carimbadas nele («só no setor da pessoa»); no alternativo, as
  -- linhas da pessoa, como em fn_recebido_por_setor.
  WITH pessoas AS (
    SELECT p.id, p.nome, p.foto_url
      FROM public.perfis p
      JOIN public.cargos c ON c.slug = p.perfil
     WHERE p.id = ANY (v_membros)
       AND c.conta_no_recebimento
       AND COALESCE(p.situacao, '') NOT IN ('ferias', 'afastado')
       AND NOT COALESCE(p.robo, FALSE)
  ),
  movimento AS (
    SELECT ar.operador_id, ar.valor_recebido AS valor, COALESCE(ar.total_ho, 0) AS ho
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id = v_emp
       AND ar.data_pagamento >= v_mes AND ar.data_pagamento <= v_fim
       AND ar.operador_id IN (SELECT id FROM pessoas)
       AND (v_alternativo OR p_equipe IS NOT NULL OR ar.setor_id = p_setor OR ar.setor_id IS NULL)
    UNION ALL
    SELECT x.operador_id, x.valor, x.valor_ho
      FROM public.fn_ajustes_recebimento(ARRAY[v_emp], v_mes, v_fim) x
     WHERE x.alvo = 'operador'
       AND x.operador_id IN (SELECT id FROM pessoas)
  ),
  somado AS (
    SELECT ps.id, ps.nome, ps.foto_url,
           SUM(mv.valor)::NUMERIC AS valor, SUM(mv.ho)::NUMERIC AS valor_ho
      FROM pessoas ps
      JOIN movimento mv ON mv.operador_id = ps.id
     GROUP BY ps.id, ps.nome, ps.foto_url
    HAVING SUM(mv.valor) > 0
     ORDER BY SUM(mv.valor) DESC
     LIMIT 10
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id, 'nome', s.nome, 'foto', s.foto_url,
           'valor', ROUND(s.valor, 2), 'valor_ho', ROUND(s.valor_ho, 2))
         ORDER BY s.valor DESC), '[]'::JSONB)
    INTO v_ranking
    FROM somado s;

  -- A série por dia (só dias com movimento). É o FORMATO do mês: a tela a
  -- escala para fechar no total oficial — ver o cabeçalho de 20261027200000.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'dia', d.dia, 'valor', ROUND(d.valor, 2), 'valor_ho', ROUND(d.ho, 2))
         ORDER BY d.dia), '[]'::JSONB)
    INTO v_serie
    FROM (
      SELECT mv.dia, SUM(mv.valor)::NUMERIC AS valor, SUM(mv.ho)::NUMERIC AS ho
        FROM (
          SELECT ar.data_pagamento AS dia, ar.valor_recebido AS valor, COALESCE(ar.total_ho, 0) AS ho
            FROM public.analitico_recebimentos ar
           WHERE ar.empresa_id = v_emp
             AND ar.data_pagamento >= v_mes AND ar.data_pagamento <= v_fim
             AND CASE WHEN p_equipe IS NULL AND NOT v_alternativo
                      THEN ar.setor_id = p_setor
                      ELSE ar.operador_id = ANY (v_membros) END
          UNION ALL
          SELECT x.dia, x.valor, x.valor_ho
            FROM public.fn_ajustes_recebimento(ARRAY[v_emp], v_mes, v_fim) x
           WHERE (p_equipe IS NULL AND x.setor_id = p_setor)
              OR (p_equipe IS NOT NULL AND (x.equipe_id = p_equipe OR x.operador_id = ANY (v_membros)))
        ) mv
       GROUP BY mv.dia
    ) d;

  -- ── Destaques (20261029230000): o 1º de cada dia e do mês ─────────────────
  -- No setor do painel e em cada equipe dele, mesmo num painel de equipe (a
  -- cena «Destaque» escolhe setor ou equipe). As mesmas regras do ranking:
  -- cargo que conta no recebimento, fora férias/afastado/robô; no setor
  -- normal só as linhas carimbadas nele, na equipe as linhas da pessoa.
  -- `dia` = 'YYYY-MM-DD' ou 'mes'.
  WITH membros AS (
    SELECT p.id AS pessoa, NULL::UUID AS equipe
      FROM public.perfis p
     WHERE p.empresa_id = v_emp AND p.setor_id = p_setor
    UNION
    SELECT p.id, p.equipe_id
      FROM public.perfis p
      JOIN public.equipes e ON e.id = p.equipe_id
     WHERE p.empresa_id = v_emp AND e.setor_id = p_setor
    UNION
    SELECT el.lider_id, el.equipe_id
      FROM public.equipe_lideres el
      JOIN public.equipes e ON e.id = el.equipe_id
     WHERE e.setor_id = p_setor
    UNION
    SELECT cl.operador_id, cl.equipe_id
      FROM public.equipe_operadores_clones cl
      JOIN public.equipes e ON e.id = cl.equipe_id
     WHERE cl.conta_recebimento IS TRUE AND e.setor_id = p_setor
  ),
  pessoas AS (
    SELECT p.id, p.nome, p.foto_url
      FROM public.perfis p
      JOIN public.cargos c ON c.slug = p.perfil
     WHERE p.id IN (SELECT pessoa FROM membros)
       AND c.conta_no_recebimento
       AND COALESCE(p.situacao, '') NOT IN ('ferias', 'afastado')
       AND NOT COALESCE(p.robo, FALSE)
  ),
  escopos AS (
    SELECT DISTINCT 'setor'::TEXT AS escopo, m.pessoa FROM membros m
    UNION
    SELECT DISTINCT m.equipe::TEXT, m.pessoa FROM membros m WHERE m.equipe IS NOT NULL
  ),
  movimento AS (
    SELECT ar.operador_id AS pessoa, ar.data_pagamento AS dia,
           ar.valor_recebido AS valor, COALESCE(ar.total_ho, 0) AS ho, 1 AS pag,
           (v_alternativo OR ar.setor_id = p_setor OR ar.setor_id IS NULL) AS no_setor
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id = v_emp
       AND ar.data_pagamento >= v_mes AND ar.data_pagamento <= v_fim
       AND ar.operador_id IN (SELECT id FROM pessoas)
    UNION ALL
    SELECT x.operador_id, x.dia, x.valor, x.valor_ho, 0, TRUE
      FROM public.fn_ajustes_recebimento(ARRAY[v_emp], v_mes, v_fim) x
     WHERE x.alvo = 'operador'
       AND x.operador_id IN (SELECT id FROM pessoas)
  ),
  somado AS (
    SELECT es.escopo, d.dia, mv.pessoa,
           SUM(mv.valor)::NUMERIC AS valor, SUM(mv.ho)::NUMERIC AS ho, SUM(mv.pag)::INT AS pag
      FROM escopos es
      JOIN movimento mv ON mv.pessoa = es.pessoa AND (es.escopo <> 'setor' OR mv.no_setor)
      CROSS JOIN LATERAL (VALUES (mv.dia::TEXT), ('mes')) d(dia)
     GROUP BY es.escopo, d.dia, mv.pessoa
    HAVING SUM(mv.valor) > 0
  ),
  primeiro AS (
    SELECT DISTINCT ON (s.escopo, s.dia) s.*
      FROM somado s
     ORDER BY s.escopo, s.dia, s.valor DESC, s.pessoa
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'escopo', pr.escopo, 'dia', pr.dia, 'id', pr.pessoa, 'nome', ps.nome, 'foto', ps.foto_url,
           'valor', ROUND(pr.valor, 2), 'valor_ho', ROUND(pr.ho, 2), 'pagamentos', pr.pag)
         ORDER BY pr.escopo, pr.dia), '[]'::JSONB)
    INTO v_destaques
    FROM primeiro pr
    JOIN pessoas ps ON ps.id = pr.pessoa;

  -- As equipes do setor que têm alguém (o editor escolhe a da cena por aqui).
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome) ORDER BY e.nome), '[]'::JSONB)
    INTO v_equipes
    FROM public.equipes e
   WHERE e.setor_id = p_setor
     AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.equipe_id = e.id AND p.empresa_id = v_emp
                 UNION ALL
                 SELECT 1 FROM public.equipe_lideres el WHERE el.equipe_id = e.id);

  RETURN jsonb_build_object(
    'alvo_nome',       v_alvo_nome,
    'alvo_tipo',       CASE WHEN p_equipe IS NULL THEN 'setor' ELSE 'equipe' END,
    'regra',           COALESCE(to_jsonb(v_setor)->>'regra', 'nosso_produto'),
    'ho_percentual',   (SELECT em.config->'ho_percentual' FROM public.empresas em WHERE em.id = v_emp),
    'mes',             v_mes_txt,
    'hoje',            v_hoje,
    'meta',            ROUND(v_meta, 2),
    'recebido',        ROUND(v_total, 2),
    'recebido_ho',     ROUND(v_total_ho, 2),
    'recebido_hoje',   ROUND(v_hoje_total, 2),
    'recebido_hoje_ho', ROUND(v_hoje_ho, 2),
    'pagamentos',      v_qtd,
    'dias_uteis',      COALESCE((v_dias->>'dias_uteis')::INT, 0),
    'dias_decorridos', COALESCE((v_dias->>'dias_decorridos')::INT, 0),
    'ranking',         v_ranking,
    'serie',           v_serie,
    'setor_nome',      v_setor.nome,
    'equipe_id',       p_equipe,
    'equipes',         v_equipes,
    'destaques',       v_destaques,
    'calculado_em',    now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_numeros_calcular(uuid, uuid) FROM PUBLIC, anon, authenticated;

DELETE FROM public.tv_numeros_cache WHERE TRUE;

COMMIT;
