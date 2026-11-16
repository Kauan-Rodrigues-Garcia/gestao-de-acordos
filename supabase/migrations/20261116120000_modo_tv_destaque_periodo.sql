-- ============================================================================
-- Modo TV: o destaque de um período (de um dia até outro)
-- 16/11/2026 · pedido do Cleber
-- ============================================================================
--
-- Na segunda-feira o destaque certo é o de sexta, sábado e domingo somados.
-- A cena «Destaque» ganha a opção «Período»: quem mais recebeu SOMANDO os
-- dias escolhidos. O pacote só tinha o 1º de cada dia, e o 1º de cada dia
-- não soma — o pacote passa a mandar cada pessoa dia a dia:
--
--   destaques_dias  [{escopo, id, nome, foto, dias: {'YYYY-MM-DD': [valor, valor_ho, pagamentos]}}]
--
-- Mesmas pessoas, mesmos escopos (setor e cada equipe) e mesmas linhas de
-- `destaques` (cargo que conta no recebimento, fora férias/afastado/robô;
-- no setor normal só as linhas carimbadas nele; ajustes de operador). A tela
-- soma os dias do período (src/pages/ModoTV/numeros.ts, destaqueDaTela).
--
-- O resto de `fn_tv_numeros_calcular` é o de 20261111150500, sem mudança.
-- Nenhuma tabela muda. O cache de 60 s é esvaziado no fim para as TVs pegarem
-- o campo novo na próxima leitura.
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
  v_destaques_dias JSONB;
  v_equipes     JSONB;
  v_ranking_eq  JSONB;
  v_equipes_rk  JSONB;
  v_quitacao    JSONB;
  v_cofen       UUID[];
  v_fonte       TEXT := 'analitico';
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

    -- 20261106120000: a regra do Painel do Líder (usePainelMetas) — a meta
    -- própria da equipe; sem ela, a soma das individuais dos membros.
    v_meta := public.fn_tv_meta_da_equipe(v_emp, p_equipe, v_mes);
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
  -- 20261106120000: sem o LIMIT 10 (a tela corta depois de ordenar — pelo %
  -- da meta, o 10º por recebido não é o corte certo) e com a meta de cada um.
  somado AS (
    SELECT ps.id, ps.nome, ps.foto_url,
           SUM(mv.valor)::NUMERIC AS valor, SUM(mv.ho)::NUMERIC AS valor_ho
      FROM pessoas ps
      JOIN movimento mv ON mv.operador_id = ps.id
     GROUP BY ps.id, ps.nome, ps.foto_url
    HAVING SUM(mv.valor) > 0
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id, 'nome', s.nome, 'foto', s.foto_url,
           'valor', ROUND(s.valor, 2), 'valor_ho', ROUND(s.valor_ho, 2),
           'meta', ROUND(COALESCE(mt.meta, 0), 2))
         ORDER BY s.valor DESC, s.id), '[]'::JSONB)
    INTO v_ranking
    FROM somado s
    LEFT JOIN LATERAL (
      -- A meta individual do mês, em bruto: a mesma que a aba Quartis lê.
      SELECT MAX(m.meta_valor) AS meta
        FROM public.metas m
       WHERE m.empresa_id = v_emp AND m.tipo = 'operador' AND m.referencia_id = s.id
         AND m.mes = EXTRACT(MONTH FROM v_mes)::INT AND m.ano = EXTRACT(YEAR FROM v_mes)::INT
    ) mt ON TRUE;

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

  -- ── Setor Cofen: a conciliação (20261030230000) ───────────────────────────
  -- O mês, o hoje e a curva do setor saem do relatório de conciliação, como
  -- no card do Painel do Líder. Equipe e pessoas continuam no 58 (acima e
  -- abaixo). Só com UM setor Cofen na empresa, e sendo o do painel.
  IF p_equipe IS NULL AND COALESCE(to_jsonb(v_setor)->>'regra', '') = 'cofen' THEN
    SELECT array_agg(s.id) INTO v_cofen
      FROM public.setores s
     WHERE s.empresa_id = v_emp
       AND s.regra = 'cofen'
       AND NOT COALESCE(s.alternativo, FALSE);

    IF COALESCE(cardinality(v_cofen), 0) = 1 AND v_cofen[1] = p_setor THEN
      v_fonte := 'conciliacao';

      SELECT COALESCE(SUM(c.total), 0) / 100.0,
             COALESCE(SUM(c.pp), 0) / 100.0,
             COUNT(*),
             COALESCE(SUM(c.total) FILTER (WHERE c.data = v_hoje), 0) / 100.0,
             COALESCE(SUM(c.pp)    FILTER (WHERE c.data = v_hoje), 0) / 100.0
        INTO v_total, v_total_ho, v_qtd, v_hoje_total, v_hoje_ho
        FROM public.pp_relatorio_conciliacoes c
       WHERE c.empresa_id = v_emp
         AND c.data >= v_mes AND c.data <= v_fim;

      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'dia', d.dia, 'valor', ROUND(d.valor, 2), 'valor_ho', ROUND(d.ho, 2))
             ORDER BY d.dia), '[]'::JSONB)
        INTO v_serie
        FROM (
          SELECT c.data AS dia,
                 SUM(c.total) / 100.0 AS valor,
                 SUM(c.pp)    / 100.0 AS ho
            FROM public.pp_relatorio_conciliacoes c
           WHERE c.empresa_id = v_emp
             AND c.data >= v_mes AND c.data <= v_fim
           GROUP BY c.data
        ) d;
    END IF;
  END IF;

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
  -- 20261116120000: cada pessoa, dia a dia, para o destaque de um PERÍODO
  -- (a tela soma os dias escolhidos). Sem o corte «> 0» de `somado`: um
  -- estorno num dia desconta do período.
  por_dia AS (
    SELECT es.escopo, mv.pessoa, mv.dia::TEXT AS dia,
           SUM(mv.valor)::NUMERIC AS valor, SUM(mv.ho)::NUMERIC AS ho, SUM(mv.pag)::INT AS pag
      FROM escopos es
      JOIN movimento mv ON mv.pessoa = es.pessoa AND (es.escopo <> 'setor' OR mv.no_setor)
     GROUP BY es.escopo, mv.pessoa, mv.dia
  ),
  primeiro AS (
    SELECT DISTINCT ON (s.escopo, s.dia) s.*
      FROM somado s
     ORDER BY s.escopo, s.dia, s.valor DESC, s.pessoa
  ),
  -- 20261030170000: o top 10 do mês de cada equipe, para a cena de ranking
  -- «Uma equipe». Mesmas regras do destaque de equipe: as linhas da pessoa.
  top_equipe AS (
    SELECT s.escopo, s.pessoa, s.valor, s.ho,
           ROW_NUMBER() OVER (PARTITION BY s.escopo ORDER BY s.valor DESC, s.pessoa) AS n
      FROM somado s
     WHERE s.dia = 'mes' AND s.escopo <> 'setor'
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'escopo', pr.escopo, 'dia', pr.dia, 'id', pr.pessoa, 'nome', ps.nome, 'foto', ps.foto_url,
              'valor', ROUND(pr.valor, 2), 'valor_ho', ROUND(pr.ho, 2), 'pagamentos', pr.pag)
            ORDER BY pr.escopo, pr.dia), '[]'::JSONB)
       FROM primeiro pr
       JOIN pessoas ps ON ps.id = pr.pessoa),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('equipe_id', g.escopo, 'pessoas', g.pessoas) ORDER BY g.escopo), '[]'::JSONB)
       FROM (
         -- 20261106120000: a equipe inteira (sem o corte em 10) e a meta de cada um.
         SELECT t.escopo,
                jsonb_agg(jsonb_build_object(
                  'id', t.pessoa, 'nome', ps.nome, 'foto', ps.foto_url,
                  'valor', ROUND(t.valor, 2), 'valor_ho', ROUND(t.ho, 2),
                  'meta', ROUND(COALESCE(mt.meta, 0), 2))
                ORDER BY t.valor DESC, t.pessoa) AS pessoas
           FROM top_equipe t
           JOIN pessoas ps ON ps.id = t.pessoa
           LEFT JOIN LATERAL (
             SELECT MAX(m.meta_valor) AS meta
               FROM public.metas m
              WHERE m.empresa_id = v_emp AND m.tipo = 'operador' AND m.referencia_id = t.pessoa
                AND m.mes = EXTRACT(MONTH FROM v_mes)::INT AND m.ano = EXTRACT(YEAR FROM v_mes)::INT
           ) mt ON TRUE
          GROUP BY t.escopo
       ) g),
    -- 20261116120000: [{escopo, id, nome, foto, dias: {'YYYY-MM-DD': [valor, valor_ho, pagamentos]}}]
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'escopo', g.escopo, 'id', g.pessoa, 'nome', ps.nome, 'foto', ps.foto_url, 'dias', g.dias)
            ORDER BY g.escopo, g.pessoa), '[]'::JSONB)
       FROM (
         SELECT pd.escopo, pd.pessoa,
                jsonb_object_agg(pd.dia, jsonb_build_array(ROUND(pd.valor, 2), ROUND(pd.ho, 2), pd.pag)) AS dias
           FROM por_dia pd
          GROUP BY pd.escopo, pd.pessoa
       ) g
       JOIN pessoas ps ON ps.id = g.pessoa)
    INTO v_destaques, v_ranking_eq, v_destaques_dias;

  -- As equipes do setor que têm alguém (o editor escolhe a da cena por aqui).
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome) ORDER BY e.nome), '[]'::JSONB)
    INTO v_equipes
    FROM public.equipes e
   WHERE e.setor_id = p_setor
     AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.equipe_id = e.id AND p.empresa_id = v_emp
                 UNION ALL
                 SELECT 1 FROM public.equipe_lideres el WHERE el.equipe_id = e.id);

  -- ── Equipe contra equipe (20261030170000) ─────────────────────────────────
  -- O total oficial de cada equipe do setor (`fn_recebido_por_equipe`, a
  -- régua do Painel do Líder, com ajuste) e a meta dela, gravada em bruto.
  -- As mesmas equipes da lista acima: as que têm alguém.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', e.id, 'nome', e.nome,
           'valor', ROUND(COALESCE(r.total, 0), 2), 'valor_ho', ROUND(COALESCE(r.total_ho, 0), 2),
           'meta', ROUND(COALESCE(mt.meta, 0), 2))
         ORDER BY COALESCE(r.total, 0) DESC, e.nome), '[]'::JSONB)
    INTO v_equipes_rk
    FROM public.equipes e
    LEFT JOIN public.fn_recebido_por_equipe(ARRAY[v_emp], v_mes_txt, v_mes, v_fim, TRUE, NULL, NULL) r
      ON r.equipe_id = e.id
    -- 20261106120000: meta própria, ou a soma das individuais (Painel do Líder).
    LEFT JOIN LATERAL (SELECT public.fn_tv_meta_da_equipe(v_emp, e.id, v_mes) AS meta) mt ON TRUE
   WHERE e.setor_id = p_setor
     AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.equipe_id = e.id AND p.empresa_id = v_emp
                 UNION ALL
                 SELECT 1 FROM public.equipe_lideres el WHERE el.equipe_id = e.id);

  -- ── Ranking de quitação (20261111150500) ───────────────────────────────────
  -- A MESMA conta da aba do Analítico (`fn_ranking_quitacao_calcular`), sem o
  -- «eu» e sem a trava de permissão: a TV é anônima, e quem decide o que ela
  -- vê é o alcance do painel. Setor sem o ranking ligado: `habilitado: false`.
  v_quitacao := public.fn_ranking_quitacao_calcular(v_emp, p_setor, v_mes, NULL);

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
    'destaques_dias',  v_destaques_dias,
    'equipes_ranking', v_equipes_rk,
    'ranking_por_equipe', v_ranking_eq,
    'quitacao',        v_quitacao,
    'fonte_setor',     v_fonte,
    'calculado_em',    now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_numeros_calcular(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_tv_numeros_calcular(uuid, uuid) IS
  'O pacote de números do Modo TV. Setor Cofen pela conciliação (mês, hoje e série), '
  'equipe e pessoas pelo Analítico; `fonte_setor` diz qual valeu. Quitação pela conta '
  'única do ranking (fn_ranking_quitacao_calcular). `destaques_dias`: cada pessoa dia a '
  'dia, para o destaque de um período. Ver 20261106120000, 20261111150500 e 20261116120000.';

-- As TVs pegam o pacote novo na próxima leitura.
DELETE FROM public.tv_numeros_cache WHERE TRUE;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261116120000', 'modo_tv_destaque_periodo', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
