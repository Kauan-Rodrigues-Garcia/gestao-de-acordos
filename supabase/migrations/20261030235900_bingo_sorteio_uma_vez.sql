-- ============================================================================
-- Bingo: a pedra é sorteada UMA vez
-- ============================================================================
--
-- ## O defeito (30/10/2026)
--
-- «null value in column "numero" of relation "bingo_pedras"» ao sortear, e na
-- segunda tentativa dava certo. `fn_bingo_sorteio` é VOLATILE (usa
-- `gen_random_uuid()`), e estava no WHERE:
--
--     WHERE i = public.fn_bingo_sorteio(75 - v_qtd)
--
-- O Postgres a chama de novo para CADA número livre: cada um é comparado com
-- um sorteio diferente. Com n livres, a chance de nenhum casar é
-- (1 − 1/n)ⁿ ≈ 37% — o número saía NULL e o INSERT caía, desfazendo tudo.
-- Quando mais de um casava, valia o primeiro, puxando o sorteio para os
-- números baixos.
--
-- ## A correção
--
-- O índice é sorteado antes, numa variável, e o número é o daquele índice.
-- O resto é a cópia da definição em produção em 30/10/2026.

CREATE OR REPLACE FUNCTION public.fn_bingo_sortear_interno(p_partida uuid, p_automatico boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_bp      public.bingo_partidas%ROWTYPE;
  v_qtd     INTEGER;
  v_indice  INTEGER;
  v_numero  SMALLINT;
  v_proxima TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_bp FROM public.bingo_partidas WHERE id = p_partida FOR UPDATE;
  IF v_bp.id IS NULL OR v_bp.estado <> 'aberta' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'A partida não está aberta.');
  END IF;
  -- «Ainda não» devolve a hora certa: quem pediu cedo recalibra o relógio
  -- sem reler a partida inteira.
  IF p_automatico AND (v_bp.auto_intervalo_s IS NULL OR v_bp.auto_pausado
                       OR v_bp.proxima_pedra_em IS NULL OR v_bp.proxima_pedra_em > now()) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ainda não', 'proxima_pedra_em', v_bp.proxima_pedra_em);
  END IF;

  SELECT COUNT(*) INTO v_qtd FROM public.bingo_pedras WHERE partida_id = p_partida;
  IF v_qtd >= 75 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Já saíram as 75 pedras.');
  END IF;

  -- Sorteado UMA vez, fora da consulta: dentro do WHERE ele rodava a cada linha.
  v_indice := public.fn_bingo_sorteio(75 - v_qtd);
  SELECT n INTO v_numero
    FROM (SELECT n::SMALLINT AS n, ROW_NUMBER() OVER (ORDER BY n) - 1 AS i
            FROM generate_series(1, 75) n
           WHERE n NOT IN (SELECT numero FROM public.bingo_pedras WHERE partida_id = p_partida)) livres
   WHERE i = v_indice;
  IF v_numero IS NULL THEN
    RAISE EXCEPTION 'BINGO_SEM_PEDRA: nenhum número livre no índice % (% já saíram)', v_indice, v_qtd;
  END IF;

  INSERT INTO public.bingo_pedras (partida_id, ordem, numero) VALUES (p_partida, v_qtd + 1, v_numero);
  UPDATE public.bingo_partidas
     SET proxima_pedra_em = CASE WHEN auto_intervalo_s IS NULL OR auto_pausado OR v_qtd + 1 >= 75 THEN NULL
                                 ELSE now() + make_interval(secs => auto_intervalo_s) END
   WHERE id = p_partida
  RETURNING proxima_pedra_em INTO v_proxima;

  PERFORM public.fn_bingo_avisar(p_partida, jsonb_build_object('tipo', 'pedra', 'ordem', v_qtd + 1, 'numero', v_numero));
  RETURN jsonb_build_object('ok', true, 'ordem', v_qtd + 1, 'numero', v_numero, 'proxima_pedra_em', v_proxima);
END;
$function$;
