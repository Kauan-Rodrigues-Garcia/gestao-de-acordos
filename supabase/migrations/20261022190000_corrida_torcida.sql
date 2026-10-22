-- ════════════════════════════════════════════════════════════════════════════
-- Corrida de Cavalos: a torcida durante a corrida (22/10/2026)
--
-- Quem corre ou assiste aperta emoji e «TORCER» durante a corrida. Na própria
-- tela o efeito é na hora; para os outros, a torcida vai JUNTA:
--
--   - cada tela soma os cliques e chama `fn_corrida_torcer` no máximo 1 vez a
--     cada ~3 s (o front segura; aqui também: 2 s por pessoa);
--   - o banco guarda por pessoa (`corrida_torcida`) e manda à sala no máximo
--     1 sinal `torcida` a cada 2 s (`corrida_torcida_envio`), com o barulho
--     somado por cavalo e os emojis desde o último sinal.
--
-- Por quê: mandar cada clique para cada tela seria centenas de milhares de
-- mensagens do Realtime por corrida (a cota estourou em 05/10). Assim são uns
-- 12 sinais por corrida, vezes quem está na sala.
--
-- A torcida não muda o resultado: a corrida já está gravada antes da largada.
-- Ninguém lê estas tabelas direto (RLS sem policy): só pelas funções.
--
-- O sinal vai no tópico `corrida-sala:<id>`; a policy `corrida_sala_receber`
-- (20261020130000) filtra pelo tópico, não pelo evento: nada a mudar nela.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE TABLE IF NOT EXISTS public.corrida_torcida (
  corrida_id bigint      NOT NULL REFERENCES public.corridas(id) ON DELETE CASCADE,
  usuario    uuid        NOT NULL,
  -- para quem torce: o dono do cavalo (quem corre torce para si; quem assiste, para o palpite)
  alvo       uuid,
  barulho    integer     NOT NULL DEFAULT 0,
  emoji      text,
  emoji_em   timestamptz,
  torceu_em  timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (corrida_id, usuario)
);
ALTER TABLE public.corrida_torcida ENABLE ROW LEVEL SECURITY;

-- Quando a sala recebeu o último sinal de torcida: uma linha por corrida.
CREATE TABLE IF NOT EXISTS public.corrida_torcida_envio (
  corrida_id bigint      PRIMARY KEY REFERENCES public.corridas(id) ON DELETE CASCADE,
  enviado_em timestamptz NOT NULL
);
ALTER TABLE public.corrida_torcida_envio ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.corrida_torcida IS
  'Corrida de Cavalos: a torcida de cada pessoa durante a corrida (barulho somado e o último emoji). Só via fn_corrida_torcer. Ver 20261022190000.';
COMMENT ON TABLE public.corrida_torcida_envio IS
  'Corrida de Cavalos: o último sinal de torcida mandado à sala (no máximo 1 a cada 2 s). Ver 20261022190000.';

CREATE OR REPLACE FUNCTION public.fn_corrida_torcer(p_corrida bigint, p_barulho integer, p_emoji text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu    uuid := auth.uid();
  v_agora timestamptz := clock_timestamp();
  v_c     public.corridas%ROWTYPE;
  v_p     public.corrida_pessoas%ROWTYPE;
  v_ult   timestamptz;
  v_ant   timestamptz;
  v_n     integer := LEAST(GREATEST(COALESCE(p_barulho, 0), 0), 60);   -- ~20 cliques/s por 3 s, no máximo
  v_emoji text := CASE WHEN p_emoji IN ('🔥', '👏', '😱', '🐎', '🍀', '🏆', '📣') THEN p_emoji END;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_c FROM public.corridas WHERE id = p_corrida;
  -- da contagem até o fim do replay (a corrida tem ~24 s, mais ~15 s de replay e foto)
  IF NOT FOUND OR v_c.estado <> 'correndo' OR v_c.inicia_em IS NULL
     OR v_agora < v_c.inicia_em - interval '4 seconds' OR v_agora > v_c.inicia_em + interval '45 seconds' THEN
    RETURN jsonb_build_object('agora', v_agora, 'fora', true);
  END IF;
  SELECT * INTO v_p FROM public.corrida_pessoas WHERE corrida_id = p_corrida AND usuario = v_eu;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: você não foi chamado para esta corrida' USING ERRCODE = '42501';
  END IF;

  -- No máximo 1 por 2 s por pessoa: o que vier antes disso é jogado fora (o front já junta).
  SELECT torceu_em INTO v_ult FROM public.corrida_torcida WHERE corrida_id = p_corrida AND usuario = v_eu;
  IF v_ult IS NOT NULL AND v_ult > v_agora - interval '2 seconds' THEN
    RETURN jsonb_build_object('agora', v_agora, 'cedo', true);
  END IF;
  INSERT INTO public.corrida_torcida AS t (corrida_id, usuario, alvo, barulho, emoji, emoji_em, torceu_em)
  VALUES (p_corrida, v_eu, CASE WHEN v_p.corre THEN v_eu ELSE v_p.palpite END, v_n,
          v_emoji, CASE WHEN v_emoji IS NOT NULL THEN v_agora END, v_agora)
  ON CONFLICT (corrida_id, usuario) DO UPDATE
     SET barulho   = t.barulho + EXCLUDED.barulho,
         alvo      = EXCLUDED.alvo,
         emoji     = COALESCE(EXCLUDED.emoji, t.emoji),
         emoji_em  = COALESCE(EXCLUDED.emoji_em, t.emoji_em),
         torceu_em = EXCLUDED.torceu_em;

  -- O sinal da sala: no máximo 1 a cada 2 s. Quem achar a linha travada (outro mandando agora) pula.
  INSERT INTO public.corrida_torcida_envio (corrida_id, enviado_em)
  VALUES (p_corrida, '-infinity') ON CONFLICT (corrida_id) DO NOTHING;
  SELECT enviado_em INTO v_ant FROM public.corrida_torcida_envio
   WHERE corrida_id = p_corrida FOR UPDATE SKIP LOCKED;
  IF FOUND AND v_ant <= v_agora - interval '2 seconds' THEN
    UPDATE public.corrida_torcida_envio SET enviado_em = v_agora WHERE corrida_id = p_corrida;
    PERFORM realtime.send(
      jsonb_build_object(
        'agora', v_agora,
        'barulho', COALESCE((SELECT jsonb_agg(jsonb_build_object('alvo', alvo, 'n', n))
                               FROM (SELECT alvo, sum(barulho)::int AS n FROM public.corrida_torcida
                                      WHERE corrida_id = p_corrida AND alvo IS NOT NULL GROUP BY alvo) b), '[]'::jsonb),
        'gritos', COALESCE((SELECT jsonb_agg(jsonb_build_object('usuario', usuario, 'emoji', emoji))
                              FROM (SELECT usuario, emoji FROM public.corrida_torcida
                                     WHERE corrida_id = p_corrida AND emoji_em > v_ant
                                     ORDER BY emoji_em DESC LIMIT 40) g), '[]'::jsonb)),
      'torcida', 'corrida-sala:' || p_corrida::text, true);
  END IF;
  RETURN jsonb_build_object('agora', v_agora);
END;
$function$;

COMMENT ON FUNCTION public.fn_corrida_torcer(bigint, integer, text) IS
  'Corrida de Cavalos: a torcida de quem foi chamado, da contagem ao fim do replay; no máximo 1 por 2 s por pessoa e 1 sinal à sala a cada 2 s. Não muda o resultado. Ver 20261022190000.';

REVOKE ALL ON FUNCTION public.fn_corrida_torcer(bigint, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_corrida_torcer(bigint, integer, text) TO authenticated;

COMMIT;

-- ── Para desfazer ──────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.fn_corrida_torcer(bigint, integer, text);
-- DROP TABLE IF EXISTS public.corrida_torcida_envio;
-- DROP TABLE IF EXISTS public.corrida_torcida;
