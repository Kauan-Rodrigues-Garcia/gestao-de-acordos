-- ============================================================================
-- Desafio do Vale: o recebido do setor igual ao do Painel do Líder (23/11/2026)
-- ============================================================================
--
-- Pedido do usuário: «o desafio tem que puxar a projeção do setor; se a
-- projeção do setor está 103,9, tem que ser puxado». Print do Painel do Líder:
-- Manutenção, «Total do relatório», recebido R$ 1.208.798,45, meta R$ 1,7 mi,
-- 13 de 19 dias úteis → 103,9% do ritmo. O desafio mostrava ~20%.
--
-- O desafio somava o 59 pelas CARTEIRAS do setor (`fn_mestre_diretoria_linhas`,
-- a régua do Painel Diretoria): R$ 238 mil na Manutenção. O Painel do Líder
-- monta o acumulado do setor de outro jeito (`acumuladoDoSetor`, o mesmo da
-- aba Comissão e do card de Desempenho Equipes):
--
--   1. o TOTAL DO RELATÓRIO: o Analítico do mês pelo carimbo do setor
--      (`setor_id` da linha; sem carimbo, o setor de quem importou) —
--      `buscarTotalPorSetor`;
--      · setor ALTERNATIVO: a soma dos usuários do setor + as órfãs carimbadas;
--   2. MENOS as origens que o setor tirou do acumulado
--      (`analitico_exclusoes_setor`; a origem da linha é o setor de quem
--      contribuiu, ou o de quem cobrou, ou «sem operador»);
--   3. MAIS a Contribuição do Receptivo DIGITADA (`contribuicao_receptivo`),
--      quando o 59 não trouxe a contribuição em linhas (`contribuicao_59`) —
--      é o que faltava na Manutenção.
--
-- Esta migration troca só a conta do recebido em `fn_desafio_vale_calcular`.
-- A meta continua a do setor na aba Metas, e a projeção é feita no app com o
-- calendário do setor (a mesma do Painel). Regra Cofen segue sem % automático.
--
-- Reexecutável. Só substitui uma função.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.fn_desafio_vale_calcular(p_desafio uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d     public.desafio_vale%ROWTYPE;
  v_mes   date;
  v_fim   date;
  v_txt   text;
  v_lote  timestamptz;
  n       integer;
BEGIN
  SELECT * INTO v_d FROM public.desafio_vale WHERE id = p_desafio;
  IF v_d.id IS NULL OR v_d.fechado_em IS NOT NULL THEN RETURN 0; END IF;

  v_mes := date_trunc('month', v_d.fim)::date;
  v_fim := (v_mes + interval '1 month - 1 day')::date;
  v_txt := to_char(v_mes, 'YYYY-MM');
  SELECT max(l.importado_em) INTO v_lote FROM public.mestre_lotes l
   WHERE l.empresa_id = v_d.empresa_id AND l.mes = v_mes AND l.estado = 'vigente';
  -- Sem o 59 do mês, zerar o setor seria jogar todo mundo na faixa mais baixa.
  IF v_lote IS NULL THEN RETURN 0; END IF;

  WITH linhas AS (
    -- O mês do Analítico, com o setor DONO (carimbo; sem ele, quem importou)
    -- e a ORIGEM (quem contribuiu > setor de quem cobrou > sem operador).
    SELECT coalesce(r.setor_id, imp.setor_id) AS dono,
           r.operador_id,
           op.setor_id                         AS setor_do_operador,
           coalesce(r.contribuicao_de_setor_id, op.setor_id) AS origem,
           r.procedencia,
           r.valor_recebido
      FROM public.analitico_recebimentos r
      LEFT JOIN public.perfis op  ON op.id  = r.operador_id
      LEFT JOIN public.perfis imp ON imp.id = r.importado_por_id
     WHERE r.empresa_id = v_d.empresa_id
       AND r.data_pagamento BETWEEN v_mes AND v_fim
  ),
  exclusoes AS (
    SELECT e.setor_id, e.setor_origem_id
      FROM public.analitico_exclusoes_setor e
     WHERE e.empresa_id = v_d.empresa_id AND e.mes = v_txt
  ),
  por_setor AS (
    SELECT st.id AS setor_id,
           coalesce((
             SELECT sum(l.valor_recebido) FROM linhas l
              WHERE CASE WHEN coalesce(st.alternativo, false)
                         -- Alternativo: os usuários do setor + as órfãs carimbadas nele.
                         THEN (l.operador_id IS NOT NULL AND l.setor_do_operador = st.id)
                              OR (l.operador_id IS NULL AND l.dono = st.id)
                         ELSE l.dono = st.id END
                AND NOT EXISTS (SELECT 1 FROM exclusoes x
                                 WHERE x.setor_id = st.id
                                   AND x.setor_origem_id IS NOT DISTINCT FROM l.origem)), 0)
           -- A Contribuição do Receptivo digitada, quando o 59 não a trouxe em linhas.
           + CASE WHEN EXISTS (SELECT 1 FROM linhas l WHERE l.dono = st.id AND l.procedencia = 'contribuicao_59') THEN 0
                  ELSE coalesce((SELECT c.acumulado FROM public.contribuicao_receptivo c
                                  WHERE c.empresa_id = v_d.empresa_id AND c.setor_id = st.id AND c.mes = v_txt
                                  LIMIT 1), 0) END AS v
      FROM public.setores st
     WHERE st.id IN (SELECT s.setor_id FROM public.desafio_vale_setores s WHERE s.desafio_id = v_d.id)
  ),
  meta AS (
    SELECT m.referencia_id::text AS setor, max(m.meta_valor) AS v
      FROM public.metas m
     WHERE m.empresa_id = v_d.empresa_id AND m.tipo = 'setor'
       AND m.mes = extract(month FROM v_mes)::integer AND m.ano = extract(year FROM v_mes)::integer
     GROUP BY 1
  )
  UPDATE public.desafio_vale_setores s
     SET recebido_auto = coalesce(ps.v, 0),
         meta_auto     = me.v,
         pct_auto      = CASE WHEN coalesce(st.regra, '') = 'cofen' OR coalesce(me.v, 0) <= 0 THEN NULL
                              ELSE round(coalesce(ps.v, 0) / me.v * 100, 2) END
    FROM public.setores st
    LEFT JOIN por_setor ps ON ps.setor_id = st.id
    LEFT JOIN meta me ON me.setor = st.id::text
   WHERE s.desafio_id = v_d.id AND st.id = s.setor_id;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.desafio_vale SET calculado_lote = v_lote, calculado_em = now() WHERE id = v_d.id;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_calcular(uuid) FROM PUBLIC, anon, authenticated;

-- Refaz já o % guardado com a regra nova.
DO $refaz$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN SELECT id FROM public.desafio_vale WHERE ativo AND fechado_em IS NULL LOOP
    PERFORM public.fn_desafio_vale_calcular(v_id);
  END LOOP;
END $refaz$;

COMMIT;
