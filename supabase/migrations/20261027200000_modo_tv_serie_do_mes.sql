-- ============================================================================
-- Modo TV 2: a série por dia, para o gráfico «Evolução do mês» (27/10/2026)
-- ============================================================================
--
-- Pedido do Cleber: uma cena com um gráfico que muda conforme o recebimento
-- entra. O pacote dos números (`fn_tv_numeros_calcular`) só tinha o TOTAL do
-- mês; o gráfico precisa do dinheiro de cada dia.
--
-- ## De onde vem a série, e por que a tela a ajusta ao total
--
-- O total continua vindo de `fn_recebido_por_setor` / `fn_recebido_por_equipe`
-- — as funções do Painel do Líder, que sabem de clone, alternativo e «só no
-- setor da pessoa». Rodar uma delas por DIA custaria 30 chamadas por minuto
-- por alvo.
--
-- A série sai de uma leitura só do analítico: no setor normal, as linhas
-- carimbadas nele; no alternativo e na equipe, as linhas de quem é do alvo;
-- mais o ajuste de recebimento (do setor, da equipe ou da pessoa). Ela dá o
-- FORMATO do mês, dia a dia. A tela escala a curva para terminar EXATAMENTE no
-- total oficial (`numeros.ts › serieAcumulada`) — o número que a parede mostra
-- é sempre o do Painel do Líder.
--
-- O corpo é o de 20261027170000, com duas mudanças: quem é do alvo vira um
-- array calculado uma vez (`v_membros`), usado pelo ranking e pela série, e
-- o pacote ganha `serie`.
--
-- O cache (`tv_numeros_cache`) é apagado no fim: são números derivados, e sem
-- isso a série só apareceria depois de um minuto.
--
-- Reverter: reaplicar `fn_tv_numeros_calcular` de 20261027170000.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

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
       AND COALESCE(p.situacao, '') <> 'ferias'
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
  -- escala para fechar no total oficial — ver o cabeçalho.
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
    'calculado_em',    now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_numeros_calcular(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Números derivados: recalculam no próximo pedido, já com a série. O WHERE é
-- pelo `safeupdate` (DELETE sem WHERE é recusado).
DELETE FROM public.tv_numeros_cache WHERE chave IS NOT NULL;

DO $conf$
BEGIN
  IF has_function_privilege('anon', 'public.fn_tv_numeros_calcular(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_tv_numeros_calcular não pode ser do anon.';
  END IF;
  IF pg_get_functiondef('public.fn_tv_numeros_calcular(uuid,uuid)'::regprocedure) !~ '''serie''' THEN
    RAISE EXCEPTION 'fn_tv_numeros_calcular sem a série.';
  END IF;
END
$conf$;

COMMIT;
