-- ============================================================================
-- Desafio do Vale: a Manutenção não tem Pix automático — vira ranking (23/11/2026)
-- ============================================================================
--
-- Pedido do usuário: «a Manutenção, a regra do Pix automático será diferente,
-- pois eles não trabalham com Pix automático. Então serão as duas pessoas que
-- mais receberem até quinta».
--
-- Cada setor do desafio passa a ter a SUA regra da 2ª parte:
--
--   cupom_regra = 'pix'      → a de sempre: a cada N Pix aprovados, 1 cupom
--   cupom_regra = 'ranking'  → os `cupom_ranking_qtd` (2) operadores do setor
--                              que mais receberem no período dos cupons (23 a
--                              26/11, de segunda a quinta) ganham
--
-- O recebido é o do Analítico (`analitico_recebimentos`, o 59 atribuído), a
-- mesma base das médias. Como o operador só lê as linhas dele, o ranking é
-- montado aqui (`fn_desafio_vale_ranking`): todo mundo do setor vê o pódio
-- (os N primeiros, com nome e valor) e a própria posição; a lista inteira,
-- com o valor de cada um, só quem tem o Analítico do setor ou de todos
-- (líder, gerência) e o super_admin.
--
-- A Manutenção já sai marcada como 'ranking' (1 linha). O super_admin troca
-- na tela, setor a setor.
--
-- Reexecutável. Acrescenta colunas e funções; muda 1 linha (a Manutenção).
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.desafio_vale_setores
  ADD COLUMN IF NOT EXISTS cupom_regra       text    NOT NULL DEFAULT 'pix',
  ADD COLUMN IF NOT EXISTS cupom_ranking_qtd integer NOT NULL DEFAULT 2;

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'desafio_vale_setores_cupom_regra') THEN
    ALTER TABLE public.desafio_vale_setores
      ADD CONSTRAINT desafio_vale_setores_cupom_regra CHECK (cupom_regra IN ('pix', 'ranking'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'desafio_vale_setores_ranking_qtd') THEN
    ALTER TABLE public.desafio_vale_setores
      ADD CONSTRAINT desafio_vale_setores_ranking_qtd CHECK (cupom_ranking_qtd BETWEEN 1 AND 20);
  END IF;
END $chk$;

-- O fechamento grava a posição de quem ganhou no ranking.
ALTER TABLE public.desafio_vale_resultado
  ADD COLUMN IF NOT EXISTS ranking_posicao integer;

-- A Manutenção do desafio ativo: ranking dos 2.
UPDATE public.desafio_vale_setores s
   SET cupom_regra = 'ranking'
  FROM public.setores st, public.desafio_vale d
 WHERE st.id = s.setor_id AND d.id = s.desafio_id AND d.ativo
   AND st.nome ILIKE 'manuten%' AND s.cupom_regra = 'pix';

-- O setor, agora com a regra da 2ª parte.
CREATE OR REPLACE FUNCTION public.fn_desafio_vale_setor_json(p_desafio uuid, p_setor uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'setor_id', st.id, 'nome', st.nome, 'cidade', c.nome, 'regra', st.regra,
    'participa', coalesce(s.participa, false),
    'pct', coalesce(s.pct_manual, s.pct_auto),
    'origem', CASE WHEN s.pct_manual IS NOT NULL THEN 'manual' WHEN s.pct_auto IS NOT NULL THEN 'automatico' END,
    'pct_manual', s.pct_manual, 'pct_auto', s.pct_auto,
    'recebido', s.recebido_auto, 'meta', s.meta_auto,
    'cupom_regra', coalesce(s.cupom_regra, 'pix'), 'cupom_ranking_qtd', coalesce(s.cupom_ranking_qtd, 2))
    FROM public.setores st
    LEFT JOIN public.rh_celulas c ON c.id = st.cidade_id
    LEFT JOIN public.desafio_vale_setores s ON s.desafio_id = p_desafio AND s.setor_id = st.id
   WHERE st.id = p_setor;
$$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_setor_json(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- O ranking de um setor 'ranking'. `p_setor` só vale para quem vê todos os
-- setores (super_admin, Analítico de todos); os outros recebem o próprio.
-- Nulo = o desafio não está visível, ou o setor não é de ranking.
CREATE OR REPLACE FUNCTION public.fn_desafio_vale_ranking(p_setor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sa     boolean := coalesce(public.fn_user_is_super_admin(), false);
  v_todos  boolean;
  v_lider  boolean;
  v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_d      public.desafio_vale%ROWTYPE;
  v_setor  uuid;
  v_qtd    integer;
  v_lista  jsonb;
  v_eu     jsonb;
  v_corte  numeric;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  v_todos := v_sa OR coalesce(public.fn_user_tem('analitico_escopo_todos_setores'), false);
  v_lider := v_todos OR coalesce(public.fn_user_tem('analitico_escopo_setor'), false);

  SELECT * INTO v_d FROM public.desafio_vale
   WHERE ativo AND (v_sa OR (liberado AND v_hoje BETWEEN inicio - 3 AND fim + 10))
   ORDER BY atualizado_em DESC LIMIT 1;
  IF v_d.id IS NULL OR v_d.cupom_inicio IS NULL OR v_d.cupom_fim IS NULL THEN RETURN NULL; END IF;

  v_setor := CASE WHEN v_todos AND p_setor IS NOT NULL THEN p_setor
                  ELSE public.fn_desafio_vale_setor_da_pessoa(v_d.id, auth.uid()) END;
  SELECT s.cupom_ranking_qtd INTO v_qtd FROM public.desafio_vale_setores s
   WHERE s.desafio_id = v_d.id AND s.setor_id = v_setor AND s.participa AND s.cupom_regra = 'ranking';
  IF v_qtd IS NULL THEN RETURN NULL; END IF;

  WITH pessoas AS (
    SELECT p.id, p.nome FROM public.perfis p
     WHERE p.empresa_id = v_d.empresa_id AND p.setor_id = v_setor
       AND coalesce(p.ativo, true) AND NOT coalesce(p.arquivado, false)
       AND p.perfil IN ('operador', 'elite')
  ),
  soma AS (
    SELECT a.operador_id, sum(a.valor_recebido) AS v
      FROM public.analitico_recebimentos a
     WHERE a.empresa_id = v_d.empresa_id
       AND a.data_pagamento BETWEEN v_d.cupom_inicio AND v_d.cupom_fim
       AND a.operador_id IN (SELECT id FROM pessoas)
     GROUP BY a.operador_id
  ),
  r AS (
    SELECT p.id, p.nome, coalesce(s.v, 0)::numeric(14,2) AS valor,
           rank() OVER (ORDER BY coalesce(s.v, 0) DESC) AS pos
      FROM pessoas p LEFT JOIN soma s ON s.operador_id = p.id
  )
  SELECT jsonb_agg(jsonb_build_object('perfil_id', r.id, 'nome', r.nome, 'valor', r.valor, 'posicao', r.pos,
                                      'eu', r.id = auth.uid()) ORDER BY r.pos, r.nome)
    INTO v_lista
    FROM r;

  -- O valor de quem está na última vaga (a régua de «quanto falta para entrar»).
  SELECT max((x->>'valor')::numeric) INTO v_corte
    FROM jsonb_array_elements(coalesce(v_lista, '[]')) x
   WHERE (x->>'posicao')::integer = (SELECT min((y->>'posicao')::integer) FROM jsonb_array_elements(coalesce(v_lista, '[]')) y
                                      WHERE (y->>'posicao')::integer >= v_qtd);
  SELECT x INTO v_eu FROM jsonb_array_elements(coalesce(v_lista, '[]')) x WHERE (x->>'eu')::boolean LIMIT 1;

  RETURN jsonb_build_object(
    'setor_id', v_setor, 'qtd', v_qtd, 'de', v_d.cupom_inicio, 'ate', v_d.cupom_fim,
    'pessoas', jsonb_array_length(coalesce(v_lista, '[]')),
    'corte', v_corte,
    -- O pódio: todo mundo do setor vê.
    'topo', coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(coalesce(v_lista, '[]')) x
                       WHERE (x->>'posicao')::integer <= v_qtd), '[]'::jsonb),
    'eu', v_eu,
    -- A lista inteira: só líder/gerência/super_admin.
    'todos', CASE WHEN v_lider THEN coalesce(v_lista, '[]'::jsonb) END);
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_ranking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_vale_ranking(uuid) TO authenticated;

COMMIT;
