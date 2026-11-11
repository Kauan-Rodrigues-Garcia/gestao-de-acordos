-- ============================================================================
-- 20261111190000_votacao_escolha_livre_diretoria.sql
--
-- Votação da Liderança: a diretoria escolhe QUALQUER participante, com ou sem
-- voto na categoria (11/11/2026).
--
-- Pedido do Kauan: «não importa os votos, eu estou decidindo». Até aqui
-- (20261110150000) a decisão só valia se o escolhido tivesse pelo menos 1 voto
-- na categoria; escolha sem voto era recusada por fn_votacao_lideranca_desempatar
-- e ignorada por fn_vl_pendentes. Agora vale qualquer participante da votação.
--
-- Também: só contam as categorias que ESTÃO na votação (`perguntas`). Uma
-- categoria tirada da votação depois de encerrada deixa de pesar na conta de
-- «líder em mais de uma» — os votos dela ficam gravados, só não contam.
--
-- O resto não muda: só a diretoria decide, só com a votação encerrada, a
-- categoria tem de estar pendente (ou já decidida, para trocar), e liberar só
-- com nada pendente. Nenhum voto muda. Reaplicável. Depende da 20261110150000.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF to_regprocedure('public.fn_vl_pendentes(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes a 20261110150000_votacao_decisao_repetidos.sql.';
  END IF;
END $$;

-- ============================================================================
-- 1. O que falta decidir
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vl_pendentes(p_id UUID)
RETURNS TABLE (pergunta_id TEXT, vencedores UUID[], empate BOOLEAN, repetido BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH vot AS (
    SELECT v.participantes,
           ARRAY(SELECT q->>'id' FROM jsonb_array_elements(v.perguntas) q) AS perguntas
      FROM public.votacao_lideranca v
     WHERE v.id = p_id
  ), c AS (
    SELECT x.pergunta_id, x.candidato_id, count(*)::int AS n
      FROM public.votacao_lideranca_votos x, vot
     WHERE x.votacao_id = p_id AND x.pergunta_id = ANY (vot.perguntas)
     GROUP BY 1, 2
  ), topo AS (
    SELECT c.pergunta_id, max(c.n) AS n FROM c GROUP BY 1
  ), venc AS (
    SELECT c.pergunta_id, c.candidato_id
      FROM c JOIN topo t ON t.pergunta_id = c.pergunta_id AND c.n = t.n
  ), decidida AS (
    -- Desde 11/11/2026: vale qualquer participante, com ou sem voto.
    SELECT d.pergunta_id, d.escolhido_id
      FROM public.votacao_lideranca_desempates d, vot
     WHERE d.votacao_id = p_id
       AND d.pergunta_id = ANY (vot.perguntas)
       AND d.escolhido_id = ANY (vot.participantes)
  ), quem_leva AS (
    SELECT d.pergunta_id, d.escolhido_id AS id FROM decidida d
    UNION ALL
    SELECT v.pergunta_id, v.candidato_id FROM venc v
     WHERE NOT EXISTS (SELECT 1 FROM decidida d WHERE d.pergunta_id = v.pergunta_id)
  ), aberta AS (
    SELECT v.pergunta_id, array_agg(v.candidato_id ORDER BY v.candidato_id) AS vencedores
      FROM venc v
     WHERE NOT EXISTS (SELECT 1 FROM decidida d WHERE d.pergunta_id = v.pergunta_id)
     GROUP BY v.pergunta_id
  ), marcada AS (
    SELECT a.pergunta_id, a.vencedores,
           cardinality(a.vencedores) > 1 AS empate,
           EXISTS (SELECT 1 FROM quem_leva q WHERE q.pergunta_id <> a.pergunta_id AND q.id = ANY (a.vencedores)) AS repetido
      FROM aberta a
  )
  SELECT m.pergunta_id, m.vencedores, m.empate, m.repetido
    FROM marcada m
   WHERE m.empate OR m.repetido;
$$;

COMMENT ON FUNCTION public.fn_vl_pendentes(UUID) IS
  'Categorias que a diretoria ainda precisa decidir: empate no 1º lugar ou 1º colocado '
  'que também leva outra categoria. Decisão vale para qualquer participante; só contam '
  'as categorias da votação. 20261111190000.';

REVOKE ALL ON FUNCTION public.fn_vl_pendentes(UUID) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. Decidir uma categoria: qualquer participante
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_desempatar(p_id UUID, p_pergunta TEXT, p_escolhido UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_pend    RECORD;
  v_ja      BOOLEAN;
  v_topo    UUID[];
  v_motivo  TEXT;
BEGIN
  IF NOT (SELECT public.fn_vl_eh_diretoria()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só a diretoria decide as categorias' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.votacao_lideranca v WHERE v.id = p_id AND v.estado = 'encerrada') THEN
    RAISE EXCEPTION 'Só dá para decidir com a votação encerrada e antes de liberar.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.votacao_lideranca v, jsonb_array_elements(v.perguntas) q
                  WHERE v.id = p_id AND q->>'id' = p_pergunta) THEN
    RAISE EXCEPTION 'Esta categoria não está na votação.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.votacao_lideranca v WHERE v.id = p_id AND p_escolhido = ANY (v.participantes)) THEN
    RAISE EXCEPTION 'Esta pessoa não participa da votação.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pend FROM public.fn_vl_pendentes(p_id) p WHERE p.pergunta_id = p_pergunta;
  v_ja := EXISTS (SELECT 1 FROM public.votacao_lideranca_desempates d WHERE d.votacao_id = p_id AND d.pergunta_id = p_pergunta);
  IF v_pend.pergunta_id IS NULL AND NOT v_ja THEN
    RAISE EXCEPTION 'Esta categoria já tem vencedor: não precisa de decisão.' USING ERRCODE = '22023';
  END IF;

  -- Os 1ºs colocados de agora (pela contagem), para o registro.
  SELECT array_agg(c.candidato_id ORDER BY c.candidato_id) INTO v_topo
    FROM (
      SELECT x.candidato_id, count(*) AS n, max(count(*)) OVER () AS m
        FROM public.votacao_lideranca_votos x
       WHERE x.votacao_id = p_id AND x.pergunta_id = p_pergunta
       GROUP BY x.candidato_id
    ) c
   WHERE c.n = c.m;

  v_motivo := CASE
    WHEN v_pend.pergunta_id IS NULL THEN (SELECT d.motivo FROM public.votacao_lideranca_desempates d
                                           WHERE d.votacao_id = p_id AND d.pergunta_id = p_pergunta)
    ELSE concat_ws(',', CASE WHEN v_pend.empate THEN 'empate' END, CASE WHEN v_pend.repetido THEN 'repetido' END)
  END;

  INSERT INTO public.votacao_lideranca_desempates (votacao_id, pergunta_id, empatados, escolhido_id, decidido_por, motivo)
  VALUES (p_id, p_pergunta, COALESCE(v_topo, '{}'), p_escolhido, auth.uid(), v_motivo)
  ON CONFLICT (votacao_id, pergunta_id) DO UPDATE
    SET empatados = EXCLUDED.empatados, escolhido_id = EXCLUDED.escolhido_id,
        decidido_por = EXCLUDED.decidido_por, decidido_em = NOW(),
        motivo = COALESCE(EXCLUDED.motivo, public.votacao_lideranca_desempates.motivo);
  PERFORM public.fn_vl_registrar(p_id, 'desempate',
    jsonb_build_object('pergunta_id', p_pergunta, 'primeiros', to_jsonb(COALESCE(v_topo, '{}')),
                       'escolhido_id', p_escolhido, 'motivo', v_motivo));
END;
$$;

COMMENT ON FUNCTION public.fn_votacao_lideranca_desempatar(UUID, TEXT, UUID) IS
  'A diretoria decide quem leva uma categoria pendente (empate ou líder em 1º em mais de '
  'uma), entre QUALQUER participante, com ou sem voto; também troca uma decisão. 20261111190000.';

-- ============================================================================
-- 3. Conferência
-- ============================================================================

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.fn_vl_pendentes(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_vl_pendentes ficou aberta para o app.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_votacao_lideranca_desempatar(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'O app perdeu o acesso a decidir.';
  END IF;
END $$;

COMMIT;
