-- Mural de Outubro: o botão começa a revelação inteira, com a abertura em 5 minutos.
--
-- Pedido de 29/10/2026 («esquece tudo do jeito que é hoje»): o botão do
-- super_admin começa a revelação para todos — o bueiro aparece com o relógio
-- de 5 minutos, faltando 2 min 45 s a água e o barquinho, nos 2 minutos a mão
-- com o barco e o «Participar», e no zero a revelação (`PortalOutubro/fases.ts`:
-- `JANELA_MS`). A abertura (`abre_em`) passa a ficar 5 minutos depois do clique
-- (era 2 min 30 s, em 20261029233000).
--
-- Só troca o intervalo; o resto da função é o de 20261029120000.

CREATE OR REPLACE FUNCTION public.fn_mural_outubro_soltar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin solta a abertura do mural' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.mural_outubro AS m (id, liberado, abre_em, atualizado_por, atualizado_por_nome, atualizado_em)
  VALUES (1, true, now() + interval '5 minutes', auth.uid(),
          (SELECT p.nome FROM public.perfis p WHERE p.id = auth.uid()), now())
  ON CONFLICT (id) DO UPDATE
    SET liberado = true, abre_em = excluded.abre_em, atualizado_por = excluded.atualizado_por,
        atualizado_por_nome = excluded.atualizado_por_nome, atualizado_em = excluded.atualizado_em;
  RETURN public.fn_mural_outubro_ler();
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_mural_outubro_soltar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mural_outubro_soltar() TO authenticated;

-- Para desfazer: reaplicar 20261029233000 (interval '2 minutes 30 seconds').
