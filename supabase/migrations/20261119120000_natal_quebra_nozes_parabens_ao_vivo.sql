-- ============================================================================
-- Parabéns ao vivo nos destaques dos quebra-nozes (parte 2)
-- Cleber, 18–19/11/2026. Spec: docs/superpowers/specs/2026-11-18-parabens-quebra-nozes-design.md
--
-- O balão de parabéns de uma pessoa chega na tela dos colegas da mesma cidade.
-- Nada fica guardado: é um Broadcast privado, tópico `natal_parabens:<cidade>`,
-- evento `parabens`, payload {chave, pessoa, nome, foto, frase}.
--
--   fn_natal_quebra_nozes_parabenizar(p_chave, p_frase, p_cidade)
--       SECURITY DEFINER. Nome e foto saem do login (perfis), nunca do cliente;
--       o cliente manda só a chave do show e o índice da frase. `p_cidade` só
--       vale para o super admin (ele acompanha as duas cidades).
--       Freio: 1 envio a cada 2 s por cidade (linha em
--       natal_quebra_nozes_parabens_freio). Quem perde o freio recebe false e
--       fica só com o balão na própria tela.
--
--   fn_natal_quebra_nozes_posso_ouvir(p_topico)
--       usada pela policy `natal_parabens_receber` em realtime.messages: ouve
--       quem é da cidade do tópico, e o super admin ouve as duas.
--
-- O freio existe porque cada balão vai para ~300 pessoas por cidade, e às 10h
-- as duas cidades sobem juntas: 2 cidades × 300 / 2 s ≈ 300 mensagens/s.
--
-- Nenhuma linha de dado existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── Freio por cidade ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.natal_quebra_nozes_parabens_freio (
  cidade TEXT PRIMARY KEY CHECK (cidade IN ('birigui', 'marilia')),
  ultimo TIMESTAMPTZ NOT NULL DEFAULT '-infinity'
);

COMMENT ON TABLE public.natal_quebra_nozes_parabens_freio IS
  'Último parabéns enviado por cidade; fn_natal_quebra_nozes_parabenizar deixa passar 1 a cada 2 s. Ver 20261119120000.';

ALTER TABLE public.natal_quebra_nozes_parabens_freio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.natal_quebra_nozes_parabens_freio FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.natal_quebra_nozes_parabens_freio TO service_role;

INSERT INTO public.natal_quebra_nozes_parabens_freio (cidade)
VALUES ('birigui'), ('marilia')
ON CONFLICT (cidade) DO NOTHING;

-- ── Envio ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_natal_quebra_nozes_parabenizar(
  p_chave  TEXT,
  p_frase  INTEGER,
  p_cidade TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid    UUID := auth.uid();
  v_cidade TEXT;
  v_nome   TEXT;
  v_foto   TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  IF p_chave IS NULL OR length(p_chave) = 0 OR length(p_chave) > 120 THEN
    RETURN false;
  END IF;
  IF p_frase IS NULL OR p_frase < 0 OR p_frase > 31 THEN
    RETURN false;
  END IF;

  v_cidade := CASE
    WHEN p_cidade IN ('birigui', 'marilia') AND public.fn_user_is_super_admin() THEN p_cidade
    ELSE public.fn_natal_cidade_de(v_uid)
  END;
  IF v_cidade IS NULL OR v_cidade NOT IN ('birigui', 'marilia') THEN
    RETURN false;
  END IF;

  -- 1 a cada 2 s por cidade. Linha travada por pouquíssimo tempo; quem chega
  -- junto e perde a corrida simplesmente não passa.
  UPDATE public.natal_quebra_nozes_parabens_freio f
     SET ultimo = now()
   WHERE f.cidade = v_cidade
     AND f.ultimo < now() - INTERVAL '2 seconds';
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT btrim(p.nome), NULLIF(btrim(p.foto_url), '')
    INTO v_nome, v_foto
    FROM public.perfis p
   WHERE p.id = v_uid;
  IF v_nome IS NULL OR v_nome = '' THEN
    RETURN false;
  END IF;

  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('chave', p_chave, 'pessoa', v_uid, 'nome', v_nome, 'foto', v_foto, 'frase', p_frase),
      'parabens', 'natal_parabens:' || v_cidade, true);
  EXCEPTION WHEN OTHERS THEN
    RETURN false;  -- o show segue; a pessoa fica com o próprio balão
  END;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_quebra_nozes_parabenizar(TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_quebra_nozes_parabenizar(TEXT, INTEGER, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_natal_quebra_nozes_parabenizar(TEXT, INTEGER, TEXT) IS
  'Parabéns ao vivo nos destaques dos quebra-nozes: Broadcast em natal_parabens:<cidade>, 1 a cada 2 s por cidade. Ver 20261119120000.';

-- ── Quem ouve ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_natal_quebra_nozes_posso_ouvir(p_topico TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p_topico IN ('natal_parabens:birigui', 'natal_parabens:marilia')
     AND auth.uid() IS NOT NULL
     AND (public.fn_user_is_super_admin()
          OR p_topico = 'natal_parabens:' || public.fn_natal_cidade_de(auth.uid()))
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_quebra_nozes_posso_ouvir(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_quebra_nozes_posso_ouvir(TEXT) TO authenticated;

DROP POLICY IF EXISTS natal_parabens_receber ON realtime.messages;
CREATE POLICY natal_parabens_receber ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    extension = 'broadcast'
    AND (SELECT realtime.topic()) LIKE 'natal_parabens:%'
    AND (SELECT public.fn_natal_quebra_nozes_posso_ouvir((SELECT realtime.topic())))
  );

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regprocedure('public.fn_natal_quebra_nozes_parabenizar(text,integer,text)') IS NULL THEN
    RAISE EXCEPTION 'fn_natal_quebra_nozes_parabenizar não foi criada';
  END IF;
  IF to_regprocedure('public.fn_natal_quebra_nozes_posso_ouvir(text)') IS NULL THEN
    RAISE EXCEPTION 'fn_natal_quebra_nozes_posso_ouvir não foi criada';
  END IF;
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'realtime.send não existe com a assinatura esperada';
  END IF;
  IF (SELECT count(*) FROM public.natal_quebra_nozes_parabens_freio) <> 2 THEN
    RAISE EXCEPTION 'freio sem as duas cidades';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'realtime' AND tablename = 'messages'
                    AND policyname = 'natal_parabens_receber') THEN
    RAISE EXCEPTION 'policy natal_parabens_receber não foi criada';
  END IF;
END
$prova$;

COMMIT;
