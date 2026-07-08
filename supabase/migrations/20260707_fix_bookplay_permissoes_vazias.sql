-- =====================================================================
-- Corrige permissões vazias por empresa (sintoma: BookPlay com TODOS os
-- cargos mostrando 0 permissões ativas na tela Admin -> Cargos).
--
-- CAUSA RAIZ:
--   Todos os seeds anteriores (20_cargos_permissoes_completo,
--   novos_cargos_2026_04_16, fix_novos_cargos_...) inserem os padrões com
--   `ON CONFLICT (empresa_id, cargo) DO NOTHING`. Se as linhas da empresa
--   já existiam vazias (`permissoes = '{}'`, default da coluna), o seed foi
--   IGNORADO para ela e ficou sem os valores reais. A Pagueplay foi semeada
--   corretamente; a BookPlay ficou com `{}`.
--
-- ESTRATÉGIA (segura para as duas empresas):
--   INSERT ... ON CONFLICT DO UPDATE com merge `default || existente`.
--   - O operador `||` faz o lado DIREITO prevalecer. Como o existente está à
--     direita, qualquer chave já configurada pelo admin é PRESERVADA e o
--     default só preenche as chaves faltantes.
--   - BookPlay (vazia): `default || '{}'` = default completo → corrige.
--   - Pagueplay (já correta): valores existentes vencem → nada muda.
--   Idempotente: rodar de novo não altera nada.
--
-- DEPENDÊNCIAS: 20_cargos_permissoes_completo.sql
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

-- NOTA: esta migration NÃO força o "espelho amplo" da 20260706c (13 chaves =
-- true em todas as empresas). O objetivo aqui é apenas dar à BookPlay o mesmo
-- baseline que a Pagueplay já tem, sem alterar a Pagueplay. Se quiser aplicar
-- o espelho amplo às duas, rode a 20260706c separadamente.
