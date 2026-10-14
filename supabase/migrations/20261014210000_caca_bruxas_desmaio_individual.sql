-- O fofo desmaiado é de cada tela (Cleber, 14/10/2026).
--
-- Antes: o primeiro a finalizar matava o fofo na tela de todo mundo, e o banco
-- só aceitava o clique até 20 s depois da queda. Agora o corpo fica até 2 min
-- no chão de cada pessoa, esperando o clique DELA; quem clicar finaliza só na
-- própria tela (o corpo some 20 s depois). Ver `bruxas/palco.ts`
-- (DESMAIADO_S, FINALIZADO_S) e `bruxas/cenaBruxas.tsx`.
--
-- O banco, então:
--   - aceita o clique até 150 s depois da queda (2 min do corpo + a queda e
--     o atraso da rede)
--   - continua guardando o PRIMEIRO que finalizou (o painel mostra)
--   - mas quem derrubou ainda pode finalizar depois de outra pessoa: como o
--     corpo é dele na tela dele, o 2x vale. Aí ele passa a ser quem finalizou.
CREATE OR REPLACE FUNCTION public.fn_abobora_finalizar(p_rodada bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_agora  timestamptz := clock_timestamp();
  v_rodada public.abobora_rodadas%ROWTYPE;
  v_nome   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rodada FROM public.abobora_rodadas WHERE id = p_rodada FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('finalizou', false, 'rodada', NULL);
  END IF;
  IF v_rodada.tema <> 'bruxas'
     OR v_rodada.situacao <> 'achada'
     OR coalesce(v_rodada.bruxa, -1) NOT IN (0, 2, 4, 6)
     OR v_rodada.dobrado
     OR (v_rodada.finalizada_por IS NOT NULL AND auth.uid() IS DISTINCT FROM v_rodada.achada_por)
     OR v_agora > v_rodada.achada_em + interval '150 seconds' THEN
    RETURN jsonb_build_object('finalizou', false, 'rodada', to_jsonb(v_rodada));
  END IF;

  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.abobora_rodadas
     SET finalizada_em       = v_agora,
         finalizada_por      = auth.uid(),
         finalizada_por_nome = coalesce(nullif(btrim(v_nome), ''), 'Alguém'),
         dobrado             = (auth.uid() = v_rodada.achada_por)
   WHERE id = v_rodada.id
  RETURNING * INTO v_rodada;

  RETURN jsonb_build_object('finalizou', true, 'rodada', to_jsonb(v_rodada));
END;
$function$;
