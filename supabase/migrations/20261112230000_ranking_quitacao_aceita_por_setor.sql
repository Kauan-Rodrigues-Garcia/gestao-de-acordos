-- ============================================================================
-- 20261112230000_ranking_quitacao_aceita_por_setor.sql
--
-- Ranking de quitação: cada setor escolhe o que conta como quitação (pedido
-- de 12/11/2026).
--
-- ## Por quê
--
-- O leitor do relatório conta como quitação tudo o que fecha o contrato: o
-- acordo de Quitação, a Junção que fechou o contrato (troca de plano) e o
-- Parcelamento/Parcela única/Semestral que ficou com saldo zero e a data da
-- quitação. O Play 3 quer assim. O Play 2 quer SÓ o acordo de Quitação.
-- No 671.xlsx (novembro, só Play 2): 68 de Quitação, 18 de Junção e 14 de
-- saldo zerado.
--
-- ## O que entra
--
-- 1. `ranking_quitacao_acordos.tipo` — a origem que o leitor já calcula:
--      quitacao      tem acordo «Situação Atual» Quitação;
--      juncao        Junção que fechou o contrato, sem acordo Quitação;
--      saldo_zerado  outro rótulo com saldo zero e a data da quitação.
--    Nula nas linhas importadas antes: conta como quitação até reimportar.
-- 2. `fn_ranking_quitacao_importar` grava o `tipo` que vem do leitor.
-- 3. A config do setor ganha `aceita`: 'todas' (padrão, o de hoje) ou
--    'so_quitacao'. A conta (`fn_ranking_quitacao_calcular`) filtra por ela,
--    e a aba, a TV, os destaques e o placar seguem juntos. A validação do
--    valor fica em `fn_ranking_quitacao_definir_setor` (20261112220000).
--
-- Config sem `aceita` = o de hoje. A prova confere: com a config atual, o
-- ranking de todo setor e mês é idêntico ao de antes.
--
-- Depende de 20261112200000 (é a conta dela, com o filtro) — colar depois.
--
-- Reverter: reaplicar a seção 1 de 20261112200000 e a seção 5 de
-- 20261111150500; a coluna pode ficar.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ── 0. O retrato de antes, para a prova ─────────────────────────────────────

CREATE TEMP TABLE _rq_alvos2 ON COMMIT DROP AS
SELECT DISTINCT s.empresa_id, s.setor_id, a.mes
  FROM public.ranking_quitacao_setores s
  JOIN public.ranking_quitacao_acordos a ON a.empresa_id = s.empresa_id
 WHERE s.ativo;

CREATE TEMP TABLE _rq_antes2 ON COMMIT DROP AS
SELECT al.empresa_id, al.setor_id, al.mes,
       public.fn_ranking_quitacao_calcular(al.empresa_id, al.setor_id, al.mes, NULL) AS r
  FROM _rq_alvos2 al;

-- ── 1. A origem de cada quitação ────────────────────────────────────────────

ALTER TABLE public.ranking_quitacao_acordos
  ADD COLUMN IF NOT EXISTS tipo TEXT;
ALTER TABLE public.ranking_quitacao_acordos
  DROP CONSTRAINT IF EXISTS ranking_quitacao_acordos_tipo;
ALTER TABLE public.ranking_quitacao_acordos
  ADD CONSTRAINT ranking_quitacao_acordos_tipo CHECK (tipo IS NULL OR tipo IN ('quitacao', 'juncao', 'saldo_zerado'));

COMMENT ON COLUMN public.ranking_quitacao_acordos.tipo IS
  'De onde a quitacao veio: quitacao (acordo Quitacao), juncao (Juncao que fechou o contrato, '
  'troca de plano) ou saldo_zerado (outro rotulo com saldo zero). Nula = importada antes de '
  '20261112230000, conta como quitacao. O setor com config aceita = so_quitacao so conta quitacao.';

-- ── 2. Importar ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ranking_quitacao_importar(p_empresa_id UUID, p_mes DATE, p_linhas JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mes DATE := date_trunc('month', p_mes)::DATE;
  v_n   INTEGER;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT (public.fn_user_is_super_admin() OR public.fn_user_tem('ranking_quitacao_importar')) THEN
    RAISE EXCEPTION 'Sem permissao para importar o Ranking de quitacao.' USING ERRCODE = '42501';
  END IF;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
    RAISE EXCEPTION 'As linhas do relatorio vieram em formato invalido.';
  END IF;

  DELETE FROM public.ranking_quitacao_acordos
   WHERE empresa_id = p_empresa_id AND mes = v_mes;

  INSERT INTO public.ranking_quitacao_acordos
         (empresa_id, mes, cod_acordo, operador_usuario, operador_id, valor_acordo, data_quitacao, importado_por, tipo)
  SELECT p_empresa_id, v_mes, l.cod_acordo, l.operador_usuario, p.id, l.valor_acordo, l.data_quitacao, (SELECT auth.uid()),
         -- 20261112230000: a origem da quitação; o leitor antigo não manda (fica nula = conta).
         CASE WHEN l.tipo IN ('quitacao', 'juncao', 'saldo_zerado') THEN l.tipo END
    FROM jsonb_to_recordset(p_linhas)
         AS l(cod_acordo TEXT, operador_usuario TEXT, operador_id UUID, valor_acordo NUMERIC, data_quitacao DATE, tipo TEXT)
    LEFT JOIN public.perfis p ON p.id = l.operador_id AND p.empresa_id = p_empresa_id
   WHERE NULLIF(trim(l.cod_acordo), '') IS NOT NULL
     AND NULLIF(trim(l.operador_usuario), '') IS NOT NULL
     AND l.valor_acordo IS NOT NULL
     AND date_trunc('month', l.data_quitacao)::DATE = v_mes
  ON CONFLICT (empresa_id, mes, cod_acordo) DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM public.fn_ranking_quitacao_avisar(p_empresa_id);
  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION public.fn_ranking_quitacao_importar(UUID, DATE, JSONB) IS
  'Grava os acordos quitados do mes, substituindo a importacao anterior do mesmo mes, e '
  'grava a origem (tipo) e avisa TVs e aba (fn_ranking_quitacao_avisar). 20261111150500, 20261112230000.';

-- ── 3. A conta, com o filtro do setor ───────────────────────────────────────

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
       -- 20261112230000: o setor que aceita só Quitação deixa de fora a Junção
       -- (troca de plano) e o saldo zerado. Sem tipo (importado antes) conta.
       AND (v_aceita = 'todas' OR COALESCE(a.tipo, 'quitacao') = 'quitacao')
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
  'zerado. Interna. 20261111150500, 20261112200000, 20261112230000.';

-- ── 4. Prova ────────────────────────────────────────────────────────────────

DO $prova$
DECLARE
  v_tot   BIGINT;
  v_dif   BIGINT;
BEGIN
  -- a. Com a config de hoje, tudo igual (fora a chave nova `aceita`).
  SELECT count(*),
         count(*) FILTER (WHERE (public.fn_ranking_quitacao_calcular(a.empresa_id, a.setor_id, a.mes, NULL) - 'aceita')
                                IS DISTINCT FROM (a.r - 'aceita'))
    INTO v_tot, v_dif
    FROM _rq_antes2 a;
  IF v_dif > 0 THEN
    RAISE EXCEPTION 'PROVA: o ranking de % de % setor/mes mudou - nada foi aplicado', v_dif, v_tot;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'ranking_quitacao_acordos' AND column_name = 'tipo') THEN
    RAISE EXCEPTION 'PROVA: a coluna tipo nao foi criada.';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_ranking_quitacao_calcular(uuid,uuid,date,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_ranking_quitacao_importar(uuid,date,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROVA: os grants do ranking ficaram errados.';
  END IF;

  RAISE NOTICE 'PROVA: % setor/mes conferidos, todos iguais', v_tot;
END
$prova$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261112230000', 'ranking_quitacao_aceita_por_setor', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
