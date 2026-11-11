-- ============================================================================
-- 20261111150500_ranking_quitacao_configuravel.sql
--
-- Ranking de quitação: uma conta só para a aba e para o Modo TV, a TV
-- atualizada na hora da importação, e o ranking configurável por setor
-- (pedido de 11/11/2026).
--
-- ## 1. Uma conta só
--
-- A conta do ranking estava escrita duas vezes: em `fn_ranking_quitacao` (a
-- aba do Analítico) e copiada dentro de `fn_tv_numeros_calcular` (a TV). Cada
-- mudança precisava ser feita nos dois lugares. Agora as duas chamam
-- `fn_ranking_quitacao_calcular`, interna (sem grant), e a TV mostra o mesmo
-- que a aba: mesma ordem, mesmo prêmio, mesmos destaques.
--
-- ## 2. A TV atualiza na hora
--
-- A TV relia os números a cada 30 s, com cache de 1 minuto: o relatório
-- importado demorava até ~1 min e meio para aparecer, e um prêmio alterado
-- também. Agora importar e salvar a configuração chamam
-- `fn_ranking_quitacao_avisar`, que:
--   a. troca só o bloco `quitacao` no cache das TVs da empresa (sem refazer o
--      resto do pacote, que é a parte pesada);
--   b. manda o «mudou» no tópico de cada painel da empresa (o mesmo de
--      20261027190000) — a TV relê na hora;
--   c. manda «mudou» no tópico público `ranking-quitacao:<empresa>`, que a
--      aba aberta no Analítico ouve. Só a hora trafega, nenhum número.
--
-- ## 3. Configurável por setor
--
-- `ranking_quitacao_setores` ganha `config` (jsonb) e os prêmios deixam de ser
-- exatamente 6 (de 0 a 10 posições):
--
--   criterio          'valor' (padrão) | 'quantidade' — o que ordena.
--   disputa           'setor' (padrão) | 'equipe' — cada equipe com o seu
--                     ranking e a mesma tabela de prêmios.
--   equipes_fora      [uuid] — equipes do setor que não disputam
--                     (ex.: Treinamento).
--   minimo_quitacoes  inteiro — quem tem menos quitações aparece, mas não
--                     leva o prêmio da posição. 0 = sem mínimo.
--   premios_texto     [texto] — o brinde de cada posição, ao lado do valor
--                     (ex.: «Troféu», «Folga»). Mesmo tamanho de `premios`.
--   categorias        [{id, ativo, premio, premio_texto}] — os destaques do
--                     mês, cada um com o seu prêmio:
--                       mais_quitacoes  quem fez mais quitações;
--                       maior_valor     quem quitou mais em valor;
--                       maior_quitacao  a maior quitação do mês, sozinha;
--                       equipe_campea   a equipe que mais quitou.
--
-- Config vazia = o comportamento de hoje (setor inteiro, por valor). A prova
-- no fim confere que, com a config atual de todos os setores (vazia), o top
-- 10 de cada setor e mês é IDÊNTICO ao de antes.
--
-- ## O que NÃO muda
--
-- Quem quita e quanto vale (o leitor do relatório, no navegador), a tabela
-- dos acordos, as chaves de permissão, a assinatura de `fn_ranking_quitacao`
-- e de `fn_ranking_quitacao_importar`. O resto de `fn_tv_numeros_calcular` é
-- o corpo de 20261106120000, sem mudança — só o bloco da quitação virou uma
-- chamada.
--
-- `fn_ranking_quitacao_definir_setor` ganha o 5º parâmetro (`p_config`,
-- opcional): a assinatura de 4 sai e entra a de 5, com o mesmo grant. O front
-- antigo continua funcionando (não manda `p_config`).
--
-- Reverter: reaplicar `fn_ranking_quitacao` de 20261006150000,
-- `fn_ranking_quitacao_importar` e `fn_ranking_quitacao_definir_setor` de
-- 20261006120000 e `fn_tv_numeros_calcular` de 20261106120000; DROP das
-- funções `fn_ranking_quitacao_calcular` e `fn_ranking_quitacao_avisar`.
-- A coluna `config` pode ficar (vazia não muda nada).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ── 0. O retrato de antes, para a prova ─────────────────────────────────────
-- A conta antiga (20261006150000), para todo setor ligado e todo mês importado.
CREATE TEMP TABLE _prova_quitacao_antes ON COMMIT DROP AS
WITH alvos AS (
  SELECT DISTINCT s.empresa_id, s.setor_id, a.mes
    FROM public.ranking_quitacao_setores s
    JOIN public.ranking_quitacao_acordos a ON a.empresa_id = s.empresa_id
   WHERE s.ativo
)
SELECT al.empresa_id, al.setor_id, al.mes,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object('id', o.operador_id, 'posicao', o.posicao,
                                             'valor', o.valor, 'quitacoes', o.quitacoes) ORDER BY o.posicao)
           FROM (
             SELECT po.operador_id, po.quitacoes, po.valor,
                    ROW_NUMBER() OVER (ORDER BY po.valor DESC, po.quitacoes DESC, p.nome) AS posicao
               FROM (
                 SELECT a.operador_id, COUNT(*)::INTEGER AS quitacoes, SUM(a.valor_acordo) AS valor
                   FROM public.ranking_quitacao_acordos a
                   JOIN public.perfis p       ON p.id = a.operador_id
                   LEFT JOIN public.equipes e ON e.id = p.equipe_id
                  WHERE a.empresa_id = al.empresa_id AND a.mes = al.mes
                    AND COALESCE(e.setor_id, p.setor_id) = al.setor_id
                  GROUP BY a.operador_id
               ) po
               JOIN public.perfis p ON p.id = po.operador_id
           ) o
          WHERE o.posicao <= 10), '[]'::JSONB) AS posicoes
  FROM alvos al;

-- ── 1. A configuração ───────────────────────────────────────────────────────

ALTER TABLE public.ranking_quitacao_setores
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE public.ranking_quitacao_setores
  DROP CONSTRAINT IF EXISTS ranking_quitacao_setores_seis_premios;
ALTER TABLE public.ranking_quitacao_setores
  DROP CONSTRAINT IF EXISTS ranking_quitacao_setores_premios_ate_dez;
ALTER TABLE public.ranking_quitacao_setores
  ADD CONSTRAINT ranking_quitacao_setores_premios_ate_dez CHECK (cardinality(premios) <= 10);
ALTER TABLE public.ranking_quitacao_setores
  DROP CONSTRAINT IF EXISTS ranking_quitacao_setores_config_objeto;
ALTER TABLE public.ranking_quitacao_setores
  ADD CONSTRAINT ranking_quitacao_setores_config_objeto
  CHECK (jsonb_typeof(config) = 'object' AND pg_column_size(config) <= 16384);

COMMENT ON COLUMN public.ranking_quitacao_setores.config IS
  'Como o setor disputa: criterio, disputa, equipes_fora, minimo_quitacoes, premios_texto, '
  'categorias. Vazio = setor inteiro, por valor. Validado em fn_ranking_quitacao_definir_setor. '
  'Ver 20261111150500.';

-- ── 2. A conta (interna) ────────────────────────────────────────────────────
--
-- `p_quem`: quem está olhando (o «eu»); nulo na TV. Sem trava de permissão:
-- quem chama confere (a aba pela chave, a TV pelo token do painel).
--
-- Devolve:
--   habilitado, criterio, disputa, minimo_quitacoes, premios, premios_texto,
--   importado_em, participantes,
--   disputas   [{equipe_id, nome, participantes, quitacoes_total, valor_total,
--                posicoes: top 10 [{posicao, id, nome, foto, equipe_id,
--                equipe_nome, quitacoes, valor, maior, premio, premio_texto,
--                abaixo_minimo}]}]
--              — uma só (equipe_id nulo) na disputa do setor;
--   equipes    [{id, nome, quitacoes, valor, pessoas}] — as equipes do setor
--              que disputam, na ordem do critério (zeradas também);
--   categorias [{id, premio, premio_texto, vencedor}] — só as ligadas;
--   eu         {posicao, quitacoes, valor, equipe_id, premio, premio_texto,
--               acima_posicao, acima_valor, acima_quitacoes, acima_nome}
--              — nome do vizinho só quando ele está no top 10.

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
    SELECT a.operador_id, a.valor_acordo, p.nome, p.foto_url, p.equipe_id, e.nome AS equipe_nome
      FROM public.ranking_quitacao_acordos a
      JOIN public.perfis p       ON p.id = a.operador_id
      LEFT JOIN public.equipes e ON e.id = p.equipe_id
     WHERE a.empresa_id = p_empresa_id
       AND a.mes = v_mes
       AND COALESCE(e.setor_id, p.setor_id) = p_setor_id
       AND (p.equipe_id IS NULL OR NOT (p.equipe_id = ANY (v_fora)))
  ),
  por_pessoa AS (
    SELECT b.operador_id, b.nome, b.foto_url, b.equipe_id, b.equipe_nome,
           COUNT(*)::INTEGER AS quitacoes,
           ROUND(SUM(b.valor_acordo), 2) AS valor,
           MAX(b.valor_acordo) AS maior
      FROM base b
     GROUP BY b.operador_id, b.nome, b.foto_url, b.equipe_id, b.equipe_nome
  ),
  ordenado AS (
    SELECT pp.*,
           CASE WHEN v_disputa = 'equipe' THEN pp.equipe_id END AS disputa_id,
           ROW_NUMBER() OVER (
             PARTITION BY CASE WHEN v_disputa = 'equipe' THEN pp.equipe_id END
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
                                   'posicoes', COALESCE(d.posicoes, '[]'::JSONB))
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
  'e para o Modo TV. Interna: quem chama confere a permissao. 20261111150500.';

-- ── 3. A aba do Analítico ───────────────────────────────────────────────────
-- Mesma assinatura e mesma trava de 20261006150000; a conta é a de cima.

CREATE OR REPLACE FUNCTION public.fn_ranking_quitacao(p_empresa_id UUID, p_setor_id UUID, p_mes DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT (public.fn_user_is_super_admin() OR public.fn_user_tem('analitico_sub_ranking_quitacao')) THEN
    RAISE EXCEPTION 'Sem permissao para ver o Ranking de quitacao.' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_ranking_quitacao_calcular(p_empresa_id, p_setor_id, p_mes, (SELECT auth.uid()));
END;
$function$;

COMMENT ON FUNCTION public.fn_ranking_quitacao(UUID, UUID, DATE) IS
  'O Ranking de quitacao do setor no mes (fn_ranking_quitacao_calcular), para quem tem a '
  'chave analitico_sub_ranking_quitacao. 20261111150500.';

-- ── 4. O aviso: TV e aba atualizadas na hora ────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ranking_quitacao_avisar(p_empresa_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  -- O mês que a TV mostra: o de hoje (fn_tv_numeros_calcular).
  v_mes DATE := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::DATE;
  r     RECORD;
BEGIN
  -- a. Só o bloco da quitação no cache das TVs. A chave do cache é
  --    «setor:equipe»; a hora do cálculo fica, e o resto do pacote vence no
  --    tempo de sempre.
  UPDATE public.tv_numeros_cache c
     SET dados = c.dados || jsonb_build_object('quitacao',
                   public.fn_ranking_quitacao_calcular(p_empresa_id, s.id, v_mes, NULL))
    FROM public.setores s
   WHERE s.empresa_id = p_empresa_id
     AND split_part(c.chave, ':', 1) = s.id::TEXT;

  -- b. As TVs da empresa releem agora (o tópico de 20261027190000).
  FOR r IN SELECT p.id, p.atualizado_em FROM public.tv_paineis p WHERE p.empresa_id = p_empresa_id LOOP
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('versao', r.atualizado_em, 'operacao', 'QUITACAO'),
        'mudou', 'tv-painel:' || r.id::TEXT, FALSE);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- Sem realtime, a TV pega na leitura de 30 s.
    END;
  END LOOP;

  -- c. A aba aberta no Analítico. Só a hora trafega.
  BEGIN
    PERFORM realtime.send(jsonb_build_object('em', now()), 'mudou',
                          'ranking-quitacao:' || p_empresa_id::TEXT, FALSE);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ranking_quitacao_avisar(UUID) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_ranking_quitacao_avisar(UUID) IS
  'Depois de importar ou configurar: troca a quitacao no cache das TVs e avisa as TVs e '
  'a aba do Analitico. Interna. 20261111150500.';

-- ── 5. Importar: o corpo de 20261006120000, mais o aviso ────────────────────

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
         (empresa_id, mes, cod_acordo, operador_usuario, operador_id, valor_acordo, data_quitacao, importado_por)
  SELECT p_empresa_id, v_mes, l.cod_acordo, l.operador_usuario, p.id, l.valor_acordo, l.data_quitacao, (SELECT auth.uid())
    FROM jsonb_to_recordset(p_linhas)
         AS l(cod_acordo TEXT, operador_usuario TEXT, operador_id UUID, valor_acordo NUMERIC, data_quitacao DATE)
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
  'avisa TVs e aba (fn_ranking_quitacao_avisar). 20261111150500.';

-- ── 6. Configurar o setor ───────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_ranking_quitacao_definir_setor(UUID, UUID, BOOLEAN, NUMERIC[]);

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
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT (public.fn_user_is_super_admin() OR public.fn_user_tem('ranking_quitacao_configurar')) THEN
    RAISE EXCEPTION 'Sem permissao para configurar o Ranking de quitacao.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.setores s WHERE s.id = p_setor_id AND s.empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'Setor nao encontrado nesta empresa.';
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
  '(NULL mantem). Avisa TVs e aba. 20261111150500.';

-- ── 7. O Modo TV: o corpo de 20261106120000, com a quitação pela conta única ─

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
  'única do ranking (fn_ranking_quitacao_calcular). Ver 20261106120000 e 20261111150500.';

-- ── 8. Prova ────────────────────────────────────────────────────────────────

DO $prova$
DECLARE
  v_dif  BIGINT;
  v_tot  BIGINT;
BEGIN
  -- a. Com a config de hoje (vazia), o top 10 de cada setor e mês é o mesmo.
  SELECT count(*), count(*) FILTER (WHERE
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', (p->>'id')::UUID, 'posicao', (p->>'posicao')::INT,
                                                 'valor', (p->>'valor')::NUMERIC, 'quitacoes', (p->>'quitacoes')::INT)
                              ORDER BY (p->>'posicao')::INT)
               FROM jsonb_array_elements(
                      public.fn_ranking_quitacao_calcular(a.empresa_id, a.setor_id, a.mes, NULL)->'disputas'->0->'posicoes') p
           ), '[]'::JSONB)
           IS DISTINCT FROM (
             SELECT COALESCE(jsonb_agg(jsonb_build_object('id', (q->>'id')::UUID, 'posicao', (q->>'posicao')::INT,
                                                          'valor', (q->>'valor')::NUMERIC, 'quitacoes', (q->>'quitacoes')::INT)
                                       ORDER BY (q->>'posicao')::INT), '[]'::JSONB)
               FROM jsonb_array_elements(a.posicoes) q))
    INTO v_tot, v_dif
    FROM _prova_quitacao_antes a;
  IF v_dif > 0 THEN
    RAISE EXCEPTION 'PROVA: o ranking de % de % setor/mes mudou com a conta nova - nada foi aplicado', v_dif, v_tot;
  END IF;

  -- b. As funções e os grants.
  IF to_regprocedure('public.fn_ranking_quitacao_calcular(uuid,uuid,date,uuid)') IS NULL
     OR to_regprocedure('public.fn_ranking_quitacao_avisar(uuid)') IS NULL
     OR to_regprocedure('public.fn_ranking_quitacao_definir_setor(uuid,uuid,boolean,numeric[],jsonb)') IS NULL THEN
    RAISE EXCEPTION 'PROVA: uma função do ranking não foi criada.';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_ranking_quitacao_calcular(uuid,uuid,date,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_ranking_quitacao_avisar(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_ranking_quitacao_definir_setor(uuid,uuid,boolean,numeric[],jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_ranking_quitacao_definir_setor(uuid,uuid,boolean,numeric[],jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_ranking_quitacao(uuid,uuid,date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_ranking_quitacao(uuid,uuid,date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_tv_numeros_calcular(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROVA: os grants do ranking ou da TV ficaram errados.';
  END IF;

  RAISE NOTICE 'PROVA: % setor/mes conferidos, todos iguais', v_tot;
END
$prova$;

-- As TVs pegam o pacote novo na próxima leitura.
DELETE FROM public.tv_numeros_cache WHERE TRUE;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261111150500', 'ranking_quitacao_configuravel', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
