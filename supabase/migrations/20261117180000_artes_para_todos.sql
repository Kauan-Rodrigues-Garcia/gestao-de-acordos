-- ============================================================================
-- Artes para todos (17/11/2026)
-- ============================================================================
--
-- Pedido do usuário: «uma ferramenta em Eventos que lança sempre uma arte que
-- a gente escolher e aparece para todos — cards, entre outros».
--
-- O super_admin escolhe o modelo (Deu a louca na gerente, Parabéns, Recado,
-- Imagem própria), preenche, escolhe as cores, para quem (todo mundo ou os
-- setores marcados) e o período, e lança. A arte abre sozinha na tela de cada
-- pessoa, uma vez; quem já viu fica registrado (o painel mostra «viram X de Y»).
--
--   artes_lancadas   a arte: modelo, conteúdo (jsonb), cores, setores (nulo =
--                    todo mundo), início, fim (nulo = até encerrar), encerrada.
--   artes_vistas     quem já viu, e quando.
--   bucket «artes»   as imagens próprias (PNG/JPG feitos no Canva…). Leitura
--                    pública; enviar e apagar só super_admin.
--
-- As tabelas não têm policy: leitura e escrita só pelas funções abaixo.
-- Nenhuma tabela existente muda. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── Tabelas ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.artes_lancadas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo         TEXT NOT NULL,
  modelo         TEXT NOT NULL,
  conteudo       JSONB NOT NULL DEFAULT '{}'::jsonb,
  tema           TEXT NOT NULL DEFAULT 'amarelo',
  setores        UUID[],
  inicio         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fim            TIMESTAMPTZ,
  criada_por     UUID,
  criada_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  encerrada_por  UUID,
  encerrada_em   TIMESTAMPTZ,
  CONSTRAINT al_titulo   CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 120),
  CONSTRAINT al_modelo   CHECK (modelo IN ('deu-a-louca','parabens','recado','imagem')),
  CONSTRAINT al_tema     CHECK (tema IN ('amarelo','ouro','fogo','oceano','claro')),
  CONSTRAINT al_conteudo CHECK (jsonb_typeof(conteudo) = 'object' AND pg_column_size(conteudo) <= 20000),
  CONSTRAINT al_periodo  CHECK (fim IS NULL OR fim > inicio),
  CONSTRAINT al_setores  CHECK (setores IS NULL OR cardinality(setores) >= 1)
);

COMMENT ON TABLE public.artes_lancadas IS
  'Arte lançada para todos (ou setores) pelo super_admin. Escrita só pelas fn_artes_*. Ver 20261117180000.';

CREATE INDEX IF NOT EXISTS idx_artes_lancadas_no_ar ON public.artes_lancadas (inicio DESC) WHERE encerrada_em IS NULL;

CREATE TABLE IF NOT EXISTS public.artes_vistas (
  arte_id    UUID NOT NULL REFERENCES public.artes_lancadas(id) ON DELETE CASCADE,
  perfil_id  UUID NOT NULL,
  vista_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (arte_id, perfil_id)
);

COMMENT ON TABLE public.artes_vistas IS 'Quem já viu cada arte (a arte abre sozinha uma vez por pessoa).';

ALTER TABLE public.artes_lancadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artes_vistas   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.artes_lancadas, public.artes_vistas FROM PUBLIC, anon, authenticated;

-- ── Ajudante: para quem a arte é ───────────────────────────────────────────
-- Pessoa ativa; sem setores = todo mundo; com setores = o setor do cadastro.

CREATE OR REPLACE FUNCTION public.fn_arte_e_para(p_setores UUID[], p_perfil UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis p
     WHERE p.id = p_perfil AND p.ativo
       AND (p_setores IS NULL OR p.setor_id = ANY (p_setores)));
$$;

-- ── Lançar e encerrar (super_admin) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_artes_lancar(
  p_titulo TEXT, p_modelo TEXT, p_conteudo JSONB, p_tema TEXT,
  p_setores UUID[] DEFAULT NULL, p_inicio TIMESTAMPTZ DEFAULT NULL, p_fim TIMESTAMPTZ DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_id UUID;
  v_setores UUID[];
  v_inicio TIMESTAMPTZ := COALESCE(p_inicio, NOW());
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin lança arte' USING ERRCODE = '42501';
  END IF;
  IF btrim(COALESCE(p_titulo, '')) = '' THEN
    RAISE EXCEPTION 'Dê um nome à arte.' USING ERRCODE = '22023';
  END IF;
  IF p_fim IS NOT NULL AND p_fim <= v_inicio THEN
    RAISE EXCEPTION 'O fim precisa ser depois do início.' USING ERRCODE = '22023';
  END IF;
  -- Setores: só os que existem; lista vazia = ninguém, e isso é erro (nulo = todo mundo).
  IF p_setores IS NOT NULL THEN
    SELECT array_agg(DISTINCT s.id) INTO v_setores FROM public.setores s WHERE s.id = ANY (p_setores);
    IF COALESCE(cardinality(v_setores), 0) = 0 THEN
      RAISE EXCEPTION 'Escolha pelo menos um setor (ou «Todo mundo»).' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.artes_lancadas (titulo, modelo, conteudo, tema, setores, inicio, fim, criada_por)
  VALUES (btrim(p_titulo), p_modelo, COALESCE(p_conteudo, '{}'::jsonb), COALESCE(p_tema, 'amarelo'),
          v_setores, v_inicio, p_fim, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_artes_encerrar(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin encerra arte' USING ERRCODE = '42501';
  END IF;
  UPDATE public.artes_lancadas SET encerrada_em = NOW(), encerrada_por = auth.uid()
   WHERE id = p_id AND encerrada_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Arte não encontrada ou já encerrada.' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- Todas as artes, com quantos são o público e quantos já viram (super_admin).
CREATE OR REPLACE FUNCTION public.fn_artes_listar()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin acompanha as artes' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'titulo', a.titulo, 'modelo', a.modelo, 'conteudo', a.conteudo, 'tema', a.tema,
      'setores', a.setores,
      'setores_nomes', (SELECT COALESCE(jsonb_agg(s.nome ORDER BY s.nome), '[]'::jsonb) FROM public.setores s WHERE s.id = ANY (a.setores)),
      'inicio', a.inicio, 'fim', a.fim, 'criada_em', a.criada_em, 'encerrada_em', a.encerrada_em,
      'publico', (SELECT count(*) FROM public.perfis p WHERE p.ativo AND (a.setores IS NULL OR p.setor_id = ANY (a.setores))),
      'viram', (SELECT count(*) FROM public.artes_vistas v WHERE v.arte_id = a.id))
      ORDER BY a.criada_em DESC), '[]'::jsonb)
    FROM (SELECT * FROM public.artes_lancadas ORDER BY criada_em DESC LIMIT 60) a
  );
END;
$$;

-- ── Quem vê ────────────────────────────────────────────────────────────────

-- As artes no ar para mim agora, com «já vi».
CREATE OR REPLACE FUNCTION public.fn_artes_minhas()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id, 'titulo', a.titulo, 'modelo', a.modelo, 'conteudo', a.conteudo, 'tema', a.tema,
    'inicio', a.inicio,
    'vi', EXISTS (SELECT 1 FROM public.artes_vistas v WHERE v.arte_id = a.id AND v.perfil_id = (SELECT auth.uid())))
    ORDER BY a.inicio), '[]'::jsonb)
  FROM public.artes_lancadas a
  WHERE a.encerrada_em IS NULL
    AND a.inicio <= NOW()
    AND (a.fim IS NULL OR a.fim > NOW())
    AND public.fn_arte_e_para(a.setores, (SELECT auth.uid()));
$$;

-- «Vi.» Só conta para quem a arte é; repetir não muda nada.
CREATE OR REPLACE FUNCTION public.fn_artes_vi(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_eu UUID := auth.uid();
BEGIN
  IF v_eu IS NULL THEN RETURN; END IF;
  INSERT INTO public.artes_vistas (arte_id, perfil_id)
  SELECT a.id, v_eu FROM public.artes_lancadas a
   WHERE a.id = p_id AND public.fn_arte_e_para(a.setores, v_eu)
  ON CONFLICT (arte_id, perfil_id) DO NOTHING;
END;
$$;

-- ── Permissões ─────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.fn_arte_e_para(UUID[], UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_artes_lancar(TEXT, TEXT, JSONB, TEXT, UUID[], TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_artes_encerrar(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_artes_listar()       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_artes_minhas()       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_artes_vi(UUID)       FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_artes_lancar(TEXT, TEXT, JSONB, TEXT, UUID[], TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_artes_encerrar(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_artes_listar()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_artes_minhas()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_artes_vi(UUID)       TO authenticated;

-- ── Imagens próprias: bucket «artes» ───────────────────────────────────────
-- Só onde existe o storage do Supabase (o teste local roda sem ele).

DO $storage$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('artes', 'artes', true, 8388608, ARRAY['image/png','image/jpeg','image/webp','image/gif'])
  ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit,
                                 allowed_mime_types = EXCLUDED.allowed_mime_types;

  DROP POLICY IF EXISTS "artes: super_admin envia" ON storage.objects;
  CREATE POLICY "artes: super_admin envia" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'artes' AND (SELECT public.fn_user_is_super_admin()));

  DROP POLICY IF EXISTS "artes: super_admin troca" ON storage.objects;
  CREATE POLICY "artes: super_admin troca" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'artes' AND (SELECT public.fn_user_is_super_admin()));

  DROP POLICY IF EXISTS "artes: super_admin apaga" ON storage.objects;
  CREATE POLICY "artes: super_admin apaga" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'artes' AND (SELECT public.fn_user_is_super_admin()));
END
$storage$;

COMMIT;
