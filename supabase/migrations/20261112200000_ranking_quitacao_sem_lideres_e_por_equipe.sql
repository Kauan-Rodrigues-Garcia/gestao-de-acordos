-- ============================================================================
-- 20261112200000_ranking_quitacao_sem_lideres_e_por_equipe.sql
--
-- Ranking de quitação: líder fora do ranking e destaques por equipe (pedido de
-- 12/11/2026).
--
-- ## 1. Líder não disputa
--
-- A conta (`fn_ranking_quitacao_calcular`, 20261111150500) punha no ranking
-- todo perfil com quitação no relatório do ERP, sem olhar o cargo. Conferido
-- no banco em 12/11: em novembro a líder Kimberli Marin (cargo `lider`, sem
-- equipe no cadastro) tinha 2 quitações e entrava no ranking do Play 2 — e, na
-- disputa por equipe, virava a «Sem equipe».
--
-- Agora vale a régua do ranking do Analítico (20261023120000): cargo que NÃO
-- conta no recebimento (`cargos.conta_no_recebimento = false`: líder,
-- gerência…) fica fora, e robô também. Cargo sem linha em `cargos` continua
-- dentro (não some ninguém por cadastro incompleto). Férias NÃO tira: o
-- ranking paga prêmio pelo mês, e quem quitou e saiu de férias continua com o
-- que fez.
--
-- Fica fora do ranking, dos destaques, do placar de equipes e do «eu». As
-- quitações continuam gravadas em `ranking_quitacao_acordos` (nada é apagado).
--
-- ## 2. Destaques por equipe
--
-- Na disputa por equipe, cada disputa traz as SUAS `categorias` (mais
-- quitações, maior valor, maior quitação), calculadas só com a gente da
-- equipe. As `categorias` do topo continuam as do setor inteiro (a Equipe
-- campeã só existe ali) — pacote antigo, aba antiga e TV antiga seguem lendo
-- igual. Na disputa do setor as duas são a mesma coisa.
--
-- ## O que NÃO muda
--
-- Quem quita e quanto vale, a tabela dos acordos, a config, as assinaturas e
-- os grants. `fn_ranking_quitacao`, a TV e o importar chamam esta mesma conta.
--
-- ## Prova
--
-- Para cada setor ligado e mês importado: o ranking novo é o antigo SEM quem
-- ficou fora, na mesma ordem (o 11º de antes pode subir para o 10º); ninguém
-- de cargo que não conta aparece; toda disputa traz `categorias`.
--
-- Reverter: reaplicar a seção 2 de 20261111150500 (fn_ranking_quitacao_calcular).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ── 0. O retrato de antes, para a prova ─────────────────────────────────────

CREATE TEMP TABLE _rq_alvos ON COMMIT DROP AS
SELECT DISTINCT s.empresa_id, s.setor_id, a.mes
  FROM public.ranking_quitacao_setores s
  JOIN public.ranking_quitacao_acordos a ON a.empresa_id = s.empresa_id
 WHERE s.ativo;

CREATE TEMP TABLE _rq_antes ON COMMIT DROP AS
SELECT al.empresa_id, al.setor_id, al.mes,
       public.fn_ranking_quitacao_calcular(al.empresa_id, al.setor_id, al.mes, NULL) AS r
  FROM _rq_alvos al;

-- Quem passa a ficar fora: a mesma condição da conta abaixo.
CREATE TEMP TABLE _rq_fora ON COMMIT DROP AS
SELECT p.id
  FROM public.perfis p
  LEFT JOIN public.cargos c ON c.slug = p.perfil
 WHERE c.conta_no_recebimento IS FALSE
    OR COALESCE(p.robo, FALSE);

-- ── 1. A conta ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ranking_quitacao_calcular(
  p_empresa_id UUID, p_setor_id UUID, p_mes DATE, p_quem UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mes      DATE := date_trunc('month', p_mes)::DATE;
  v_linha    public.ranking_quitacao_setores%ROWTYPE;
  v_cfg      JSONB;
  v_criterio TEXT;
  v_disputa  TEXT;
  v_minimo   INTEGER;
  v_fora     UUID[];
  v_premios  NUMERIC[];
  v_textos   TEXT[];
  v_out      JSONB;
BEGIN
  SELECT * INTO v_linha
    FROM public.ranking_quitacao_setores s
   WHERE s.empresa_id = p_empresa_id AND s.setor_id = p_setor_id AND s.ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('habilitado', false);
  END IF;

  v_cfg      := COALESCE(v_linha.config, '{}'::JSONB);
  v_criterio := CASE WHEN v_cfg->>'criterio' = 'quantidade' THEN 'quantidade' ELSE 'valor' END;
  v_disputa  := CASE WHEN v_cfg->>'disputa' = 'equipe' THEN 'equipe' ELSE 'setor' END;
  v_minimo   := GREATEST(0, COALESCE((v_cfg->>'minimo_quitacoes')::INTEGER, 0));
  v_fora     := ARRAY(SELECT x::UUID FROM jsonb_array_elements_text(
                        CASE WHEN jsonb_typeof(v_cfg->'equipes_fora') = 'array' THEN v_cfg->'equipes_fora' ELSE '[]'::JSONB END) x);
  v_premios  := COALESCE(v_linha.premios::NUMERIC[], ARRAY[]::NUMERIC[]);
  v_textos   := ARRAY(SELECT x FROM jsonb_array_elements_text(
                        CASE WHEN jsonb_typeof(v_cfg->'premios_texto') = 'array' THEN v_cfg->'premios_texto' ELSE '[]'::JSONB END) x);

  WITH base AS (
    -- Cada linha é uma quitação (o leitor já juntou as peças do contrato).
    -- O setor da pessoa é o da equipe, senão o do cadastro (20261006120000).
    -- 20261112200000: cargo que não conta no recebimento (líder) e robô fora.
    SELECT a.operador_id, a.valor_acordo, p.nome, p.foto_url, p.equipe_id, e.nome AS equipe_nome,
           CASE WHEN v_disputa = 'equipe' THEN p.equipe_id END AS disputa_id
      FROM public.ranking_quitacao_acordos a
      JOIN public.perfis p       ON p.id = a.operador_id
      LEFT JOIN public.equipes e ON e.id = p.equipe_id
      LEFT JOIN public.cargos c  ON c.slug = p.perfil
     WHERE a.empresa_id = p_empresa_id
       AND a.mes = v_mes
       AND COALESCE(e.setor_id, p.setor_id) = p_setor_id
       AND (p.equipe_id IS NULL OR NOT (p.equipe_id = ANY (v_fora)))
       AND c.conta_no_recebimento IS NOT FALSE
       AND NOT COALESCE(p.robo, FALSE)
  ),
  por_pessoa AS (
    SELECT b.operador_id, b.nome, b.foto_url, b.equipe_id, b.equipe_nome, b.disputa_id,
           COUNT(*)::INTEGER AS quitacoes,
           ROUND(SUM(b.valor_acordo), 2) AS valor,
           MAX(b.valor_acordo) AS maior
      FROM base b
     GROUP BY b.operador_id, b.nome, b.foto_url, b.equipe_id, b.equipe_nome, b.disputa_id
  ),
  ordenado AS (
    SELECT pp.*,
           ROW_NUMBER() OVER (
             PARTITION BY pp.disputa_id
             ORDER BY CASE WHEN v_criterio = 'quantidade' THEN pp.quitacoes::NUMERIC ELSE pp.valor END DESC,
                      CASE WHEN v_criterio = 'quantidade' THEN pp.valor ELSE pp.quitacoes::NUMERIC END DESC,
                      pp.nome, pp.operador_id
           )::INTEGER AS posicao
      FROM por_pessoa pp
  ),
  premiado AS (
    SELECT o.*,
           (o.posicao <= cardinality(v_premios) AND o.quitacoes < v_minimo) AS abaixo_minimo,
           CASE WHEN o.posicao <= cardinality(v_premios) AND o.quitacoes >= v_minimo
                THEN NULLIF(v_premios[o.posicao], 0) END AS premio,
           CASE WHEN o.posicao <= cardinality(v_premios) AND o.quitacoes >= v_minimo
                THEN NULLIF(btrim(v_textos[o.posicao]), '') END AS premio_texto
      FROM ordenado o
  ),
  -- Os vencedores de cada destaque, por disputa (no setor, uma só).
  v_mais_quitacoes AS (
    SELECT DISTINCT ON (pp.disputa_id) pp.disputa_id,
           jsonb_build_object('id', pp.operador_id, 'nome', pp.nome, 'foto', pp.foto_url,
                              'equipe_nome', pp.equipe_nome, 'quitacoes', pp.quitacoes, 'valor', pp.valor) AS vencedor
      FROM por_pessoa pp
     ORDER BY pp.disputa_id, pp.quitacoes DESC, pp.valor DESC, pp.nome
  ),
  v_maior_valor AS (
    SELECT DISTINCT ON (pp.disputa_id) pp.disputa_id,
           jsonb_build_object('id', pp.operador_id, 'nome', pp.nome, 'foto', pp.foto_url,
                              'equipe_nome', pp.equipe_nome, 'quitacoes', pp.quitacoes, 'valor', pp.valor) AS vencedor
      FROM por_pessoa pp
     ORDER BY pp.disputa_id, pp.valor DESC, pp.quitacoes DESC, pp.nome
  ),
  v_maior_quitacao AS (
    SELECT DISTINCT ON (b.disputa_id) b.disputa_id,
           jsonb_build_object('id', b.operador_id, 'nome', b.nome, 'foto', b.foto_url,
                              'equipe_nome', b.equipe_nome, 'quitacoes', 1, 'valor', b.valor_acordo) AS vencedor
      FROM base b
     ORDER BY b.disputa_id, b.valor_acordo DESC, b.nome
  ),
  disputas AS (
    SELECT pr.disputa_id,
           CASE WHEN v_disputa = 'equipe' THEN COALESCE(MAX(pr.equipe_nome), 'Sem equipe') END AS nome,
           COUNT(*)::INTEGER AS participantes,
           SUM(pr.quitacoes)::INTEGER AS quitacoes_total,
           ROUND(SUM(pr.valor), 2) AS valor_total,
           jsonb_agg(jsonb_build_object(
             'posicao', pr.posicao, 'id', pr.operador_id, 'nome', pr.nome, 'foto', pr.foto_url,
             'equipe_id', pr.equipe_id, 'equipe_nome', pr.equipe_nome,
             'quitacoes', pr.quitacoes, 'valor', pr.valor, 'maior', pr.maior,
             'premio', pr.premio, 'premio_texto', pr.premio_texto, 'abaixo_minimo', pr.abaixo_minimo)
             ORDER BY pr.posicao) FILTER (WHERE pr.posicao <= 10) AS posicoes
      FROM premiado pr
     GROUP BY pr.disputa_id
  ),
  -- As equipes do setor que disputam: com gente ou com quitação no mês.
  equipes AS (
    SELECT e.id, e.nome,
           COALESCE(SUM(pp.quitacoes), 0)::INTEGER AS quitacoes,
           COALESCE(ROUND(SUM(pp.valor), 2), 0) AS valor,
           COUNT(pp.operador_id)::INTEGER AS pessoas
      FROM public.equipes e
      LEFT JOIN por_pessoa pp ON pp.equipe_id = e.id
     WHERE e.empresa_id = p_empresa_id
       AND e.setor_id = p_setor_id
       AND NOT (e.id = ANY (v_fora))
       AND (pp.operador_id IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.perfis p WHERE p.equipe_id = e.id AND p.empresa_id = p_empresa_id))
     GROUP BY e.id, e.nome
  ),
  categorias AS (
    SELECT c.ord,
           c.x->>'id' AS id,
           CASE WHEN jsonb_typeof(c.x->'premio') = 'number' THEN NULLIF((c.x->>'premio')::NUMERIC, 0) END AS premio,
           NULLIF(btrim(COALESCE(c.x->>'premio_texto', '')), '') AS premio_texto
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(v_cfg->'categorias') = 'array' THEN v_cfg->'categorias' ELSE '[]'::JSONB END
           ) WITH ORDINALITY AS c(x, ord)
     WHERE COALESCE((c.x->>'ativo')::BOOLEAN, TRUE)
       AND c.x->>'id' IN ('mais_quitacoes', 'maior_valor', 'maior_quitacao', 'equipe_campea')
  ),
  eu AS (
    SELECT pr.* FROM premiado pr WHERE p_quem IS NOT NULL AND pr.operador_id = p_quem
  )
  SELECT jsonb_build_object(
    'habilitado',       true,
    'criterio',         v_criterio,
    'disputa',          v_disputa,
    'minimo_quitacoes', v_minimo,
    'premios',          to_jsonb(v_premios),
    'premios_texto',    to_jsonb(v_textos),
    'importado_em',     (SELECT MAX(a.importado_em) FROM public.ranking_quitacao_acordos a
                          WHERE a.empresa_id = p_empresa_id AND a.mes = v_mes),
    'participantes',    (SELECT COUNT(*) FROM por_pessoa),
    'disputas',         COALESCE((
                          SELECT jsonb_agg(jsonb_build_object(
                                   'equipe_id', d.disputa_id, 'nome', d.nome,
                                   'participantes', d.participantes,
                                   'quitacoes_total', d.quitacoes_total, 'valor_total', d.valor_total,
                                   'posicoes', COALESCE(d.posicoes, '[]'::JSONB),
                                   -- 20261112200000: os destaques DESTA disputa (sem a Equipe campeã).
                                   'categorias', COALESCE((
                                     SELECT jsonb_agg(jsonb_build_object(
                                              'id', c.id, 'premio', c.premio, 'premio_texto', c.premio_texto,
                                              'vencedor', CASE c.id
                                                WHEN 'mais_quitacoes' THEN (SELECT w.vencedor FROM v_mais_quitacoes w
                                                                             WHERE w.disputa_id IS NOT DISTINCT FROM d.disputa_id)
                                                WHEN 'maior_valor'    THEN (SELECT w.vencedor FROM v_maior_valor w
                                                                             WHERE w.disputa_id IS NOT DISTINCT FROM d.disputa_id)
                                                WHEN 'maior_quitacao' THEN (SELECT w.vencedor FROM v_maior_quitacao w
                                                                             WHERE w.disputa_id IS NOT DISTINCT FROM d.disputa_id)
                                              END)
                                            ORDER BY c.ord)
                                       FROM categorias c
                                      WHERE c.id <> 'equipe_campea'), '[]'::JSONB))
                                 ORDER BY d.nome NULLS FIRST)
                            FROM disputas d), '[]'::JSONB),
    'equipes',          COALESCE((
                          SELECT jsonb_agg(jsonb_build_object(
                                   'id', e.id, 'nome', e.nome, 'quitacoes', e.quitacoes,
                                   'valor', e.valor, 'pessoas', e.pessoas)
                                 ORDER BY CASE WHEN v_criterio = 'quantidade' THEN e.quitacoes::NUMERIC ELSE e.valor END DESC,
                                          CASE WHEN v_criterio = 'quantidade' THEN e.valor ELSE e.quitacoes::NUMERIC END DESC,
                                          e.nome)
                            FROM equipes e), '[]'::JSONB),
    -- O setor inteiro (como antes): a aba e a TV antigas leem só este.
    'categorias',       COALESCE((
                          SELECT jsonb_agg(jsonb_build_object(
                                   'id', c.id, 'premio', c.premio, 'premio_texto', c.premio_texto,
                                   'vencedor', CASE c.id
                                     WHEN 'mais_quitacoes' THEN (
                                       SELECT jsonb_build_object('id', pp.operador_id, 'nome', pp.nome, 'foto', pp.foto_url,
                                                'equipe_nome', pp.equipe_nome, 'quitacoes', pp.quitacoes, 'valor', pp.valor)
                                         FROM por_pessoa pp
                                        ORDER BY pp.quitacoes DESC, pp.valor DESC, pp.nome LIMIT 1)
                                     WHEN 'maior_valor' THEN (
                                       SELECT jsonb_build_object('id', pp.operador_id, 'nome', pp.nome, 'foto', pp.foto_url,
                                                'equipe_nome', pp.equipe_nome, 'quitacoes', pp.quitacoes, 'valor', pp.valor)
                                         FROM por_pessoa pp
                                        ORDER BY pp.valor DESC, pp.quitacoes DESC, pp.nome LIMIT 1)
                                     WHEN 'maior_quitacao' THEN (
                                       SELECT jsonb_build_object('id', b.operador_id, 'nome', b.nome, 'foto', b.foto_url,
                                                'equipe_nome', b.equipe_nome, 'quitacoes', 1, 'valor', b.valor_acordo)
                                         FROM base b
                                        ORDER BY b.valor_acordo DESC, b.nome LIMIT 1)
                                     WHEN 'equipe_campea' THEN (
                                       SELECT jsonb_build_object('id', e.id, 'nome', e.nome, 'foto', NULL,
                                                'equipe_nome', NULL, 'quitacoes', e.quitacoes, 'valor', e.valor,
                                                'pessoas', e.pessoas, 'equipe', TRUE)
                                         FROM equipes e
                                        WHERE e.quitacoes > 0
                                        ORDER BY CASE WHEN v_criterio = 'quantidade' THEN e.quitacoes::NUMERIC ELSE e.valor END DESC,
                                                 CASE WHEN v_criterio = 'quantidade' THEN e.valor ELSE e.quitacoes::NUMERIC END DESC,
                                                 e.nome LIMIT 1)
                                   END)
                                 ORDER BY c.ord)
                            FROM categorias c), '[]'::JSONB),
    'eu',               (SELECT jsonb_build_object(
                                  'posicao', eu.posicao, 'quitacoes', eu.quitacoes, 'valor', eu.valor,
                                  'equipe_id', eu.disputa_id, 'premio', eu.premio, 'premio_texto', eu.premio_texto,
                                  'acima_posicao', ac.posicao, 'acima_valor', ac.valor, 'acima_quitacoes', ac.quitacoes,
                                  'acima_nome', CASE WHEN ac.posicao <= 10 THEN ac.nome END)
                           FROM eu
                           LEFT JOIN premiado ac
                             ON ac.posicao = eu.posicao - 1
                            AND ac.disputa_id IS NOT DISTINCT FROM eu.disputa_id)
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ranking_quitacao_calcular(UUID, UUID, DATE, UUID) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_ranking_quitacao_calcular(UUID, UUID, DATE, UUID) IS
  'A conta do Ranking de quitacao (setor, mes, config do setor), para a aba do Analitico '
  'e para o Modo TV. Cargo que nao conta no recebimento (lider) e robo ficam fora; cada '
  'disputa traz os seus destaques. Interna. 20261111150500, 20261112200000.';

-- ── 2. Prova ────────────────────────────────────────────────────────────────

DO $prova$
DECLARE
  v_alvos    BIGINT;
  v_fora     BIGINT;
  v_mudou    BIGINT;
  v_lider    BIGINT;
  v_sem_cat  BIGINT;
BEGIN
  CREATE TEMP TABLE _rq_depois ON COMMIT DROP AS
  SELECT al.empresa_id, al.setor_id, al.mes,
         public.fn_ranking_quitacao_calcular(al.empresa_id, al.setor_id, al.mes, NULL) AS r
    FROM _rq_alvos al;

  SELECT count(*) INTO v_alvos FROM _rq_alvos;

  -- Quem saiu do top 10 de alguma disputa.
  SELECT count(DISTINCT (x->>'id')) INTO v_fora
    FROM _rq_antes a,
         jsonb_array_elements(a.r->'disputas') d,
         jsonb_array_elements(COALESCE(d->'posicoes', '[]'::JSONB)) x
   WHERE (x->>'id')::UUID IN (SELECT id FROM _rq_fora);

  -- a. O novo é o antigo sem quem ficou fora, na mesma ordem.
  WITH antes AS (
    SELECT a.empresa_id, a.setor_id, a.mes, d->>'equipe_id' AS eq,
           (x->>'id')::UUID AS id, (x->>'posicao')::INT AS pos
      FROM _rq_antes a,
           jsonb_array_elements(a.r->'disputas') d,
           jsonb_array_elements(COALESCE(d->'posicoes', '[]'::JSONB)) x
  ),
  antes_sem AS (
    SELECT t.*, ROW_NUMBER() OVER (PARTITION BY t.empresa_id, t.setor_id, t.mes, t.eq ORDER BY t.pos) AS rn
      FROM antes t
     WHERE t.id NOT IN (SELECT id FROM _rq_fora)
  ),
  depois AS (
    SELECT a.empresa_id, a.setor_id, a.mes, d->>'equipe_id' AS eq,
           (x->>'id')::UUID AS id, (x->>'posicao')::INT AS pos
      FROM _rq_depois a,
           jsonb_array_elements(a.r->'disputas') d,
           jsonb_array_elements(COALESCE(d->'posicoes', '[]'::JSONB)) x
  )
  SELECT count(*) INTO v_mudou
    FROM antes_sem s
   WHERE NOT EXISTS (
     SELECT 1 FROM depois n
      WHERE n.empresa_id = s.empresa_id AND n.setor_id = s.setor_id AND n.mes = s.mes
        AND n.eq IS NOT DISTINCT FROM s.eq AND n.pos = s.rn AND n.id = s.id);
  IF v_mudou > 0 THEN
    RAISE EXCEPTION 'PROVA: % posicoes mudaram alem de tirar os lideres - nada foi aplicado', v_mudou;
  END IF;

  -- b. Ninguém de cargo que não conta, em posição nem em destaque.
  SELECT count(*) INTO v_lider
    FROM _rq_depois a
   WHERE EXISTS (
     SELECT 1 FROM jsonb_path_query(a.r, 'lax $.**.id') j
      WHERE jsonb_typeof(j) = 'string' AND (j #>> '{}') ~ '^[0-9a-f-]{36}$'
        AND (j #>> '{}')::UUID IN (SELECT id FROM _rq_fora));
  IF v_lider > 0 THEN
    RAISE EXCEPTION 'PROVA: lider ainda aparece em % ranking(s) - nada foi aplicado', v_lider;
  END IF;

  -- c. Toda disputa traz os seus destaques.
  SELECT count(*) INTO v_sem_cat
    FROM _rq_depois a, jsonb_array_elements(a.r->'disputas') d
   WHERE jsonb_typeof(d->'categorias') <> 'array' OR d->'categorias' IS NULL;
  IF v_sem_cat > 0 THEN
    RAISE EXCEPTION 'PROVA: % disputa(s) sem categorias - nada foi aplicado', v_sem_cat;
  END IF;

  IF has_function_privilege('authenticated', 'public.fn_ranking_quitacao_calcular(uuid,uuid,date,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROVA: fn_ranking_quitacao_calcular ficou aberta - nada foi aplicado';
  END IF;

  RAISE NOTICE 'PROVA: % setor/mes conferidos; % pessoa(s) de cargo que nao conta sairam do top 10', v_alvos, v_fora;
END
$prova$;

-- ── 3. TV e aba abertas pegam o ranking novo agora ──────────────────────────

SELECT public.fn_ranking_quitacao_avisar(x.empresa_id)
  FROM (SELECT DISTINCT empresa_id FROM public.ranking_quitacao_setores WHERE ativo) x;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261112200000', 'ranking_quitacao_sem_lideres_e_por_equipe', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
