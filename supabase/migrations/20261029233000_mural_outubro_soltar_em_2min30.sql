-- Mural de Outubro: «Soltar a abertura» passa de 1 minuto para 2 min 30 s.
--
-- Pedido de 29/10/2026: antes da revelação, o barquinho cai no bueiro, a mão
-- sai com ele e começa uma contagem de 2 minutos com o botão «Participar»
-- (`PortalOutubro/fases.ts`: a fase `final` começa 2 min 9,6 s antes da
-- abertura). Com 1 minuto não cabia: o final já começava pela metade. Os 20
-- segundos que sobram são o tempo de o aviso chegar a todas as telas antes de
-- o barco aparecer.
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
  VALUES (1, true, now() + interval '2 minutes 30 seconds', auth.uid(),
          (SELECT p.nome FROM public.perfis p WHERE p.id = auth.uid()), now())
  ON CONFLICT (id) DO UPDATE
    SET liberado = true, abre_em = excluded.abre_em, atualizado_por = excluded.atualizado_por,
        atualizado_por_nome = excluded.atualizado_por_nome, atualizado_em = excluded.atualizado_em;
  RETURN public.fn_mural_outubro_ler();
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_mural_outubro_soltar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mural_outubro_soltar() TO authenticated;

-- Para desfazer: reaplicar o bloco de `fn_mural_outubro_soltar` de
-- 20261029120000 (interval '1 minute').
