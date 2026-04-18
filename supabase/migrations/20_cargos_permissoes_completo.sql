-- ============================================================
-- Migration 20: Permissões completas por cargo × empresa
-- Garante registros para operador + lider (que faltavam)
-- e normaliza o set de keys para todas as empresas.
-- ============================================================

-- 1. Garantir que a tabela existe (idempotente)
CREATE TABLE IF NOT EXISTS public.cargos_permissoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cargo         TEXT NOT NULL,
  permissoes    JSONB NOT NULL DEFAULT '{}',
  descricao     TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, cargo)
);

-- 2. Trigger atualizado_em
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

-- 3. RLS
ALTER TABLE public.cargos_permissoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cargos_select_empresa" ON public.cargos_permissoes;
CREATE POLICY "cargos_select_empresa" ON public.cargos_permissoes
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "cargos_admin_write" ON public.cargos_permissoes;
CREATE POLICY "cargos_admin_write" ON public.cargos_permissoes
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis
      WHERE id = auth.uid()
        AND perfil IN ('administrador', 'super_admin')
    )
  );

-- 4. Inserir/Upsert permissões padrão para TODOS os cargos × TODAS as empresas

-- OPERADOR
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT
  e.id,
  'operador',
  '{
    "ver_acordos_proprios": true,
    "ver_acordos_gerais": false,
    "criar_acordos": true,
    "editar_acordos": true,
    "excluir_acordos": false,
    "importar_excel": false,
    "ver_painel_lider": false,
    "ver_analiticos_setor": false,
    "ver_analiticos_global": false,
    "ver_todos_setores": false,
    "filtrar_por_setor": false,
    "filtrar_por_equipe": false,
    "filtrar_por_usuario": false,
    "ver_usuarios": false,
    "ver_equipes": false,
    "ver_metas": false,
    "ver_operadores": false,
    "ver_lixeira": false,
    "ver_logs": false,
    "ver_configuracoes": false
  }'::jsonb,
  'Usuário operacional padrão. Gerencia apenas os próprios acordos.'
FROM public.empresas e
ON CONFLICT (empresa_id, cargo) DO NOTHING;

-- LIDER
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT
  e.id,
  'lider',
  '{
    "ver_acordos_proprios": true,
    "ver_acordos_gerais": true,
    "criar_acordos": true,
    "editar_acordos": true,
    "excluir_acordos": false,
    "importar_excel": true,
    "ver_painel_lider": true,
    "ver_analiticos_setor": true,
    "ver_analiticos_global": false,
    "ver_todos_setores": false,
    "filtrar_por_setor": false,
    "filtrar_por_equipe": true,
    "filtrar_por_usuario": true,
    "ver_usuarios": true,
    "ver_equipes": true,
    "ver_metas": true,
    "ver_operadores": true,
    "ver_lixeira": true,
    "ver_logs": false,
    "ver_configuracoes": false
  }'::jsonb,
  'Líder de equipe/setor. Acesso aos acordos e métricas do setor.'
FROM public.empresas e
ON CONFLICT (empresa_id, cargo) DO NOTHING;

-- ELITE
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT
  e.id,
  'elite',
  '{
    "ver_acordos_proprios": true,
    "ver_acordos_gerais": true,
    "criar_acordos": true,
    "editar_acordos": true,
    "excluir_acordos": false,
    "importar_excel": true,
    "ver_painel_lider": true,
    "ver_analiticos_setor": true,
    "ver_analiticos_global": false,
    "ver_todos_setores": false,
    "filtrar_por_setor": false,
    "filtrar_por_equipe": true,
    "filtrar_por_usuario": true,
    "ver_usuarios": true,
    "ver_equipes": true,
    "ver_metas": true,
    "ver_operadores": true,
    "ver_lixeira": true,
    "ver_logs": false,
    "ver_configuracoes": false
  }'::jsonb,
  'Líder híbrido com alternância entre visão individual e geral.'
FROM public.empresas e
ON CONFLICT (empresa_id, cargo) DO NOTHING;

-- GERENCIA
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT
  e.id,
  'gerencia',
  '{
    "ver_acordos_proprios": true,
    "ver_acordos_gerais": true,
    "criar_acordos": true,
    "editar_acordos": true,
    "excluir_acordos": false,
    "importar_excel": true,
    "ver_painel_lider": true,
    "ver_analiticos_setor": true,
    "ver_analiticos_global": false,
    "ver_todos_setores": false,
    "filtrar_por_setor": false,
    "filtrar_por_equipe": true,
    "filtrar_por_usuario": true,
    "ver_usuarios": true,
    "ver_equipes": true,
    "ver_metas": true,
    "ver_operadores": true,
    "ver_lixeira": true,
    "ver_logs": false,
    "ver_configuracoes": false
  }'::jsonb,
  'Mesmas permissões de líder para uso gerencial.'
FROM public.empresas e
ON CONFLICT (empresa_id, cargo) DO NOTHING;

-- DIRETORIA
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT
  e.id,
  'diretoria',
  '{
    "ver_acordos_proprios": false,
    "ver_acordos_gerais": true,
    "criar_acordos": false,
    "editar_acordos": false,
    "excluir_acordos": false,
    "importar_excel": false,
    "ver_painel_lider": true,
    "ver_analiticos_setor": true,
    "ver_analiticos_global": true,
    "ver_todos_setores": true,
    "filtrar_por_setor": true,
    "filtrar_por_equipe": true,
    "filtrar_por_usuario": true,
    "ver_usuarios": true,
    "ver_equipes": true,
    "ver_metas": true,
    "ver_operadores": true,
    "ver_lixeira": true,
    "ver_logs": false,
    "ver_configuracoes": false
  }'::jsonb,
  'Visualização analítica completa sem capacidade de edição.'
FROM public.empresas e
ON CONFLICT (empresa_id, cargo) DO NOTHING;

-- 5. REPLICA IDENTITY para Realtime
ALTER TABLE public.cargos_permissoes REPLICA IDENTITY FULL;
