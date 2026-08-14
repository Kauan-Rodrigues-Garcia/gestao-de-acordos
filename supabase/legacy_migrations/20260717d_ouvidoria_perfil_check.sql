-- Ouvidoria — terceiro complemento: CHECK constraint da coluna perfil.
--
-- Além do enum, perfis.perfil tem o CHECK perfis_perfil_check com a lista
-- fixa de valores (recriado por step3_rls_novos_cargos_v3 sem 'ouvidoria').
-- Salvar o cargo novo violava o CHECK → HTTP 400 "violates check constraint"
-- mesmo com o enum já atualizado. Mesmo bug que elite/gerencia/diretoria
-- tiveram em 2026-04-16 (migration 18, item 3).

ALTER TABLE public.perfis
  DROP CONSTRAINT IF EXISTS perfis_perfil_check;

ALTER TABLE public.perfis
  ADD CONSTRAINT perfis_perfil_check
  CHECK (perfil::text IN (
    'operador', 'lider', 'administrador', 'super_admin',
    'elite', 'gerencia', 'diretoria', 'ouvidoria'
  ));
