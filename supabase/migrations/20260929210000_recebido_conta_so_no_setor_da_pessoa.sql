-- ============================================================================
-- O recebimento conta só no setor onde a pessoa está — BookPlay, set/2026 em diante
-- ============================================================================
--
-- ## A regra (29/09/2026)
--
-- «Se a pessoa tá naquela carteira, naquele setor, só vai contar pra ela o
-- recebimento que vier no 59 para aquele setor.» Quem mudou do Play 1 para o
-- Play 2 no meio do mês tem, no 59, linhas carimbadas Play 1 e linhas Play 2.
-- Estando hoje no Play 2, só as do Play 2 são dela — e só elas somam na equipe
-- em que ela está. As do Play 1 continuam no total do Play 1 (que soma pelo
-- carimbo) e, se ela deixou fantasma lá, na equipe de origem.
--
-- «Se eu faço parte do Play 1 e recebi 5 mil pro Play 1 e 4 mil pro Play 2, os
-- 4 mil vão lá pro Play 2. Pra mim consta que recebi só 5 mil.»
--
-- ## O caso que expôs (Play 2, equipe Luan/ Gaby)
--
-- Relatório 58 da equipe: R$ 435.313,44. Card: R$ 428.629,28. Faltavam Stella
-- (R$ 13.244,66) e Camilly (R$ 2.094,46), inteiras: as duas vieram do Play 1 em
-- 15/09 com fantasma de pé, e o fantasma devolvia a pessoa INTEIRA para a
-- origem. E sobrava a Emilly com R$ 551,22 de linhas do Play 1.
--
-- ## "Setor onde a pessoa está"
--
-- O do perfil, o das equipes que lidera e o das equipes em que é clone — a
-- mesma resposta de `fn_setores_do_operador`. Mês fechado lê do retrato
-- (`composicao_mes`, `composicao_mes_equipe`, `composicao_mes_lider`); quem não
-- está no retrato cai no ao vivo.
--
-- O que NÃO muda:
--   * linha sem setor (`setor_id` nulo) continua da pessoa;
--   * pessoa sem setor nenhum não é filtrada (não há "setor atual" a comparar);
--   * PaguePlay — o 59 é da BookPlay, e o fantasma da PaguePlay segue como era;
--   * meses anteriores a setembro/2026, já pagos: a regra vale de 2026-09 em
--     diante;
--   * o total do SETOR na BookPlay, que soma pelo carimbo do relatório.
--
-- ## O que muda
--
--   fn_analitico_setores_no_mes (nova)        onde cada pessoa está, no mês
--   fn_analitico_resumo_por_operador          filtra as linhas pelo setor
--   fn_analitico_recebido_fora_do_setor (nova) o que ficou de fora, por setor —
--                                              a equipe de origem de um fantasma
--                                              de SETOR recebe daqui as linhas
--                                              do setor de origem
--
-- Só funções. Nenhuma linha de dados muda. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── Onde a pessoa está no mês ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_analitico_setores_no_mes(
  p_empresa_id uuid, p_mes text, p_ops uuid[]
)
RETURNS TABLE(operador_id uuid, setor_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH corrente AS (
    SELECT p_mes >= to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS vivo
  ),
  retrato AS (
    SELECT cm.operador_id AS op, cm.setor_id AS setor, cm.equipes_clone AS clones
      FROM public.composicao_mes cm
     WHERE cm.empresa_id = p_empresa_id
       AND cm.mes = p_mes
       AND cm.operador_id = ANY(p_ops)
       AND NOT (SELECT c.vivo FROM corrente c)
  )
  -- Mês fechado: o setor do retrato…
  SELECT r.op, r.setor FROM retrato r WHERE r.setor IS NOT NULL
  UNION
  -- …os das equipes em que era clone, com o setor que a equipe tinha no mês…
  SELECT r.op, cme.setor_id
    FROM retrato r
   CROSS JOIN LATERAL unnest(COALESCE(r.clones, '{}'::uuid[])) AS cl(eq)
    JOIN public.composicao_mes_equipe cme
      ON cme.empresa_id = p_empresa_id AND cme.mes = p_mes AND cme.equipe_id = cl.eq
   WHERE cme.setor_id IS NOT NULL
  UNION
  -- …e os das equipes que liderava.
  SELECT l.lider_id, cme.setor_id
    FROM public.composicao_mes_lider l
    JOIN public.composicao_mes_equipe cme
      ON cme.empresa_id = l.empresa_id AND cme.mes = l.mes AND cme.equipe_id = l.equipe_id
   WHERE l.empresa_id = p_empresa_id
     AND l.mes = p_mes
     AND l.lider_id = ANY(p_ops)
     AND cme.setor_id IS NOT NULL
     AND NOT (SELECT c.vivo FROM corrente c)
  UNION
  -- Mês corrente, ou quem não está no retrato: ao vivo.
  SELECT o.op, s.setor
    FROM unnest(p_ops) AS o(op)
   CROSS JOIN LATERAL public.fn_setores_do_operador(o.op) AS s(setor)
   WHERE (SELECT c.vivo FROM corrente c)
      OR NOT EXISTS (SELECT 1 FROM retrato r WHERE r.op = o.op);
$function$;

COMMENT ON FUNCTION public.fn_analitico_setores_no_mes(uuid, text, uuid[]) IS
  'Setores onde cada pessoa está no mês: perfil, equipes que lidera e clones. Mês fechado pelo retrato (composicao_mes*), corrente ao vivo (fn_setores_do_operador). Só é chamada de dentro das RPCs do analítico (20260929210000).';

REVOKE ALL ON FUNCTION public.fn_analitico_setores_no_mes(uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;

-- ── Resumo por operador: só as linhas do setor da pessoa ────────────────────
CREATE OR REPLACE FUNCTION public.fn_analitico_resumo_por_operador(p_empresa_id uuid, p_mes text, p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date)
 RETURNS TABLE(operador_id uuid, operador_usuario text, operador_nome text, total_recebido numeric, total_ho numeric, total_pagamentos bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu      UUID := (SELECT auth.uid());
  v_escopo  INTEGER;
  -- Quem entra no recorte, montado UMA vez — não por linha do analítico.
  -- É o pertencimento de QUEM RECEBEU (membro, líder ou clone), e não o
  -- cadastro: o líder não tem `perfis.equipe_id`, e o de uma equipe noutro
  -- setor não tem o `setor_id` de quem olha (20260929120000).
  v_ops     UUID[] := '{}';
  v_setores UUID[] := '{}';
  v_de      DATE;
  v_ate     DATE;
  -- A linha só conta no setor onde a pessoa está (20260929210000).
  v_por_setor BOOLEAN;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('ver_analitico')
     OR NOT public.fn_user_tem('analitico_sub_analitico')
     OR NOT public.fn_user_tem('analitico_sub_ranking') THEN
    RETURN;
  END IF;

  -- Sem intervalo, o mês inteiro: o comportamento que as lentes Mês e Dia
  -- esperam, e o que esta função sempre fez.
  v_de  := COALESCE(p_inicio, (p_mes || '-01')::DATE);
  v_ate := COALESCE(p_fim, ((p_mes || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE);

  v_por_setor := p_mes >= '2026-09'
    AND EXISTS (SELECT 1 FROM public.empresas em WHERE em.id = p_empresa_id AND em.slug = 'bookplay');

  v_escopo := public.fn_user_escopo('analitico');

  IF v_escopo = 2 THEN
    -- Setor: quem é do setor pelo perfil, quem está numa equipe do setor, e eu.
    v_setores := ARRAY(SELECT public.fn_setores_do_operador(v_eu));
    v_ops := ARRAY(
      SELECT pf.id
        FROM public.perfis pf
       WHERE pf.setor_id = ANY(v_setores)
      UNION
      SELECT public.fn_pessoas_das_equipes(ARRAY(
        SELECT e.id FROM public.equipes e WHERE e.setor_id = ANY(v_setores)
      ))
      UNION
      SELECT v_eu
    );
  ELSIF v_escopo < 2 THEN
    -- Equipe: quem está nas equipes por onde eu respondo, e eu.
    v_ops := ARRAY(
      SELECT public.fn_pessoas_das_equipes(
        ARRAY(SELECT public.fn_equipes_de_alcance(v_eu)))
      UNION
      SELECT v_eu
    );
  END IF;

  RETURN QUERY
  WITH linhas AS (
    SELECT ar.operador_id AS op, ar.operador_usuario AS usuario, ar.setor_id AS setor,
           ar.valor_recebido AS valor, ar.total_ho AS ho
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id = p_empresa_id
       AND ar.operador_id IS NOT NULL
       AND ar.data_pagamento BETWEEN v_de AND v_ate
       AND (v_escopo >= 3 OR ar.operador_id = ANY(v_ops))
  ),
  casa AS (
    SELECT sm.operador_id AS op, sm.setor_id AS setor
      FROM public.fn_analitico_setores_no_mes(
             p_empresa_id, p_mes, ARRAY(SELECT DISTINCT x.op FROM linhas x)) sm
     WHERE v_por_setor
  )
  SELECT
    li.op,
    MIN(li.usuario),
    p.nome,
    SUM(li.valor)::NUMERIC,
    SUM(li.ho)::NUMERIC,
    COUNT(*)::BIGINT
  FROM linhas li
  LEFT JOIN public.perfis p ON p.id = li.op
  WHERE COALESCE(p.perfil, '') <> 'super_admin'
    AND (NOT v_por_setor
         OR li.setor IS NULL
         OR NOT EXISTS (SELECT 1 FROM casa c WHERE c.op = li.op)
         OR EXISTS (SELECT 1 FROM casa c WHERE c.op = li.op AND c.setor = li.setor))
  GROUP BY li.op, p.nome
  ORDER BY 4 DESC;
END;
$function$;

-- ── O que ficou de fora: por pessoa e por setor da linha ────────────────────
--
-- Existe para o fantasma de SETOR: a equipe de origem de quem foi transferido
-- no mês continua recebendo as linhas carimbadas no setor de ORIGEM — e só
-- elas. O front casa (pessoa, setor de origem) com `perfis_transferencias`.
--
-- Recorte de quem olha: o mesmo do resumo, mais quem deixou fantasma ativo nas
-- equipes/setores do alcance — a pessoa já não está lá, mas o dinheiro dela no
-- setor de origem está.
CREATE OR REPLACE FUNCTION public.fn_analitico_recebido_fora_do_setor(p_empresa_id uuid, p_mes text, p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date)
 RETURNS TABLE(operador_id uuid, setor_id uuid, total_recebido numeric, total_ho numeric, total_pagamentos bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu      UUID := (SELECT auth.uid());
  v_escopo  INTEGER;
  v_ops     UUID[] := '{}';
  v_setores UUID[] := '{}';
  v_equipes UUID[] := '{}';
  v_de      DATE;
  v_ate     DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('ver_analitico')
     OR NOT public.fn_user_tem('analitico_sub_analitico')
     OR NOT public.fn_user_tem('analitico_sub_ranking') THEN
    RETURN;
  END IF;

  IF p_mes < '2026-09'
     OR NOT EXISTS (SELECT 1 FROM public.empresas em WHERE em.id = p_empresa_id AND em.slug = 'bookplay') THEN
    RETURN;
  END IF;

  v_de  := COALESCE(p_inicio, (p_mes || '-01')::DATE);
  v_ate := COALESCE(p_fim, ((p_mes || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE);

  v_escopo := public.fn_user_escopo('analitico');

  IF v_escopo = 2 THEN
    v_setores := ARRAY(SELECT public.fn_setores_do_operador(v_eu));
    v_equipes := ARRAY(SELECT e.id FROM public.equipes e WHERE e.setor_id = ANY(v_setores));
    v_ops := ARRAY(
      SELECT pf.id FROM public.perfis pf WHERE pf.setor_id = ANY(v_setores)
      UNION
      SELECT public.fn_pessoas_das_equipes(v_equipes)
      UNION
      SELECT v_eu
    );
  ELSIF v_escopo < 2 THEN
    v_equipes := ARRAY(SELECT public.fn_equipes_de_alcance(v_eu));
    v_ops := ARRAY(
      SELECT public.fn_pessoas_das_equipes(v_equipes)
      UNION
      SELECT v_eu
    );
  END IF;

  IF v_escopo < 3 THEN
    v_ops := v_ops || ARRAY(
      SELECT t.perfil_id
        FROM public.perfis_transferencias t
       WHERE t.empresa_id = p_empresa_id
         AND t.mes = p_mes
         AND t.tipo = 'setor'
         AND t.fantasma_ativo
         AND t.desfeita_em IS NULL
         AND (t.origem_equipe_id = ANY(v_equipes) OR t.origem_setor_id = ANY(v_setores))
    );
  END IF;

  RETURN QUERY
  WITH linhas AS (
    SELECT ar.operador_id AS op, ar.setor_id AS setor,
           ar.valor_recebido AS valor, ar.total_ho AS ho
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id = p_empresa_id
       AND ar.operador_id IS NOT NULL
       AND ar.setor_id IS NOT NULL
       AND ar.data_pagamento BETWEEN v_de AND v_ate
       AND (v_escopo >= 3 OR ar.operador_id = ANY(v_ops))
  ),
  casa AS (
    SELECT sm.operador_id AS op, sm.setor_id AS setor
      FROM public.fn_analitico_setores_no_mes(
             p_empresa_id, p_mes, ARRAY(SELECT DISTINCT x.op FROM linhas x)) sm
  )
  SELECT li.op, li.setor, SUM(li.valor)::NUMERIC, SUM(li.ho)::NUMERIC, COUNT(*)::BIGINT
    FROM linhas li
   WHERE EXISTS (SELECT 1 FROM casa c WHERE c.op = li.op)
     AND NOT EXISTS (SELECT 1 FROM casa c WHERE c.op = li.op AND c.setor = li.setor)
   GROUP BY li.op, li.setor;
END;
$function$;

COMMENT ON FUNCTION public.fn_analitico_recebido_fora_do_setor(uuid, text, date, date) IS
  'Linhas do analítico carimbadas num setor onde a pessoa NÃO está no mês, somadas por (pessoa, setor). BookPlay, de 2026-09 em diante. A equipe de origem de um fantasma de setor recebe daqui as linhas do setor de origem (20260929210000).';

REVOKE ALL ON FUNCTION public.fn_analitico_recebido_fora_do_setor(uuid, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_analitico_recebido_fora_do_setor(uuid, text, date, date) TO authenticated;

COMMIT;
