-- ============================================================================
-- 20261105160000_plantao_elite_historico.sql
--
-- Plantão Elite: sub-aba «Histórico» (pedido de 05/11/2026) — todos os meses
-- desde o início do plantão (19/09/2026), com o comparativo dia a dia,
-- preenchido conforme os dias passam.
--
-- ## O problema que vem antes do histórico: a escala não tinha passado
--
-- `elite_plantao` guarda só a escala de HOJE (quem é ímpar, quem é par). Em
-- 01/11/2026 as duplas trocaram de dia: Tiago + Agatha, que eram do ímpar,
-- passaram para o par; Matheus + Gabriel, do par para o ímpar. Lendo só a
-- tabela, todo dia antes da troca sairia com a dupla ERRADA — no histórico e
-- também no quadro do dia (que hoje já erra os dias antigos).
--
-- Por isso entra `elite_plantao_escala`: retratos da escala inteira, cada um
-- valendo a partir de `desde`. A escala de um dia é o retrato mais recente com
-- `desde` <= o dia. `elite_plantao` continua sendo onde se edita a escala; um
-- gatilho tira o retrato sozinho a cada mudança, valendo do dia da mudança.
--
-- Retratos semeados aqui:
--   19/09/2026  a escala do início — a de hoje com os dias trocados;
--   01/11/2026  a escala de hoje (a data da troca: ajuste `v_troca` abaixo se
--               a troca valeu de outro dia).
--
-- ## O que muda
--
--   • `fn_elite_plantao_hora` (o quadro do dia) passa a ler a dupla da escala
--     DAQUELE dia. Assinatura e resposta iguais; só os dias antigos mudam de
--     dupla — para a certa.
--   • `fn_elite_plantao_historico` (nova): por dia, a dupla de plantão, quanto
--     cada um recebeu e o total do setor (mesma regra do card do quadro).
--
-- Mesma chave (`painel_lider_sub_elite`) e mesma regra de quem vê: quem é de
-- uma dupla vê só os dias em que ESTEVE de plantão; a gerência vê todos.
--
-- Reaplicável: o semeio só roda para empresa sem retrato nenhum.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Os retratos da escala ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.elite_plantao_escala (
  empresa_id UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  desde      DATE        NOT NULL,
  perfil_id  UUID        NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  plantao    TEXT        NOT NULL CHECK (plantao IN ('impar', 'par')),
  ordem      SMALLINT    NOT NULL DEFAULT 1,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, desde, perfil_id)
);

COMMENT ON TABLE public.elite_plantao_escala IS
  'Retratos da escala do Plantao Elite: cada `desde` guarda a escala inteira '
  'valendo daquele dia em diante. Tirado pelo gatilho de elite_plantao. '
  'Lida so pelas funcoes SECURITY DEFINER; RLS ligada e sem policy. 20261105160000.';

ALTER TABLE public.elite_plantao_escala ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.elite_plantao_escala FROM anon, authenticated;

-- ── 2. Semear: o início e a troca de 01/11 ─────────────────────────────────

DO $$
DECLARE
  v_inicio CONSTANT DATE := '2026-09-19';  -- o plantão começou aqui
  -- As duplas trocaram de dia aqui. Era 04/11 (o dia em que a troca foi
  -- anotada); os recebimentos mostram que valeu de 01/11 — corrigido no banco
  -- em 05/11/2026 (UPDATE de desde 04/11 → 01/11, 4 linhas).
  v_troca  CONSTANT DATE := '2026-11-01';
  e RECORD;
  n_impar INTEGER;
  n_par   INTEGER;
BEGIN
  FOR e IN SELECT DISTINCT ep.empresa_id FROM public.elite_plantao ep LOOP
    IF EXISTS (SELECT 1 FROM public.elite_plantao_escala x WHERE x.empresa_id = e.empresa_id) THEN
      CONTINUE;  -- já tem passado: reaplicar não mexe
    END IF;

    SELECT count(*) FILTER (WHERE plantao = 'impar'), count(*) FILTER (WHERE plantao = 'par')
      INTO n_impar, n_par
      FROM public.elite_plantao WHERE empresa_id = e.empresa_id;

    -- A troca de 01/11 inverteu duas duplas de duas pessoas. Escala diferente
    -- disso não é a que se conhece: melhor parar do que gravar passado errado.
    IF n_impar <> 2 OR n_par <> 2 THEN
      RAISE EXCEPTION 'Plantão Elite: esperava 2 pessoas no ímpar e 2 no par, achei % e %.', n_impar, n_par;
    END IF;

    -- Do início até a troca: a escala de hoje com os dias invertidos.
    INSERT INTO public.elite_plantao_escala (empresa_id, desde, perfil_id, plantao, ordem)
    SELECT ep.empresa_id, v_inicio, ep.perfil_id,
           CASE ep.plantao WHEN 'impar' THEN 'par' ELSE 'impar' END, ep.ordem
      FROM public.elite_plantao ep
     WHERE ep.empresa_id = e.empresa_id;

    -- Da troca em diante: a escala de hoje.
    INSERT INTO public.elite_plantao_escala (empresa_id, desde, perfil_id, plantao, ordem)
    SELECT ep.empresa_id, v_troca, ep.perfil_id, ep.plantao, ep.ordem
      FROM public.elite_plantao ep
     WHERE ep.empresa_id = e.empresa_id;
  END LOOP;
END $$;

-- ── 3. A escala de um dia ──────────────────────────────────────────────────
--
-- O retrato mais recente até o dia. Dia anterior a todos os retratos usa o
-- primeiro. Empresa sem retrato nenhum usa `elite_plantao` como está.

CREATE OR REPLACE FUNCTION public.fn_elite_escala_no_dia(p_empresa_id UUID, p_data DATE)
RETURNS TABLE(perfil_id UUID, plantao TEXT, ordem SMALLINT)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH vigente AS (
    SELECT COALESCE(
      (SELECT max(x.desde) FROM public.elite_plantao_escala x
        WHERE x.empresa_id = p_empresa_id AND x.desde <= p_data),
      (SELECT min(x.desde) FROM public.elite_plantao_escala x
        WHERE x.empresa_id = p_empresa_id)
    ) AS desde
  )
  SELECT x.perfil_id, x.plantao, x.ordem
    FROM public.elite_plantao_escala x
    JOIN vigente v ON v.desde = x.desde
   WHERE x.empresa_id = p_empresa_id
  UNION ALL
  SELECT ep.perfil_id, ep.plantao, ep.ordem
    FROM public.elite_plantao ep
   WHERE ep.empresa_id = p_empresa_id
     AND NOT EXISTS (SELECT 1 FROM public.elite_plantao_escala x WHERE x.empresa_id = p_empresa_id);
$function$;

REVOKE ALL ON FUNCTION public.fn_elite_escala_no_dia(UUID, DATE) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_elite_escala_no_dia(UUID, DATE) IS
  'Escala do Plantao Elite valendo no dia (retrato mais recente ate o dia). '
  'Uso interno das funcoes do plantao. 20261105160000.';

-- ── 4. O gatilho que tira o retrato ────────────────────────────────────────
--
-- Qualquer mudança em `elite_plantao` regrava o retrato de HOJE (São Paulo)
-- com a escala inteira: a mudança vale do dia em que foi feita, e os dias
-- anteriores ficam com a dupla que de fato estava neles.

CREATE OR REPLACE FUNCTION public.fn_elite_plantao_retrato()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
BEGIN
  DELETE FROM public.elite_plantao_escala WHERE desde = v_hoje;
  INSERT INTO public.elite_plantao_escala (empresa_id, desde, perfil_id, plantao, ordem)
  SELECT ep.empresa_id, v_hoje, ep.perfil_id, ep.plantao, ep.ordem
    FROM public.elite_plantao ep;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_elite_plantao_retrato() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_elite_plantao_retrato ON public.elite_plantao;
CREATE TRIGGER trg_elite_plantao_retrato
  AFTER INSERT OR UPDATE OR DELETE ON public.elite_plantao
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_elite_plantao_retrato();

-- ── 5. O quadro do dia lê a dupla daquele dia ──────────────────────────────
--
-- O corpo é o de 20260919100000; só muda de onde vem a dupla: da escala do
-- dia (`fn_elite_escala_no_dia`), e não da escala de hoje.

CREATE OR REPLACE FUNCTION public.fn_elite_plantao_hora(
  p_empresa_id UUID,
  p_data       DATE,
  p_plantao    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meu_plantao TEXT;
  v_plantao     TEXT;
  v_membros     UUID[];
  v_setor       UUID;
  v_mes         TEXT := to_char(p_data, 'YYYY-MM');
  v_resultado   JSONB;
BEGIN
  IF p_data IS NULL
     OR NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('painel_lider_sub_elite') THEN
    RAISE EXCEPTION 'Sem permissão para o Plantão Elite.' USING ERRCODE = '42501';
  END IF;

  SELECT ep.plantao INTO v_meu_plantao
    FROM public.fn_elite_escala_no_dia(p_empresa_id, p_data) ep
   WHERE ep.perfil_id = auth.uid();

  -- Quem é da dupla vê a própria, sempre. Os demais: a pedida ou a do dia.
  v_plantao := COALESCE(
    v_meu_plantao,
    CASE WHEN p_plantao IN ('impar', 'par') THEN p_plantao END,
    CASE WHEN extract(day FROM p_data)::INT % 2 = 1 THEN 'impar' ELSE 'par' END
  );

  SELECT array_agg(ep.perfil_id) INTO v_membros
    FROM public.fn_elite_escala_no_dia(p_empresa_id, p_data) ep
   WHERE ep.plantao = v_plantao;

  SELECT p.setor_id INTO v_setor
    FROM public.perfis p
   WHERE p.id = ANY(COALESCE(v_membros, '{}'))
     AND p.setor_id IS NOT NULL
   GROUP BY p.setor_id
   ORDER BY count(*) DESC, p.setor_id
   LIMIT 1;

  WITH
  membros AS (
    SELECT p.id, p.nome, p.usuario, ep.ordem
      FROM public.perfis p
      JOIN public.fn_elite_escala_no_dia(p_empresa_id, p_data) ep ON ep.perfil_id = p.id
     WHERE p.id = ANY(COALESCE(v_membros, '{}'))
  ),
  chegadas AS (
    SELECT ar.operador_id,
           CASE
             WHEN (ar.importado_em AT TIME ZONE 'America/Sao_Paulo')::DATE > p_data THEN 24
             WHEN (ar.importado_em AT TIME ZONE 'America/Sao_Paulo')::DATE < p_data THEN 0
             ELSE extract(hour FROM ar.importado_em AT TIME ZONE 'America/Sao_Paulo')::INT
           END AS hora,
           ar.valor_recebido
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id     = p_empresa_id
       AND ar.data_pagamento = p_data
       AND ar.operador_id    = ANY(COALESCE(v_membros, '{}'))
  ),
  do_setor AS (
    SELECT ar.valor_recebido, ar.importado_em,
           CASE
             WHEN ar.contribuicao_de_setor_id IS NOT NULL THEN ar.contribuicao_de_setor_id
             WHEN ar.operador_id IS NULL THEN NULL
             ELSE COALESCE(eq.setor_id, op.setor_id)
           END AS origem
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis  op ON op.id = ar.operador_id
      LEFT JOIN public.equipes eq ON eq.id = op.equipe_id
     WHERE v_setor IS NOT NULL
       AND ar.empresa_id     = p_empresa_id
       AND ar.data_pagamento = p_data
       AND ar.setor_id       = v_setor
  ),
  setor_conta AS (
    SELECT d.*
      FROM do_setor d
     WHERE NOT EXISTS (
       SELECT 1 FROM public.analitico_exclusoes_setor x
        WHERE x.empresa_id = p_empresa_id
          AND x.setor_id   = v_setor
          AND x.mes        = v_mes
          AND x.setor_origem_id IS NOT DISTINCT FROM d.origem)
  )
  SELECT jsonb_build_object(
    'data',        p_data,
    'plantao',     v_plantao,
    'sou_da_dupla', v_meu_plantao IS NOT NULL,
    'membros', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'usuario', m.usuario)
                       ORDER BY m.ordem, m.nome)
        FROM membros m), '[]'::JSONB),
    'chegadas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'operador_id', c.operador_id, 'hora', c.hora,
               'valor', c.total, 'qtd', c.qtd) ORDER BY c.operador_id, c.hora)
        FROM (SELECT operador_id, hora, sum(valor_recebido) AS total, count(*) AS qtd
                FROM chegadas GROUP BY operador_id, hora) c), '[]'::JSONB),
    'setor', CASE WHEN v_setor IS NULL THEN NULL ELSE jsonb_build_object(
      'id',    v_setor,
      'nome',  (SELECT s.nome FROM public.setores s WHERE s.id = v_setor),
      'total', COALESCE((SELECT sum(valor_recebido) FROM setor_conta), 0),
      'qtd',   (SELECT count(*) FROM setor_conta)
    ) END,
    'ultima_chegada', (SELECT max(importado_em) FROM do_setor)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_elite_plantao_hora(UUID, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_elite_plantao_hora(UUID, DATE, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_elite_plantao_hora(UUID, DATE, TEXT) IS
  'Plantao Elite: recebimento da dupla por hora de CHEGADA no analitico '
  '(importado_em, fuso de Sao Paulo) e total do setor no dia. A dupla vem da '
  'escala DAQUELE dia (20261105160000). Exige painel_lider_sub_elite; quem e '
  'da dupla ve so a propria.';

-- ── 6. O histórico ─────────────────────────────────────────────────────────
--
-- Devolve, do início do plantão (ou `p_de`) até hoje (ou `p_ate`), um item por
-- dia com:
--   plantao     ímpar/par pelo dia do mês;
--   membros     a dupla de plantão naquele dia (escala do dia), na ordem do
--               quadro, com quanto cada um recebeu e quantos pagamentos;
--   setor_total o total do setor no dia, na regra do card do quadro do dia
--               (carimbo do setor, sem as origens tiradas do acumulado no mês).
-- `pessoas` traz nome e login de quem aparece. Teto de 400 dias por chamada.

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
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'usuario', p.usuario) ORDER BY p.nome)
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
    ), '[]'::JSONB)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_elite_plantao_historico(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_elite_plantao_historico(UUID, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.fn_elite_plantao_historico(UUID, DATE, DATE) IS
  'Plantao Elite, historico: por dia, a dupla de plantao (escala do dia), o '
  'recebido de cada um e o total do setor. Exige painel_lider_sub_elite; quem '
  'e de dupla ve so os dias em que esteve de plantao. 20261105160000.';

COMMIT;

-- Conferência (só leitura): os retratos da escala, com os nomes.
SELECT x.desde, x.plantao, x.ordem, p.nome
  FROM public.elite_plantao_escala x
  JOIN public.perfis p ON p.id = x.perfil_id
 ORDER BY x.desde, x.plantao, x.ordem;
