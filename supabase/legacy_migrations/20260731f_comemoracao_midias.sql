-- ============================================================================
-- 20260731f — Comemoração: mídia do líder e posição dos elementos (fase 2)
-- ============================================================================
--
-- A fase 1 usa efeitos animados em código e sons sintetizados. Aqui o líder
-- passa a poder enviar o GIF e o som dele, que ficam salvos e aparecem numa
-- lista para reaproveitar nas próximas comemorações.
--
-- As colunas `efeito`/`som` da fase 1 CONTINUAM valendo: a mídia própria entra
-- em colunas separadas, e quem não enviar nada segue com o catálogo. Uma
-- comemoração criada antes desta migration não muda de comportamento.
--
-- Idempotente.
-- ============================================================================

-- ── 1. Biblioteca ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comemoracao_midias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('gif', 'som')),
  nome        TEXT NOT NULL CHECK (length(btrim(nome)) > 0),
  -- URL pública do arquivo no bucket `comemoracoes`.
  url         TEXT NOT NULL,
  -- Caminho dentro do bucket. Guardado para conseguir apagar o arquivo junto
  -- com a linha — só a URL pública não serve para remover.
  caminho     TEXT NOT NULL,
  criado_por  UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.comemoracao_midias IS
  'GIFs e sons enviados pelo líder para as comemorações. O catálogo padrão '
  'vive em código (src/pages/Comemoracoes/catalogo.ts) e não passa por aqui.';

CREATE INDEX IF NOT EXISTS idx_comemoracao_midias_empresa
  ON public.comemoracao_midias (empresa_id, tipo, criado_em DESC);

-- ── 2. Ligação com a comemoração ────────────────────────────────────────────
-- NULL = usa o catálogo (colunas `efeito`/`som`). Preenchido = usa o arquivo.

ALTER TABLE public.comemoracoes
  ADD COLUMN IF NOT EXISTS gif_midia_id UUID REFERENCES public.comemoracao_midias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS som_midia_id UUID REFERENCES public.comemoracao_midias(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.comemoracoes.gif_midia_id IS
  'GIF enviado pelo líder. NULL = usa o efeito animado do catálogo (coluna efeito).';

-- `ON DELETE SET NULL` de propósito: apagar uma mídia da biblioteca não pode
-- derrubar a comemoração que a usou — ela volta para o efeito do catálogo.

-- ── 3. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.comemoracao_midias ENABLE ROW LEVEL SECURITY;

-- Ver: qualquer um da empresa. A mídia aparece dentro da comemoração, que já é
-- vista por gente sem permissão de criar.
DROP POLICY IF EXISTS "comemoracao_midias_select" ON public.comemoracao_midias;
CREATE POLICY "comemoracao_midias_select" ON public.comemoracao_midias
  FOR SELECT USING (
    (SELECT public.fn_user_is_super_admin())
    OR empresa_id = (SELECT public.fn_user_empresa_id())
  );

DROP POLICY IF EXISTS "comemoracao_midias_insert" ON public.comemoracao_midias;
CREATE POLICY "comemoracao_midias_insert" ON public.comemoracao_midias
  FOR INSERT WITH CHECK (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND criado_por = (SELECT auth.uid())
    AND (SELECT public.fn_comemoracao_pode_criar())
  );

-- Apagar: quem enviou, ou administração. Sem UPDATE — mídia não se edita, se
-- troca.
DROP POLICY IF EXISTS "comemoracao_midias_delete" ON public.comemoracao_midias;
CREATE POLICY "comemoracao_midias_delete" ON public.comemoracao_midias
  FOR DELETE USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (
      criado_por = (SELECT auth.uid())
      OR (SELECT public.fn_user_has_any_role(ARRAY['diretoria','administrador','super_admin']))
    )
  );

-- ── 4. Bucket ───────────────────────────────────────────────────────────────
--
-- ⚠️  O LIMITE DE TAMANHO VIVE AQUI, não no front: um GIF de 40 MB trava a tela
-- de todo mundo do setor, e validação só no navegador é contornável pela API.
--
--   GIF → 5 MB   ·   som → 1 MB
--
-- Como o bucket é um só, o teto é o maior dos dois; o tipo MIME separa o resto.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comemoracoes', 'comemoracoes', true, 5242880,
  ARRAY['image/gif','image/png','image/webp','audio/mpeg','audio/mp3','audio/wav','audio/ogg']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura pública (o bucket serve GIF e som direto na tela de todo mundo).
DROP POLICY IF EXISTS "comemoracoes_midia_leitura" ON storage.objects;
CREATE POLICY "comemoracoes_midia_leitura" ON storage.objects
  FOR SELECT USING (bucket_id = 'comemoracoes');

-- Enviar e apagar: quem pode criar comemoração.
DROP POLICY IF EXISTS "comemoracoes_midia_envio" ON storage.objects;
CREATE POLICY "comemoracoes_midia_envio" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'comemoracoes' AND (SELECT public.fn_comemoracao_pode_criar())
  );

DROP POLICY IF EXISTS "comemoracoes_midia_remocao" ON storage.objects;
CREATE POLICY "comemoracoes_midia_remocao" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'comemoracoes' AND (SELECT public.fn_comemoracao_pode_criar())
  );
