-- ═══════════════════════════════════════════════════════════════════════════
-- Gincana — ranking v2: qualidade pontua, higiene desconta
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Só LEITURA. As datas e os dois parâmetros de nota ficam no CTE `par`.
--
-- ## O defeito da v1 que este arquivo corrige
--
-- Medido em 17/09/2026 sobre 01–16/09, nas 13 equipes de verdade:
--
--   critério      peso   menor   maior   pontos que gerava
--   metas          30%    75,0   100,0   ~1,7 no miolo da tabela
--   foto           10%    50,0   100,0   ~1,4 (fora a equipe da Tauana)
--   frequência     30%    53,6    98,5   13,5
--   planilha       30%    32,0    89,6   17,3
--
-- Nove das treze equipes tinham 85,7% em metas — que é 6/7: TODA equipe tem
-- exatamente uma pessoa sem meta. E sete tinham 100% em foto. Somados, metas e
-- foto são 40% do peso entregando ~3 pontos de separação: não ordenavam nada,
-- só somavam a mesma constante para todo mundo. Era daí que vinha a queixa de
-- que a diferença entre as equipes é pequena.
--
-- Havia também contagem dupla: «frequência» é dias com ACESSO, e a metade
-- «regularidade» da planilha é dias com acesso E trabalho — a segunda contém a
-- primeira. Eram 45% do peso medindo presença.
--
-- ## O que a v2 faz
--
--   1. **Higiene vira DESCONTO, não média.** Meta e foto saem do cálculo da
--      nota e viram penalidade por pessoa (−3 e −2). A cobrança continua — e
--      fica mais visível, porque é um número que some —, sem 40% do peso
--      distribuindo a mesma constante. E é acionável: o líder resolve hoje e
--      recupera amanhã.
--   2. **Presença conta uma vez.** Sai «frequência» como critério; fica a
--      regularidade, que já exige acesso E trabalho. A frequência continua nas
--      colunas, como leitura — junto com `dias_so_acesso`, que é o caso que o
--      agregado escondia: equipe presente e planilha parada.
--   3. **O volume tem alvo FIXO.** A v1 dividia pelo melhor do mês, e isso tem
--      dois defeitos: a nota de uma equipe passava a depender do desempenho de
--      outra, e setembro não comparava com outubro porque o denominador mudava.
--      Agora é contra `alvo_lanc_hora`, com teto em `teto_volume` para que
--      estourar o alvo valha algo sem virar o placar inteiro.
--
--      nota = (regularidade + volume) / 2 − 3×(sem meta) − 2×(sem foto)
--
-- O calendário por pessoa da v1 continua: menor aprendiz folga terça e tem
-- jornada de 5 h (08:00–13:00); operador, 7 h líquidas. Sábado fora para todos.
--
-- ## O que a v2 ainda NÃO faz
--
-- Nada aqui mede QUALIDADE do que foi tabulado — só regularidade e volume. Os
-- três critérios que fariam isso, todos com dado que já existe em `acordos`,
-- ficaram para outubro:
--
--   • atraso de tabulação   `criado_em::date − data_cadastro`
--   • acordo vencido sem desfecho  a régua de `isAtrasado` em `lib/index.ts`:
--                            `vencimento < hoje AND status NOT IN
--                            ('pago','nao_pago')` — é o «acompanhamento» do
--                            critério original, hoje não medido de jeito nenhum
--   • completude do cadastro  % com `whatsapp`, `instituicao`, `estado_uf`
--
-- «Equipes organizadas» continua fora: é conferência presencial, e os pontos
-- dela entram por fora.
--
-- O detalhe por pessoa que sustenta cada linha daqui está em
-- `gincana_detalhe_por_pessoa_20260917.sql`.

WITH par AS (
  SELECT DATE '2026-09-01' AS ini,
         DATE '2026-09-16' AS fim,        -- ontem: só dias completos
         '2026-09'::TEXT   AS mes_txt,
         9                 AS mes_n,
         2026              AS ano_n,
         5::NUMERIC        AS horas_aprendiz,   -- 08:00 às 13:00
         7::NUMERIC        AS horas_operador,   -- 7 a 8 horas, menos o almoço
         0.40::NUMERIC     AS alvo_lanc_hora,   -- o que vale 100 no volume
         120::NUMERIC      AS teto_volume,      -- estourar o alvo vale, com limite
         3::NUMERIC        AS desconto_meta,    -- por pessoa sem meta
         2::NUMERIC        AS desconto_foto     -- por pessoa sem foto
),
setor_alvo AS (
  SELECT cs.empresa_id, cs.setor_id, cs.nome AS setor
    FROM public.composicao_mes_setor cs, par
   WHERE cs.mes = par.mes_txt
     AND cs.nome IN ('Play 4','Play 5','Play Mix Marília','Conecta Play')),
lider AS (
  SELECT DISTINCT ON (l.equipe_id) l.equipe_id, l.lider_id, p.nome AS lider
    FROM public.composicao_mes_lider l
    JOIN public.perfis p ON p.id = l.lider_id, par
   WHERE l.mes = par.mes_txt
   ORDER BY l.equipe_id, l.ordem),
aprendiz_equipe AS (
  SELECT li.equipe_id FROM lider li WHERE li.lider ILIKE 'Elisandra%'),
gente AS (
  SELECT cm.empresa_id, cm.operador_id, cm.equipe_id, ce.nome AS equipe, sa.setor,
         COALESCE(li.lider, ce.nome)                        AS lider,
         (cm.equipe_id IN (SELECT equipe_id FROM aprendiz_equipe)) AS aprendiz,
         (NULLIF(btrim(p.foto_url), '') IS NOT NULL)        AS tem_foto
    FROM public.composicao_mes cm
    JOIN public.composicao_mes_equipe ce
      ON ce.mes = cm.mes AND ce.empresa_id = cm.empresa_id AND ce.equipe_id = cm.equipe_id
    JOIN setor_alvo sa
      ON sa.empresa_id = cm.empresa_id AND sa.setor_id = COALESCE(cm.setor_id, ce.setor_id)
    JOIN public.perfis p ON p.id = cm.operador_id AND NOT p.robo
    LEFT JOIN lider li ON li.equipe_id = cm.equipe_id, par
   WHERE cm.mes = par.mes_txt AND cm.equipe_id IS NOT NULL AND cm.situacao = 'ativo'),
uteis AS (
  SELECT e.empresa_id, d::DATE AS dia, extract(isodow FROM d)::INT AS isodow
    FROM (SELECT DISTINCT empresa_id FROM gente) e
    CROSS JOIN par
    CROSS JOIN LATERAL generate_series(par.ini, par.fim, INTERVAL '1 day') d
    LEFT JOIN public.metas_config_mes mc
      ON mc.empresa_id = e.empresa_id AND mc.mes = par.mes_n AND mc.ano = par.ano_n
   WHERE extract(isodow FROM d) < 6
     AND NOT COALESCE(mc.feriados, '[]'::JSONB) @> to_jsonb(to_char(d, 'YYYY-MM-DD'))),
n_uteis AS (
  SELECT empresa_id,
         count(*)                            AS n_todos,
         count(*) FILTER (WHERE isodow <> 2) AS n_aprendiz
    FROM uteis GROUP BY empresa_id),
acesso AS (
  SELECT usuario_id, dia FROM public.uso_sessoes, par WHERE dia BETWEEN par.ini AND par.fim
  UNION
  SELECT usuario_id, dia FROM public.uso_telas,   par WHERE dia BETWEEN par.ini AND par.fim),
mexeu AS (
  SELECT operador_id AS usuario_id, (criado_em AT TIME ZONE 'America/Sao_Paulo')::DATE AS dia
    FROM public.acordos, par
   WHERE criado_em >= par.ini::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'
     AND criado_em <  (par.fim + 1)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'
  UNION
  SELECT usuario_id, (criado_em AT TIME ZONE 'America/Sao_Paulo')::DATE
    FROM public.historico_acordos, par
   WHERE valor_anterior IS NOT NULL
     AND criado_em >= par.ini::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'
     AND criado_em <  (par.fim + 1)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'
  UNION
  SELECT operador_id, (criado_em AT TIME ZONE 'America/Sao_Paulo')::DATE
    FROM public.pix_automatico_acordos, par
   WHERE criado_em >= par.ini::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'
     AND criado_em <  (par.fim + 1)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'
  UNION
  SELECT usuario_id, dia FROM public.uso_telas, par
   WHERE tela LIKE 'acordos%' AND dia BETWEEN par.ini AND par.fim),
lanc AS (
  SELECT usuario_id, count(*) AS n FROM (
    SELECT DISTINCT operador_id AS usuario_id, COALESCE(acordo_grupo_id, id) AS chave
      FROM public.acordos, par
     WHERE criado_em >= par.ini::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'
       AND criado_em <  (par.fim + 1)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'
    UNION ALL
    SELECT operador_id, id FROM public.pix_automatico_acordos, par
     WHERE criado_em >= par.ini::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'
       AND criado_em <  (par.fim + 1)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo') x
  GROUP BY usuario_id),
com_meta AS (
  SELECT DISTINCT referencia_id FROM public.metas, par
   WHERE tipo = 'operador' AND mes = par.mes_n AND ano = par.ano_n AND meta_valor > 0),
por_pessoa AS (
  SELECT g.*,
         CASE WHEN g.aprendiz THEN nu.n_aprendiz ELSE nu.n_todos END AS n_uteis,
         CASE WHEN g.aprendiz THEN nu.n_aprendiz * par.horas_aprendiz
                              ELSE nu.n_todos    * par.horas_operador END AS horas,
         (SELECT count(*) FROM acesso a
            JOIN uteis u ON u.empresa_id = g.empresa_id AND u.dia = a.dia
           WHERE a.usuario_id = g.operador_id
             AND (NOT g.aprendiz OR u.isodow <> 2)) AS dias_acesso,
         (SELECT count(*) FROM mexeu x
            JOIN uteis u ON u.empresa_id = g.empresa_id AND u.dia = x.dia
           WHERE x.usuario_id = g.operador_id
             AND (NOT g.aprendiz OR u.isodow <> 2)) AS dias_planilha,
         COALESCE(l.n, 0) AS lancamentos,
         EXISTS (SELECT 1 FROM com_meta m WHERE m.referencia_id = g.operador_id) AS tem_meta
    FROM gente g
    CROSS JOIN par
    JOIN n_uteis nu ON nu.empresa_id = g.empresa_id
    LEFT JOIN lanc l ON l.usuario_id = g.operador_id),
por_lider AS (
  SELECT lider,
         string_agg(DISTINCT equipe, ' + ' ORDER BY equipe) AS equipes,
         string_agg(DISTINCT setor,  ', ' ORDER BY setor)   AS setores,
         bool_or(aprendiz)                                  AS tem_aprendiz,
         count(*)                                           AS pessoas,
         min(n_uteis)                                       AS dias_uteis,
         sum(horas)                                         AS horas,
         sum((NOT tem_meta)::INT)                           AS sem_meta,
         sum((NOT tem_foto)::INT)                           AS sem_foto,
         -- Fica como LEITURA, não pontua mais: ver o cabeçalho.
         100.0 * avg(dias_acesso::NUMERIC   / NULLIF(n_uteis, 0)) AS freq_pct,
         100.0 * avg(dias_planilha::NUMERIC / NULLIF(n_uteis, 0)) AS regular_pct,
         sum(dias_acesso - dias_planilha)                   AS dias_so_acesso,
         sum(lancamentos)                                   AS lancamentos,
         sum(lancamentos)::NUMERIC / NULLIF(sum(horas), 0)  AS lanc_hora
    FROM por_pessoa GROUP BY lider),
com_nota AS (
  SELECT e.*,
         LEAST(100 * COALESCE(e.lanc_hora, 0) / par.alvo_lanc_hora, par.teto_volume) AS volume_pct,
         e.sem_meta * par.desconto_meta + e.sem_foto * par.desconto_foto AS penalidade
    FROM por_lider e CROSS JOIN par)
SELECT rank() OVER (ORDER BY pontos DESC) AS pos, *
  FROM (
    SELECT c.lider, c.equipes, c.setores, c.pessoas, c.dias_uteis,
           CASE WHEN c.tem_aprendiz THEN 'menor aprendiz' ELSE '' END AS obs,
           round(c.regular_pct, 1) AS regularidade,
           round(c.volume_pct,  1) AS volume,
           round((c.regular_pct + c.volume_pct) / 2, 1) AS qualidade,
           c.sem_meta, c.sem_foto,
           round(c.penalidade, 1) AS penalidade,
           -- Nota nunca negativa: «zero» já diz tudo o que precisa ser dito, e
           -- um número abaixo de zero só embaralharia a leitura.
           GREATEST(round((c.regular_pct + c.volume_pct) / 2 - c.penalidade, 1), 0) AS pontos,
           -- Leitura, fora da conta:
           round(c.freq_pct, 1)  AS frequencia,
           c.dias_so_acesso,
           c.lancamentos, round(c.horas, 0) AS horas, round(c.lanc_hora, 3) AS lanc_hora
      FROM com_nota c) t
 ORDER BY pontos DESC;
