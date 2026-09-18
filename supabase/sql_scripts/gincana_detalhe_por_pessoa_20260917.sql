-- ═══════════════════════════════════════════════════════════════════════════
-- Gincana — o detalhe POR PESSOA, que é o que responde «por que estou aqui?»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Só LEITURA. Mesmas datas e mesmas regras do ranking: trocar o CTE `par` aqui
-- e lá mantém os dois falando do mesmo período.
--
-- ## Por que existe
--
-- O placar dá um número por líder, e quem está no fim da tabela pergunta por
-- quê — com razão, porque «68,4» não é uma resposta. As contas por pessoa já
-- existiam dentro do ranking (CTE `por_pessoa`), e só o agregado saía. Aqui
-- elas saem inteiras.
--
-- A nota não fica mais justa por causa deste arquivo. Fica AUDITÁVEL, que é
-- outra coisa e é a que estava faltando: o líder abre a lista, vê o nome, o dia
-- que faltou e o campo em branco, e a conversa deixa de ser sobre a fórmula.
--
-- ## Como ler a coluna `o_que_falta`
--
-- É a lista do que aquela pessoa custou à equipe, em ordem de tamanho. Vazio
-- significa que ela não tirou ponto de ninguém. As três primeiras são as que o
-- líder resolve sozinho, hoje:
--
--   «sem meta»        — configurar na aba Metas (desconto de 3 pontos)
--   «sem foto»        — a pessoa sobe no perfil (desconto de 2 pontos)
--   «N dias sem acessar»    — conversa
--   «N dias sem tabular»    — acessou e não mexeu em acordo nenhum. É o caso
--                             que o agregado escondia: a equipe aparece
--                             presente e a planilha não anda.
--
-- ## Recorte
--
-- Idêntico ao do ranking: setores Play 4, Play 5, Play Mix Marília e Conecta
-- Play pelo setor da PESSOA; só `situacao = 'ativo'`; robô fora; equipe
-- principal; menor aprendiz com o calendário dele (folga terça, 5 h/dia).

WITH par AS (
  SELECT DATE '2026-09-01' AS ini,
         DATE '2026-09-16' AS fim,        -- ontem: só dias completos
         '2026-09'::TEXT   AS mes_txt,
         9                 AS mes_n,
         2026              AS ano_n,
         5::NUMERIC        AS horas_aprendiz,
         7::NUMERIC        AS horas_operador
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
         p.nome                                             AS pessoa,
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
    LEFT JOIN lanc l ON l.usuario_id = g.operador_id)
SELECT p.lider,
       p.equipe,
       p.setor,
       p.pessoa,
       CASE WHEN p.aprendiz THEN 'aprendiz' ELSE '' END AS contrato,
       p.n_uteis        AS dias_uteis,
       p.dias_acesso,
       p.n_uteis - p.dias_acesso                    AS dias_sem_acesso,
       p.dias_planilha,
       -- Acessou e não tabulou: o dia em que a pessoa esteve no sistema e não
       -- tocou em acordo nenhum. É o caso que o número da equipe escondia.
       p.dias_acesso - p.dias_planilha              AS dias_so_acesso,
       p.lancamentos,
       round(p.lancamentos / NULLIF(p.horas, 0), 3) AS lanc_hora,
       p.tem_meta,
       p.tem_foto,
       -- O que essa pessoa custou à equipe, em ordem de tamanho.
       COALESCE(NULLIF(array_to_string(ARRAY[
         CASE WHEN NOT p.tem_meta THEN 'sem meta (-3)'  END,
         CASE WHEN NOT p.tem_foto THEN 'sem foto (-2)'  END,
         CASE WHEN p.n_uteis - p.dias_acesso > 0
              THEN (p.n_uteis - p.dias_acesso) || ' dias sem acessar' END,
         CASE WHEN p.dias_acesso - p.dias_planilha > 0
              THEN (p.dias_acesso - p.dias_planilha) || ' dias sem tabular' END,
         CASE WHEN p.lancamentos = 0 THEN 'nenhum lançamento no período' END
       ], ' · '), ''), 'em dia')                    AS o_que_falta
  FROM por_pessoa p
 ORDER BY p.lider,
          -- Pior primeiro: é essa a lista que o líder precisa abrir.
          (NOT p.tem_meta)::INT + (NOT p.tem_foto)::INT
            + (p.n_uteis - p.dias_acesso) DESC,
          p.pessoa;
