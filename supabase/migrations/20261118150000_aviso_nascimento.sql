-- ============================================================================
-- Aviso de nascimento para um setor (18/11/2026)
-- ============================================================================
--
-- O super_admin prepara o aviso, envia a foto e libera em Configurações › Geral.
-- Ao liberar, o card abre para todas as pessoas ativas cujo SETOR DO CADASTRO é
-- o setor do aviso. Elas podem deixar um recadinho, que só administrador e
-- super_admin leem.
--
--   avisos_nascimento           o aviso: setor, textos, foto e situação.
--   avisos_nascimento_vistas    quem já abriu o livro.
--   avisos_nascimento_recados   um recadinho por pessoa (editável).
--   bucket avisos-nascimento    PRIVADO. A foto só sai por URL assinada, para
--                               admin e, depois de liberar, para o setor.
--
-- Nomes e textos NÃO moram aqui: este repositório é público. A linha do aviso
-- é criada à parte, direto no banco, e a foto é enviada pela tela.
--
-- As tabelas não têm policy nem GRANT: tudo passa pelas funções abaixo.
-- Nenhuma tabela existente muda. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS public.avisos_nascimento (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor_id        UUID NOT NULL REFERENCES public.setores(id),
  conteudo        JSONB NOT NULL DEFAULT '{}'::jsonb,
  foto_caminho    TEXT,
  homenageada_id  UUID,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  liberado_em     TIMESTAMPTZ,
  liberado_por    UUID,
  encerrado_em    TIMESTAMPTZ,
  encerrado_por   UUID,
  CONSTRAINT an_conteudo CHECK (jsonb_typeof(conteudo) = 'object' AND pg_column_size(conteudo) <= 20000)
);

COMMENT ON TABLE public.avisos_nascimento IS
  'Aviso de nascimento para um setor. Escrita só pelas fn_nascimento_*. Ver 20261118150000.';

CREATE TABLE IF NOT EXISTS public.avisos_nascimento_vistas (
  aviso_id   UUID NOT NULL REFERENCES public.avisos_nascimento(id) ON DELETE CASCADE,
  perfil_id  UUID NOT NULL,
  vista_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (aviso_id, perfil_id)
);

CREATE TABLE IF NOT EXISTS public.avisos_nascimento_recados (
  aviso_id   UUID NOT NULL REFERENCES public.avisos_nascimento(id) ON DELETE CASCADE,
  perfil_id  UUID NOT NULL,
  texto      TEXT NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  editado_em TIMESTAMPTZ,
  PRIMARY KEY (aviso_id, perfil_id),
  CONSTRAINT anr_texto CHECK (char_length(btrim(texto)) BETWEEN 3 AND 280)
);

ALTER TABLE public.avisos_nascimento         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avisos_nascimento_vistas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avisos_nascimento_recados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.avisos_nascimento, public.avisos_nascimento_vistas, public.avisos_nascimento_recados
  FROM PUBLIC, anon, authenticated;

-- ── Ajudantes ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_nascimento_e_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis p
     WHERE p.id = (SELECT auth.uid()) AND p.ativo
       AND p.perfil::text IN ('administrador', 'super_admin'));
$$;

CREATE OR REPLACE FUNCTION public.fn_nascimento_e_para(p_setor UUID, p_perfil UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis p
     WHERE p.id = p_perfil AND p.ativo AND p.setor_id = p_setor);
$$;

-- Os avisos cuja foto eu posso abrir: admin vê todos; o setor, só os liberados.
CREATE OR REPLACE FUNCTION public.fn_nascimento_ids_visiveis()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT a.id::text
    FROM public.avisos_nascimento a
   WHERE public.fn_nascimento_e_admin()
      OR (a.liberado_em IS NOT NULL AND a.encerrado_em IS NULL
          AND public.fn_nascimento_e_para(a.setor_id, (SELECT auth.uid())));
$$;

-- O sinal vai no tópico `permissoes` da empresa do setor. Ele não traz nome nem
-- texto: só diz qual setor deve reler.
CREATE OR REPLACE FUNCTION public.fn_nascimento_avisar(p_setor UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_empresa UUID;
BEGIN
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RETURN;
  END IF;
  SELECT s.empresa_id INTO v_empresa FROM public.setores s WHERE s.id = p_setor;
  IF v_empresa IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object('tabela', 'aviso_nascimento:' || p_setor::text, 'operacao', 'UPDATE', 'importado_por', '[]'::jsonb),
      'mudou',
      'permissoes:' || v_empresa::text,
      true);
  END IF;
END;
$$;

-- ── Painel (administrador e super_admin) ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_nascimento_painel()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT public.fn_nascimento_e_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só administrador e super_admin acompanham o aviso' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'setor_id', a.setor_id, 'setor_nome', s.nome, 'conteudo', a.conteudo,
      'foto_caminho', a.foto_caminho, 'homenageada_id', a.homenageada_id,
      'liberado_em', a.liberado_em, 'encerrado_em', a.encerrado_em,
      'posso_liberar', (SELECT public.fn_user_is_super_admin()),
      'pessoas', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', p.id, 'nome', p.nome, 'cargo', p.perfil::text,
          'no_publico', (p.ativo AND p.setor_id = a.setor_id),
          'viu_em', v.vista_em, 'recado', r.texto, 'recado_em', COALESCE(r.editado_em, r.criado_em))
          ORDER BY p.nome), '[]'::jsonb)
        FROM public.perfis p
        LEFT JOIN public.avisos_nascimento_vistas v ON v.aviso_id = a.id AND v.perfil_id = p.id
        LEFT JOIN public.avisos_nascimento_recados r ON r.aviso_id = a.id AND r.perfil_id = p.id
        WHERE (p.ativo AND p.setor_id = a.setor_id) OR r.perfil_id IS NOT NULL))
      ORDER BY a.criado_em DESC), '[]'::jsonb)
    FROM public.avisos_nascimento a
    JOIN public.setores s ON s.id = a.setor_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_nascimento_definir_foto(p_id UUID, p_caminho TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin troca a foto' USING ERRCODE = '42501';
  END IF;
  IF p_caminho IS NULL OR p_caminho NOT LIKE p_id::text || '/%' THEN
    RAISE EXCEPTION 'Caminho de foto inválido.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.avisos_nascimento SET foto_caminho = p_caminho WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aviso não encontrado.' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_nascimento_liberar(p_id UUID, p_liberar BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_aviso public.avisos_nascimento;
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin libera o aviso' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_aviso FROM public.avisos_nascimento WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aviso não encontrado.' USING ERRCODE = '22023';
  END IF;
  IF p_liberar THEN
    IF v_aviso.foto_caminho IS NULL THEN
      RAISE EXCEPTION 'Envie a foto antes de liberar.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.avisos_nascimento
       SET liberado_em = NOW(), liberado_por = auth.uid(), encerrado_em = NULL, encerrado_por = NULL
     WHERE id = p_id;
  ELSE
    UPDATE public.avisos_nascimento SET encerrado_em = NOW(), encerrado_por = auth.uid() WHERE id = p_id;
  END IF;
  PERFORM public.fn_nascimento_avisar(v_aviso.setor_id);
END;
$$;

-- ── Quem é do setor ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_nascimento_meu()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id, 'conteudo', a.conteudo, 'foto_caminho', a.foto_caminho,
    'pode_recado', a.homenageada_id IS DISTINCT FROM (SELECT auth.uid()),
    'vi', EXISTS (SELECT 1 FROM public.avisos_nascimento_vistas v
                   WHERE v.aviso_id = a.id AND v.perfil_id = (SELECT auth.uid())),
    'meu_recado', (SELECT r.texto FROM public.avisos_nascimento_recados r
                    WHERE r.aviso_id = a.id AND r.perfil_id = (SELECT auth.uid())))
    ORDER BY a.liberado_em), '[]'::jsonb)
  FROM public.avisos_nascimento a
  WHERE a.liberado_em IS NOT NULL
    AND a.encerrado_em IS NULL
    AND a.foto_caminho IS NOT NULL
    AND public.fn_nascimento_e_para(a.setor_id, (SELECT auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.fn_nascimento_vi(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_eu UUID := auth.uid();
BEGIN
  IF v_eu IS NULL THEN RETURN; END IF;
  INSERT INTO public.avisos_nascimento_vistas (aviso_id, perfil_id)
  SELECT a.id, v_eu FROM public.avisos_nascimento a
   WHERE a.id = p_id AND a.liberado_em IS NOT NULL AND a.encerrado_em IS NULL
     AND public.fn_nascimento_e_para(a.setor_id, v_eu)
  ON CONFLICT (aviso_id, perfil_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_nascimento_recado(p_id UUID, p_texto TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_eu    UUID := auth.uid();
  v_texto TEXT := btrim(COALESCE(p_texto, ''));
BEGIN
  IF char_length(v_texto) NOT BETWEEN 3 AND 280 THEN
    RAISE EXCEPTION 'O recadinho precisa ter de 3 a 280 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.avisos_nascimento a
     WHERE a.id = p_id AND a.liberado_em IS NOT NULL AND a.encerrado_em IS NULL
       AND a.homenageada_id IS DISTINCT FROM v_eu
       AND public.fn_nascimento_e_para(a.setor_id, v_eu)
  ) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: este recadinho não está aberto para você' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.avisos_nascimento_recados (aviso_id, perfil_id, texto)
  VALUES (p_id, v_eu, v_texto)
  ON CONFLICT (aviso_id, perfil_id) DO UPDATE SET texto = EXCLUDED.texto, editado_em = NOW();
END;
$$;

-- ── Permissões ──────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.fn_nascimento_e_admin()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_nascimento_e_para(UUID, UUID)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_nascimento_avisar(UUID)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_nascimento_ids_visiveis()             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_nascimento_painel()                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_nascimento_definir_foto(UUID, TEXT)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_nascimento_liberar(UUID, BOOLEAN)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_nascimento_meu()                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_nascimento_vi(UUID)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_nascimento_recado(UUID, TEXT)         FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_nascimento_ids_visiveis()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nascimento_painel()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nascimento_definir_foto(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nascimento_liberar(UUID, BOOLEAN)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nascimento_meu()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nascimento_vi(UUID)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nascimento_recado(UUID, TEXT)       TO authenticated;

-- ── Foto: bucket privado ────────────────────────────────────────────────────
-- Só onde existe o storage do Supabase (o teste local roda sem ele).

DO $storage$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('avisos-nascimento', 'avisos-nascimento', false, 8388608, ARRAY['image/png','image/jpeg','image/webp'])
  ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
                                 allowed_mime_types = EXCLUDED.allowed_mime_types;

  DROP POLICY IF EXISTS "avisos-nascimento: quem pode ve" ON storage.objects;
  CREATE POLICY "avisos-nascimento: quem pode ve" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'avisos-nascimento'
           AND split_part(name, '/', 1) IN (SELECT public.fn_nascimento_ids_visiveis()));

  DROP POLICY IF EXISTS "avisos-nascimento: super_admin envia" ON storage.objects;
  CREATE POLICY "avisos-nascimento: super_admin envia" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avisos-nascimento' AND (SELECT public.fn_user_is_super_admin()));

  DROP POLICY IF EXISTS "avisos-nascimento: super_admin troca" ON storage.objects;
  CREATE POLICY "avisos-nascimento: super_admin troca" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'avisos-nascimento' AND (SELECT public.fn_user_is_super_admin()));

  DROP POLICY IF EXISTS "avisos-nascimento: super_admin apaga" ON storage.objects;
  CREATE POLICY "avisos-nascimento: super_admin apaga" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'avisos-nascimento' AND (SELECT public.fn_user_is_super_admin()));
END
$storage$;

COMMIT;
