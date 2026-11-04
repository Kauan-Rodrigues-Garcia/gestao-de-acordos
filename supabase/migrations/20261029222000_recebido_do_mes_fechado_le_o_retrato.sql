-- ============================================================================
-- Recebido por equipe e por setor: mês fechado lê o retrato
-- ============================================================================
--
-- Fase 2 da auditoria de fechamento (29/10/2026).
--
-- ## O buraco
--
-- `fn_recebido_por_equipe` e `fn_recebido_por_setor` são a conta única de
-- desafios, app/celular, avisos, Modo TV e do selo do fechamento. As duas
-- montavam a ESTRUTURA do mês com as tabelas de hoje — para qualquer mês:
--
--   fn_recebido_por_equipe   perfis (cargo, equipe, arquivado, situação),
--                            equipe_lideres, equipe_operadores_clones,
--                            equipes + setores.alternativo
--   fn_recebido_por_setor    perfis.setor_id, clones, setores.alternativo
--
-- Mover alguém de equipe em novembro mudava a equipe que recebeu em outubro.
-- Arquivar em novembro um desligado de outubro tirava o dinheiro dele do card
-- de outubro. Ligar «alternativo» num setor reescrevia como os meses passados
-- foram somados. E excluir a equipe apagava a liderança e os clones dela.
--
-- O dinheiro em si nunca foi o problema: as linhas do relatório têm data e
-- carimbo de setor. O que viajava no tempo era QUEM estava ONDE.
--
-- ## A correção
--
-- Empresa com o mês FECHADO e retrato gravado (`composicao_mes`) passa a ler
-- os ingredientes do retrato:
--
--   cargo, equipe, ativo, situação   composicao_mes
--   liderança                        composicao_mes_lider (ordem < 100 =
--                                    explícita, a mesma de equipe_lideres)
--   clones que contam                composicao_mes.equipes_clone menos as
--                                    equipes que a pessoa lidera
--   setor da equipe, alternativo     composicao_mes_equipe, composicao_mes_setor
--
-- As REGRAS de cada função não mudam (líder único, líder fora do alternativo,
-- Treinamento, fantasma, BookPlay por setor, ajuste). Muda só de onde vem a
-- estrutura. Arquivado não existe no retrato: quem está na foto do mês estava
-- no mês.
--
-- Decisão do Cleber (29/10/2026): quem muda de equipe no meio do mês conta o
-- mês inteiro na equipe onde terminou — é o que o retrato guarda. O fantasma da
-- transferência (`perfis_transferencias`, gravado por mês) continua valendo.
--
-- Mês corrente, e mês fechado sem retrato (antes de 08/2026), continuam ao vivo.
--
-- ## Prova
--
-- O resultado do MÊS CORRENTE, por empresa e com as empresas juntas, é
-- fotografado antes da troca e comparado linha a linha depois. Qualquer
-- diferença desfaz a migration inteira — no mês corrente a resposta tem de ser
-- letra por letra a de antes.
--
-- Só funções. Nenhuma linha de dado muda. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ── 0. A foto do mês corrente, antes ───────────────────────────────────────
CREATE TEMP TABLE _prova_antes ON COMMIT DROP AS
WITH m AS (
  SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS mes,
         date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::DATE AS ini
),
chamadas AS (
  SELECT ARRAY[e.id] AS empresas, e.slug AS rotulo FROM public.empresas e
  UNION ALL
  SELECT array_agg(e.id ORDER BY e.id), 'todas' FROM public.empresas e
)
SELECT 'equipe' AS nivel, c.rotulo, r.equipe_id AS alvo, r.total, r.total_ho, r.qtd
  FROM chamadas c, m
 CROSS JOIN LATERAL public.fn_recebido_por_equipe(
         c.empresas, m.mes, m.ini, (m.ini + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
         TRUE, NULL, NULL) r
UNION ALL
SELECT 'setor', c.rotulo, r.setor_id, r.total, r.total_ho, r.qtd
  FROM chamadas c, m
 CROSS JOIN LATERAL public.fn_recebido_por_setor(
         c.empresas, m.mes, m.ini, (m.ini + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
         NULL, NULL) r;

-- ── 1. Recebido por equipe ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_recebido_por_equipe(p_empresas uuid[], p_mes text, p_ini date, p_fim date, p_com_ajustes boolean, p_chegada_de timestamp with time zone, p_chegada_ate timestamp with time zone)
 RETURNS TABLE(equipe_id uuid, total numeric, total_ho numeric, qtd bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  -- Empresas em que o mês já fechou e tem retrato: a estrutura vem da foto
  -- (20261029222000). As outras, de hoje.
  retrato AS (
    SELECT em.id AS empresa_id
      FROM public.empresas em
     WHERE em.id = ANY (p_empresas)
       AND public.fn_mes_fechado(p_mes)
       AND EXISTS (SELECT 1 FROM public.composicao_mes cm
                    WHERE cm.empresa_id = em.id AND cm.mes = p_mes)
  ),
  -- Quem lidera o quê. No retrato, `ordem < 100` é a liderança explícita — a
  -- de `equipe_lideres`; de 100 em diante é a reserva do cadastro.
  lideranca AS (
    SELECT el.empresa_id, el.lider_id, el.equipe_id
      FROM public.equipe_lideres el
     WHERE el.empresa_id = ANY (p_empresas)
       AND el.empresa_id NOT IN (SELECT r.empresa_id FROM retrato r)
    UNION ALL
    SELECT ml.empresa_id, ml.lider_id, ml.equipe_id
      FROM public.composicao_mes_lider ml
     WHERE ml.empresa_id IN (SELECT r.empresa_id FROM retrato r)
       AND ml.mes = p_mes
       AND COALESCE(ml.ordem, 0) < 100
  ),
  -- Vínculo de liderança, e só quando é ÚNICO. Quem lidera três equipes não
  -- tem «a sua equipe»: creditá-lo nas três contaria o mesmo dinheiro três
  -- vezes. Mesma decisão de `equipeUnicaPorLider`.
  lider_unico AS (
    SELECT l.lider_id, MIN(l.equipe_id::TEXT)::UUID AS equipe_id
      FROM lideranca l
     GROUP BY l.lider_id
    HAVING COUNT(DISTINCT l.equipe_id) = 1
  ),
  -- Equipes de setor ALTERNATIVO (06/10/2026): o líder não conta em nenhuma
  -- delas, só no total do setor. Ver o cabeçalho de 20261006190000.
  equipe_alternativa AS (
    SELECT e.id AS equipe_id
      FROM public.equipes e
      JOIN public.setores st ON st.id = e.setor_id
     WHERE e.empresa_id = ANY (p_empresas)
       AND e.empresa_id NOT IN (SELECT r.empresa_id FROM retrato r)
       AND st.alternativo IS TRUE
    UNION
    SELECT ce.equipe_id
      FROM public.composicao_mes_equipe ce
      JOIN public.composicao_mes_setor cs
        ON cs.empresa_id = ce.empresa_id AND cs.mes = ce.mes AND cs.setor_id = ce.setor_id
     WHERE ce.empresa_id IN (SELECT r.empresa_id FROM retrato r)
       AND ce.mes = p_mes
       AND cs.alternativo IS TRUE
  ),
  -- BookPlay, set/2026 em diante: a linha só conta no setor onde a pessoa
  -- está. Mesma condição de `fn_analitico_resumo_por_operador`.
  por_setor AS (
    SELECT em.id AS empresa_id
      FROM public.empresas em
     WHERE em.id = ANY (p_empresas)
       AND em.slug = 'bookplay'
       AND p_mes >= '2026-09'
  ),
  -- As linhas do período com operador. `super_admin` fora, como em
  -- `fn_analitico_resumo_por_operador`.
  linhas_op AS (
    SELECT ar.empresa_id, ar.operador_id, ar.setor_id,
           ar.valor_recebido AS valor, COALESCE(ar.total_ho, 0) AS ho
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis p ON p.id = ar.operador_id
     WHERE ar.empresa_id      = ANY (p_empresas)
       AND ar.operador_id    IS NOT NULL
       AND COALESCE(p.perfil, '') <> 'super_admin'
       AND ar.data_pagamento >= p_ini
       AND ar.data_pagamento <= p_fim
       -- Janela de CHEGADA (desafio do dia, 20261019140000). Nula = sem janela.
       AND (p_chegada_de  IS NULL OR ar.importado_em >= p_chegada_de)
       AND (p_chegada_ate IS NULL OR ar.importado_em <  p_chegada_ate)
  ),
  -- Onde cada pessoa está no mês — a MESMA função do resumo do Painel.
  casa AS (
    SELECT sm.operador_id, sm.setor_id
      FROM por_setor ps
     CROSS JOIN LATERAL public.fn_analitico_setores_no_mes(
             ps.empresa_id, p_mes,
             ARRAY(SELECT DISTINCT l.operador_id FROM linhas_op l WHERE l.empresa_id = ps.empresa_id)
           ) sm
  ),
  -- `fora` = linha carimbada num setor onde a pessoa não está. Não conta para
  -- ela; se ela deixou fantasma de SETOR, vai para a equipe de origem abaixo.
  linhas AS (
    SELECT l.*,
           (l.setor_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM por_setor ps WHERE ps.empresa_id = l.empresa_id)
            AND EXISTS (SELECT 1 FROM casa c WHERE c.operador_id = l.operador_id)
            AND NOT EXISTS (SELECT 1 FROM casa c
                             WHERE c.operador_id = l.operador_id AND c.setor_id = l.setor_id)
           ) AS fora
      FROM linhas_op l
  ),
  -- Transferido no mês. Na BookPlay (set/2026+) o fantasma de SETOR deixa a
  -- pessoa onde está — `aplicarFantasmas(..., { setorFicaNoLugar })`; nos
  -- outros casos ela volta inteira para a equipe de ORIGEM, como antes.
  --
  -- Um por pessoa E EMPRESA (21/10/2026): o fantasma é da empresa onde a
  -- transferência foi gravada, e só alcança as linhas de lá. Ver o cabeçalho.
  fantasma AS (
    SELECT DISTINCT ON (t.perfil_id, t.empresa_id)
           t.perfil_id, t.empresa_id, t.origem_equipe_id, t.origem_setor_id,
           (COALESCE(t.tipo, 'setor') = 'setor'
            AND EXISTS (SELECT 1 FROM por_setor ps WHERE ps.empresa_id = t.empresa_id)
           ) AS fica_no_lugar
      FROM public.perfis_transferencias t
     WHERE t.empresa_id     = ANY (p_empresas)
       AND t.mes            = p_mes
       AND t.fantasma_ativo IS TRUE
       AND t.desfeita_em    IS NULL
     ORDER BY t.perfil_id, t.empresa_id, t.id
  ),
  -- Ajuste de recebimento da PESSOA no período (26/10/2026): cada alteração
  -- do card no dia em que foi lançada (`fn_ajustes_recebimento`). Não é
  -- pagamento: não conta em `qtd`.
  ajuste AS (
    SELECT x.operador_id, x.empresa_id,
           SUM(x.valor)::NUMERIC    AS total,
           SUM(x.valor_ho)::NUMERIC AS total_ho
      FROM public.fn_ajustes_recebimento(p_empresas, p_ini, p_fim, p_chegada_de, p_chegada_ate) x
     WHERE x.alvo = 'operador'
     GROUP BY x.operador_id, x.empresa_id
  ),
  -- Ajuste lançado para a EQUIPE (26/10/2026): conta nela, em ninguém.
  ajuste_equipe AS (
    SELECT x.equipe_id,
           SUM(x.valor)::NUMERIC    AS total,
           SUM(x.valor_ho)::NUMERIC AS total_ho
      FROM public.fn_ajustes_recebimento(p_empresas, p_ini, p_fim, p_chegada_de, p_chegada_ate) x
     WHERE x.alvo = 'equipe' AND x.equipe_id IS NOT NULL
     GROUP BY x.equipe_id
  ),
  -- O caixa do período por operador e empresa, só com as linhas que contam
  -- para ele.
  soma AS (
    SELECT x.operador_id, x.empresa_id,
           SUM(x.total)::NUMERIC    AS total,
           SUM(x.total_ho)::NUMERIC AS total_ho,
           SUM(x.qtd)::BIGINT       AS qtd
      FROM (
        SELECT l.operador_id, l.empresa_id, SUM(l.valor) AS total, SUM(l.ho) AS total_ho, COUNT(*) AS qtd
          FROM linhas l
         WHERE NOT l.fora
         GROUP BY l.operador_id, l.empresa_id
        UNION ALL
        SELECT aj.operador_id, aj.empresa_id, aj.total, aj.total_ho, 0
          FROM ajuste aj
      ) x
     GROUP BY x.operador_id, x.empresa_id
  ),
  -- A pessoa NAQUELE mês: do retrato quando o mês fechou, de `perfis` no
  -- corrente. Quem está na foto não é «arquivado»: estava no mês.
  cadastro AS (
    SELECT s.operador_id, s.empresa_id,
           CASE WHEN cm.operador_id IS NOT NULL THEN cm.cargo     ELSE p.perfil::TEXT END AS perfil,
           CASE WHEN cm.operador_id IS NOT NULL THEN cm.equipe_id ELSE p.equipe_id    END AS equipe_id,
           (cm.operador_id IS NOT NULL OR p.id IS NOT NULL)                             AS existe,
           CASE WHEN cm.operador_id IS NOT NULL THEN FALSE        ELSE p.arquivado    END AS arquivado,
           CASE WHEN cm.operador_id IS NOT NULL THEN cm.ativo     ELSE p.ativo        END AS ativo,
           CASE WHEN cm.operador_id IS NOT NULL THEN cm.situacao  ELSE p.situacao     END AS situacao
      FROM soma s
      LEFT JOIN public.composicao_mes cm
        ON cm.empresa_id  = s.empresa_id
       AND cm.mes         = p_mes
       AND cm.operador_id = s.operador_id
       AND s.empresa_id IN (SELECT r.empresa_id FROM retrato r)
      LEFT JOIN public.perfis p ON p.id = s.operador_id
  ),
  -- A equipe principal de cada um, em cada empresa. Arquivado e
  -- desativado-à-mão ficam de fora, como em `buscarComposicaoAnalitica`; o
  -- fantasma entra mesmo sem perfil visível, porque quem mudou de empresa não
  -- aparece mais na consulta de lá.
  principal AS (
    SELECT c.operador_id, c.empresa_id,
           COALESCE(
             CASE WHEN f.fica_no_lugar THEN NULL ELSE f.origem_equipe_id END,
             CASE WHEN c.perfil = 'lider'
                  -- No líder, tanto a equipe que lidera quanto o resíduo de
                  -- `perfis.equipe_id` caem quando são de setor alternativo.
                  THEN COALESCE(
                         CASE WHEN lu.equipe_id IN (SELECT equipe_id FROM equipe_alternativa) THEN NULL ELSE lu.equipe_id END,
                         CASE WHEN c.equipe_id  IN (SELECT equipe_id FROM equipe_alternativa) THEN NULL ELSE c.equipe_id END)
                  ELSE COALESCE(
                         c.equipe_id,
                         CASE WHEN lu.equipe_id IN (SELECT equipe_id FROM equipe_alternativa) THEN NULL ELSE lu.equipe_id END)
             END
           ) AS equipe_id
      FROM cadastro c
      LEFT JOIN lider_unico  lu  ON lu.lider_id = c.operador_id
      LEFT JOIN fantasma     f   ON f.perfil_id  = c.operador_id
                                AND f.empresa_id = c.empresa_id
     WHERE (f.perfil_id IS NOT NULL AND NOT f.fica_no_lugar)
        OR (c.existe
            AND c.arquivado IS NOT TRUE
            AND NOT (c.ativo IS FALSE
                     AND COALESCE(c.situacao, 'ativo') <> 'desligado'))
  ),
  -- Os clones que contam. No retrato, `equipes_clone` traz também as OUTRAS
  -- equipes que a pessoa lidera; essas saem, como em `equipe_operadores_clones`.
  clone AS (
    SELECT cl.operador_id, cl.equipe_id
      FROM public.equipe_operadores_clones cl
     WHERE cl.empresa_id        = ANY (p_empresas)
       AND cl.empresa_id NOT IN (SELECT r.empresa_id FROM retrato r)
       AND cl.conta_recebimento IS TRUE
    UNION
    SELECT cm.operador_id, x.equipe_id
      FROM public.composicao_mes cm
     CROSS JOIN LATERAL unnest(COALESCE(cm.equipes_clone, '{}'::UUID[])) AS x(equipe_id)
     WHERE cm.empresa_id IN (SELECT r.empresa_id FROM retrato r)
       AND cm.mes = p_mes
       AND NOT EXISTS (SELECT 1 FROM lideranca l
                        WHERE l.empresa_id = cm.empresa_id
                          AND l.lider_id   = cm.operador_id
                          AND l.equipe_id  = x.equipe_id)
  ),
  -- Principal mais as equipes em que a pessoa é clone que conta, mais a
  -- Treinamento para quem a lidera. `UNION` deduplica o trio, então clone
  -- dentro da própria equipe não conta duas vezes. Clone e Treinamento levam
  -- a pessoa em todas as empresas da chamada, como antes.
  vinculos AS (
    SELECT pr.operador_id, pr.empresa_id, pr.equipe_id
      FROM principal pr
     WHERE pr.equipe_id IS NOT NULL
    UNION
    SELECT cl.operador_id, s2.empresa_id, cl.equipe_id
      FROM clone cl
      JOIN soma s2 ON s2.operador_id = cl.operador_id
    UNION
    -- Treinamento (21/10/2026): ali o líder conta na equipe, como o clone.
    -- Ver o cabeçalho de 20261021120000.
    SELECT l.lider_id, pr3.empresa_id, l.equipe_id
      FROM lideranca l
      JOIN principal pr3 ON pr3.operador_id = l.lider_id
     WHERE l.equipe_id = 'f44b422a-2ef1-4eec-9fd0-1b46b370dd1d'::UUID
  ),
  -- A equipe de ORIGEM de um fantasma de setor recebe as linhas carimbadas no
  -- setor de origem — `creditosDeOrigem` do Painel.
  credito_origem AS (
    SELECT f.origem_equipe_id AS equipe_id,
           SUM(l.valor)::NUMERIC AS total,
           SUM(l.ho)::NUMERIC    AS total_ho,
           COUNT(*)::BIGINT      AS qtd
      FROM fantasma f
      JOIN linhas l ON l.operador_id = f.perfil_id
                   AND l.empresa_id  = f.empresa_id
                   AND l.fora
                   AND l.setor_id    = f.origem_setor_id
     WHERE f.fica_no_lugar
       AND f.origem_equipe_id IS NOT NULL
     GROUP BY f.origem_equipe_id
  ),
  por_equipe AS (
    SELECT v.equipe_id, s.total, s.total_ho, s.qtd
      FROM vinculos v
      JOIN soma s ON s.operador_id = v.operador_id
                 AND s.empresa_id  = v.empresa_id
    UNION ALL
    SELECT co.equipe_id, co.total, co.total_ho, co.qtd
      FROM credito_origem co
    UNION ALL
    SELECT ae.equipe_id, ae.total, ae.total_ho, 0::BIGINT
      FROM ajuste_equipe ae
  )
  SELECT pe.equipe_id,
         SUM(pe.total)::NUMERIC    AS total,
         SUM(pe.total_ho)::NUMERIC AS total_ho,
         SUM(pe.qtd)::BIGINT       AS qtd
    FROM por_equipe pe
   GROUP BY pe.equipe_id;
$function$;

COMMENT ON FUNCTION public.fn_recebido_por_equipe(UUID[], TEXT, DATE, DATE, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Recebido por equipe no periodo, pelas regras do Painel do Lider, com janela '
  'opcional de CHEGADA (importado_em) para o desafio do dia. Mes fechado com '
  'retrato le a estrutura (cargo, equipe, lideranca, clones, alternativo) de '
  'composicao_mes* (20261029222000); o corrente, de hoje.';

-- ── 2. Recebido por setor ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_recebido_por_setor(p_empresas uuid[], p_mes text, p_ini date, p_fim date, p_chegada_de timestamp with time zone, p_chegada_ate timestamp with time zone)
 RETURNS TABLE(setor_id uuid, total numeric, total_ho numeric, qtd bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  -- Empresas em que o mês já fechou e tem retrato (20261029222000).
  retrato AS (
    SELECT em.id AS empresa_id
      FROM public.empresas em
     WHERE em.id = ANY (p_empresas)
       AND public.fn_mes_fechado(p_mes)
       AND EXISTS (SELECT 1 FROM public.composicao_mes cm
                    WHERE cm.empresa_id = em.id AND cm.mes = p_mes)
  ),
  linhas AS (
    SELECT ar.empresa_id, ar.operador_id, ar.setor_id, ar.valor_recebido,
           COALESCE(ar.total_ho, 0) AS ho
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis p ON p.id = ar.operador_id
     WHERE ar.empresa_id      = ANY (p_empresas)
       AND COALESCE(p.perfil, '') <> 'super_admin'
       AND ar.data_pagamento >= p_ini
       AND ar.data_pagamento <= p_fim
       -- Janela de CHEGADA (desafio do dia, 20261019140000). Nula = sem janela.
       AND (p_chegada_de  IS NULL OR ar.importado_em >= p_chegada_de)
       AND (p_chegada_ate IS NULL OR ar.importado_em <  p_chegada_ate)
  ),
  -- A chave `alternativo` do mês. Setor que não está na foto (criado depois)
  -- entra com a chave de hoje, para a linha carimbada nele não sumir.
  setores_emp AS (
    SELECT st.id, COALESCE(st.alternativo, FALSE) AS alternativo
      FROM public.setores st
     WHERE st.empresa_id = ANY (p_empresas)
       AND NOT EXISTS (SELECT 1 FROM public.composicao_mes_setor cs
                        WHERE cs.empresa_id = st.empresa_id AND cs.mes = p_mes AND cs.setor_id = st.id
                          AND cs.empresa_id IN (SELECT r.empresa_id FROM retrato r))
    UNION ALL
    SELECT cs.setor_id, COALESCE(cs.alternativo, FALSE)
      FROM public.composicao_mes_setor cs
     WHERE cs.empresa_id IN (SELECT r.empresa_id FROM retrato r)
       AND cs.mes = p_mes
  ),
  conta_no_setor AS (
    SELECT p.setor_id, p.id AS operador_id
      FROM public.perfis p
     WHERE p.empresa_id  = ANY (p_empresas)
       AND p.empresa_id NOT IN (SELECT r.empresa_id FROM retrato r)
       AND p.setor_id   IS NOT NULL
    UNION
    SELECT e.setor_id, cl.operador_id
      FROM public.equipe_operadores_clones cl
      JOIN public.equipes e ON e.id = cl.equipe_id
     WHERE cl.empresa_id        = ANY (p_empresas)
       AND cl.empresa_id NOT IN (SELECT r.empresa_id FROM retrato r)
       AND cl.conta_recebimento IS TRUE
       AND e.setor_id          IS NOT NULL
    UNION
    -- Mês fechado: o setor da pessoa e o das equipes em que era clone, da foto.
    SELECT cm.setor_id, cm.operador_id
      FROM public.composicao_mes cm
     WHERE cm.empresa_id IN (SELECT r.empresa_id FROM retrato r)
       AND cm.mes = p_mes
       AND cm.setor_id IS NOT NULL
    UNION
    SELECT ce.setor_id, cm.operador_id
      FROM public.composicao_mes cm
     CROSS JOIN LATERAL unnest(COALESCE(cm.equipes_clone, '{}'::UUID[])) AS x(equipe_id)
      JOIN public.composicao_mes_equipe ce
        ON ce.empresa_id = cm.empresa_id AND ce.mes = cm.mes AND ce.equipe_id = x.equipe_id
     WHERE cm.empresa_id IN (SELECT r.empresa_id FROM retrato r)
       AND cm.mes = p_mes
       AND ce.setor_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.composicao_mes_lider ml
                        WHERE ml.empresa_id = cm.empresa_id AND ml.mes = cm.mes
                          AND ml.lider_id = cm.operador_id AND ml.equipe_id = x.equipe_id
                          AND COALESCE(ml.ordem, 0) < 100)
  ),
  -- Os setores de cada pessoa no mês (régua de fn_analitico_resumo_por_operador):
  -- só BookPlay, de set/2026 em diante. Fora disso, vazio, e tudo conta.
  casa AS (
    SELECT sm.operador_id, sm.setor_id
      FROM public.empresas em
     CROSS JOIN LATERAL public.fn_analitico_setores_no_mes(
             em.id, p_mes,
             ARRAY(SELECT DISTINCT l.operador_id FROM linhas l
                    WHERE l.empresa_id = em.id AND l.operador_id IS NOT NULL)) sm
     WHERE em.id = ANY (p_empresas)
       AND em.slug = 'bookplay'
       AND p_mes >= '2026-09'
  ),
  -- Ajuste de recebimento (26/10/2026): da pessoa, da equipe ou do setor.
  ajuste AS (
    SELECT x.alvo, x.operador_id, x.setor_id, x.valor, x.valor_ho
      FROM public.fn_ajustes_recebimento(p_empresas, p_ini, p_fim, p_chegada_de, p_chegada_ate) x
  ),
  -- `pg`: é pagamento? O ajuste soma no dinheiro e fica fora da quantidade.
  receb_setor AS (
    SELECT se.id AS setor_id, l.valor_recebido, l.ho, 1 AS pg
      FROM linhas l
      JOIN setores_emp se ON se.id = l.setor_id AND NOT se.alternativo
    UNION ALL
    SELECT c.setor_id, l.valor_recebido, l.ho, 1
      FROM linhas l
      JOIN conta_no_setor c  ON c.operador_id = l.operador_id
      JOIN setores_emp    se ON se.id = c.setor_id AND se.alternativo
     WHERE l.operador_id IS NOT NULL
       AND (l.setor_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM casa h WHERE h.operador_id = l.operador_id)
            OR EXISTS (SELECT 1 FROM casa h
                        WHERE h.operador_id = l.operador_id AND h.setor_id = l.setor_id))
    UNION ALL
    SELECT se.id, l.valor_recebido, l.ho, 1
      FROM linhas l
      JOIN setores_emp se ON se.id = l.setor_id AND se.alternativo
     WHERE l.operador_id IS NULL
    UNION ALL
    -- Ajuste no setor carimbado. No alternativo, o da pessoa entra pelos
    -- setores dela (abaixo), como as linhas dela.
    SELECT se.id, a.valor, a.valor_ho, 0
      FROM ajuste a
      JOIN setores_emp se ON se.id = a.setor_id AND (NOT se.alternativo OR a.alvo <> 'operador')
    UNION ALL
    SELECT c.setor_id, a.valor, a.valor_ho, 0
      FROM ajuste a
      JOIN conta_no_setor c  ON c.operador_id = a.operador_id
      JOIN setores_emp    se ON se.id = c.setor_id AND se.alternativo
     WHERE a.alvo = 'operador'
  )
  SELECT r.setor_id,
         SUM(r.valor_recebido)::NUMERIC AS total,
         SUM(r.ho)::NUMERIC             AS total_ho,
         SUM(r.pg)::BIGINT              AS qtd
    FROM receb_setor r
   GROUP BY r.setor_id;
$function$;

COMMENT ON FUNCTION public.fn_recebido_por_setor(UUID[], TEXT, DATE, DATE, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Recebido por setor no periodo, com ajuste. Mes fechado com retrato le a '
  'chave alternativo e quem conta em cada setor alternativo de composicao_mes* '
  '(20261029222000); o corrente, de hoje.';

-- ── 3. Prova: o mês corrente não mudou nada ─────────────────────────────────
DO $prova$
DECLARE
  v_dif BIGINT;
BEGIN
  WITH m AS (
    SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS mes,
           date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::DATE AS ini
  ),
  chamadas AS (
    SELECT ARRAY[e.id] AS empresas, e.slug AS rotulo FROM public.empresas e
    UNION ALL
    SELECT array_agg(e.id ORDER BY e.id), 'todas' FROM public.empresas e
  ),
  depois AS (
    SELECT 'equipe' AS nivel, c.rotulo, r.equipe_id AS alvo, r.total, r.total_ho, r.qtd
      FROM chamadas c, m
     CROSS JOIN LATERAL public.fn_recebido_por_equipe(
             c.empresas, m.mes, m.ini, (m.ini + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
             TRUE, NULL, NULL) r
    UNION ALL
    SELECT 'setor', c.rotulo, r.setor_id, r.total, r.total_ho, r.qtd
      FROM chamadas c, m
     CROSS JOIN LATERAL public.fn_recebido_por_setor(
             c.empresas, m.mes, m.ini, (m.ini + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
             NULL, NULL) r
  )
  SELECT count(*) INTO v_dif FROM (
    (SELECT * FROM _prova_antes EXCEPT ALL SELECT * FROM depois)
    UNION ALL
    (SELECT * FROM depois EXCEPT ALL SELECT * FROM _prova_antes)
  ) d;

  IF v_dif > 0 THEN
    RAISE EXCEPTION 'PROVA: o mês corrente mudou em % linha(s) — nada foi aplicado', v_dif;
  END IF;
  RAISE NOTICE 'PROVA: mês corrente idêntico (% linhas)', (SELECT count(*) FROM _prova_antes);
END
$prova$;

COMMIT;
