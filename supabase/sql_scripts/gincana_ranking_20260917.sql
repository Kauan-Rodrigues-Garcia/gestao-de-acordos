-- ═══════════════════════════════════════════════════════════════════════════
-- Gincana Gestão de Acordos — ranking por LÍDER, com o calendário de cada um
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Só LEITURA. Para atualizar, troque as três datas do CTE `par` (e nada mais).
--
-- Sucessor de `gincana_ranking_uso_da_planilha_20260916.sql`. O que mudou:
--
--   1. entrou o 4º critério, FOTO DE PERFIL, com peso 10%;
--   2. a linha do ranking é o LÍDER, e não a equipe — as três equipes do
--      Brunno Piccolo viram uma só, ponderada por pessoa, que é como o placar
--      publicado já as mostrava («Digital unificada»);
--   3. cada pessoa passou a ter o PRÓPRIO calendário e a PRÓPRIA carga horária.
--      É a correção do pedido de 17/09/2026, explicada abaixo.
--
-- ## Menor aprendiz não trabalha os mesmos dias, nem as mesmas horas
--
-- A equipe da Elisandra Raquel (setor Play 4) é de menores aprendizes. Duas
-- coisas os separam do resto:
--
--   • FOLGAM TERÇA-FEIRA. Contra um calendário de segunda a sexta, eles nunca
--     poderiam passar de 4/5 da frequência — a nota media a folga deles, não o
--     esforço. Aqui a terça sai dos dois lados da conta: não conta como dia que
--     deveria ter acesso, e um acesso numa terça não vira crédito extra.
--   • CARGA DE 5 HORAS (08:00–13:00), contra as ~7 horas líquidas dos
--     operadores (7 a 8 horas, menos a hora de almoço). Com o mesmo denominador,
--     o volume de lançamentos deles seria sempre menor pela jornada, e não pelo
--     ritmo. Aqui o volume é POR HORA DISPONÍVEL, e não por pessoa.
--
-- Sábado ficou de fora para todo mundo, como estava: os operadores trabalham um
-- por mês, e um dia solto não muda posição nenhuma — mas mudaria o denominador
-- de quem nunca trabalha aos sábados.
--
-- ## Recorte
--
--   • setores: Play 4, Play 5, Play Mix Marília, Conecta Play, pelo setor da
--     PESSOA (a Digital do Brunno tem gente nos três primeiros);
--   • só `situacao = 'ativo'` — férias e desligados fora dos dois lados da
--     conta; contas de robô fora;
--   • cada pessoa conta na equipe PRINCIPAL; clone não pontua duas vezes;
--   • Elisandra e Treinamento Leticia entram;
--   • dia útil = seg–sex menos os feriados de `metas_config_mes`, a régua do
--     painel de metas — menos a terça, para os menores aprendizes. Só dias
--     completos: o dia da consulta fica fora.
--
-- ## Quatro critérios, todos de 0 a 100
--
--   metas       30%  % da equipe com meta individual do mês (> 0). Meta
--                    configurada conta; o valor dela não entra — a régua é
--                    «está configurada?», e nada além disso.
--   frequencia  30%  média, por pessoa, de dias úteis DELA com acesso ÷ dias
--                    úteis DELA (uso_sessoes ∪ uso_telas)
--   planilha    30%  metade REGULARIDADE (dias úteis DELA em que criou ou
--                    alterou acordo, lançou Pix automático ou abriu as telas de
--                    acordos ÷ dias úteis dela) e metade VOLUME (lançamentos da
--                    equipe ÷ HORAS disponíveis da equipe, sobre o melhor
--                    índice entre as equipes). Parcelas do mesmo acordo contam 1.
--   foto        10%  % das pessoas ativas com foto de perfil
--
--   pontos = 0,9 × (metas + frequencia + planilha) / 3 + 0,1 × foto
--
-- «Equipes organizadas e atualizadas» NÃO está aqui de propósito: é conferência
-- presencial, e os pontos dela entram por fora.
--
-- ## Limitações conhecidas
--
--   • `historico_acordos` credita ao operador a alteração feita sem usuário
--     logado (sincronização automática). Por isso a regularidade conta DIAS,
--     não alterações — rajada automática vale um dia, não cem.
--   • Quem é menor aprendiz sai do nome da LÍDER (`ILIKE 'Elisandra%'` em
--     `composicao_mes_lider`), porque não há marca de contrato no cadastro. Se
--     a equipe mudar de líder, ajuste `aprendiz_equipe` antes de rodar.

WITH par AS (
  SELECT DATE '2026-09-01' AS ini,
         DATE '2026-09-16' AS fim,        -- ontem: só dias completos
         '2026-09'::TEXT   AS mes_txt,
         9                 AS mes_n,
         2026              AS ano_n,
         5::NUMERIC        AS horas_aprendiz,   -- 08:00 às 13:00
         7::NUMERIC        AS horas_operador    -- 7 a 8 horas, menos o almoço
),
setor_alvo AS (
  SELECT cs.empresa_id, cs.setor_id, cs.nome AS setor
    FROM public.composicao_mes_setor cs, par
   WHERE cs.mes = par.mes_txt
     AND cs.nome IN ('Play 4','Play 5','Play Mix Marília','Conecta Play')),
-- O líder da equipe no mês: o de menor `ordem`, que é o titular.
lider AS (
  SELECT DISTINCT ON (l.equipe_id) l.equipe_id, l.lider_id, p.nome AS lider
    FROM public.composicao_mes_lider l
    JOIN public.perfis p ON p.id = l.lider_id, par
   WHERE l.mes = par.mes_txt
   ORDER BY l.equipe_id, l.ordem),
-- As equipes de menores aprendizes. Ver a limitação no cabeçalho.
aprendiz_equipe AS (
  SELECT li.equipe_id FROM lider li WHERE li.lider ILIKE 'Elisandra%'),
gente AS (
  SELECT cm.empresa_id, cm.operador_id, cm.equipe_id, ce.nome AS equipe, sa.setor,
         COALESCE(li.lider, ce.nome)                       AS lider,
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
-- Dias úteis do período, com o dia da semana à mão: é ele que tira a terça do
-- calendário dos aprendizes.
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
         count(*)                                   AS n_todos,
         count(*) FILTER (WHERE isodow <> 2)        AS n_aprendiz
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
-- Agrupado pelo LÍDER: as três equipes do Brunno entram numa linha só, e a
-- média sai ponderada por pessoa porque a agregação é sobre as pessoas.
por_lider AS (
  SELECT lider,
         string_agg(DISTINCT equipe, ' + ' ORDER BY equipe) AS equipes,
         string_agg(DISTINCT setor,  ', ' ORDER BY setor)   AS setores,
         bool_or(aprendiz)                                   AS tem_aprendiz,
         count(*)                                            AS pessoas,
         min(n_uteis)                                        AS dias_uteis,
         sum(horas)                                          AS horas,
         100.0 * avg(tem_meta::INT)                          AS metas_pct,
         100.0 * avg(tem_foto::INT)                          AS foto_pct,
         100.0 * avg(dias_acesso::NUMERIC   / NULLIF(n_uteis, 0)) AS freq_pct,
         100.0 * avg(dias_planilha::NUMERIC / NULLIF(n_uteis, 0)) AS regular_pct,
         sum(lancamentos)                                    AS lancamentos,
         sum(lancamentos)::NUMERIC / NULLIF(sum(horas), 0)   AS lanc_hora
    FROM por_pessoa GROUP BY lider),
-- O volume vira nota contra o MELHOR índice do mês: 100 para quem mais lançou
-- por hora disponível, proporcional para os demais.
com_nota AS (
  SELECT e.*,
         100 * COALESCE(e.lanc_hora / NULLIF(max(e.lanc_hora) OVER (), 0), 0) AS volume_pct
    FROM por_lider e)
SELECT rank() OVER (ORDER BY pontos DESC) AS pos, *
  FROM (
    SELECT c.lider, c.equipes, c.setores, c.pessoas, c.dias_uteis,
           CASE WHEN c.tem_aprendiz THEN 'menor aprendiz' ELSE '' END AS obs,
           round(c.metas_pct,   1) AS metas,
           round(c.freq_pct,    1) AS frequencia,
           round(c.regular_pct, 1) AS regularidade,
           round(c.volume_pct,  1) AS volume,
           round(c.foto_pct,    1) AS foto,
           c.lancamentos, round(c.horas, 0) AS horas,
           round(c.lanc_hora, 3)   AS lanc_hora,
           round((c.regular_pct + c.volume_pct) / 2, 1) AS planilha,
           round(
             0.9 * (c.metas_pct + c.freq_pct + (c.regular_pct + c.volume_pct) / 2) / 3
             + 0.1 * c.foto_pct, 1) AS pontos
      FROM com_nota c) t
 ORDER BY pontos DESC;
