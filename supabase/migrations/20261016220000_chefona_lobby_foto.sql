-- ============================================================================
-- Caça às Bruxas: a FOTO de quem entrou no lobby da chefona
-- ============================================================================
--
-- Pedido do Cleber (16/10/2026): no painel do lobby (o do Tab), quem tem foto
-- aparece com a foto; quem não tem, com o rostinho de pixel.
--
-- A foto é guardada na entrada (como o nome e o setor), e o estado manda junto
-- na lista dos 24 últimos. Quem entrou antes desta migration fica sem foto
-- (rostinho) até a próxima chefona.
--
-- Redefine `fn_chefona_lobby_entrar` (a da 20261016120000 + a foto) e
-- `fn_chefona_estado` (a da 20261016200000 + a foto na lista). Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

ALTER TABLE public.chefona_lobby ADD COLUMN IF NOT EXISTS foto TEXT;

CREATE OR REPLACE FUNCTION public.fn_chefona_lobby_entrar(p_rodada bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu    uuid := auth.uid();
  v_r     public.chefona_rodadas%ROWTYPE;
  v_nome  text;
  v_setor text;
  v_foto  text;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_r FROM public.chefona_rodadas WHERE id = p_rodada;
  IF NOT FOUND OR v_r.situacao <> 'ativo' OR v_r.expira_em <= clock_timestamp() THEN
    RAISE EXCEPTION 'SEM_CHEFONA: ela não está na tela' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(nullif(btrim(p.nome), ''), 'Alguém'), nullif(btrim(s.nome), ''), nullif(btrim(p.foto_url), '')
    INTO v_nome, v_setor, v_foto
    FROM public.perfis p
    LEFT JOIN public.setores s ON s.id = p.setor_id
   WHERE p.id = v_eu;

  INSERT INTO public.chefona_lobby (rodada_id, usuario, nome, setor, foto)
  VALUES (v_r.id, v_eu, coalesce(v_nome, 'Alguém'), v_setor, v_foto)
  ON CONFLICT (rodada_id, usuario) DO NOTHING;

  -- Já estava (duas abas, ou clique duplo): não avisa ninguém de novo.
  IF NOT FOUND THEN
    RETURN public.fn_chefona_estado(v_r.id) || jsonb_build_object('eu_no_lobby', true);
  END IF;
  RETURN public.fn_chefona_lobby_avisar(v_r.id) || jsonb_build_object('eu_no_lobby', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_chefona_estado(p_rodada bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT (to_jsonb(r) - 'avisado_em' - 'solta_por' - 'lobby_avisado_em')
      || jsonb_build_object(
           'agora', clock_timestamp(),
           'ritmo', CASE
             WHEN r.situacao = 'ativo' AND clock_timestamp() >= r.solta_em
             THEN round(public.fn_chefona_ritmo(
                    extract(epoch FROM clock_timestamp() - r.solta_em),
                    r.vida::numeric / greatest(1, r.vida_max)), 3)
             ELSE 1 END,
           'participantes', (SELECT count(*) FROM public.chefona_golpes g WHERE g.rodada_id = r.id),
           'ranking', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'usuario', t.usuario, 'nome', t.nome, 'foto', t.foto,
                      'dano', t.dano, 'acertos', t.acertos, 'criticos', t.criticos)
                    ORDER BY t.dano DESC, t.criticos DESC, t.primeiro_em)
               FROM (SELECT g.* FROM public.chefona_golpes g
                      WHERE g.rodada_id = r.id AND g.dano > 0
                      ORDER BY g.dano DESC, g.criticos DESC, g.primeiro_em
                      LIMIT 10) t
           ), '[]'::jsonb),
           'lobby_total', (SELECT count(*) FROM public.chefona_lobby l WHERE l.rodada_id = r.id),
           'lobby', coalesce((
             SELECT jsonb_agg(jsonb_build_object('usuario', t.usuario, 'nome', t.nome, 'setor', t.setor, 'foto', t.foto)
                    ORDER BY t.entrou_em)
               FROM (SELECT l.* FROM public.chefona_lobby l
                      WHERE l.rodada_id = r.id
                      ORDER BY l.entrou_em DESC
                      LIMIT 24) t
           ), '[]'::jsonb))
    FROM public.chefona_rodadas r
   WHERE r.id = p_rodada;
$function$;

REVOKE ALL ON FUNCTION public.fn_chefona_estado(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_chefona_lobby_entrar(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chefona_lobby_entrar(bigint) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Para desfazer: reaplicar `fn_chefona_lobby_entrar` da 20261016120000 e
-- `fn_chefona_estado` da 20261016200000, e
--   ALTER TABLE public.chefona_lobby DROP COLUMN IF EXISTS foto;
