-- ============================================================================
-- Modo TV: telas sob demanda, opções de ranking, Ranking de quitação e cena livre
-- 30/10/2026 · pedido do Cleber
-- ============================================================================
--
-- 1. `tv_paineis.telas`: até 20 telas (eram 12) e 64 KB (eram 16 KB).
--    As telas sob demanda (`telas[].sob_demanda`) ficam fora do rodízio e
--    só vão ao ar fixadas; a cena livre guarda os elementos no jsonb. O
--    formato continua sendo do front (src/pages/ModoTV/templates.ts).
--
-- 2. `fn_tv_numeros_calcular` ganha três campos no pacote. O resto do corpo é
--    o de 20261029230000, sem mudança:
--
--      equipes_ranking     [{id, nome, valor, valor_ho, meta}] — cada equipe
--                          do setor, pelo `fn_recebido_por_equipe`, e a meta
--                          da equipe no mês (bruto).
--      ranking_por_equipe  [{equipe_id, pessoas: [{id, nome, foto, valor,
--                          valor_ho}]}] — o top 10 do mês de cada equipe.
--      quitacao            {habilitado:false} ou {habilitado, premios,
--                          participantes, importado_em, posicoes[top 10]} —
--                          a mesma conta de `fn_ranking_quitacao`.
--
-- Nenhuma tabela nova, nenhum grant novo. O cache de 60 s
-- (`tv_numeros_cache`) é esvaziado no fim para as TVs pegarem os campos novos.
-- O front funciona sem esta migration: as cenas que dependem dela avisam
-- «chega com a próxima atualização», e o painel com mais de 12 telas é
-- recusado com mensagem clara.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. O limite das telas ────────────────────────────────────────────────────
-- A CHECK nasceu dentro do CREATE TABLE (20261027170000), com nome gerado.
-- Acha pelo conteúdo em vez de supor o nome.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'public.tv_paineis'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%jsonb_array_length%'
  LOOP
    EXECUTE format('ALTER TABLE public.tv_paineis DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.tv_paineis ADD CONSTRAINT tv_paineis_telas_check
  CHECK (jsonb_typeof(telas) = 'array'
         AND jsonb_array_length(telas) <= 20
         AND pg_column_size(telas) <= 65536);

-- ── 2. O pacote de números ───────────────────────────────────────────────────

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
  v_ranking_eq  JSONB;
  v_equipes_rk  JSONB;
  v_quitacao    JSONB;
  v_premios     NUMERIC(12,2)[];
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
         SELECT t.escopo,
                jsonb_agg(jsonb_build_object(
                  'id', t.pessoa, 'nome', ps.nome, 'foto', ps.foto_url,
                  'valor', ROUND(t.valor, 2), 'valor_ho', ROUND(t.ho, 2))
                ORDER BY t.valor DESC, t.pessoa) AS pessoas
           FROM top_equipe t
           JOIN pessoas ps ON ps.id = t.pessoa
          WHERE t.n <= 10
          GROUP BY t.escopo
       ) g)
    INTO v_destaques, v_ranking_eq;

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
    LEFT JOIN LATERAL (
      SELECT MAX(m.meta_valor) AS meta
        FROM public.metas m
       WHERE m.empresa_id = v_emp AND m.tipo = 'equipe' AND m.referencia_id = e.id
         AND m.mes = EXTRACT(MONTH FROM v_mes)::INT AND m.ano = EXTRACT(YEAR FROM v_mes)::INT
    ) mt ON TRUE
   WHERE e.setor_id = p_setor
     AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.equipe_id = e.id AND p.empresa_id = v_emp
                 UNION ALL
                 SELECT 1 FROM public.equipe_lideres el WHERE el.equipe_id = e.id);

  -- ── Ranking de quitação (20261030170000) ───────────────────────────────────
  -- A conta de `fn_ranking_quitacao` (20261006150000) sem o «eu» e sem a
  -- trava de permissão: a TV é anônima, e quem decide o que ela vê é o alcance
  -- do painel. Setor sem o ranking ligado: `habilitado: false`, e a cena avisa.
  SELECT s.premios INTO v_premios
    FROM public.ranking_quitacao_setores s
   WHERE s.empresa_id = v_emp AND s.setor_id = p_setor AND s.ativo;
  IF NOT FOUND THEN
    v_quitacao := jsonb_build_object('habilitado', false);
  ELSE
    WITH por_operador AS (
      SELECT a.operador_id,
             COUNT(*)::INTEGER   AS quitacoes,
             SUM(a.valor_acordo) AS valor
        FROM public.ranking_quitacao_acordos a
        JOIN public.perfis p        ON p.id = a.operador_id
        LEFT JOIN public.equipes e  ON e.id = p.equipe_id
       WHERE a.empresa_id = v_emp
         AND a.mes = v_mes
         AND COALESCE(e.setor_id, p.setor_id) = p_setor
       GROUP BY a.operador_id
    ),
    ordenado AS (
      SELECT po.operador_id, po.quitacoes, po.valor, p.nome, p.foto_url,
             ROW_NUMBER() OVER (ORDER BY po.valor DESC, po.quitacoes DESC, p.nome) AS posicao
        FROM por_operador po
        JOIN public.perfis p ON p.id = po.operador_id
    )
    SELECT jsonb_build_object(
      'habilitado',    true,
      'premios',       to_jsonb(v_premios),
      'participantes', (SELECT COUNT(*) FROM ordenado),
      'importado_em',  (SELECT MAX(a.importado_em) FROM public.ranking_quitacao_acordos a
                         WHERE a.empresa_id = v_emp AND a.mes = v_mes),
      'posicoes',      COALESCE((
                         SELECT jsonb_agg(jsonb_build_object(
                                  'posicao', o.posicao, 'id', o.operador_id, 'nome', o.nome,
                                  'foto', o.foto_url, 'quitacoes', o.quitacoes, 'valor', ROUND(o.valor, 2))
                                ORDER BY o.posicao)
                           FROM ordenado o WHERE o.posicao <= 10), '[]'::JSONB))
      INTO v_quitacao;
  END IF;

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
    'equipes_ranking', v_equipes_rk,
    'ranking_por_equipe', v_ranking_eq,
    'quitacao',        v_quitacao,
    'calculado_em',    now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_numeros_calcular(uuid, uuid) FROM PUBLIC, anon, authenticated;

DELETE FROM public.tv_numeros_cache WHERE TRUE;

COMMIT;
