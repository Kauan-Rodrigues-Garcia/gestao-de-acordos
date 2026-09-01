-- ============================================================================
-- Modo TV 2.0 — fase 2: os números que os templates precisam
-- ============================================================================
--
-- A fonte de meta devolvia dois números: alvo e realizado. Dá para desenhar uma
-- barra com isso e nada mais. Projeção, meta diária, ritmo necessário e gráfico
-- de evolução precisam de DIA ÚTIL — e dia útil neste sistema não é "seg a
-- sex": é seg a sex MENOS os feriados de `metas_config_mes.feriados`, a mesma
-- regra de `lib/diasUteis.ts` que o dashboard usa.
--
-- Calcular diferente aqui poria duas contas de meta no mesmo sistema, e a da
-- parede é a que todo mundo vê.
--
-- `contar_dia_atual` também vem de lá, e tem razão de existir: o analítico do
-- dia chega ao longo do dia, então contar hoje como decorrido faz a projeção
-- parecer pior de manhã e melhor à tarde. Quem decide é a configuração do mês.
--
-- Conferido em produção (BookPlay, Play 5, agosto/2026): alvo 504.000,00,
-- realizado 360.873,55, 21 dias úteis, meta diária 24.000,00.
--
-- ## Uma consulta, vários desenhos
--
-- A função devolve o PACOTE inteiro, e não o número de um modelo específico.
-- Qual deles vai ao palco é decisão do `config.modelo` na tela — assim um
-- template novo (rosca, termômetro, o que vier) não pede migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_tv_metricas_setor(
  p_empresa_id UUID, p_setor_id UUID, p_mes DATE
)
RETURNS JSONB
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH cfg AS (
    SELECT COALESCE(mc.feriados, '[]'::JSONB) AS feriados,
           COALESCE(mc.contar_dia_atual, TRUE) AS conta_hoje
      FROM public.metas_config_mes mc
     WHERE mc.empresa_id = p_empresa_id
       AND mc.mes = EXTRACT(MONTH FROM p_mes)::INT
       AND mc.ano = EXTRACT(YEAR  FROM p_mes)::INT
     LIMIT 1
  ),
  parametros AS (
    SELECT COALESCE((SELECT feriados   FROM cfg), '[]'::JSONB) AS feriados,
           COALESCE((SELECT conta_hoje FROM cfg), TRUE)        AS conta_hoje,
           (now() AT TIME ZONE 'America/Sao_Paulo')::DATE      AS hoje
  ),
  -- Dias uteis do mes: seg-sex menos feriados. Feriado em fim de semana nao
  -- subtrai nada, porque ja nao era dia util.
  dias AS (
    SELECT d::DATE AS dia
      FROM generate_series(p_mes, (p_mes + INTERVAL '1 month - 1 day')::DATE, INTERVAL '1 day') d
     WHERE EXTRACT(ISODOW FROM d) < 6
       AND NOT (to_char(d, 'YYYY-MM-DD') IN (
             SELECT jsonb_array_elements_text((SELECT feriados FROM parametros))))
  ),
  contagem AS (
    SELECT COUNT(*)::INT AS total,
           COUNT(*) FILTER (
             WHERE d.dia < (SELECT hoje FROM parametros)
                OR (d.dia = (SELECT hoje FROM parametros) AND (SELECT conta_hoje FROM parametros))
           )::INT AS decorridos
      FROM dias d
  ),
  meta AS (
    SELECT COALESCE(MAX(m.meta_valor), 0)::NUMERIC AS alvo
      FROM public.metas m
     WHERE m.empresa_id    = p_empresa_id
       AND m.tipo          = 'setor'
       AND m.referencia_id = p_setor_id
       AND m.mes = EXTRACT(MONTH FROM p_mes)::INT
       AND m.ano = EXTRACT(YEAR  FROM p_mes)::INT
  ),
  recebido AS (
    SELECT COALESCE(SUM(ar.valor_recebido), 0)::NUMERIC AS total,
           COALESCE(SUM(ar.valor_recebido) FILTER (
             WHERE ar.data_pagamento = (SELECT hoje FROM parametros)), 0)::NUMERIC AS hoje
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id     = p_empresa_id
       AND ar.setor_id       = p_setor_id
       AND ar.mes_referencia = p_mes
  ),
  -- A serie por dia alimenta o grafico de evolucao. So dias COM movimento: a
  -- linha nao deve cair a zero no domingo, ela deve simplesmente nao ter ponto.
  serie AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('dia', s.dia, 'valor', s.valor)
                              ORDER BY s.dia), '[]'::JSONB) AS pontos
      FROM (
        SELECT ar.data_pagamento AS dia,
               SUM(ar.valor_recebido)::NUMERIC AS valor
          FROM public.analitico_recebimentos ar
         WHERE ar.empresa_id     = p_empresa_id
           AND ar.setor_id       = p_setor_id
           AND ar.mes_referencia = p_mes
         GROUP BY ar.data_pagamento
      ) s
  )
  SELECT jsonb_build_object(
    'alvo',             (SELECT alvo  FROM meta),
    'realizado',        (SELECT total FROM recebido),
    'realizado_hoje',   (SELECT hoje  FROM recebido),
    'falta',            GREATEST(0, (SELECT alvo FROM meta) - (SELECT total FROM recebido)),
    'dias_uteis',       (SELECT total FROM contagem),
    'dias_decorridos',  (SELECT decorridos FROM contagem),
    'dias_restantes',   GREATEST(0, (SELECT total FROM contagem) - (SELECT decorridos FROM contagem)),
    -- Meta diaria "normal": a mensal dividida pelos dias uteis do mes.
    'meta_diaria',      CASE WHEN (SELECT total FROM contagem) > 0
                             THEN ROUND((SELECT alvo FROM meta) / (SELECT total FROM contagem), 2)
                             ELSE 0 END,
    -- Ritmo que AINDA falta por dia. E outro numero, e o mais util quando o mes
    -- ja andou: a meta diaria nao muda, este sobe quando se fica para tras.
    'ritmo_necessario', CASE WHEN (SELECT total FROM contagem) - (SELECT decorridos FROM contagem) > 0
                             THEN ROUND(GREATEST(0, (SELECT alvo FROM meta) - (SELECT total FROM recebido))
                                        / ((SELECT total FROM contagem) - (SELECT decorridos FROM contagem)), 2)
                             ELSE 0 END,
    'esperado_ate_hoje', CASE WHEN (SELECT total FROM contagem) > 0
                              THEN ROUND((SELECT alvo FROM meta) / (SELECT total FROM contagem)
                                         * (SELECT decorridos FROM contagem), 2)
                              ELSE 0 END,
    -- Projecao: o ritmo de ate agora mantido ate o fim do mes.
    'projecao',         CASE WHEN (SELECT decorridos FROM contagem) > 0
                             THEN ROUND((SELECT total FROM recebido)
                                        / (SELECT decorridos FROM contagem)
                                        * (SELECT total FROM contagem), 2)
                             ELSE 0 END,
    'serie',            (SELECT pontos FROM serie)
  );
$function$;

REVOKE ALL     ON FUNCTION public.fn_tv_metricas_setor(UUID, UUID, DATE) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_tv_metricas_setor(UUID, UUID, DATE) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.fn_tv_metricas_setor(UUID, UUID, DATE) IS
  'Tudo que os templates de meta do Modo TV precisam: alvo, realizado, dias '
  'uteis (seg-sex menos os feriados de metas_config_mes, a MESMA regra de '
  'lib/diasUteis.ts), meta diaria, ritmo necessario, projecao e a serie por '
  'dia. Uma regra so de dia util no sistema inteiro.';
