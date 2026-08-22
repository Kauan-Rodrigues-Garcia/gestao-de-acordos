-- ============================================================================
-- O painel manda: gestao de pessoas, equipes, setores e metas
-- ============================================================================
--
-- 17 policies em 8 tabelas. Aqui as listas de cargo eram TODAS diferentes entre
-- si — excluir equipe era so `administrador`, criar era mais quatro cargos,
-- mexer em lider de equipe era outra lista ainda. Nenhuma chave do painel
-- representava isso.
--
-- Usar as chaves antigas teria concedido demais: `editar_equipes` esta ligada
-- para seis cargos, e a exclusao era de um. Ligar uma na outra daria exclusao
-- de equipes a seis cargos sem ninguem pedir.
--
-- Entao entram 10 chaves, cada uma nascendo EXATAMENTE com quem ja podia:
--
--   usuarios_administrar ......... administrador
--   usuarios_editar_do_setor ..... lider, elite, gerencia
--   usuarios_transferir .......... lider, elite, gerencia, diretoria
--   equipes_criar_editar ......... lider, elite, gerencia
--   equipes_excluir .............. ninguem alem do acesso total
--   equipes_gerenciar_composicao . lider, gerencia
--   metas_editar ................. lider, elite, gerencia
--   metas_excluir ................ ninguem alem do acesso total
--   metas_editar_dias_uteis ...... lider
--   metas_excluir_dias_uteis ..... ninguem alem do acesso total
--
-- Nada muda hoje. O que muda e que as dez viraram interruptor.
--
-- ## Tres chaves saem
--
-- `editar_usuarios`, `editar_equipes` e `gerenciar_metas` ficaram sem
-- consumidor. Cada uma dizia "pode escrever aqui" para acoes que o banco
-- tratava como coisas diferentes — e era por isso que ligar `editar_equipes`
-- nao dava poder de excluir equipe, sem nada na tela explicando o porque.
--
-- ## Um ganho: a ouvidoria na leitura de perfis
--
-- `perfis_select` passa a perguntar `fn_user_escopo('usuarios') >= 2`. A
-- ouvidoria tem, no painel, a aba Usuarios ligada com alcance de empresa — mas
-- nao estava na lista de cargo da policy. De novo o caso de a tela prometer e o
-- banco negar.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── As dez chaves, derivadas da lista de hoje ───────────────────────────────
UPDATE public.cargos_permissoes c
SET permissoes = c.permissoes || jsonb_build_object(
      'usuarios_administrar',         c.cargo IN ('administrador','super_admin'),
      'usuarios_editar_do_setor',     c.cargo IN ('administrador','super_admin','lider','elite','gerencia'),
      'usuarios_transferir',          c.cargo IN ('administrador','super_admin','lider','elite','gerencia','diretoria'),
      'equipes_criar_editar',         c.cargo IN ('administrador','super_admin','lider','elite','gerencia'),
      'equipes_excluir',              c.cargo IN ('administrador','super_admin'),
      'equipes_gerenciar_composicao', c.cargo IN ('administrador','super_admin','lider','gerencia'),
      'metas_editar',                 c.cargo IN ('administrador','super_admin','lider','elite','gerencia'),
      'metas_excluir',                c.cargo IN ('administrador','super_admin'),
      'metas_editar_dias_uteis',      c.cargo IN ('administrador','super_admin','lider'),
      'metas_excluir_dias_uteis',     c.cargo IN ('administrador','super_admin')
    ),
    atualizado_em = now();

-- ── As tres antigas saem ────────────────────────────────────────────────────
UPDATE public.cargos_permissoes
SET permissoes = permissoes - 'editar_usuarios' - 'editar_equipes' - 'gerenciar_metas'
WHERE permissoes ?| ARRAY['editar_usuarios','editar_equipes','gerenciar_metas'];

UPDATE public.perfis_permissoes
SET permissoes = permissoes - 'editar_usuarios' - 'editar_equipes' - 'gerenciar_metas'
WHERE permissoes ?| ARRAY['editar_usuarios','editar_equipes','gerenciar_metas'];

-- ── perfis ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS perfis_select ON public.perfis;
CREATE POLICY perfis_select ON public.perfis
FOR SELECT USING (
  (SELECT auth.uid()) = id
  OR (SELECT public.fn_user_is_super_admin())
  OR (
    ((SELECT public.fn_user_acesso_multiempresa())
     OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (SELECT public.fn_user_escopo('usuarios')) >= 2
  )
);

DROP POLICY IF EXISTS perfis_admin_all ON public.perfis;
CREATE POLICY perfis_admin_all ON public.perfis
FOR ALL USING (
  (SELECT public.fn_user_is_super_admin())
  OR (
    ((SELECT public.fn_user_acesso_multiempresa())
     OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (SELECT public.fn_user_tem('usuarios_administrar'))
  )
);

DROP POLICY IF EXISTS perfis_lider_update ON public.perfis;
CREATE POLICY perfis_lider_update ON public.perfis
FOR UPDATE USING (
  ((SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id()))
  AND setor_id = (SELECT public.fn_user_setor_id())
  AND (SELECT public.fn_user_tem('usuarios_editar_do_setor'))
  -- Quem edita no proprio setor nao alcanca conta de administrador. Isto NAO e
  -- teto sobre o painel: e o limite da propria chave, que se chama "editar quem
  -- e do meu setor". Para alcancar qualquer um existe `usuarios_administrar`.
  AND perfil <> ALL (ARRAY['administrador','super_admin'])
);

-- ── setores ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS setores_admin ON public.setores;
CREATE POLICY setores_admin ON public.setores
FOR ALL USING (
  (SELECT public.fn_user_is_super_admin())
  OR (
    ((SELECT public.fn_user_acesso_multiempresa())
     OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (SELECT public.fn_user_tem('usuarios_administrar'))
  )
);

-- ── equipes ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS equipes_insert_admin_lider ON public.equipes;
CREATE POLICY equipes_insert_admin_lider ON public.equipes
FOR INSERT WITH CHECK (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('equipes_criar_editar'))
);

DROP POLICY IF EXISTS equipes_update_admin_lider ON public.equipes;
CREATE POLICY equipes_update_admin_lider ON public.equipes
FOR UPDATE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('equipes_criar_editar'))
);

DROP POLICY IF EXISTS equipes_delete_admin ON public.equipes;
CREATE POLICY equipes_delete_admin ON public.equipes
FOR DELETE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('equipes_excluir'))
);

DROP POLICY IF EXISTS equipe_lideres_write_gestao ON public.equipe_lideres;
CREATE POLICY equipe_lideres_write_gestao ON public.equipe_lideres
FOR ALL USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('equipes_gerenciar_composicao'))
);

DROP POLICY IF EXISTS clones_write_gestao ON public.equipe_operadores_clones;
CREATE POLICY clones_write_gestao ON public.equipe_operadores_clones
FOR ALL USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('equipes_gerenciar_composicao'))
);

-- ── metas ───────────────────────────────────────────────────────────────────
-- `fn_meta_esta_bloqueada` continua no lugar: e o cadeado do mes fechado, que
-- e outra pergunta — "este mes ainda aceita escrita?" — e nao permissao.
DROP POLICY IF EXISTS metas_insert ON public.metas;
CREATE POLICY metas_insert ON public.metas
FOR INSERT WITH CHECK (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('metas_editar'))
  AND NOT public.fn_meta_esta_bloqueada(tipo, referencia_id, empresa_id, mes, ano)
);

DROP POLICY IF EXISTS metas_update ON public.metas;
CREATE POLICY metas_update ON public.metas
FOR UPDATE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('metas_editar'))
  AND NOT public.fn_meta_esta_bloqueada(tipo, referencia_id, empresa_id, mes, ano)
);

DROP POLICY IF EXISTS metas_delete ON public.metas;
CREATE POLICY metas_delete ON public.metas
FOR DELETE USING (
  (SELECT public.fn_user_tem('metas_excluir'))
  AND NOT public.fn_meta_esta_bloqueada(tipo, referencia_id, empresa_id, mes, ano)
);

DROP POLICY IF EXISTS metas_config_insert ON public.metas_config_mes;
CREATE POLICY metas_config_insert ON public.metas_config_mes
FOR INSERT WITH CHECK (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('metas_editar_dias_uteis'))
);

DROP POLICY IF EXISTS metas_config_update ON public.metas_config_mes;
CREATE POLICY metas_config_update ON public.metas_config_mes
FOR UPDATE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('metas_editar_dias_uteis'))
);

DROP POLICY IF EXISTS metas_config_delete ON public.metas_config_mes;
CREATE POLICY metas_config_delete ON public.metas_config_mes
FOR DELETE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('metas_excluir_dias_uteis'))
);

-- ── transferencias ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS transferencias_insert ON public.perfis_transferencias;
CREATE POLICY transferencias_insert ON public.perfis_transferencias
FOR INSERT WITH CHECK (
  ((SELECT public.fn_user_is_super_admin())
   OR (SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id())
   OR destino_empresa_id = (SELECT public.fn_user_empresa_id()))
  AND (SELECT public.fn_user_tem('usuarios_transferir'))
);

DROP POLICY IF EXISTS transferencias_update ON public.perfis_transferencias;
CREATE POLICY transferencias_update ON public.perfis_transferencias
FOR UPDATE USING (
  ((SELECT public.fn_user_is_super_admin())
   OR (SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id()))
  AND (SELECT public.fn_user_tem('usuarios_transferir'))
);

-- ── Catalogo ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH atalhos AS (
    SELECT
      ARRAY['lider','elite','gerencia','diretoria']::TEXT[] AS lideranca,
      ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[] AS todos,
      ARRAY['gerencia','diretoria']::TEXT[] AS cupula,
      ARRAY[]::TEXT[] AS ninguem
  )
  SELECT t.* FROM atalhos, LATERAL (VALUES
    -- Abas e telas
    ('ver_acordos',                 ARRAY['bookplay'],  todos,     false),
    ('ver_analitico',               NULL::TEXT[],       todos,     false),
    ('ver_painel_lider',            NULL::TEXT[],       lideranca, false),
    ('ver_painel_diretoria',        NULL::TEXT[],       ARRAY['diretoria'], false),
    ('ver_ouvidoria',               ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('ver_campanha_facil',          ARRAY['bookplay'],  lideranca, false),
    ('ver_solicitacoes_whatsapp',   NULL::TEXT[],       todos,     false),
    ('ver_pix_automatico',          ARRAY['bookplay'],  todos,     false),
    ('ver_lixeira',                 NULL::TEXT[],       todos,     false),
    ('ver_logs',                    NULL::TEXT[],       ninguem,   false),
    ('ver_configuracoes',           NULL::TEXT[],       ninguem,   false),
    -- Acordos
    -- Acordos: escopo por aba (fase 5a) — bookplay-only, como a chave da aba
    ('acordos_escopo_individual',    ARRAY['bookplay'], todos,     false),
    ('acordos_escopo_equipe',        ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('acordos_escopo_setor',         ARRAY['bookplay'], lideranca, false),
    ('acordos_escopo_todos_setores', ARRAY['bookplay'], cupula,    false),
    ('criar_acordos',               NULL::TEXT[],       todos,     false),
    ('editar_acordos',              NULL::TEXT[],       todos,     false),
    ('excluir_acordos',             NULL::TEXT[],       todos,     false),
    ('excluir_em_lote',             NULL::TEXT[],       lideranca, false),
    -- Importacoes
    ('importar_excel',              NULL::TEXT[],       todos,     false),
    ('importar_analitico',          NULL::TEXT[],       lideranca, false),
    ('importar_diario',             NULL::TEXT[],       lideranca, false),
    -- Gestao de pessoas
    ('ver_usuarios',                NULL::TEXT[],       lideranca, false),
    ('ver_equipes',                 NULL::TEXT[],       lideranca, false),
    ('ver_operadores',              NULL::TEXT[],       lideranca, false),
    ('usuarios_escopo_setor',         NULL::TEXT[], todos, false),
    ('usuarios_escopo_todos_setores', NULL::TEXT[], ARRAY['gerencia','diretoria','ouvidoria'], false),
    -- Metas
    ('ver_metas',                   NULL::TEXT[],       lideranca, false),
    ('usuarios_administrar',         NULL::TEXT[], ninguem, false),
    ('usuarios_editar_do_setor',     NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('usuarios_transferir',          NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria'], false),
    ('equipes_criar_editar',         NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('equipes_excluir',              NULL::TEXT[], ninguem, false),
    ('equipes_gerenciar_composicao', NULL::TEXT[], ARRAY['lider','gerencia'], false),
    ('metas_editar',                 NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('metas_excluir',                NULL::TEXT[], ninguem, false),
    ('metas_editar_dias_uteis',      NULL::TEXT[], ARRAY['lider'], false),
    ('metas_excluir_dias_uteis',     NULL::TEXT[], ninguem, false),
    -- Filtros e visao (globais — em desmonte pela reestruturacao por aba)
    ('filtrar_por_usuario',         NULL::TEXT[],       lideranca, false),
    -- Pix Automatico: escopo por aba (fase 5b)
    ('pix_escopo_individual',        ARRAY['bookplay'], todos,     false),
    ('pix_escopo_equipe',            ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_escopo_setor',             ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_escopo_todos_setores',     ARRAY['bookplay'], ARRAY['gerencia'], false),
    ('pix_editar_configuracoes',     ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    -- Painel Diretoria: escopo por aba (fase 6a)
    ('painel_diretoria_escopo_setor',         NULL::TEXT[], ARRAY['gerencia'],  false),
    ('painel_diretoria_escopo_todos_setores', NULL::TEXT[], ARRAY['diretoria'], false),
    -- Acoes especificas
    ('editar_ouvidoria',            ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('gerenciar_acessos_ouvidoria', ARRAY['pagueplay'], ninguem,   false),
    ('criar_solicitacao_whatsapp',  NULL::TEXT[],       todos,     false),
    ('aprovar_pix_automatico',      ARRAY['bookplay'],  lideranca, false),
    ('ignorar_fechamento_mes',      NULL::TEXT[],       ninguem,   true),
    -- Lixeira (fase 1)
    ('lixeira_escopo_individual',   NULL::TEXT[],       todos,     false),
    ('lixeira_escopo_equipe',       NULL::TEXT[],       lideranca, false),
    ('lixeira_escopo_setor',        NULL::TEXT[],       lideranca, false),
    ('lixeira_escopo_todos_setores', NULL::TEXT[],      cupula,    false),
    ('lixeira_restaurar',           NULL::TEXT[],       todos,     false),
    ('lixeira_limpar',              NULL::TEXT[],       todos,     false),
    -- Painel Lider (fase 2)
    ('painel_lider_escopo_setor',            NULL::TEXT[], lideranca, false),
    ('painel_lider_escopo_todos_setores',    NULL::TEXT[], ARRAY['diretoria'], false),
    ('painel_lider_sub_acompanhamento',      NULL::TEXT[], lideranca, false),
    ('painel_lider_sub_desempenho_equipes',  NULL::TEXT[], lideranca, false),
    ('painel_lider_sub_quartis',             NULL::TEXT[], lideranca, false),
    ('painel_lider_sub_grafico_recebimento', NULL::TEXT[], lideranca, false),
    -- Dashboard (fase 3a) — sem chave de aba, de proposito
    ('dashboard_escopo_individual',    NULL::TEXT[], todos,     false),
    ('dashboard_escopo_equipe',        NULL::TEXT[], lideranca, false),
    ('dashboard_escopo_setor',         NULL::TEXT[], lideranca, false),
    ('dashboard_escopo_todos_setores', NULL::TEXT[], cupula,    false),
    -- Analitico (fase 4) — encerra veTodosOsSetores
    ('analitico_escopo_individual',      NULL::TEXT[], ARRAY['operador','elite'], false),
    ('analitico_escopo_setor',           NULL::TEXT[], ARRAY['lider','elite','gerencia','ouvidoria','diretoria'], false),
    ('analitico_escopo_todos_setores',   NULL::TEXT[], cupula,    false),
    ('analitico_sub_analitico',          NULL::TEXT[], todos,     false),
    ('analitico_sub_recebimento_diario', NULL::TEXT[], todos,     false),
    ('analitico_sub_colchao',            NULL::TEXT[], todos,     false),
    ('analitico_sub_por_operador',       NULL::TEXT[], todos,     false),
    ('analitico_sub_formas_pagamento',   NULL::TEXT[], todos,     false),
    ('analitico_sub_ranking',            NULL::TEXT[], todos,     false),
    ('analitico_sub_destaques_dia',      NULL::TEXT[], todos,     false),
    ('analitico_sub_sem_operador',       NULL::TEXT[], todos,     false)
  ) AS t(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo oficial de permissoes. Espelha src/lib/permissoes-catalogo.ts; os '
  'testes de contrato quebram a CI se divergirem.';

COMMIT;
