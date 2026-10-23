-- ============================================================================
-- Jumpscare: uma imagem em tela cheia, para todo mundo, num horário marcado
-- 23/10/2026 · pedido do Cleber
-- ============================================================================
--
-- O super_admin envia uma imagem e marca o horário em Configurações > Geral.
-- Na hora, a imagem aparece em tela cheia para todo mundo logado, em todas as
-- empresas, e some sozinha em `duracao_ms` (padrão 300 ms).
--
--   jumpscare             uma linha só (id = 1): o agendamento da vez.
--                         Agendar de novo SUBSTITUI; cancelar apaga a hora.
--   bucket `jumpscare`    a imagem. Privado: só quem está logado baixa, só o
--                         super_admin envia. 2 MB, só imagem.
--
-- «Na hora» é o mesmo caminho da liberação do Halloween (20261001140000): um
-- Broadcast `mudou` no tópico `permissoes:<empresa>` de TODAS as empresas. O
-- tópico já existe, todo mundo logado já o escuta, e a policy de
-- `realtime.messages` não muda. O aviso só leva «mudou»; cada tela relê a
-- linha e marca o timer para o horário — quem entra depois lê ao entrar.
--
-- A imagem não pode ficar presa na tela de ninguém (Cleber, 23/10). O banco
-- segura a parte dele: `duracao_ms` entre 100 e 2000. O resto é da tela
-- (`JumpscareOverlay`).
--
-- Nenhuma linha de dado existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS public.jumpscare (
  id                 SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  imagem_path        TEXT,
  dispara_em         TIMESTAMPTZ,
  duracao_ms         INTEGER NOT NULL DEFAULT 300 CHECK (duracao_ms BETWEEN 100 AND 2000),
  agendado_por       UUID,
  agendado_por_nome  TEXT,
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.jumpscare IS
  'Uma linha = o jumpscare agendado (imagem em tela cheia para todos). Escrita só por '
  'fn_jumpscare_agendar / fn_jumpscare_cancelar (super_admin). Ver 20261023160000.';

ALTER TABLE public.jumpscare ENABLE ROW LEVEL SECURITY;
-- Sem policy: ninguém lê nem escreve direto. A leitura é `fn_jumpscare_ler`,
-- que devolve também o relógio do banco.
REVOKE ALL ON public.jumpscare FROM anon, authenticated;
GRANT ALL ON public.jumpscare TO service_role;

-- ── O aviso: todas as empresas ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_jumpscare_avisar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa uuid;
BEGIN
  FOR v_empresa IN SELECT e.id FROM public.empresas e LOOP
    PERFORM realtime.send(
      jsonb_build_object('tabela', 'jumpscare', 'operacao', tg_op, 'importado_por', '[]'::jsonb),
      'mudou',
      'permissoes:' || v_empresa::text,
      true);
  END LOOP;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_jumpscare_avisar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_jumpscare_avisar ON public.jumpscare;
CREATE TRIGGER trg_jumpscare_avisar
  AFTER INSERT OR UPDATE OR DELETE ON public.jumpscare
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_jumpscare_avisar();

-- ── Ler: o agendamento e o relógio do banco ─────────────────────────────────
-- O relógio vai junto para a tela marcar o timer pela hora do banco, e não
-- pela do computador de cada um (que pode estar minutos fora).
CREATE OR REPLACE FUNCTION public.fn_jumpscare_ler()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'agora',       now(),
    'imagem_path', j.imagem_path,
    'dispara_em',  j.dispara_em,
    'duracao_ms',  j.duracao_ms,
    'agendado_por_nome', CASE WHEN (SELECT public.fn_user_is_super_admin()) THEN j.agendado_por_nome END)
  FROM (SELECT 1) um
  LEFT JOIN public.jumpscare j ON j.id = 1;
$function$;

REVOKE ALL ON FUNCTION public.fn_jumpscare_ler() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_jumpscare_ler() TO authenticated;

-- ── Agendar (substitui o que houver) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_jumpscare_agendar(
  p_imagem_path text, p_dispara_em timestamptz, p_duracao_ms integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_nome text;
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin agenda o jumpscare' USING ERRCODE = '42501';
  END IF;
  IF p_imagem_path IS NULL OR btrim(p_imagem_path) = '' THEN
    RAISE EXCEPTION 'Envie a imagem antes de agendar.' USING ERRCODE = '22023';
  END IF;
  IF p_dispara_em IS NULL OR p_dispara_em < now() + interval '30 seconds' THEN
    -- 30 s: o aviso leva alguns segundos para chegar a todas as telas.
    RAISE EXCEPTION 'O horário precisa ser pelo menos 30 segundos no futuro.' USING ERRCODE = '22023';
  END IF;
  IF p_dispara_em > now() + interval '30 days' THEN
    RAISE EXCEPTION 'O horário pode ser no máximo daqui a 30 dias.' USING ERRCODE = '22023';
  END IF;
  IF p_duracao_ms IS NULL OR p_duracao_ms NOT BETWEEN 100 AND 2000 THEN
    RAISE EXCEPTION 'A duração vai de 100 a 2000 ms.' USING ERRCODE = '22023';
  END IF;

  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = auth.uid();

  INSERT INTO public.jumpscare AS j (id, imagem_path, dispara_em, duracao_ms, agendado_por, agendado_por_nome, atualizado_em)
  VALUES (1, p_imagem_path, p_dispara_em, p_duracao_ms, auth.uid(), v_nome, now())
  ON CONFLICT (id) DO UPDATE
    SET imagem_path = excluded.imagem_path, dispara_em = excluded.dispara_em,
        duracao_ms = excluded.duracao_ms, agendado_por = excluded.agendado_por,
        agendado_por_nome = excluded.agendado_por_nome, atualizado_em = excluded.atualizado_em;

  RETURN public.fn_jumpscare_ler();
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_jumpscare_agendar(text, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_jumpscare_agendar(text, timestamptz, integer) TO authenticated;

-- ── Cancelar: tira a hora (a imagem fica guardada para a próxima) ───────────
CREATE OR REPLACE FUNCTION public.fn_jumpscare_cancelar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin cancela o jumpscare' USING ERRCODE = '42501';
  END IF;
  UPDATE public.jumpscare SET dispara_em = NULL, atualizado_em = now() WHERE id = 1 AND dispara_em IS NOT NULL;
  RETURN public.fn_jumpscare_ler();
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_jumpscare_cancelar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_jumpscare_cancelar() TO authenticated;

-- ── A imagem: bucket `jumpscare` ─────────────────────────────────────────────
DO $storage$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('jumpscare', 'jumpscare', FALSE, 2097152,
          ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
  ON CONFLICT (id) DO UPDATE
    SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

  EXECUTE 'DROP POLICY IF EXISTS jumpscare_ler ON storage.objects';
  EXECUTE $p$CREATE POLICY jumpscare_ler ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'jumpscare')$p$;
  EXECUTE 'DROP POLICY IF EXISTS jumpscare_escrever ON storage.objects';
  EXECUTE $p$CREATE POLICY jumpscare_escrever ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'jumpscare' AND (SELECT public.fn_user_is_super_admin()))$p$;
  EXECUTE 'DROP POLICY IF EXISTS jumpscare_trocar ON storage.objects';
  EXECUTE $p$CREATE POLICY jumpscare_trocar ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'jumpscare' AND (SELECT public.fn_user_is_super_admin()))$p$;
  EXECUTE 'DROP POLICY IF EXISTS jumpscare_apagar ON storage.objects';
  EXECUTE $p$CREATE POLICY jumpscare_apagar ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'jumpscare' AND (SELECT public.fn_user_is_super_admin()))$p$;
END;
$storage$;

-- ── Prova ──────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regclass('public.jumpscare') IS NULL THEN
    RAISE EXCEPTION 'jumpscare: faltou a tabela';
  END IF;
  IF has_table_privilege('authenticated', 'public.jumpscare', 'INSERT')
     OR has_table_privilege('authenticated', 'public.jumpscare', 'SELECT') THEN
    RAISE EXCEPTION 'jumpscare: tabela aberta demais';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_jumpscare_avisar()', 'EXECUTE') THEN
    RAISE EXCEPTION 'jumpscare: função interna aberta demais';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_jumpscare_avisar') THEN
    RAISE EXCEPTION 'jumpscare: faltou o gatilho do aviso';
  END IF;
END;
$prova$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Para desfazer ──────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS jumpscare_ler ON storage.objects;  (e jumpscare_escrever, jumpscare_trocar, jumpscare_apagar)
-- DROP FUNCTION IF EXISTS public.fn_jumpscare_cancelar(), public.fn_jumpscare_agendar(text, timestamptz, integer),
--   public.fn_jumpscare_ler();
-- DROP TABLE IF EXISTS public.jumpscare;  (leva o gatilho junto)
-- DROP FUNCTION IF EXISTS public.fn_jumpscare_avisar();
-- (o bucket `jumpscare` só sai vazio: apague os arquivos antes, pelo dashboard)
