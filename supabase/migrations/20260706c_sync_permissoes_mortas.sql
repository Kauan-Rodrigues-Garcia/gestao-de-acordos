-- =====================================================================
-- Sincroniza as permissões "mortas" com o comportamento atual (espelho)
--
-- CONTEXTO:
--   13 permissões da tela Admin -> Cargos nunca eram consultadas no código
--   (interruptores mortos). A partir de agora elas passam a ser fiscalizadas
--   no frontend. Para NÃO alterar o comportamento atual de nenhum cargo
--   (decisão do dono: "espelhar o acesso amplo atual"), ligamos todas elas
--   = true para todos os cargos editáveis.
--
--   Isso é seguro: a fiscalização no código é combinada (AND) com as travas
--   de rota/menu por cargo que já existem, então ligar amplo não expõe
--   nada novo — apenas permite que DESLIGAR um interruptor passe a ter
--   efeito real. O admin pode então restringir o que quiser pela tela.
--
--   Vale para TODAS as empresas (Bookplay, Pagueplay e futuras).
--
-- DEPENDÊNCIAS: 20_cargos_permissoes_completo.sql
-- =====================================================================

-- Mescla as chaves = true preservando as demais permissões já configuradas.
-- (o operador || faz o lado direito prevalecer nas chaves em conflito)
UPDATE public.cargos_permissoes
SET permissoes = permissoes || '{
  "ver_acordos_proprios": true,
  "editar_acordos": true,
  "excluir_acordos": true,
  "importar_excel": true,
  "ver_analiticos_setor": true,
  "gerenciar_metas": true,
  "filtrar_por_setor": true,
  "filtrar_por_equipe": true,
  "ver_equipes": true,
  "ver_operadores": true,
  "editar_usuarios": true,
  "editar_equipes": true,
  "ver_logs": true
}'::jsonb
WHERE cargo IN ('operador', 'lider', 'elite', 'gerencia', 'diretoria');
