-- Migração: sistema de tags visuais para acordos
-- Tags são criadas por admins e podem ser aplicadas a qualquer acordo.
-- Finalidade: diferenciação visual (não relacionadas ao vínculo Direto/Extra).
--
-- COMO APLICAR:
--   1. Acesse o Supabase Dashboard → SQL Editor
--   2. Cole e execute este script
--   3. É idempotente — pode rodar mais de uma vez.

-- 1. Tabela de definições de tags (por empresa)
CREATE TABLE IF NOT EXISTS public.tags (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome       TEXT        NOT NULL,
  cor        TEXT        NOT NULL DEFAULT '#6366f1',
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, nome)
);

-- 2. Índice de busca por empresa
CREATE INDEX IF NOT EXISTS idx_tags_empresa_id
  ON public.tags(empresa_id);

-- 3. Coluna tag_ids na tabela acordos (array de UUIDs referenciando tags)
ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS tag_ids UUID[] DEFAULT '{}';

-- 4. Índice GIN para buscas em arrays
CREATE INDEX IF NOT EXISTS idx_acordos_tag_ids
  ON public.acordos USING GIN(tag_ids)
  WHERE tag_ids IS NOT NULL AND tag_ids <> '{}';

-- 5. RLS na tabela tags
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- Cria policies apenas se ainda não existirem (CREATE POLICY não suporta IF NOT EXISTS)
DO $$
BEGIN

  -- Todos os usuários da empresa podem ver as tags
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tags' AND policyname = 'tags_select'
  ) THEN
    CREATE POLICY tags_select ON public.tags FOR SELECT
      USING (
        empresa_id IN (
          SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
        )
      );
  END IF;

  -- Apenas admins podem criar tags
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tags' AND policyname = 'tags_insert'
  ) THEN
    CREATE POLICY tags_insert ON public.tags FOR INSERT
      WITH CHECK (
        empresa_id IN (
          SELECT empresa_id FROM public.perfis
          WHERE id = auth.uid()
            AND perfil IN ('administrador', 'super_admin')
        )
      );
  END IF;

  -- Apenas admins podem editar tags
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tags' AND policyname = 'tags_update'
  ) THEN
    CREATE POLICY tags_update ON public.tags FOR UPDATE
      USING (
        empresa_id IN (
          SELECT empresa_id FROM public.perfis
          WHERE id = auth.uid()
            AND perfil IN ('administrador', 'super_admin')
        )
      );
  END IF;

  -- Apenas admins podem excluir tags
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tags' AND policyname = 'tags_delete'
  ) THEN
    CREATE POLICY tags_delete ON public.tags FOR DELETE
      USING (
        empresa_id IN (
          SELECT empresa_id FROM public.perfis
          WHERE id = auth.uid()
            AND perfil IN ('administrador', 'super_admin')
        )
      );
  END IF;

END $$;

-- 6. Confirma resultado
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_name = 'tags' AND table_schema = 'public') AS tabela_tags_criada,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'acordos' AND column_name = 'tag_ids' AND table_schema = 'public') AS coluna_tag_ids_criada,
  (SELECT COUNT(*) FROM pg_policies
   WHERE tablename = 'tags' AND schemaname = 'public') AS policies_criadas;
