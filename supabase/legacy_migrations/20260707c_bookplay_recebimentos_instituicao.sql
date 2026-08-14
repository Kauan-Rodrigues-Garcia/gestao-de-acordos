-- =====================================================================
-- BookPlay: aba Analítico + Recebimento diário a partir de UM relatório
--
-- 1) Coluna `instituicao` (coluna "Empresa" do relatório BookPlay:
--    bookplay, mundial editora, faculdade bookplay...) nas duas tabelas
--    de recebimento. Nullable — a PaguePlay simplesmente não preenche.
--
-- 2) Permissões importar_analitico / importar_diario nos cargos da
--    BookPlay. Os seeds originais (20260629_analitico_recebimentos e
--    20260701b_diario_recebimentos) só adicionaram essas chaves onde
--    ainda não existiam; como a BookPlay teve o histórico de
--    cargos_permissoes zerado/sobrescrito, garantimos aqui que líder+
--    tenham as chaves = true e operador = false, escopo BookPlay.
--
-- DEPENDÊNCIAS: 20260629_analitico_recebimentos.sql,
--               20260701b_diario_recebimentos.sql, 09_multi_empresa.sql
-- =====================================================================

-- ── 1. Coluna instituicao ────────────────────────────────────────────
ALTER TABLE public.analitico_recebimentos
  ADD COLUMN IF NOT EXISTS instituicao TEXT;

ALTER TABLE public.diario_recebimentos
  ADD COLUMN IF NOT EXISTS instituicao TEXT;

-- ── 2. Permissões de importação para os cargos da BookPlay ───────────
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
