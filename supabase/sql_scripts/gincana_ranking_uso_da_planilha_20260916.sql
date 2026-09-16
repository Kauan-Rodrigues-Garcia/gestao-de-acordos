-- ═══════════════════════════════════════════════════════════════════════════
-- Gincana Gestão de Acordos — ranking parcial de 16/09/2026 (dados de 01–15/09)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Só LEITURA. Para atualizar, troque as datas (período e o `mes` 2026-09).
--
-- ## Por que não é o `gincana_placar_por_equipe.sql`
--
-- O placar de 10/09 tinha cinco critérios. No parcial de 16/09 dois saíram por
-- decisão da gestão: foto de perfil e equipe organizada. Os pontos deste
-- script NÃO são comparáveis aos de 10/09 — só as posições são.
--
-- ## Recorte
--
--   • setores: Play 4, Play 5, Play Mix Marília, Conecta Play, pelo setor da
--     PESSOA (a Digital do Brunno tem gente nos três primeiros);
--   • só `situacao = 'ativo'` — férias e desligados fora dos dois lados da
--     conta; contas de robô fora;
--   • cada pessoa conta na equipe PRINCIPAL; clone não pontua duas vezes;
--   • Elisandra e Treinamento Leticia entram (estavam no placar de 10/09);
--   • dia útil = seg–sex menos os feriados de `metas_config_mes`, a régua do
--     painel de metas. Só dias completos: o dia da consulta fica fora.
--
-- ## Três critérios, 1/3 cada, todos de 0 a 100
--
--   metas        — % da equipe com meta individual do mês (> 0)
--   frequencia   — média, por pessoa, de dias úteis com acesso ÷ dias úteis
--                  (uso_sessoes ∪ uso_telas)
--   planilha     — metade REGULARIDADE (dias úteis em que a pessoa criou ou
--                  alterou acordo, lançou Pix automático ou abriu as telas de
--                  acordos) e metade VOLUME (acordos + Pix por pessoa ÷ a
--                  equipe que mais lançou). Parcelas do mesmo acordo contam 1.
--
-- ## Limitações conhecidas
--
--   • `historico_acordos` credita ao operador a alteração feita sem usuário
--     logado (sincronização automática). Por isso a regularidade conta DIAS,
--     não alterações — rajada automática vale um dia, não cem.
--   • O Brunno lidera três equipes (Digital Bruno / Digital - Brunno / Equipe
--     Digital). O placar publicado as junta em «Digital unificada», com média
--     ponderada por pessoa. A consulta devolve as três separadas.

WITH setor_alvo AS (
  SELECT cs.empresa_id, cs.setor_id, cs.nome AS setor
    FROM public.composicao_mes_setor cs
   WHERE cs.mes = '2026-09'
     AND cs.nome IN ('Play 4','Play 5','Play Mix Marília','Conecta Play')),
gente AS (
  SELECT cm.empresa_id, cm.operador_id, cm.equipe_id, ce.nome AS equipe, sa.setor
    FROM public.composicao_mes cm
    JOIN public.composicao_mes_equipe ce
      ON ce.mes = cm.mes AND ce.empresa_id = cm.empresa_id AND ce.equipe_id = cm.equipe_id
    JOIN setor_alvo sa
      ON sa.empresa_id = cm.empresa_id AND sa.setor_id = COALESCE(cm.setor_id, ce.setor_id)
    JOIN public.perfis p ON p.id = cm.operador_id AND NOT p.robo
   WHERE cm.mes = '2026-09' AND cm.equipe_id IS NOT NULL AND cm.situacao = 'ativo'),
uteis AS (
  SELECT e.empresa_id, d::date AS dia
    FROM (SELECT DISTINCT empresa_id FROM gente) e
    CROSS JOIN generate_series(DATE '2026-09-01', DATE '2026-09-15', INTERVAL '1 day') d
    LEFT JOIN public.metas_config_mes mc
      ON mc.empresa_id = e.empresa_id AND mc.mes = 9 AND mc.ano = 2026
   WHERE extract(isodow FROM d) < 6
     AND NOT COALESCE(mc.feriados, '[]'::jsonb) @> to_jsonb(to_char(d, 'YYYY-MM-DD'))),
n_uteis AS (SELECT empresa_id, count(*) AS n FROM uteis GROUP BY empresa_id),
acesso AS (
  SELECT usuario_id, dia FROM public.uso_sessoes WHERE dia BETWEEN '2026-09-01' AND '2026-09-15'
  UNION
  SELECT usuario_id, dia FROM public.uso_telas   WHERE dia BETWEEN '2026-09-01' AND '2026-09-15'),
mexeu AS (
  SELECT operador_id AS usuario_id, (criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia
    FROM public.acordos
   WHERE criado_em >= '2026-09-01 00:00-03' AND criado_em < '2026-09-16 00:00-03'
  UNION
  SELECT usuario_id, (criado_em AT TIME ZONE 'America/Sao_Paulo')::date
    FROM public.historico_acordos
   WHERE valor_anterior IS NOT NULL
     AND criado_em >= '2026-09-01 00:00-03' AND criado_em < '2026-09-16 00:00-03'
  UNION
  SELECT operador_id, (criado_em AT TIME ZONE 'America/Sao_Paulo')::date
    FROM public.pix_automatico_acordos
   WHERE criado_em >= '2026-09-01 00:00-03' AND criado_em < '2026-09-16 00:00-03'
  UNION
  SELECT usuario_id, dia FROM public.uso_telas
   WHERE tela LIKE 'acordos%' AND dia BETWEEN '2026-09-01' AND '2026-09-15'),
lanc AS (
  SELECT usuario_id, count(*) AS n FROM (
    SELECT DISTINCT operador_id AS usuario_id, COALESCE(acordo_grupo_id, id) AS chave
      FROM public.acordos
     WHERE criado_em >= '2026-09-01 00:00-03' AND criado_em < '2026-09-16 00:00-03'
    UNION ALL
    SELECT operador_id, id FROM public.pix_automatico_acordos
     WHERE criado_em >= '2026-09-01 00:00-03' AND criado_em < '2026-09-16 00:00-03') x
  GROUP BY usuario_id),
com_meta AS (
  SELECT DISTINCT referencia_id FROM public.metas
   WHERE tipo = 'operador' AND mes = 9 AND ano = 2026 AND meta_valor > 0),
por_pessoa AS (
  SELECT g.*, nu.n AS n_uteis,
         (SELECT count(*) FROM acesso a JOIN uteis u ON u.empresa_id = g.empresa_id AND u.dia = a.dia
           WHERE a.usuario_id = g.operador_id) AS dias_acesso,
         (SELECT count(*) FROM mexeu x JOIN uteis u ON u.empresa_id = g.empresa_id AND u.dia = x.dia
           WHERE x.usuario_id = g.operador_id) AS dias_planilha,
         COALESCE(l.n, 0) AS lancamentos,
         EXISTS (SELECT 1 FROM com_meta m WHERE m.referencia_id = g.operador_id) AS tem_meta
    FROM gente g
    JOIN n_uteis nu ON nu.empresa_id = g.empresa_id
    LEFT JOIN lanc l ON l.usuario_id = g.operador_id),
por_equipe AS (
  SELECT equipe_id, equipe, string_agg(DISTINCT setor, ', ') AS setores,
         count(*) AS pessoas, max(n_uteis) AS dias_uteis,
         100.0 * avg(tem_meta::int)                        AS metas_pct,
         100.0 * avg(dias_acesso::numeric   / n_uteis)     AS freq_pct,
         100.0 * avg(dias_planilha::numeric / n_uteis)     AS regular_pct,
         sum(lancamentos)                                  AS lancamentos,
         sum(lancamentos)::numeric / count(*)              AS lanc_pessoa
    FROM por_pessoa GROUP BY equipe_id, equipe),
lider AS (
  SELECT DISTINCT ON (l.equipe_id) l.equipe_id, p.nome
    FROM public.composicao_mes_lider l JOIN public.perfis p ON p.id = l.lider_id
   WHERE l.mes = '2026-09' ORDER BY l.equipe_id, l.ordem)
SELECT rank() OVER (ORDER BY pontos DESC) AS pos, *
  FROM (
    SELECT li.nome AS lider, e.equipe, e.setores, e.pessoas, e.dias_uteis,
           round(e.metas_pct, 1)  AS metas,
           round(e.freq_pct, 1)   AS frequencia,
           round(e.regular_pct, 1) AS regularidade,
           e.lancamentos, round(e.lanc_pessoa, 1) AS lanc_pessoa,
           round((e.regular_pct + 100 * COALESCE(e.lanc_pessoa / NULLIF(max(e.lanc_pessoa) OVER (), 0), 0)) / 2, 1) AS planilha,
           round((e.metas_pct + e.freq_pct
                  + (e.regular_pct + 100 * COALESCE(e.lanc_pessoa / NULLIF(max(e.lanc_pessoa) OVER (), 0), 0)) / 2) / 3, 1) AS pontos
      FROM por_equipe e LEFT JOIN lider li USING (equipe_id)) t
 ORDER BY pontos DESC;
