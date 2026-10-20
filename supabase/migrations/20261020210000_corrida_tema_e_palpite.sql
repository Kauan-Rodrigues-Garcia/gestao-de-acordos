-- ============================================================================
-- Corrida da Sorte: o cenário do lobby e o palpite no vencedor — 20/10/2026
-- ============================================================================
--
-- Pedido do Cleber:
--   1. Três cenários novos de lobby (A · pit lane noturno, B · tarde no
--      hipódromo, C · estúdio ao vivo); o super_admin escolhe um ao montar a
--      corrida. Fica em `corridas.tema` e vai no JSON da corrida.
--   2. O palpite: quem foi chamado clica num corredor do lobby e aposta nele
--      (só por diversão, sem prêmio). Fica em `corrida_pessoas.palpite`, vai no
--      JSON de cada pessoa, e cada palpite avisa a sala com um recado pequeno
--      (`palpite`: quem e em quem), sem reler nada.
--
-- Palpite só com o lobby aberto e antes da largada, só em quem corre, e no
-- máximo um por segundo por pessoa (clicar sem parar não vira enxurrada de
-- avisos no Realtime).
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

ALTER TABLE public.corridas ADD COLUMN IF NOT EXISTS tema TEXT NOT NULL DEFAULT 'f1'
  CHECK (tema IN ('f1', 'hipodromo', 'tv', 'atual'));
ALTER TABLE public.corrida_pessoas ADD COLUMN IF NOT EXISTS palpite UUID;
ALTER TABLE public.corrida_pessoas ADD COLUMN IF NOT EXISTS palpite_em TIMESTAMPTZ;

-- ── Os JSONs ganham o tema e o palpite ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corrida_json(p_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'premio', c.premio, 'estado', c.estado, 'versao', c.versao, 'tema', c.tema,
    'criada_em', c.criada_em, 'aberta_em', c.aberta_em, 'gravada_em', c.gravada_em,
    'inicia_em', c.inicia_em, 'encerrada_em', c.encerrada_em,
    'gravacao', c.gravacao, 'vencedor', c.vencedor, 'vencedor_nome', c.vencedor_nome,
    'corredores', (SELECT count(*) FROM public.corrida_pessoas p WHERE p.corrida_id = c.id AND p.corre),
    'chamados',   (SELECT count(*) FROM public.corrida_pessoas p WHERE p.corrida_id = c.id),
    'escolheram', (SELECT count(*) FROM public.corrida_pessoas p WHERE p.corrida_id = c.id AND p.corre AND p.escolha IS NOT NULL),
    'no_lobby',   (SELECT count(*) FROM public.corrida_pessoas p WHERE p.corrida_id = c.id AND p.entrou_em IS NOT NULL)
  )
  FROM public.corridas c
  WHERE c.id = p_id;
$function$;

CREATE OR REPLACE FUNCTION public.fn_corrida_pessoa_json(p public.corrida_pessoas)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'usuario', p.usuario, 'nome', p.nome, 'setor', p.setor, 'foto', p.foto,
    'corre', p.corre, 'assiste', p.assiste, 'escolha', p.escolha, 'entrou_em', p.entrou_em,
    'palpite', p.palpite
  );
$function$;

-- ── O cenário do lobby ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corrida_tema(p_corrida bigint, p_tema text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.fn_corrida_exigir_admin();
  IF p_tema IS NULL OR p_tema NOT IN ('f1', 'hipodromo', 'tv', 'atual') THEN
    RAISE EXCEPTION 'TEMA_INVALIDO' USING ERRCODE = '22023';
  END IF;
  UPDATE public.corridas SET tema = p_tema, versao = versao + 1
   WHERE id = p_corrida AND estado IN ('preparando', 'aberta') AND inicia_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_DA: o cenário só muda antes da largada' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.fn_corrida_avisar_sala(p_corrida, 'estado');
  RETURN public.fn_corrida_painel();
END;
$function$;

-- ── O palpite ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corrida_palpitar(p_corrida bigint, p_alvo uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu uuid := auth.uid();
  v_c  public.corridas%ROWTYPE;
  v_p  public.corrida_pessoas%ROWTYPE;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_c FROM public.corridas WHERE id = p_corrida;
  IF NOT FOUND OR v_c.estado <> 'aberta' OR v_c.inicia_em IS NOT NULL THEN
    RAISE EXCEPTION 'PALPITE_FECHADO: o palpite fecha na largada' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_p FROM public.corrida_pessoas WHERE corrida_id = p_corrida AND usuario = v_eu;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: você não foi chamado para esta corrida' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.corrida_pessoas
                  WHERE corrida_id = p_corrida AND usuario = p_alvo AND corre
                    AND (escolha IS NOT NULL OR v_c.gravada_em IS NOT NULL)) THEN
    RAISE EXCEPTION 'ALVO_INVALIDO: só dá para apostar em quem está no grid' USING ERRCODE = '22023';
  END IF;
  -- O mesmo palpite, ou outro em menos de 1 s: fica como está, sem aviso.
  IF v_p.palpite IS NOT DISTINCT FROM p_alvo OR v_p.palpite_em > clock_timestamp() - interval '1 second' THEN
    RETURN jsonb_build_object('agora', clock_timestamp(), 'palpite', v_p.palpite);
  END IF;
  UPDATE public.corrida_pessoas SET palpite = p_alvo, palpite_em = clock_timestamp()
   WHERE corrida_id = p_corrida AND usuario = v_eu;
  PERFORM realtime.send(jsonb_build_object('usuario', v_eu, 'palpite', p_alvo),
                        'palpite', 'corrida-sala:' || p_corrida::text, true);
  RETURN jsonb_build_object('agora', clock_timestamp(), 'palpite', p_alvo);
END;
$function$;

COMMENT ON FUNCTION public.fn_corrida_tema(bigint, text) IS
  'Corrida da Sorte: o cenário do lobby (f1, hipodromo, tv ou atual), só antes da largada. Ver 20261020210000.';
COMMENT ON FUNCTION public.fn_corrida_palpitar(bigint, uuid) IS
  'Corrida da Sorte: o palpite de quem foi chamado num corredor do grid, com o lobby aberto e antes da largada; no máximo 1 por segundo. Ver 20261020210000.';

REVOKE ALL ON FUNCTION public.fn_corrida_tema(bigint, text)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_corrida_palpitar(bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_corrida_tema(bigint, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_corrida_palpitar(bigint, uuid) TO authenticated;

COMMIT;
