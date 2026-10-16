-- ============================================================================
-- Caça às Bruxas: a chefona leva a HORA DO BANCO no estado
-- ============================================================================
--
-- ## Por quê (auditoria de 16/10/2026)
--
-- Cada tela decide QUANDO a bruxa nasce comparando o `solta_em` do banco com o
-- relógio do próprio computador. Um computador com o relógio adiantado 20 s
-- vê a bruxa 20 s antes — e os tiros dele nesses 20 s voltam como «ainda na
-- contagem»; atrasado, ela chega depois para ele, e a música do lobby perde o
-- drop junto com a chegada dos outros.
--
-- Agora o estado leva `agora` (a hora do banco quando o estado saiu). O app
-- mede a diferença para o próprio relógio e ajusta todos os horários da
-- chefona (`banco.ts`, `ajustarRelogio`). Sem esta migration o app segue como
-- antes (sem `agora`, sem ajuste).
--
-- Só redefine `fn_chefona_estado` (a da 20261016120000, com `agora` a mais).
-- Reexecutável.
-- ============================================================================

BEGIN;

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
             SELECT jsonb_agg(jsonb_build_object('usuario', t.usuario, 'nome', t.nome, 'setor', t.setor)
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

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Para desfazer: reaplicar a `fn_chefona_estado` da 20261016120000.
