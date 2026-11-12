-- ============================================================================
-- 20261112235000_ranking_quitacao_juntar_equipes.sql
--
-- Ranking de quitação: juntar equipes para contar como uma só (pedido de
-- 12/11/2026 — no Play 2, Mateus e Kimberli disputam juntos).
--
-- ## O que entra
--
-- A config do setor ganha `grupos_equipes`: [{nome?, equipes: [uuid, …]}].
-- Cada grupo junta 2 ou mais equipes do setor, e cada equipe fica em um
-- grupo só. Onde a conta trata equipe, o grupo vale como UMA:
--
--   * disputa por equipe — um ranking só para o grupo (a mesma tabela de
--     prêmios), com os destaques do grupo;
--   * placar de equipes e Equipe campeã — uma linha só, somando o grupo.
--
-- A chave do grupo é a 1ª equipe dele (é o `equipe_id` da disputa, que a aba
-- e a TV já usam) e o nome é o dado, senão os nomes das equipes juntos
-- («Kimberli Marin + Mateus Castro»). Cada disputa passa a trazer `equipes`
-- (as equipes dela): a TV que escolheu uma equipe do grupo cai no grupo.
--
-- A validação mora em `fn_ranking_quitacao_definir_setor`: até 10 grupos,
-- só equipes do setor, nenhuma em dois grupos, nome até 40 letras.
--
-- Sem `grupos_equipes` = o de hoje. A prova confere: com a config atual, o
-- ranking de todo setor e mês é idêntico ao de antes (fora a chave nova
-- `equipes` em cada disputa).
--
-- Reverter: reaplicar a seção 3 de 20261112230000 e a seção 2 de
-- 20261112220000.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ── 0. O retrato de antes, para a prova ─────────────────────────────────────

CREATE TEMP TABLE _rq_alvos3 ON COMMIT DROP AS
SELECT DISTINCT s.empresa_id, s.setor_id, a.mes
  FROM public.ranking_quitacao_setores s
  JOIN public.ranking_quitacao_acordos a ON a.empresa_id = s.empresa_id
 WHERE s.ativo;

CREATE TEMP TABLE _rq_antes3 ON COMMIT DROP AS
SELECT al.empresa_id, al.setor_id, al.mes,
       public.fn_ranking_quitacao_calcular(al.empresa_id, al.setor_id, al.mes, NULL) AS r
  FROM _rq_alvos3 al;

-- ── 1. A conta, com os grupos ───────────────────────────────────────────────

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
  v_aceita   TEXT;
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
  v_aceita   := CASE WHEN v_cfg->>'aceita' = 'so_quitacao' THEN 'so_quitacao' ELSE 'todas' END;
  v_minimo   := GREATEST(0, COALESCE((v_cfg->>'minimo_quitacoes')::INTEGER, 0));
  v_fora     := ARRAY(SELECT x::UUID FROM jsonb_array_elements_text(
                        CASE WHEN jsonb_typeof(v_cfg->'equipes_fora') = 'array' THEN v_cfg->'equipes_fora' ELSE '[]'::JSONB END) x);
  v_premios  := COALESCE(v_linha.premios::NUMERIC[], ARRAY[]::NUMERIC[]);
  v_textos   := ARRAY(SELECT x FROM jsonb_array_elements_text(
                        CASE WHEN jsonb_typeof(v_cfg->'premios_texto') = 'array' THEN v_cfg->'premios_texto' ELSE '[]'::JSONB END) x);

  WITH grupos AS (
    -- 20261112235000: equipes que contam juntas (config `grupos_equipes`).
    SELECT g.ord,
           NULLIF(btrim(COALESCE(g.x->>'nome', '')), '') AS nome,
           ARRAY(SELECT y::UUID FROM jsonb_array_elements_text(
                   CASE WHEN jsonb_typeof(g.x->'equipes') = 'array' THEN g.x->'equipes' ELSE '[]'::JSONB END
                 ) WITH ORDINALITY AS t(y, o) ORDER BY t.o) AS equipes
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(v_cfg->'grupos_equipes') = 'array' THEN v_cfg->'grupos_equipes' ELSE '[]'::JSONB END
           ) WITH ORDINALITY AS g(x, ord)
  ),
  -- Cada equipe do grupo aponta para a chave do grupo (a 1ª equipe dele) e
  -- para o nome do grupo (o dado, ou os nomes das equipes, «Kimberli + Mateus»).
  mapa AS (
    SELECT eq.id AS equipe_id, gr.equipes[1] AS chave,
           COALESCE(gr.nome, (SELECT string_agg(e2.nome, ' + ' ORDER BY array_position(gr.equipes, e2.id))
                                FROM public.equipes e2 WHERE e2.id = ANY (gr.equipes))) AS nome
      FROM grupos gr
      JOIN public.equipes eq ON eq.id = ANY (gr.equipes)
     WHERE eq.empresa_id = p_empresa_id AND eq.setor_id = p_setor_id
       AND cardinality(gr.equipes) >= 2
  ),
  base AS (
    -- Cada linha é uma quitação (o leitor já juntou as peças do contrato).
    -- O setor da pessoa é o da equipe, senão o do cadastro (20261006120000).
    -- 20261112200000: cargo que não conta no recebimento (líder) e robô fora.
    SELECT a.operador_id, a.valor_acordo, p.nome, p.foto_url, p.equipe_id, e.nome AS equipe_nome,
           -- 20261112235000: equipe de um grupo disputa com o grupo.
           CASE WHEN v_disputa = 'equipe' THEN COALESCE(m.chave, p.equipe_id) END AS disputa_id,
           m.nome AS grupo_nome
      FROM public.ranking_quitacao_acordos a
      JOIN public.perfis p       ON p.id = a.operador_id
      LEFT JOIN public.equipes e ON e.id = p.equipe_id
      LEFT JOIN mapa m           ON m.equipe_id = p.equipe_id
      LEFT JOIN public.cargos c  ON c.slug = p.perfil
     WHERE a.empresa_id = p_empresa_id
       AND a.mes = v_mes
       AND COALESCE(e.setor_id, p.setor_id) = p_setor_id
       AND (p.equipe_id IS NULL OR NOT (p.equipe_id = ANY (v_fora)))
       AND c.conta_no_recebimento IS NOT FALSE
       AND NOT COALESCE(p.robo, FALSE)
       -- 20261112230000: o setor que aceita só Quitação deixa de fora a Junção
       -- (troca de plano) e o saldo zerado. Sem tipo (importado antes) conta.
       AND (v_aceita = 'todas' OR COALESCE(a.tipo, 'quitacao') = 'quitacao')
  ),
  por_pessoa AS (
    SELECT b.operador_id, b.nome, b.foto_url, b.equipe_id, b.equipe_nome, b.disputa_id, b.grupo_nome,
           COUNT(*)::INTEGER AS quitacoes,
           ROUND(SUM(b.valor_acordo), 2) AS valor,
           MAX(b.valor_acordo) AS maior
      FROM base b
     GROUP BY b.operador_id, b.nome, b.foto_url, b.equipe_id, b.equipe_nome, b.disputa_id, b.grupo_nome
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
           CASE WHEN v_disputa = 'equipe' THEN COALESCE(MAX(pr.grupo_nome), MAX(pr.equipe_nome), 'Sem equipe') END AS nome,
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
  -- As equipes do setor que disputam: com gente ou com quitação no mês. O
  -- grupo (20261112235000) é uma linha só, com a chave e o nome do grupo.
  equipes AS (
    SELECT COALESCE(m.chave, e.id) AS id,
           COALESCE(MAX(m.nome), MAX(e.nome)) AS nome,
           COALESCE(SUM(pp.quitacoes), 0)::INTEGER AS quitacoes,
           COALESCE(ROUND(SUM(pp.valor), 2), 0) AS valor,
           COUNT(pp.operador_id)::INTEGER AS pessoas
      FROM public.equipes e
      LEFT JOIN mapa m        ON m.equipe_id = e.id
      LEFT JOIN por_pessoa pp ON pp.equipe_id = e.id
     WHERE e.empresa_id = p_empresa_id
       AND e.setor_id = p_setor_id
       AND NOT (e.id = ANY (v_fora))
       AND (pp.operador_id IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.perfis p WHERE p.equipe_id = e.id AND p.empresa_id = p_empresa_id))
     GROUP BY COALESCE(m.chave, e.id)
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
    'aceita',           v_aceita,
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
                                   -- 20261112235000: as equipes desta disputa (o grupo inteiro).
                                   'equipes', COALESCE((SELECT jsonb_agg(m.equipe_id) FROM mapa m WHERE m.chave = d.disputa_id),
                                                       CASE WHEN d.disputa_id IS NULL THEN '[]'::JSONB
                                                            ELSE jsonb_build_array(d.disputa_id) END),
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
  'disputa traz os seus destaques; config aceita = so_quitacao deixa de fora Juncao e saldo '
  'zerado; config grupos_equipes junta equipes numa disputa so. Interna. 20261111150500, '
  '20261112200000, 20261112230000, 20261112235000.';

-- ── 2. Configurar: valida os grupos ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ranking_quitacao_definir_setor(
  p_empresa_id UUID, p_setor_id UUID, p_ativo BOOLEAN,
  p_premios NUMERIC[] DEFAULT NULL, p_config JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_premios NUMERIC[];
  v_x       JSONB;
  v_fora    TEXT;
  v_geral   BOOLEAN;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Sem permissao para configurar o Ranking de quitacao.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.setores s WHERE s.id = p_setor_id AND s.empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'Setor nao encontrado nesta empresa.';
  END IF;

  v_geral := public.fn_user_is_super_admin() OR public.fn_user_tem('ranking_quitacao_configurar');
  -- 20261112220000: o líder, só no próprio setor, já ligado, sem ligar/desligar.
  IF NOT v_geral THEN
    IF NOT public.fn_user_tem('ranking_quitacao_configurar_setor') THEN
      RAISE EXCEPTION 'Sem permissao para configurar o Ranking de quitacao.' USING ERRCODE = '42501';
    END IF;
    IF NOT (p_setor_id IN (SELECT public.fn_setores_do_operador((SELECT auth.uid())))) THEN
      RAISE EXCEPTION 'Voce so configura o Ranking de quitacao do seu setor.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ranking_quitacao_setores s
                    WHERE s.empresa_id = p_empresa_id AND s.setor_id = p_setor_id AND s.ativo) THEN
      RAISE EXCEPTION 'O Ranking de quitacao nao esta ligado neste setor. Quem liga e o administrador, em Configuracoes.' USING ERRCODE = '42501';
    END IF;
    IF p_ativo IS FALSE THEN
      RAISE EXCEPTION 'Desligar o Ranking de quitacao e com o administrador, em Configuracoes.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_premios IS NOT NULL AND (
       cardinality(p_premios) > 10
       OR EXISTS (SELECT 1 FROM unnest(p_premios) v WHERE v IS NULL OR v < 0)
     ) THEN
    RAISE EXCEPTION 'Os premios vao de 0 a 10 posicoes, sem valor negativo.';
  END IF;

  IF p_config IS NOT NULL THEN
    IF jsonb_typeof(p_config) <> 'object' OR pg_column_size(p_config) > 16384 THEN
      RAISE EXCEPTION 'A configuracao do ranking veio em formato invalido.';
    END IF;
    IF COALESCE(p_config->>'criterio', 'valor') NOT IN ('valor', 'quantidade') THEN
      RAISE EXCEPTION 'O criterio do ranking e valor ou quantidade.';
    END IF;
    IF COALESCE(p_config->>'disputa', 'setor') NOT IN ('setor', 'equipe') THEN
      RAISE EXCEPTION 'A disputa do ranking e por setor ou por equipe.';
    END IF;
    -- 20261112230000: o que conta como quitação no setor.
    IF COALESCE(p_config->>'aceita', 'todas') NOT IN ('todas', 'so_quitacao') THEN
      RAISE EXCEPTION 'O ranking aceita todas as quitacoes ou so acordo de Quitacao.';
    END IF;
    IF p_config ? 'minimo_quitacoes' AND (
         jsonb_typeof(p_config->'minimo_quitacoes') <> 'number'
         OR (p_config->>'minimo_quitacoes') !~ '^[0-9]{1,3}$'
       ) THEN
      RAISE EXCEPTION 'O minimo de quitacoes e um numero inteiro de 0 a 999.';
    END IF;
    IF p_config ? 'equipes_fora' THEN
      IF jsonb_typeof(p_config->'equipes_fora') <> 'array' THEN
        RAISE EXCEPTION 'As equipes de fora vieram em formato invalido.';
      END IF;
      FOR v_fora IN SELECT jsonb_array_elements_text(p_config->'equipes_fora') LOOP
        IF v_fora !~ '^[0-9a-f-]{36}$'
           OR NOT EXISTS (SELECT 1 FROM public.equipes e
                           WHERE e.id = v_fora::UUID AND e.empresa_id = p_empresa_id AND e.setor_id = p_setor_id) THEN
          RAISE EXCEPTION 'Uma equipe de fora nao e deste setor.';
        END IF;
      END LOOP;
    END IF;
    -- 20261112235000: equipes que contam juntas.
    IF p_config ? 'grupos_equipes' THEN
      IF jsonb_typeof(p_config->'grupos_equipes') <> 'array' OR jsonb_array_length(p_config->'grupos_equipes') > 10 THEN
        RAISE EXCEPTION 'Os grupos de equipes vieram em formato invalido.';
      END IF;
      FOR v_x IN SELECT jsonb_array_elements(p_config->'grupos_equipes') LOOP
        IF jsonb_typeof(v_x) <> 'object'
           OR jsonb_typeof(v_x->'equipes') IS DISTINCT FROM 'array'
           OR jsonb_array_length(v_x->'equipes') < 2
           OR (v_x ? 'nome' AND jsonb_typeof(v_x->'nome') NOT IN ('string', 'null'))
           OR char_length(COALESCE(v_x->>'nome', '')) > 40 THEN
          RAISE EXCEPTION 'Cada grupo junta pelo menos duas equipes, com nome de ate 40 letras.';
        END IF;
        FOR v_fora IN SELECT jsonb_array_elements_text(v_x->'equipes') LOOP
          IF v_fora !~ '^[0-9a-f-]{36}$'
             OR NOT EXISTS (SELECT 1 FROM public.equipes e
                             WHERE e.id = v_fora::UUID AND e.empresa_id = p_empresa_id AND e.setor_id = p_setor_id) THEN
            RAISE EXCEPTION 'Uma equipe do grupo nao e deste setor.';
          END IF;
        END LOOP;
      END LOOP;
      IF (SELECT count(*) <> count(DISTINCT t.x)
            FROM (SELECT jsonb_array_elements_text(g->'equipes') AS x
                    FROM jsonb_array_elements(p_config->'grupos_equipes') g) t) THEN
        RAISE EXCEPTION 'Uma equipe esta em dois grupos.';
      END IF;
    END IF;
    IF p_config ? 'premios_texto' AND (
         jsonb_typeof(p_config->'premios_texto') <> 'array'
         OR jsonb_array_length(p_config->'premios_texto') > 10
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_config->'premios_texto') t
                     WHERE jsonb_typeof(t) <> 'string' OR char_length(t #>> '{}') > 40)
       ) THEN
      RAISE EXCEPTION 'O brinde de cada posicao e um texto de ate 40 letras.';
    END IF;
    IF p_config ? 'categorias' THEN
      IF jsonb_typeof(p_config->'categorias') <> 'array' OR jsonb_array_length(p_config->'categorias') > 8 THEN
        RAISE EXCEPTION 'Os destaques do ranking vieram em formato invalido.';
      END IF;
      FOR v_x IN SELECT jsonb_array_elements(p_config->'categorias') LOOP
        IF jsonb_typeof(v_x) <> 'object'
           OR COALESCE(v_x->>'id', '') NOT IN ('mais_quitacoes', 'maior_valor', 'maior_quitacao', 'equipe_campea')
           OR (v_x ? 'ativo' AND jsonb_typeof(v_x->'ativo') <> 'boolean')
           OR (v_x ? 'premio' AND jsonb_typeof(v_x->'premio') NOT IN ('number', 'null'))
           OR (jsonb_typeof(v_x->'premio') = 'number' AND (v_x->>'premio')::NUMERIC < 0)
           OR (v_x ? 'premio_texto' AND jsonb_typeof(v_x->'premio_texto') NOT IN ('string', 'null'))
           OR char_length(COALESCE(v_x->>'premio_texto', '')) > 40 THEN
          RAISE EXCEPTION 'Um destaque do ranking esta invalido.';
        END IF;
      END LOOP;
    END IF;
  END IF;

  INSERT INTO public.ranking_quitacao_setores AS s
         (empresa_id, setor_id, ativo, premios, config, atualizado_por, atualizado_em)
  VALUES (p_empresa_id, p_setor_id, COALESCE(p_ativo, TRUE),
          COALESCE(p_premios, ARRAY[350, 250, 180, 100, 70, 50]::NUMERIC[]),
          COALESCE(p_config, '{}'::JSONB),
          (SELECT auth.uid()), NOW())
  ON CONFLICT (empresa_id, setor_id) DO UPDATE
     SET ativo          = COALESCE(p_ativo, s.ativo),
         premios        = COALESCE(p_premios, s.premios),
         config         = COALESCE(p_config, s.config),
         atualizado_por = EXCLUDED.atualizado_por,
         atualizado_em  = NOW()
  RETURNING s.premios INTO v_premios;

  IF p_config ? 'premios_texto'
     AND jsonb_array_length(p_config->'premios_texto') > cardinality(v_premios) THEN
    RAISE EXCEPTION 'Ha mais brindes do que posicoes premiadas.';
  END IF;

  PERFORM public.fn_ranking_quitacao_avisar(p_empresa_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ranking_quitacao_definir_setor(UUID, UUID, BOOLEAN, NUMERIC[], JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ranking_quitacao_definir_setor(UUID, UUID, BOOLEAN, NUMERIC[], JSONB) TO authenticated;

COMMENT ON FUNCTION public.fn_ranking_quitacao_definir_setor(UUID, UUID, BOOLEAN, NUMERIC[], JSONB) IS
  'Liga/desliga o Ranking de quitacao num setor e grava premios (0 a 10) e a config '
  '(NULL mantem). ranking_quitacao_configurar: todos os setores; '
  'ranking_quitacao_configurar_setor: so os setores da pessoa, ja ligados, sem ligar/desligar. '
  'Valida grupos_equipes (20261112235000). Avisa TVs e aba. 20261111150500, 20261112220000, 20261112235000.';

-- ── 3. Prova ────────────────────────────────────────────────────────────────

DO $prova$
DECLARE
  v_tot BIGINT;
  v_dif BIGINT;
BEGIN
  -- Sem grupos (a config de hoje), tudo igual — fora a chave nova `equipes`.
  WITH depois AS (
    SELECT a.r AS antes, public.fn_ranking_quitacao_calcular(a.empresa_id, a.setor_id, a.mes, NULL) AS novo
      FROM _rq_antes3 a
  )
  SELECT count(*),
         count(*) FILTER (WHERE (d.novo - 'disputas') IS DISTINCT FROM (d.antes - 'disputas')
                             OR COALESCE((SELECT jsonb_agg(x - 'equipes') FROM jsonb_array_elements(d.novo->'disputas') x), '[]'::JSONB)
                                IS DISTINCT FROM COALESCE(d.antes->'disputas', '[]'::JSONB))
    INTO v_tot, v_dif
    FROM depois d;
  IF v_dif > 0 THEN
    RAISE EXCEPTION 'PROVA: o ranking de % de % setor/mes mudou - nada foi aplicado', v_dif, v_tot;
  END IF;

  IF has_function_privilege('authenticated', 'public.fn_ranking_quitacao_calcular(uuid,uuid,date,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_ranking_quitacao_definir_setor(uuid,uuid,boolean,numeric[],jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROVA: os grants do ranking ficaram errados.';
  END IF;

  RAISE NOTICE 'PROVA: % setor/mes conferidos, todos iguais', v_tot;
END
$prova$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261112235000', 'ranking_quitacao_juntar_equipes', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
