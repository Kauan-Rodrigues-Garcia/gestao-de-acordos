-- ============================================================================
-- Ouvidoria Cofen 3: lixeira, anexos e aviso do retorno fora da aba (09/11/2026)
-- ============================================================================
--
-- Pedido do Cleber (09/11/2026), sobre 20261109120000:
--
--   1. LIXEIRA. Excluir deixa de apagar: a manifestação ganha `excluido_em`
--      e some da lista. Quem gerencia vê a «Lixeira da Ouvidoria» na aba,
--      restaura ou apaga de vez (`fn_ouvidoria_cofen_lixeira`, `_restaurar`,
--      `_apagar_de_vez`). Só apagar de vez é DELETE — e a auditoria guarda.
--
--   2. ANEXOS. Print de conversa, comprovante, áudio de ligação, PDF. Balde
--      privado `ouvidoria` (15 MB por arquivo), caminho
--      `<setor_id>/<manifestacao_id>/<arquivo>`; a tabela `ouvidoria_anexos`
--      é o catálogo. A política do balde pergunta a mesma coisa que as
--      funções: a pessoa alcança a Ouvidoria daquele setor.
--      Atenção: o Storage não deixa apagar arquivo por SQL
--      (`storage.protect_delete`); quem apaga é a tela, pela API.
--
--   3. AVISO FORA DA ABA. A cada 5 minutos o pg_cron roda
--      `fn_ouvidoria_avisar_retornos`: retorno agendado para a próxima hora
--      vira notificação (o sino do sistema) para quem agendou e para quem
--      registrou. `ouvidoria_retorno_avisos` lembra o que já foi avisado
--      (por manifestação + horário: reagendar avisa de novo).
--
-- Nada destrutivo: colunas novas, tabelas novas, funções e um job do cron.
-- Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Lixeira ──────────────────────────────────────────────────────────────

ALTER TABLE public.ouvidoria_manifestacoes
  ADD COLUMN IF NOT EXISTS excluido_em       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excluido_por      UUID REFERENCES public.perfis (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS excluido_por_nome TEXT;

COMMENT ON COLUMN public.ouvidoria_manifestacoes.excluido_em IS
  'Na lixeira da Ouvidoria desde (NULL = ativa). Ver 20261109180000.';

ALTER TABLE public.ouvidoria_andamentos DROP CONSTRAINT IF EXISTS ouvidoria_andamentos_tipo;
ALTER TABLE public.ouvidoria_andamentos ADD CONSTRAINT ouvidoria_andamentos_tipo CHECK (
  tipo IN ('criada', 'status', 'retorno', 'responsavel', 'acompanhamento', 'edicao', 'nota',
           'agendamento', 'ciencia', 'resposta', 'ticket', 'grupo', 'anexo', 'lixeira'));

-- A lista não mostra o que está na lixeira.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_listar(p_setor_id UUID)
RETURNS SETOF public.ouvidoria_manifestacoes
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_ouvidoria_cofen_alcanca(p_setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso à Ouvidoria deste setor.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.* FROM public.ouvidoria_manifestacoes m
     WHERE m.setor_id = p_setor_id
       AND m.excluido_em IS NULL
     ORDER BY m.data_manifestacao DESC, m.numero DESC;
END;
$function$;

-- Excluir = mandar para a lixeira (mesma assinatura de antes; só quem gerencia).
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_excluir(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_m    public.ouvidoria_manifestacoes;
  v_uid  UUID := (SELECT auth.uid());
  v_nome TEXT;
BEGIN
  SELECT * INTO v_m FROM public.ouvidoria_manifestacoes m WHERE m.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manifestação não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.fn_ouvidoria_cofen_alcanca(v_m.setor_id, TRUE) THEN
    RAISE EXCEPTION 'Só quem gerencia a Ouvidoria do setor exclui um registro.' USING ERRCODE = '42501';
  END IF;
  IF v_m.excluido_em IS NOT NULL THEN RETURN; END IF;
  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = v_uid;
  UPDATE public.ouvidoria_manifestacoes SET
    excluido_em = now(), excluido_por = v_uid, excluido_por_nome = v_nome,
    -- Na lixeira não há o que avisar.
    retorno_agendado_em = NULL, retorno_agendado_nota = NULL,
    retorno_agendado_por = NULL, retorno_agendado_por_nome = NULL
   WHERE id = p_id;
  PERFORM public.fn_ouvidoria_andar(p_id, v_m.empresa_id, 'lixeira', 'Foi para a lixeira');
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_lixeira(p_setor_id UUID)
RETURNS SETOF public.ouvidoria_manifestacoes
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_ouvidoria_cofen_alcanca(p_setor_id, TRUE) THEN
    RAISE EXCEPTION 'Só quem gerencia a Ouvidoria do setor vê a lixeira.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.* FROM public.ouvidoria_manifestacoes m
     WHERE m.setor_id = p_setor_id AND m.excluido_em IS NOT NULL
     ORDER BY m.excluido_em DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_restaurar(p_id UUID)
RETURNS public.ouvidoria_manifestacoes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_m public.ouvidoria_manifestacoes;
BEGIN
  SELECT * INTO v_m FROM public.ouvidoria_manifestacoes m WHERE m.id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Manifestação não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.fn_ouvidoria_cofen_alcanca(v_m.setor_id, TRUE) THEN
    RAISE EXCEPTION 'Só quem gerencia a Ouvidoria do setor restaura.' USING ERRCODE = '42501';
  END IF;
  IF v_m.excluido_em IS NULL THEN RETURN v_m; END IF;
  UPDATE public.ouvidoria_manifestacoes SET
    excluido_em = NULL, excluido_por = NULL, excluido_por_nome = NULL, atualizado_em = now()
   WHERE id = p_id RETURNING * INTO v_m;
  PERFORM public.fn_ouvidoria_andar(p_id, v_m.empresa_id, 'lixeira', 'Restaurada da lixeira');
  RETURN v_m;
END;
$function$;

-- Apagar de vez: só da lixeira, só quem gerencia. Devolve os caminhos dos
-- anexos para a tela apagar os arquivos do balde (SQL não apaga no Storage).
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_apagar_de_vez(p_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_m        public.ouvidoria_manifestacoes;
  v_caminhos TEXT[];
BEGIN
  SELECT * INTO v_m FROM public.ouvidoria_manifestacoes m WHERE m.id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Manifestação não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.fn_ouvidoria_cofen_alcanca(v_m.setor_id, TRUE) THEN
    RAISE EXCEPTION 'Só quem gerencia a Ouvidoria do setor apaga de vez.' USING ERRCODE = '42501';
  END IF;
  IF v_m.excluido_em IS NULL THEN
    RAISE EXCEPTION 'Mande para a lixeira antes de apagar de vez.' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(a.caminho), ARRAY[]::TEXT[]) INTO v_caminhos
    FROM public.ouvidoria_anexos a WHERE a.manifestacao_id = p_id;
  DELETE FROM public.ouvidoria_manifestacoes WHERE id = p_id;
  RETURN v_caminhos;
END;
$function$;

-- ── 2. Anexos ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ouvidoria_anexos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  manifestacao_id UUID        NOT NULL REFERENCES public.ouvidoria_manifestacoes (id) ON DELETE CASCADE,
  empresa_id      UUID        NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  setor_id        UUID        NOT NULL REFERENCES public.setores (id),
  caminho         TEXT        NOT NULL,
  nome            TEXT        NOT NULL,
  tipo            TEXT,
  tamanho         BIGINT,
  criado_por      UUID        REFERENCES public.perfis (id) ON DELETE SET NULL,
  criado_por_nome TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ouvidoria_anexos_caminho_unico UNIQUE (caminho),
  CONSTRAINT ouvidoria_anexos_nome CHECK (char_length(btrim(nome)) BETWEEN 1 AND 200),
  CONSTRAINT ouvidoria_anexos_tamanho CHECK (tamanho IS NULL OR tamanho BETWEEN 0 AND 15728640)
);

CREATE INDEX IF NOT EXISTS ouvidoria_anexos_manifestacao
  ON public.ouvidoria_anexos (manifestacao_id, criado_em);

COMMENT ON TABLE public.ouvidoria_anexos IS
  'Catálogo dos arquivos da Ouvidoria Cofen (balde privado `ouvidoria`). Ver 20261109180000.';

ALTER TABLE public.ouvidoria_anexos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ouvidoria_anexos FROM anon, authenticated;

-- O caminho do balde é `<setor_id>/<manifestacao_id>/<arquivo>`. A pessoa
-- alcança o arquivo se alcança a Ouvidoria do setor (e a manifestação é dele).
-- Sem `storage.foldername` de propósito: a função não depende do schema storage.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_anexo_alcanca(p_caminho TEXT, p_gerir BOOLEAN)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN split_part(p_caminho, '/', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR split_part(p_caminho, '/', 2) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN FALSE
    ELSE EXISTS (
      SELECT 1 FROM public.ouvidoria_manifestacoes m
       WHERE m.id = split_part(p_caminho, '/', 2)::UUID
         AND m.setor_id = split_part(p_caminho, '/', 1)::UUID
    ) AND public.fn_ouvidoria_cofen_alcanca(split_part(p_caminho, '/', 1)::UUID, p_gerir)
  END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ouvidoria_anexo_alcanca(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_anexo_alcanca(TEXT, BOOLEAN) TO authenticated;

-- Quem anexou o arquivo (a tabela é fechada; a política do balde pergunta por aqui).
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_anexo_e_meu(p_caminho TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.ouvidoria_anexos a
                  WHERE a.caminho = p_caminho AND a.criado_por = (SELECT auth.uid()));
$function$;

REVOKE ALL ON FUNCTION public.fn_ouvidoria_anexo_e_meu(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_anexo_e_meu(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_anexos(p_id UUID)
RETURNS SETOF public.ouvidoria_anexos
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_setor UUID;
BEGIN
  SELECT m.setor_id INTO v_setor FROM public.ouvidoria_manifestacoes m WHERE m.id = p_id;
  IF v_setor IS NULL OR NOT public.fn_ouvidoria_cofen_alcanca(v_setor, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso a esta manifestação.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT a.* FROM public.ouvidoria_anexos a WHERE a.manifestacao_id = p_id ORDER BY a.criado_em;
END;
$function$;

-- Depois de subir o arquivo no balde, a tela registra no catálogo.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_anexo_registrar(
  p_id UUID, p_caminho TEXT, p_nome TEXT, p_tipo TEXT, p_tamanho BIGINT)
RETURNS public.ouvidoria_anexos
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_m    public.ouvidoria_manifestacoes;
  v_uid  UUID := (SELECT auth.uid());
  v_nome TEXT;
  v_a    public.ouvidoria_anexos;
BEGIN
  SELECT * INTO v_m FROM public.ouvidoria_manifestacoes m WHERE m.id = p_id;
  IF NOT FOUND OR NOT public.fn_ouvidoria_cofen_alcanca(v_m.setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso a esta manifestação.' USING ERRCODE = '42501';
  END IF;
  IF v_m.excluido_em IS NOT NULL THEN
    RAISE EXCEPTION 'A manifestação está na lixeira.' USING ERRCODE = '22023';
  END IF;
  IF p_caminho IS NULL OR p_caminho NOT LIKE v_m.setor_id::TEXT || '/' || v_m.id::TEXT || '/%' THEN
    RAISE EXCEPTION 'Caminho do anexo não é desta manifestação.' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_nome), '') IS NULL THEN
    RAISE EXCEPTION 'O anexo precisa de um nome.' USING ERRCODE = '22023';
  END IF;
  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = v_uid;
  INSERT INTO public.ouvidoria_anexos (manifestacao_id, empresa_id, setor_id, caminho, nome, tipo, tamanho, criado_por, criado_por_nome)
  VALUES (p_id, v_m.empresa_id, v_m.setor_id, p_caminho, left(btrim(p_nome), 200), NULLIF(btrim(p_tipo), ''), p_tamanho, v_uid, v_nome)
  RETURNING * INTO v_a;
  PERFORM public.fn_ouvidoria_andar(p_id, v_m.empresa_id, 'anexo', 'Anexou «' || v_a.nome || '»');
  UPDATE public.ouvidoria_manifestacoes SET atualizado_em = now() WHERE id = p_id;
  RETURN v_a;
END;
$function$;

-- Tira do catálogo (quem anexou ou quem gerencia). A tela apaga o arquivo antes.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_anexo_excluir(p_anexo_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_a public.ouvidoria_anexos;
BEGIN
  SELECT * INTO v_a FROM public.ouvidoria_anexos a WHERE a.id = p_anexo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Anexo não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.fn_ouvidoria_cofen_alcanca(v_a.setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso a esta manifestação.' USING ERRCODE = '42501';
  END IF;
  IF v_a.criado_por IS DISTINCT FROM (SELECT auth.uid()) AND NOT public.fn_ouvidoria_cofen_alcanca(v_a.setor_id, TRUE) THEN
    RAISE EXCEPTION 'Só quem anexou ou quem gerencia a Ouvidoria tira um anexo.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.ouvidoria_anexos WHERE id = p_anexo_id;
  PERFORM public.fn_ouvidoria_andar(v_a.manifestacao_id, v_a.empresa_id, 'anexo', 'Tirou o anexo «' || v_a.nome || '»');
  UPDATE public.ouvidoria_manifestacoes SET atualizado_em = now() WHERE id = v_a.manifestacao_id;
END;
$function$;

-- O balde e as políticas (só onde há Storage: o teste local não tem).
DO $storage$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('ouvidoria', 'ouvidoria', FALSE, 15728640, ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic',
    'application/pdf', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/aac',
    'video/mp4'])
  ON CONFLICT (id) DO UPDATE
    SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

  EXECUTE 'DROP POLICY IF EXISTS ouvidoria_anexo_ler ON storage.objects';
  EXECUTE $p$CREATE POLICY ouvidoria_anexo_ler ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'ouvidoria' AND (SELECT public.fn_ouvidoria_anexo_alcanca(name, FALSE)))$p$;
  EXECUTE 'DROP POLICY IF EXISTS ouvidoria_anexo_enviar ON storage.objects';
  EXECUTE $p$CREATE POLICY ouvidoria_anexo_enviar ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'ouvidoria' AND (SELECT public.fn_ouvidoria_anexo_alcanca(name, FALSE)))$p$;
  -- Apagar: quem gerencia, ou quem anexou (o catálogo ainda tem a linha).
  EXECUTE 'DROP POLICY IF EXISTS ouvidoria_anexo_apagar ON storage.objects';
  EXECUTE $p$CREATE POLICY ouvidoria_anexo_apagar ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'ouvidoria' AND (
      (SELECT public.fn_ouvidoria_anexo_alcanca(name, TRUE))
      OR (SELECT public.fn_ouvidoria_anexo_e_meu(name))
    ))$p$;
END;
$storage$;

-- ── 3. Aviso do retorno agendado fora da aba ────────────────────────────────

-- O que já foi avisado: manifestação + horário. Reagendar = horário novo = aviso novo.
CREATE TABLE IF NOT EXISTS public.ouvidoria_retorno_avisos (
  manifestacao_id UUID        NOT NULL REFERENCES public.ouvidoria_manifestacoes (id) ON DELETE CASCADE,
  agendado_em     TIMESTAMPTZ NOT NULL,
  avisado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (manifestacao_id, agendado_em)
);

ALTER TABLE public.ouvidoria_retorno_avisos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ouvidoria_retorno_avisos FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS ouvidoria_manifestacoes_retorno_agendado
  ON public.ouvidoria_manifestacoes (retorno_agendado_em) WHERE retorno_agendado_em IS NOT NULL;

-- Retorno agendado para a próxima hora (ou que passou há menos de 1 dia sem
-- aviso, se o cron ficou parado) vira notificação para quem agendou e para
-- quem registrou. Devolve quantas manifestações avisou.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_avisar_retornos()
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r     RECORD;
  v_qtd INTEGER := 0;
  v_txt TEXT;
BEGIN
  FOR r IN
    SELECT m.* FROM public.ouvidoria_manifestacoes m
     WHERE m.retorno_agendado_em IS NOT NULL
       AND m.retorno_agendado_em <= now() + INTERVAL '60 minutes'
       AND m.retorno_agendado_em >  now() - INTERVAL '1 day'
       AND m.status <> 'concluido'
       AND m.acompanhar
       AND m.excluido_em IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.ouvidoria_retorno_avisos v
                        WHERE v.manifestacao_id = m.id AND v.agendado_em = m.retorno_agendado_em)
  LOOP
    INSERT INTO public.ouvidoria_retorno_avisos (manifestacao_id, agendado_em)
    VALUES (r.id, r.retorno_agendado_em) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_txt := format('Dar retorno a %s (%s) às %s%s.',
                    r.nome_profissional, r.codigo,
                    to_char(r.retorno_agendado_em AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
                    COALESCE(' — ' || r.retorno_agendado_nota, ''));
    INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, rota, autor_nome)
    SELECT DISTINCT u, 'Ouvidoria: retorno agendado', v_txt, r.empresa_id, '/ouvidoria?m=' || r.id::TEXT, 'Ouvidoria'
      FROM unnest(ARRAY[r.retorno_agendado_por, r.criado_por]) u
     WHERE u IS NOT NULL;
    v_qtd := v_qtd + 1;
  END LOOP;

  -- O que já passou faz tempo não precisa ficar guardado.
  DELETE FROM public.ouvidoria_retorno_avisos WHERE agendado_em < now() - INTERVAL '7 days';
  RETURN v_qtd;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ouvidoria_avisar_retornos() FROM PUBLIC, anon, authenticated;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'ouvidoria-avisar-retornos';
    PERFORM cron.schedule('ouvidoria-avisar-retornos', '*/5 * * * *',
                          $job$SELECT public.fn_ouvidoria_avisar_retornos()$job$);
  END IF;
END
$cron$;

-- ── 4. Permissões de execução ───────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_lixeira(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_restaurar(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_apagar_de_vez(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_anexos(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_anexo_registrar(UUID, TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_anexo_excluir(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_lixeira(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_restaurar(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_apagar_de_vez(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_anexos(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_anexo_registrar(UUID, TEXT, TEXT, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_anexo_excluir(UUID) TO authenticated;

-- ── 5. Prova ────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'ouvidoria_manifestacoes' AND column_name = 'excluido_em') THEN
    RAISE EXCEPTION 'Faltou a coluna excluido_em.';
  END IF;
  IF to_regclass('public.ouvidoria_anexos') IS NULL OR to_regclass('public.ouvidoria_retorno_avisos') IS NULL THEN
    RAISE EXCEPTION 'Faltou tabela de anexos ou de avisos.';
  END IF;
  IF to_regprocedure('public.fn_ouvidoria_avisar_retornos()') IS NULL
     OR to_regprocedure('public.fn_ouvidoria_cofen_restaurar(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Alguma função nova da Ouvidoria não foi criada.';
  END IF;
END
$prova$;

COMMIT;
