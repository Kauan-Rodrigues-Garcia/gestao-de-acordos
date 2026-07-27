-- =====================================================================
-- SCRIPT CONSOLIDADO — Migrations BookPlay (2026-07-07)
-- Cole tudo isto no SQL Editor do Supabase e clique em RUN.
--
-- Reúne, na ordem correta, as 4 migrations:
--   1) 20260707_fix_bookplay_permissoes_vazias
--   2) 20260707b_force_bookplay_permissoes
--   3) 20260707c_bookplay_recebimentos_instituicao
--   4) 20260707d_bookplay_analitico_forma_detalhe
--
-- Seguro: nenhum comando destrutivo; tudo idempotente (ON CONFLICT /
-- IF NOT EXISTS). Rodar de novo não causa dano. Envolvido em transação:
-- se algo falhar, faz rollback e nada é alterado.
-- =====================================================================

BEGIN;

-- =====================================================================
-- [1/4] Corrige permissões vazias por empresa (baseline p/ BookPlay).
--   INSERT ... ON CONFLICT DO UPDATE com merge `default || existente`
--   (o existente vence: nada da Pagueplay muda).
-- =====================================================================

-- OPERADOR
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT e.id, 'operador',
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
ON CONFLICT (empresa_id, cargo)
DO UPDATE SET permissoes = EXCLUDED.permissoes || public.cargos_permissoes.permissoes;

-- LIDER
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT e.id, 'lider',
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
ON CONFLICT (empresa_id, cargo)
DO UPDATE SET permissoes = EXCLUDED.permissoes || public.cargos_permissoes.permissoes;

-- ELITE
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT e.id, 'elite',
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
ON CONFLICT (empresa_id, cargo)
DO UPDATE SET permissoes = EXCLUDED.permissoes || public.cargos_permissoes.permissoes;

-- GERENCIA
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT e.id, 'gerencia',
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
ON CONFLICT (empresa_id, cargo)
DO UPDATE SET permissoes = EXCLUDED.permissoes || public.cargos_permissoes.permissoes;

-- DIRETORIA
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT e.id, 'diretoria',
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
ON CONFLICT (empresa_id, cargo)
DO UPDATE SET permissoes = EXCLUDED.permissoes || public.cargos_permissoes.permissoes;

-- =====================================================================
-- [2/4] FORÇA os defaults APENAS na BookPlay (slug = 'bookplay').
--   Aqui o EXCLUDED (default) VENCE — necessário porque a BookPlay tinha
--   as chaves explicitamente `false`. Pagueplay NÃO é tocada.
-- =====================================================================

-- OPERADOR
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT e.id, 'operador',
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
FROM public.empresas e WHERE e.slug = 'bookplay'
ON CONFLICT (empresa_id, cargo) DO UPDATE SET permissoes = EXCLUDED.permissoes;

-- LIDER
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT e.id, 'lider',
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
FROM public.empresas e WHERE e.slug = 'bookplay'
ON CONFLICT (empresa_id, cargo) DO UPDATE SET permissoes = EXCLUDED.permissoes;

-- ELITE
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT e.id, 'elite',
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
FROM public.empresas e WHERE e.slug = 'bookplay'
ON CONFLICT (empresa_id, cargo) DO UPDATE SET permissoes = EXCLUDED.permissoes;

-- GERENCIA
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT e.id, 'gerencia',
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
FROM public.empresas e WHERE e.slug = 'bookplay'
ON CONFLICT (empresa_id, cargo) DO UPDATE SET permissoes = EXCLUDED.permissoes;

-- DIRETORIA
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT e.id, 'diretoria',
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
FROM public.empresas e WHERE e.slug = 'bookplay'
ON CONFLICT (empresa_id, cargo) DO UPDATE SET permissoes = EXCLUDED.permissoes;

-- =====================================================================
-- [3/4] BookPlay: coluna `instituicao` nas tabelas de recebimento +
--        permissões importar_analitico / importar_diario.
-- =====================================================================

-- 1. Coluna instituicao
ALTER TABLE public.analitico_recebimentos
  ADD COLUMN IF NOT EXISTS instituicao TEXT;

ALTER TABLE public.diario_recebimentos
  ADD COLUMN IF NOT EXISTS instituicao TEXT;

-- 2. Permissões de importação para os cargos da BookPlay
-- Líder e acima: podem importar/limpar (true)
UPDATE public.cargos_permissoes cp
SET permissoes = cp.permissoes
      || '{"importar_analitico": true, "importar_diario": true}'::jsonb
FROM public.empresas e
WHERE e.id = cp.empresa_id
  AND e.slug = 'bookplay'
  AND cp.cargo IN ('lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin');

-- Operador: apenas recebe os dados (false)
UPDATE public.cargos_permissoes cp
SET permissoes = cp.permissoes
      || '{"importar_analitico": false, "importar_diario": false}'::jsonb
FROM public.empresas e
WHERE e.id = cp.empresa_id
  AND e.slug = 'bookplay'
  AND cp.cargo = 'operador';

-- =====================================================================
-- [4/4] BookPlay: rótulo detalhado da forma de pagamento no Analítico.
-- =====================================================================

ALTER TABLE public.analitico_recebimentos
  ADD COLUMN IF NOT EXISTS forma_detalhe TEXT;

COMMIT;

-- =====================================================================
-- FIM. Se rodou sem erro, o COMMIT já aplicou tudo.
-- Para conferir as permissões da BookPlay depois:
--   SELECT cargo, permissoes FROM public.cargos_permissoes cp
--   JOIN public.empresas e ON e.id = cp.empresa_id
--   WHERE e.slug = 'bookplay' ORDER BY cargo;
-- =====================================================================
