-- =============================================================================
-- Relatório 945: a trava semanal vira validação do mês fechado
-- =============================================================================
-- Pedido do Cleber, 19/11/2026. A trava da 20261026150000 exigia que cada dia
-- fosse reimportado 7 dias depois (consolidado): na prática, toda importação
-- pedia «exporte desde a semana passada». A faixa de cobertura já mostra qual
-- dia veio completo; a trava diária sai.
--
-- Regra nova:
-- 1. Importação do dia a dia: qualquer período, sem exigência.
-- 2. A partir do 2º dia útil (seg–sex) do mês, o mês anterior precisa estar
--    VALIDADO. Enquanto não estiver, o arquivo precisa começar no dia 1º do mês
--    anterior (e ir até hoje). É a mesma trava de antes, só que mensal.
-- 3. Um dia está validado quando um arquivo que o cobriu foi importado no 2º
--    dia útil do mês seguinte ou depois, e esse arquivo vai além do fim do mês
--    (corte já no mês seguinte). Assim pega as baixas retroativas do mês todo.
-- 4. Começa pelo mês de novembro/2026 (primeira validação em 02/12/2026).
--    Outubro e antes já passaram pela trava semanal.
-- 5. Na faixa, «consolidado» passa a ser: corte 7+ dias depois do dia (como
--    antes) OU dia validado.
--
-- Só troca as funções de leitura da regra. `private.r945_operar` continua
-- chamando `private.r945_inicio_exigido` na abertura e na conclusão do lote,
-- então o banco recusa de novo com a regra nova sem precisar ser reescrito.
-- =============================================================================

-- O 2º dia útil (seg–sex) do mês de `d`. Feriado não entra: a regra é simples
-- de propósito, e no pior caso pede a validação um dia útil mais cedo.
CREATE OR REPLACE FUNCTION private.r945_segundo_dia_util(d date)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT x::date
    FROM generate_series(date_trunc('month', d)::timestamp, date_trunc('month', d)::timestamp + interval '9 days', interval '1 day') x
   WHERE extract(isodow FROM x) < 6
   ORDER BY x
  OFFSET 1 LIMIT 1;
$$;

-- O dia `d` passou pela validação do mês dele?
CREATE OR REPLACE FUNCTION private.r945_validado(d date, corte timestamptz, atualizado_em timestamptz)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT corte >= private.r945_inicio_do_dia((date_trunc('month', d) + interval '1 month')::date)
     AND (atualizado_em AT TIME ZONE 'America/Sao_Paulo')::date
         >= private.r945_segundo_dia_util((date_trunc('month', d) + interval '1 month')::date);
$$;

-- Dia 1º do mês anterior, se ele ainda precisa ser validado; senão, null.
CREATE OR REPLACE FUNCTION private.r945_inicio_exigido(e uuid, hoje date)
RETURNS date LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT m.ini
    FROM (SELECT (date_trunc('month', hoje) - interval '1 month')::date AS ini,
                 (date_trunc('month', hoje) - interval '1 day')::date AS fim) m
   WHERE m.ini >= date '2026-11-01'
     AND hoje >= private.r945_segundo_dia_util(hoje)
     AND EXISTS (
       SELECT 1
         FROM generate_series(m.ini::timestamp, m.fim::timestamp, interval '1 day') d
        WHERE NOT EXISTS (
          SELECT 1 FROM private.r945_cobertura c
           WHERE c.empresa_id = e AND c.data = d::date
             AND private.r945_validado(d::date, c.corte, c.atualizado_em)));
$$;

-- Igual à 20261026150000; muda só o estado «consolidado».
CREATE OR REPLACE FUNCTION private.r945_cobertura_json(e uuid, hoje date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'hoje', hoje,
    'inicio_exigido', private.r945_inicio_exigido(e, hoje),
    'piso_diario', (date_trunc('month', hoje) - interval '1 month')::date,
    'ultimo_corte', (SELECT max(l.corte) FROM private.pp_relatorio_lotes l
                      WHERE l.empresa_id = e AND l.modalidade = 'pagamento' AND l.concluido_em IS NOT NULL),
    'dias', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'data', d::date,
        'estado', CASE
          WHEN c.corte IS NULL THEN 'sem_importacao'
          WHEN c.corte >= private.r945_inicio_do_dia(d::date + 7)
            OR private.r945_validado(d::date, c.corte, c.atualizado_em) THEN 'consolidado'
          WHEN c.corte >= private.r945_inicio_do_dia(d::date + 1) THEN 'completo'
          ELSE 'parcial' END,
        'corte', c.corte,
        'atualizado_em', c.atualizado_em,
        'diario', (SELECT count(*) FROM public.diario_recebimentos r
                    WHERE r.empresa_id = e AND r.dia_referencia = d::date AND r.id_baixa IS NOT NULL),
        'diretoria', (SELECT count(*) FROM public.pp_relatorio_pagamentos a
                       WHERE a.empresa_id = e AND a.data = d::date)
      ) ORDER BY d), '[]'::jsonb)
        FROM generate_series((hoje - 20)::timestamp, hoje::timestamp, interval '1 day') d
        LEFT JOIN private.r945_cobertura c ON c.empresa_id = e AND c.data = d::date
    ));
$$;

REVOKE ALL ON FUNCTION private.r945_segundo_dia_util(date), private.r945_validado(date, timestamptz, timestamptz),
  private.r945_inicio_exigido(uuid, date), private.r945_cobertura_json(uuid, date) FROM PUBLIC, anon, authenticated;
