-- ============================================================================
-- 20261110150000_votacao_decisao_repetidos.sql
--
-- Votação da Liderança: a diretoria decide também quando o MESMO LÍDER ganha
-- mais de uma categoria (10/11/2026).
--
-- Pedido do Kauan: «quero que a diretoria escolha também caso um líder ganhe
-- em mais de uma categoria, ficando a critério deles quem irá levar, com os
-- mais votados dessa».
--
-- Até aqui (20261104230000) a diretoria só decidia EMPATE no 1º lugar, e só
-- entre os empatados. Agora uma categoria precisa de decisão quando:
--
--   - deu empate no 1º lugar; ou
--   - quem está em 1º nela também está em 1º em outra categoria (contando as
--     decisões já tomadas: decidida, a categoria vale pelo escolhido).
--
-- Em cada uma a diretoria escolhe quem leva entre os que TÊM VOTO nela (a tela
-- mostra os mais votados primeiro). Pode manter o mesmo líder — fica a
-- critério dela; manter numa categoria não dispensa decidir as outras dele.
-- Tirar o líder de uma categoria pode passar o 1º lugar a alguém que já leva
-- outra: essa outra passa a precisar de decisão também. Liberar o resultado só
-- com nada pendente — o banco confere.
--
-- Decisão de empate já gravada continua valendo (o escolhido tinha voto).
-- Nenhum voto muda. Reaplicável. Depende da 20261104230000.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF to_regclass('public.votacao_lideranca_desempates') IS NULL
     OR to_regprocedure('public.fn_vl_eh_diretoria()') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes a 20261104230000_votacao_lideranca.sql.';
  END IF;
END $$;

-- O porquê de cada decisão, para o registro: 'empate', 'repetido' ou os dois.
ALTER TABLE public.votacao_lideranca_desempates
  ADD COLUMN IF NOT EXISTS motivo TEXT;

COMMENT ON TABLE public.votacao_lideranca_desempates IS
  'Categoria decidida pela diretoria antes de liberar: empate no 1º lugar ou líder '
  'em 1º em mais de uma categoria (motivo). `empatados` = os 1ºs colocados na hora. 20261110150000.';
COMMENT ON COLUMN public.votacao_lideranca_desempates.motivo IS
  'empate | repetido | empate,repetido. 20261110150000.';

-- ============================================================================
-- 1. O que falta decidir (interno)
-- ============================================================================
--
-- Uma linha por categoria pendente: os 1ºs colocados e o porquê. Decisão só
-- vale se o escolhido tem voto na categoria.

CREATE OR REPLACE FUNCTION public.fn_vl_pendentes(p_id UUID)
RETURNS TABLE (pergunta_id TEXT, vencedores UUID[], empate BOOLEAN, repetido BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH c AS (
    SELECT v.pergunta_id, v.candidato_id, count(*)::int AS n
      FROM public.votacao_lideranca_votos v
     WHERE v.votacao_id = p_id
     GROUP BY 1, 2
  ), topo AS (
    SELECT c.pergunta_id, max(c.n) AS n FROM c GROUP BY 1
  ), venc AS (
    SELECT c.pergunta_id, c.candidato_id
      FROM c JOIN topo t ON t.pergunta_id = c.pergunta_id AND c.n = t.n
  ), decidida AS (
    SELECT d.pergunta_id, d.escolhido_id
      FROM public.votacao_lideranca_desempates d
      JOIN c ON c.pergunta_id = d.pergunta_id AND c.candidato_id = d.escolhido_id
     WHERE d.votacao_id = p_id
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
  'que também leva outra categoria. 20261110150000.';

REVOKE ALL ON FUNCTION public.fn_vl_pendentes(UUID) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. Decidir uma categoria
-- ============================================================================
--
-- Só a diretoria (ou o super_admin), com a votação encerrada. A categoria tem
-- de estar pendente — ou já ter decisão (para trocar). O escolhido tem de ter
-- pelo menos 1 voto nela.

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
  IF NOT EXISTS (SELECT 1 FROM public.votacao_lideranca_votos x
                  WHERE x.votacao_id = p_id AND x.pergunta_id = p_pergunta AND x.candidato_id = p_escolhido) THEN
    RAISE EXCEPTION 'Esta pessoa não tem voto nesta categoria.' USING ERRCODE = '22023';
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
  'uma), entre quem tem voto nela; também troca uma decisão. 20261110150000.';

-- ============================================================================
-- 3. Liberar: só com nada pendente
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_liberar(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_pendentes INTEGER;
BEGIN
  IF NOT (SELECT public.fn_vl_eh_diretoria()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só a diretoria libera o resultado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.votacao_lideranca v WHERE v.id = p_id AND v.estado = 'encerrada') THEN
    RAISE EXCEPTION 'Só dá para liberar uma votação encerrada.' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_pendentes FROM public.fn_vl_pendentes(p_id);
  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'Falta decidir % categoria(s) antes de liberar.', v_pendentes USING ERRCODE = '22023';
  END IF;

  UPDATE public.votacao_lideranca
     SET estado = 'liberada', liberada_por = auth.uid(), liberada_em = NOW(), atualizada_em = NOW()
   WHERE id = p_id;
  PERFORM public.fn_vl_registrar(p_id, 'liberada');
END;
$$;

COMMENT ON FUNCTION public.fn_votacao_lideranca_liberar(UUID) IS
  'Libera o resultado: só com a votação encerrada e nenhuma categoria pendente '
  '(empate ou líder em 1º em mais de uma). 20261110150000.';

-- ============================================================================
-- 4. Conferência
-- ============================================================================

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.fn_vl_pendentes(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_vl_pendentes ficou aberta para o app.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_votacao_lideranca_desempatar(uuid,text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_votacao_lideranca_liberar(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'O app perdeu o acesso a decidir ou liberar.';
  END IF;
END $$;

COMMIT;
