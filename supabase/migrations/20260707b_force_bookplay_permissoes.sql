-- =====================================================================
-- FORÇA os defaults de permissão APENAS na BookPlay (slug = 'bookplay').
--
-- Por que esta segunda migration:
--   A 20260707_fix_bookplay_permissoes_vazias usava merge com o valor
--   EXISTENTE vencendo (`EXCLUDED || existente`), assumindo linhas vazias.
--   Na prática as linhas da BookPlay tinham as chaves explicitamente `false`,
--   então o merge preservou os `false` e continuou tudo zerado.
--
--   Aqui o EXCLUDED (default) VENCE — sobrescreve por completo. Como o escopo
--   é só a empresa 'bookplay', a Pagueplay NÃO é tocada. Seguro porque a
--   BookPlay estava toda zerada (não havia customização a preservar).
--
-- DEPENDÊNCIAS: 20_cargos_permissoes_completo.sql, 09_multi_empresa.sql
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
