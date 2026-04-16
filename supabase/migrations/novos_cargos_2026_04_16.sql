
-- ─── 1. Adicionar novos valores ao ENUM perfil_usuario ───────────────────────
DO $$
BEGIN
  -- elite
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'perfil_usuario'::regtype
      AND enumlabel = 'elite'
  ) THEN
    ALTER TYPE perfil_usuario ADD VALUE 'elite';
  END IF;

  -- gerencia
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'perfil_usuario'::regtype
      AND enumlabel = 'gerencia'
  ) THEN
    ALTER TYPE perfil_usuario ADD VALUE 'gerencia';
  END IF;

  -- diretoria
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'perfil_usuario'::regtype
      AND enumlabel = 'diretoria'
  ) THEN
    ALTER TYPE perfil_usuario ADD VALUE 'diretoria';
  END IF;
END;
$$;

-- ─── 2. Criar tabela de permissões de cargo ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cargos_permissoes_2026_04_16 (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cargo         TEXT NOT NULL,  -- nome do cargo (ex: 'elite', 'gerencia', 'operador')
  permissoes    JSONB NOT NULL DEFAULT '{}',  -- { "ver_todos_acordos": true, "ver_analiticos": true, ... }
  descricao     TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, cargo)
);

-- Renomear para nome limpo (sem sufixo)
ALTER TABLE IF EXISTS public.cargos_permissoes_2026_04_16 RENAME TO cargos_permissoes;

-- ─── 3. Trigger de atualização automática do atualizado_em ──────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at_cargos()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cargos_updated_at ON public.cargos_permissoes;
CREATE TRIGGER trg_cargos_updated_at
  BEFORE UPDATE ON public.cargos_permissoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_cargos();

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.cargos_permissoes ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado da mesma empresa
DROP POLICY IF EXISTS "cargos_select_empresa" ON public.cargos_permissoes;
CREATE POLICY "cargos_select_empresa" ON public.cargos_permissoes
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
    )
  );

-- Insert/Update/Delete: apenas administrador da empresa
DROP POLICY IF EXISTS "cargos_admin_write" ON public.cargos_permissoes;
CREATE POLICY "cargos_admin_write" ON public.cargos_permissoes
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis
      WHERE id = auth.uid()
        AND perfil IN ('administrador', 'super_admin')
    )
  );

-- ─── 5. Inserir permissões padrão para os novos cargos (por empresa já existente) ─
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT
  id AS empresa_id,
  'elite',
  '{
    "ver_acordos_gerais": true,
    "ver_acordos_proprios": true,
    "ver_analiticos_setor": true,
    "ver_operadores": true,
    "ver_painel_lider": true,
    "criar_acordos": true,
    "editar_acordos": true,
    "excluir_acordos": false,
    "ver_lixeira": true,
    "importar_excel": true,
    "ver_metas": true,
    "ver_usuarios": true,
    "ver_equipes": true
  }'::jsonb,
  'Cargo híbrido: acesso de líder com visão individual ou geral alternável'
FROM public.empresas
ON CONFLICT (empresa_id, cargo) DO NOTHING;

INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT
  id AS empresa_id,
  'gerencia',
  '{
    "ver_acordos_gerais": true,
    "ver_acordos_proprios": true,
    "ver_analiticos_setor": true,
    "ver_operadores": true,
    "ver_painel_lider": true,
    "criar_acordos": true,
    "editar_acordos": true,
    "excluir_acordos": false,
    "ver_lixeira": true,
    "importar_excel": true,
    "ver_metas": true,
    "ver_usuarios": true,
    "ver_equipes": true
  }'::jsonb,
  'Mesmas permissões que líder'
FROM public.empresas
ON CONFLICT (empresa_id, cargo) DO NOTHING;

INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT
  id AS empresa_id,
  'diretoria',
  '{
    "ver_acordos_gerais": true,
    "ver_todos_setores": true,
    "ver_analiticos_global": true,
    "filtrar_por_setor": true,
    "filtrar_por_equipe": true,
    "filtrar_por_usuario": true,
    "ver_operadores": true,
    "ver_painel_lider": true,
    "criar_acordos": false,
    "editar_acordos": false,
    "excluir_acordos": false,
    "ver_lixeira": true,
    "importar_excel": false,
    "ver_metas": true,
    "ver_usuarios": true,
    "ver_equipes": true
  }'::jsonb,
  'Acesso total a todos os setores e análises gerais'
FROM public.empresas
ON CONFLICT (empresa_id, cargo) DO NOTHING;

-- ─── 6. Adicionar REPLICA IDENTITY FULL para Realtime ────────────────────────
ALTER TABLE public.cargos_permissoes REPLICA IDENTITY FULL;
