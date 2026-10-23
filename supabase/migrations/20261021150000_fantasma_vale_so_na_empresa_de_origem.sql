-- ============================================================================
-- O fantasma da transferência vale só na empresa de ORIGEM
-- ============================================================================
--
-- O caso (21/10/2026): no desafio dos líderes (Noite do Pódio, BookPlay +
-- PaguePlay) a Camila Hitomi aparecia com 120,9% de projeção; no Painel do
-- Líder, 82%. A equipe CAMILA HITOMI recebeu R$ 33.774,79 em outubro pelo
-- Painel, e R$ 49.668,55 pelo desafio.
--
-- A diferença, R$ 15.893,76, é o Luan Pinto. Ele saiu da equipe em 05/10 para
-- o Conecta Play (empresa PaguePlay, regra Cofen), com fantasma de tipo
-- `empresa` gravado na BookPlay. Todo o recebimento dele em outubro está na
-- PaguePlay, carimbado no Conecta Play.
--
-- ## O que estava errado
--
-- `fantasma` casava a pessoa só pelo `perfil_id`. Chamada com UMA empresa —
-- Painel, celular, avisos — isso não aparece: as linhas da outra empresa nem
-- entram. Chamada com as DUAS — o desafio que cruza empresas —, o fantasma
-- puxava para a equipe de origem também o que a pessoa recebeu na empresa de
-- DESTINO, depois de sair. E tirava esse mesmo dinheiro da equipe dela lá.
--
-- Pior que o número: era dinheiro Cofen somando numa equipe de Nosso produto.
-- Regra diferente é carteira diferente (CLAUDE.md).
--
-- ## A correção
--
-- `soma`, `principal` e `vinculos` passam a ser por (operador, EMPRESA), e o
-- fantasma só casa com as linhas da empresa onde a transferência foi gravada
-- (`perfis_transferencias.empresa_id`, a de origem). Na empresa de destino a
-- pessoa segue o cadastro de lá, como no Painel daquela empresa.
--
-- Clone e Treinamento não mudam: continuam levando o recebimento da pessoa em
-- todas as empresas da chamada, como antes — `vinculos` só os replica por
-- empresa para que a soma feche igual.
--
-- Chamada com uma empresa só, o resultado é letra por letra o de antes: há uma
-- empresa só para casar. O resto da função é o de 20261021120000. Só função.
-- Reaplicável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_recebido_por_equipe(
  p_empresas    UUID[],
  p_mes         TEXT,
  p_ini         DATE,
  p_fim         DATE,
  p_com_ajustes BOOLEAN,
  p_chegada_de  TIMESTAMPTZ,
  p_chegada_ate TIMESTAMPTZ
)
RETURNS TABLE(equipe_id UUID, total NUMERIC, total_ho NUMERIC, qtd BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  -- Vínculo de liderança, e só quando é ÚNICO. Quem lidera três equipes não
  -- tem «a sua equipe»: creditá-lo nas três contaria o mesmo dinheiro três
  -- vezes. Mesma decisão de `equipeUnicaPorLider`.
  lider_unico AS (
    SELECT el.lider_id, MIN(el.equipe_id::TEXT)::UUID AS equipe_id
      FROM public.equipe_lideres el
     WHERE el.empresa_id = ANY (p_empresas)
     GROUP BY el.lider_id
    HAVING COUNT(DISTINCT el.equipe_id) = 1
  ),
  -- Equipes de setor ALTERNATIVO (06/10/2026): o líder não conta em nenhuma
  -- delas, só no total do setor. Ver o cabeçalho de 20261006190000.
  equipe_alternativa AS (
    SELECT e.id AS equipe_id
      FROM public.equipes e
      JOIN public.setores st ON st.id = e.setor_id
     WHERE e.empresa_id = ANY (p_empresas)
       AND st.alternativo IS TRUE
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
  -- Ajuste manual do mês (competência), só quando pedido: o card do Painel o
  -- soma no recebido do operador (`buscarResumoOperadoresAnalitico`), em H.O.
  -- na PaguePlay. Não é pagamento: não conta em `qtd`.
  ajuste AS (
    SELECT a.operador_id, a.empresa_id,
           SUM(a.valor)::NUMERIC AS total,
           (SUM(a.valor) * CASE WHEN em.slug = 'pagueplay'
                                THEN public.fn_pp_ho_percentual() ELSE 0 END)::NUMERIC AS total_ho
      FROM public.analitico_ajustes_manuais a
      JOIN public.empresas em ON em.id = a.empresa_id
      LEFT JOIN public.perfis p ON p.id = a.operador_id
     WHERE p_com_ajustes
       AND a.empresa_id     = ANY (p_empresas)
       AND a.operador_id   IS NOT NULL
       AND a.mes_referencia = to_date(p_mes || '-01', 'YYYY-MM-DD')
       AND a.cancelado     IS NOT TRUE
       AND COALESCE(p.perfil, '') <> 'super_admin'
     GROUP BY a.operador_id, a.empresa_id, em.slug
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
  -- A equipe principal de cada um, em cada empresa. Arquivado e
  -- desativado-à-mão ficam de fora, como em `buscarComposicaoAnalitica`; o
  -- fantasma entra mesmo sem perfil visível, porque quem mudou de empresa não
  -- aparece mais na consulta de lá.
  principal AS (
    SELECT s.operador_id, s.empresa_id,
           COALESCE(
             CASE WHEN f.fica_no_lugar THEN NULL ELSE f.origem_equipe_id END,
             CASE WHEN p.perfil = 'lider'
                  -- No líder, tanto a equipe que lidera quanto o resíduo de
                  -- `perfis.equipe_id` caem quando são de setor alternativo.
                  THEN COALESCE(
                         CASE WHEN lu.equipe_id IN (SELECT equipe_id FROM equipe_alternativa) THEN NULL ELSE lu.equipe_id END,
                         CASE WHEN p.equipe_id  IN (SELECT equipe_id FROM equipe_alternativa) THEN NULL ELSE p.equipe_id END)
                  ELSE COALESCE(
                         p.equipe_id,
                         CASE WHEN lu.equipe_id IN (SELECT equipe_id FROM equipe_alternativa) THEN NULL ELSE lu.equipe_id END)
             END
           ) AS equipe_id
      FROM soma s
      LEFT JOIN public.perfis p  ON p.id       = s.operador_id
      LEFT JOIN lider_unico  lu  ON lu.lider_id = s.operador_id
      LEFT JOIN fantasma     f   ON f.perfil_id  = s.operador_id
                                AND f.empresa_id = s.empresa_id
     WHERE (f.perfil_id IS NOT NULL AND NOT f.fica_no_lugar)
        OR (p.id IS NOT NULL
            AND p.arquivado IS NOT TRUE
            AND NOT (p.ativo IS FALSE
                     AND COALESCE(p.situacao, 'ativo') <> 'desligado'))
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
      FROM public.equipe_operadores_clones cl
      JOIN soma s2 ON s2.operador_id = cl.operador_id
     WHERE cl.empresa_id        = ANY (p_empresas)
       AND cl.conta_recebimento IS TRUE
    UNION
    -- Treinamento (21/10/2026): ali o líder conta na equipe, como o clone.
    -- Ver o cabeçalho de 20261021120000.
    SELECT el.lider_id, pr3.empresa_id, el.equipe_id
      FROM public.equipe_lideres el
      JOIN principal pr3 ON pr3.operador_id = el.lider_id
     WHERE el.equipe_id = 'f44b422a-2ef1-4eec-9fd0-1b46b370dd1d'::UUID
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
  )
  SELECT pe.equipe_id,
         SUM(pe.total)::NUMERIC    AS total,
         SUM(pe.total_ho)::NUMERIC AS total_ho,
         SUM(pe.qtd)::BIGINT       AS qtd
    FROM por_equipe pe
   GROUP BY pe.equipe_id;
$function$;

REVOKE ALL ON FUNCTION public.fn_recebido_por_equipe(UUID[], TEXT, DATE, DATE, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_recebido_por_equipe(UUID[], TEXT, DATE, DATE, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Recebido por equipe no periodo, pelas regras do Painel do Lider, com janela '
  'opcional de CHEGADA (importado_em) para o desafio do dia. Nula = sem janela. '
  'Corpo de 20261006180729. 20261019140000. Na equipe Treinamento do setor '
  'alternativo o lider conta na equipe (20261021120000). O fantasma da '
  'transferencia so alcanca as linhas da empresa de origem (20261021150000).';

COMMIT;
