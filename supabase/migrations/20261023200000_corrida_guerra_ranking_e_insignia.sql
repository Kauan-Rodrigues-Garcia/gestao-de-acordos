-- Guerra na Corrida: o ranking completo e a insígnia do Cavalo da Guerra (23/10/2026).
--
--   1. O ranking de quem bateu no chefe vinha com os 8 primeiros. Durante a
--      luta continua assim (o aviso vai para a sala a cada 2 s e tem que ser
--      leve); quando ele cai (ou foge), vem TODO mundo que acertou, em ordem,
--      e `atiradores` diz quantos foram. É o que o placar da página e a festa
--      da corrida mostram.
--   2. A insígnia «Cavalo da Guerra» do álbum das gincanas (`Insignias/`): quem
--      deu dano numa luta em que ele CAIU (a mesma regra do Rei do Pop e da
--      Bruxa do Pântano). As tabelas da guerra não têm leitura direta (RLS sem
--      policy), então o álbum lê por `fn_corrida_guerra_insignias`: cada um o
--      seu; o de todo mundo, só o super_admin.
--
-- O fn_corrida_guerra_json daqui é o mesmo da 20261023150000 (que também foi
-- atualizada): rodar uma ou as duas, em qualquer ordem, dá no mesmo.
--
-- Reexecutável. Desfazer: ver o fim do arquivo.

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_corrida_guerra_json(p_corrida bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'corrida_id', g.corrida_id, 'ligada', true, 'versao', g.versao, 'agora', clock_timestamp(),
    'cavalos', g.cavalos, 'alvo', g.alvo, 'comecou_em', g.comecou_em, 'pressao', g.pressao, 'sobrou_em', g.sobrou_em,
    'solta_em', g.solta_em, 'expira_em', g.expira_em, 'pessoas', g.pessoas,
    'vida_max', g.vida_max, 'vida', g.vida, 'curas', g.curas, 'cura_em', g.cura_em, 'cura_vida', g.cura_vida,
    'ritmo', g.ritmo, 'caiu_em', g.caiu_em,
    'atacando', (SELECT count(*) FROM public.corrida_guerra_golpes x
                  WHERE x.corrida_id = g.corrida_id AND x.atacou_em > clock_timestamp() - interval '5 seconds'),
    'atiradores', (SELECT count(*) FROM public.corrida_guerra_golpes x WHERE x.corrida_id = g.corrida_id AND x.dano > 0),
    -- na luta, os 8 primeiros; caído (ou fugido), todo mundo que acertou
    'ranking', COALESCE((SELECT jsonb_agg(jsonb_build_object('usuario', r.usuario, 'nome', r.nome, 'foto', r.foto, 'dano', r.dano) ORDER BY r.pos)
                           FROM (SELECT x.usuario, COALESCE(p.nome, 'Alguém') AS nome, p.foto, round(x.dano)::int AS dano,
                                        row_number() OVER (ORDER BY x.dano DESC, x.usuario) AS pos
                                   FROM public.corrida_guerra_golpes x
                                   LEFT JOIN public.corrida_pessoas p ON p.corrida_id = x.corrida_id AND p.usuario = x.usuario
                                  WHERE x.corrida_id = g.corrida_id AND x.dano > 0) r
                          WHERE r.pos <= CASE WHEN g.caiu_em IS NOT NULL OR g.expira_em <= clock_timestamp() THEN 500 ELSE 8 END), '[]'::jsonb))
    FROM public.corrida_guerra g WHERE g.corrida_id = p_corrida;
$function$;

-- A insígnia: quem deu dano numa luta em que o Cavalo da Guerra caiu.
CREATE OR REPLACE FUNCTION public.fn_corrida_guerra_insignias(p_usuario uuid DEFAULT NULL)
RETURNS TABLE (usuario uuid, nome text, foto text, dano numeric, corrida_id bigint, caiu_em timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501'; END IF;
  IF (p_usuario IS NULL OR p_usuario <> auth.uid()) AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: cada um vê a sua; a de todo mundo é do super_admin' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT x.usuario, p.nome, p.foto, x.dano, x.corrida_id, g.caiu_em
      FROM public.corrida_guerra_golpes x
      JOIN public.corrida_guerra g ON g.corrida_id = x.corrida_id AND g.caiu_em IS NOT NULL
      LEFT JOIN public.corrida_pessoas p ON p.corrida_id = x.corrida_id AND p.usuario = x.usuario
     WHERE x.dano > 0 AND (p_usuario IS NULL OR x.usuario = p_usuario)
     ORDER BY x.corrida_id, x.usuario;
END;
$function$;

COMMENT ON FUNCTION public.fn_corrida_guerra_insignias(uuid) IS
  'Insígnia «Cavalo da Guerra»: quem deu dano numa luta em que ele caiu (o seu; sem usuário, o de todo mundo, só o super_admin). Ver 20261023200000.';

REVOKE ALL ON FUNCTION public.fn_corrida_guerra_json(bigint)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_corrida_guerra_insignias(uuid)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_corrida_guerra_insignias(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Para desfazer ──────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.fn_corrida_guerra_insignias(uuid);
-- (o fn_corrida_guerra_json volta rodando a versão anterior da 20261023150000)
