-- ============================================================================
-- Corrida da Sorte: «preencher para quem não escolheu» — 20/10/2026
-- ============================================================================
--
-- Pedido do Cleber: abrir a corrida não fecha o grid. Quem corre e ainda não
-- escolheu o bichinho segue escolhendo com o lobby aberto, e só aparece no
-- grid depois de escolher (o lobby filtra no navegador). O aleatório fica para
-- a hora de largar: a gravação sorteia quem continua sem escolha.
--
-- Este botão adianta esse sorteio: dá um bichinho aleatório (0, 1 ou 2) a cada
-- corredor sem escolha, grava, e avisa a sala e cada pessoa sorteada (a tela
-- de escolha dela fecha sozinha). Só antes da gravação, como escolher.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_corrida_preencher(p_corrida bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_c public.corridas%ROWTYPE;
  v_u uuid;
BEGIN
  PERFORM public.fn_corrida_exigir_admin();
  SELECT * INTO v_c FROM public.corridas WHERE id = p_corrida FOR UPDATE;
  IF NOT FOUND OR v_c.estado NOT IN ('preparando', 'aberta') OR v_c.gravada_em IS NOT NULL THEN
    RAISE EXCEPTION 'NAO_DA: só preenche antes de gravar' USING ERRCODE = 'P0001';
  END IF;

  FOR v_u IN
    UPDATE public.corrida_pessoas
       SET escolha = floor(random() * 3)::smallint, escolhida_em = clock_timestamp()
     WHERE corrida_id = p_corrida AND corre AND escolha IS NULL
    RETURNING usuario
  LOOP
    PERFORM public.fn_corrida_avisar_pessoa(v_u);
  END LOOP;
  IF FOUND THEN
    PERFORM public.fn_corrida_avisar_sala(p_corrida, 'pessoas');
  END IF;
  RETURN public.fn_corrida_painel();
END;
$function$;

COMMENT ON FUNCTION public.fn_corrida_preencher(bigint) IS
  'Corrida da Sorte: bichinho aleatório para quem corre e não escolheu (só antes de gravar). Ver 20261020200000.';

REVOKE ALL ON FUNCTION public.fn_corrida_preencher(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_corrida_preencher(bigint) TO authenticated;

COMMIT;
