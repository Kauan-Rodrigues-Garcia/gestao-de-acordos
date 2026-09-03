-- ═══════════════════════════════════════════════════════════════════════════
-- Gincana Gestão de Acordos — placar de uso por equipe
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Só LEITURA. Roda quantas vezes quiser; troque as duas datas no topo.
--
-- ## Regras acertadas com o Cleber em 02/09/2026
--
--   • setores: Play 4, Play 5, Play Mix Marília, Conecta Play. "Marília
--     Digital" fica de fora por enquanto (as equipes de lá são só clones);
--   • fora do ranking: "Elisandra - Play inovação" (equipe nova, ainda sem
--     usuários) e "Treinamento Leticia" (não participa);
--   • quem está de FÉRIAS ou DESLIGADO não entra nem no numerador nem no
--     denominador — `situacao = 'ativo'` resolve os dois de uma vez;
--   • cada pessoa conta na equipe PRINCIPAL dela. Clone não pontua duas vezes.
--
-- ## O que cada coluna mede
--
--   adesao_pct   — % da equipe ativa que abriu o sistema no período
--   horas_pessoa — tempo com a aba EM FOCO (o rastreio ignora aba de fundo)
--   acordos      — linhas criadas em `acordos` por gente da equipe
--
-- ## Duas notas, de propósito
--
--   nota_media3    — adesão, horas e acordos pesando igual. Premia permanência.
--   nota_producao  — 20% adesão + 80% acordos. Tempo vira só pré-requisito.
--
-- A diferença entre as duas é a decisão da gincana, não um detalhe: em
-- 01–02/09 a equipe Rafaela lidera a primeira com 4,0 h/pessoa e 1,8
-- acordos/pessoa, e a Stephanie lidera a segunda com 0,9 h/pessoa e 14,3.

WITH periodo AS (SELECT DATE '2026-09-01' AS de, DATE '2026-09-02' AS ate),
alvo AS (
  SELECT cs.empresa_id, cs.setor_id, cs.nome AS setor
    FROM public.composicao_mes_setor cs
   WHERE cs.mes = to_char((SELECT de FROM periodo), 'YYYY-MM')
     AND cs.nome IN ('Play 4','Play 5','Play Mix Marília','Conecta Play')),
gente AS (
  SELECT cm.operador_id, ce.nome AS equipe, a.setor
    FROM public.composicao_mes cm
    JOIN public.composicao_mes_equipe ce
      ON ce.mes = cm.mes AND ce.empresa_id = cm.empresa_id AND ce.equipe_id = cm.equipe_id
    JOIN alvo a ON a.empresa_id = ce.empresa_id AND a.setor_id = ce.setor_id
   WHERE cm.mes = to_char((SELECT de FROM periodo), 'YYYY-MM')
     AND cm.equipe_id IS NOT NULL
     AND cm.situacao = 'ativo'
     AND ce.nome NOT IN ('Elisandra - Play inovação','Treinamento Leticia')),
base AS (
  SELECT g.setor, g.equipe, count(*) AS pessoas,
         count(DISTINCT s.usuario_id) AS usaram,
         COALESCE(sum(s.entradas),0) AS entradas,
         COALESCE(sum(t.seg),0)/3600.0 / count(*) AS h_pess,
         COALESCE(sum(ac.n),0)::numeric / count(*) AS ac_pess,
         COALESCE(sum(ac.n),0) AS acordos
    FROM gente g
    LEFT JOIN (SELECT usuario_id, sum(entradas) AS entradas FROM public.uso_sessoes
                WHERE dia BETWEEN (SELECT de FROM periodo) AND (SELECT ate FROM periodo)
                GROUP BY usuario_id) s ON s.usuario_id = g.operador_id
    LEFT JOIN (SELECT usuario_id, sum(segundos) AS seg FROM public.uso_telas
                WHERE dia BETWEEN (SELECT de FROM periodo) AND (SELECT ate FROM periodo)
                GROUP BY usuario_id) t ON t.usuario_id = g.operador_id
    LEFT JOIN (SELECT operador_id, count(*) AS n FROM public.acordos
                WHERE criado_em >= (SELECT de FROM periodo)::timestamptz
                  AND criado_em <  ((SELECT ate FROM periodo) + 1)::timestamptz
                GROUP BY operador_id) ac ON ac.operador_id = g.operador_id
   GROUP BY g.setor, g.equipe)
SELECT setor, equipe, pessoas, usaram,
       round(100.0*usaram/pessoas)   AS adesao_pct,
       round(h_pess, 1)              AS horas_pessoa,
       entradas,
       acordos,
       round(ac_pess, 1)             AS acordos_pessoa,
       round(100*((usaram::numeric/pessoas)
                  + h_pess  / NULLIF(max(h_pess)  OVER (), 0)
                  + ac_pess / NULLIF(max(ac_pess) OVER (), 0)) / 3, 1) AS nota_media3,
       round(100*(0.20*(usaram::numeric/pessoas)
                  + 0.80*(ac_pess / NULLIF(max(ac_pess) OVER (), 0))), 1) AS nota_producao
  FROM base
 ORDER BY nota_producao DESC;
