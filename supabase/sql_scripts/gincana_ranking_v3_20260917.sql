-- ═══════════════════════════════════════════════════════════════════════════
-- Gincana — ranking v3: mede quem está sendo cobrado, e só isso
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Só LEITURA. Datas e parâmetros de nota ficam no CTE `par`.
--
-- Substitui a v2 (`gincana_ranking_v2_20260917.sql`), que substituiu a v1
-- (`gincana_ranking_20260917.sql`). O histórico das três está no fim.
--
-- ## O que o detalhe por pessoa revelou, e que a v2 ainda errava
--
-- Rodado em 17/09/2026 sobre 01–16/09, o detalhe por pessoa mostrou que **12
-- dos 15 «sem meta» das equipes reais eram os PRÓPRIOS LÍDERES**. Líder não tem
-- meta individual porque líder não tabula — ele lidera. O critério de metas
-- nunca mediu esforço: descontava de toda equipe a mesma coisa, a existência do
-- líder. Daí os 85,7% (= 6/7) em nove das treze equipes.
--
-- Pior: o Brunno Piccolo marcava 100% em metas **por não estar cadastrado na
-- composição das equipes que lidera**. Ganhava 30% do peso cheio por uma
-- diferença de cadastro, e ninguém na tela tinha como saber.
--
-- O mesmo detalhe mostrou gente `situacao = 'ativo'` com ZERO acesso em onze
-- dias úteis — Jhonata Nazawa (Bruna), Jade (Katia) e as duas equipes de
-- treinamento inteiras. Isso é afastamento ou cadastro velho, não desempenho de
-- quem lidera.
--
-- ## As cinco correções da v3
--
-- 1. **O líder sai da população medida da própria equipe.** Ele continua sendo
--    quem o ranking ordena — a gincana é da gestão —, mas deixa de entrar como
--    membro. Isso zera de uma vez a distorção do Brunno e devolve o critério de
--    metas a quem ele deveria medir. Efeito colateral honesto: a líder que
--    tabula muito (Elisandra lançou 19 dos 28 da equipe dela; Maria, 7) deixa de
--    emprestar o próprio trabalho ao número do time — e é essa a leitura certa,
--    porque líder tabulando é líder fazendo o trabalho do operador.
--
-- 2. **Quem não acessou NENHUM dia sai da conta e vira coluna.** Zero acesso em
--    todos os dias úteis do período não é desempenho ruim: é gente afastada,
--    desligada sem baixa ou admitida depois. Fica visível em `fora_ativos` para
--    ninguém esconder ausência de verdade — o corte é zero, e não «poucos».
--
-- 3. **Desconto PROPORCIONAL, não por cabeça.** A v2 descontava 3 por pessoa
--    sem meta: a Bruna, com 2 de 14 (14%), levava 6, e a Camila, com 1 de 7
--    (a mesma taxa), levava 3. Equipe grande pagava mais pela mesma taxa. Agora
--    é `30 × fração` e `20 × fração`.
--
-- 4. **Alvo do volume em 0,55 lanç./hora.** Com 0,40 a Stephanie (0,635) e a
--    Bruna (0,577) estouravam o teto e EMPATAVAM em 120, apesar de uma ser 10%
--    mais produtiva que a outra. O alvo é a mensagem que se manda à operação;
--    o teto existe só para estourá-lo não virar o placar.
--
-- 5. **Equipe em treinamento sai do placar, não do relatório.** Equipe em que
--    NINGUÉM tem meta configurada não está disputando — está se formando.
--    Aparece no fim, sem posição, com os números à vista.
--
-- ## Os critérios, afinal
--
--   regularidade   dias úteis DELE em que a pessoa criou ou alterou acordo,
--                  lançou Pix ou abriu as telas de acordos ÷ dias úteis dele
--   volume         lançamentos da equipe ÷ HORAS disponíveis, contra
--                  `alvo_lanc_hora`, com teto
--
--   qualidade = MIN((regularidade + volume) / 2, 100)
--   pontos    = MAX(qualidade − 30×(fração sem meta) − 20×(fração sem foto), 0)
--
-- O teto de 100 na QUALIDADE existe porque o volume vai até 120: sem ele, a
-- equipe que estoura o alvo termina com «102,4 pontos», e um placar que passa
-- de 100 parece defeito para quem lê. Estourar o alvo continua valendo — só
-- não passa do teto. Medido em 17/09: só a Stephanie batia nele, e a ordem não
-- muda com ou sem o teto.
--
-- «Frequência» saiu de critério e virou leitura: dias com ACESSO já está dentro
-- de regularidade, que é acesso E trabalho. Eram 45% do peso medindo presença
-- duas vezes.
--
-- «Equipes organizadas» continua fora: é conferência presencial, pontos por fora.
--
-- ## O calendário de cada um
--
-- Menor aprendiz (equipe da Elisandra Raquel, Play 4) folga TERÇA e cumpre
-- 08:00–13:00 = 5 h. Operador: seg–sex, 7 h líquidas. Sábado fora para todos —
-- é um por mês e não muda posição, mas distorceria o denominador de quem nunca
-- trabalha aos sábados. A terça sai dos DOIS lados da conta do aprendiz.
--
-- ## O que ainda NÃO pontua, de propósito
--
-- `venc_aberto_pct` — acordos da equipe que VENCERAM no período e continuam em
-- `verificar_pendente`. Era para ser o «acompanhamento» do critério original,
-- que nenhum placar mede.
--
-- **Medido em 17/09/2026 e deu ZERO em todas as treze equipes** — 2.151 acordos
-- vencidos entre 01 e 16/09, nenhum ainda pendente. Ou seja: como CRITÉRIO ele
-- não serve, porque não separa ninguém. O desfecho já acontece (o 59 resolve),
-- e cobrar acompanhamento por aqui seria cobrar uma fila que não existe.
--
-- As colunas ficam para que a próxima pessoa não refaça a descoberta — e para
-- que o número apareça se um dia parar de ser zero.
--
-- «Atraso de tabulação» foi DESCARTADO: `acordos.data_cadastro` é gravado com
-- `getTodayISO()` na criação (ver `AcordoNovoInline`), então é o mesmo dia do
-- `criado_em` e não existe atraso a medir nesse dado.
--
-- O detalhe que sustenta cada linha daqui está em
-- `gincana_detalhe_por_pessoa_20260917.sql`.

WITH par AS (
  SELECT DATE '2026-09-01' AS ini,
         DATE '2026-09-16' AS fim,        -- ontem: só dias completos
         '2026-09'::TEXT   AS mes_txt,
         9                 AS mes_n,
         2026              AS ano_n,
         5::NUMERIC        AS horas_aprendiz,   -- 08:00 às 13:00
         7::NUMERIC        AS horas_operador,   -- 7 a 8 horas, menos o almoço
         0.55::NUMERIC     AS alvo_lanc_hora,   -- o que vale 100 no volume
         120::NUMERIC      AS teto_volume,
         30::NUMERIC       AS desconto_meta,    -- × fração da equipe sem meta
         20::NUMERIC       AS desconto_foto     -- × fração da equipe sem foto
),
setor_alvo AS (
  SELECT cs.empresa_id, cs.setor_id, cs.nome AS setor
    FROM public.composicao_mes_setor cs, par
   WHERE cs.mes = par.mes_txt
     AND cs.nome IN ('Play 4','Play 5','Play Mix Marília','Conecta Play')),
-- Todos os vínculos de liderança do mês, e não só o titular: quem lidera a
-- própria equipe em segunda posição também não é medido como membro dela.
lider_da_equipe AS (
  SELECT DISTINCT l.equipe_id, l.lider_id
    FROM public.composicao_mes_lider l, par
   WHERE l.mes = par.mes_txt),
-- O titular, que dá nome à linha do ranking.
lider AS (
  SELECT DISTINCT ON (l.equipe_id) l.equipe_id, p.nome AS lider
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
         (NULLIF(btrim(p.foto_url), '') IS NOT NULL)        AS tem_foto,
         EXISTS (SELECT 1 FROM lider_da_equipe le
                  WHERE le.equipe_id = cm.equipe_id
                    AND le.lider_id  = cm.operador_id)      AS eh_lider
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
-- LEITURA, não pontua: acordos que venceram no período e seguem sem desfecho.
venc AS (
  SELECT a.operador_id,
         count(*)                                                AS venc_total,
         count(*) FILTER (WHERE a.status = 'verificar_pendente')  AS venc_aberto
    FROM public.acordos a, par
   WHERE a.vencimento BETWEEN par.ini AND par.fim
   GROUP BY a.operador_id),
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
         COALESCE(l.n, 0)  AS lancamentos,
         COALESCE(v.venc_total, 0)  AS venc_total,
         COALESCE(v.venc_aberto, 0) AS venc_aberto,
         EXISTS (SELECT 1 FROM com_meta m WHERE m.referencia_id = g.operador_id) AS tem_meta
    FROM gente g
    CROSS JOIN par
    JOIN n_uteis nu ON nu.empresa_id = g.empresa_id
    LEFT JOIN lanc l ON l.usuario_id = g.operador_id
    LEFT JOIN venc v ON v.operador_id = g.operador_id),
-- Quem é MEDIDO: nem o líder da própria equipe, nem quem não apareceu um dia
-- sequer. Ver as correções 1 e 2 no cabeçalho.
medidos AS (
  SELECT * FROM por_pessoa WHERE NOT eh_lider AND dias_acesso > 0),
-- Quem ficou de fora, para a coluna — e para ninguém esconder ausência real.
fora AS (
  SELECT lider,
         count(*)                                                   AS n_equipe,
         count(*) FILTER (WHERE eh_lider)                           AS n_lideres,
         count(*) FILTER (WHERE NOT eh_lider AND dias_acesso = 0)   AS n_sem_acesso,
         -- A carteira vencida é da EQUIPE inteira: o acordo de quem se afastou
         -- continua precisando de desfecho, e some se só os medidos contarem.
         sum(venc_total)  AS venc_total,
         sum(venc_aberto) AS venc_aberto,
         bool_or(tem_meta) AS alguem_tem_meta
    FROM por_pessoa GROUP BY lider),
por_lider AS (
  SELECT lider,
         string_agg(DISTINCT equipe, ' + ' ORDER BY equipe) AS equipes,
         string_agg(DISTINCT setor,  ', ' ORDER BY setor)   AS setores,
         bool_or(aprendiz)                                  AS tem_aprendiz,
         count(*)                                           AS medidos,
         min(n_uteis)                                       AS dias_uteis,
         sum(horas)                                         AS horas,
         avg((NOT tem_meta)::INT)                           AS fr_sem_meta,
         avg((NOT tem_foto)::INT)                           AS fr_sem_foto,
         sum((NOT tem_meta)::INT)                           AS sem_meta,
         sum((NOT tem_foto)::INT)                           AS sem_foto,
         100.0 * avg(dias_acesso::NUMERIC   / NULLIF(n_uteis, 0)) AS freq_pct,
         100.0 * avg(dias_planilha::NUMERIC / NULLIF(n_uteis, 0)) AS regular_pct,
         sum(dias_acesso - dias_planilha)                   AS dias_so_acesso,
         sum(lancamentos)                                   AS lancamentos,
         sum(lancamentos)::NUMERIC / NULLIF(sum(horas), 0)  AS lanc_hora
    FROM medidos GROUP BY lider),
com_nota AS (
  SELECT e.*, f.n_equipe, f.n_lideres, f.n_sem_acesso, f.alguem_tem_meta,
         f.venc_total, f.venc_aberto,
         LEAST(100 * COALESCE(e.lanc_hora, 0) / par.alvo_lanc_hora, par.teto_volume) AS volume_pct,
         e.fr_sem_meta * par.desconto_meta + e.fr_sem_foto * par.desconto_foto       AS penalidade
    FROM por_lider e
    JOIN fora f USING (lider)
    CROSS JOIN par)
SELECT CASE WHEN no_placar THEN rank() OVER (PARTITION BY no_placar ORDER BY pontos DESC) END AS pos,
       t.*
  FROM (
    SELECT c.alguem_tem_meta AS no_placar,
           c.lider, c.equipes, c.setores,
           c.n_equipe, c.medidos, c.n_lideres, c.n_sem_acesso AS fora_ativos,
           c.dias_uteis,
           CASE WHEN c.tem_aprendiz THEN 'menor aprendiz' ELSE '' END AS obs,
           round(c.regular_pct, 1) AS regularidade,
           round(c.volume_pct,  1) AS volume,
           round(LEAST((c.regular_pct + c.volume_pct) / 2, 100), 1) AS qualidade,
           c.sem_meta, c.sem_foto,
           round(c.penalidade, 1) AS penalidade,
           -- Nota nunca negativa: «zero» já diz tudo, e abaixo disso só
           -- embaralharia a leitura.
           GREATEST(round(LEAST((c.regular_pct + c.volume_pct) / 2, 100) - c.penalidade, 1), 0) AS pontos,
           -- Leitura, fora da conta:
           round(c.freq_pct, 1) AS frequencia,
           c.dias_so_acesso,
           c.lancamentos, round(c.horas, 0) AS horas, round(c.lanc_hora, 3) AS lanc_hora,
           c.venc_total, c.venc_aberto,
           round(100.0 * c.venc_aberto / NULLIF(c.venc_total, 0), 1) AS venc_aberto_pct
      FROM com_nota c) t
 ORDER BY no_placar DESC, pontos DESC;
