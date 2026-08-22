-- ============================================================================
-- O painel manda: o resto do sistema
-- ============================================================================
--
-- As ultimas policies que decidiam por cargo. Duas chaves novas, o resto
-- reaproveita chave que ja existia e que ja tinha exatamente o mesmo alcance.
--
--   administrar_sistema ..... administrador — painel de permissoes, fila de
--                             Tickets, monitoramento de uso, aceites de termo
--   comemoracoes_gerenciar .. diretoria, administrador
--
-- Reaproveitadas, cargo a cargo identicas ao que a policy dizia:
--
--   ver_configuracoes ....... ai_config, modelos de mensagem, termos de uso,
--                             documentos LGPD, itens e regras do pet
--   ver_logs ................ logs_sistema
--   ver_ouvidoria + editar_ouvidoria / gerenciar_acessos_ouvidoria
--   fn_user_escopo('dashboard') >= 2 .... responsaveis de atendimento,
--                             contribuicao do receptivo, historico de acordos,
--                             exclusao de solicitacao de WhatsApp
--
-- ## Acordos: escrever segue a mesma escada da leitura
--
-- `acordos_insert`, `acordos_update` e `acordos_delete_admin` tinham a escada
-- inteira escrita por extenso — cupula ve tudo, lideranca da BookPlay ve o
-- setor com clones, lider da PaguePlay ve a empresa. E a mesma escada que a
-- leitura ja usa, entao passam a usar `fn_user_escopo('acordos')` do mesmo
-- jeito. Escrever e ler deixam de poder discordar.
--
-- ## Ouvidoria: a chave da aba entra junto
--
-- `editar_ouvidoria` e `gerenciar_acessos_ouvidoria` estao ligadas para quase
-- todo cargo da PaguePlay, mas as policies so aceitavam `ouvidoria` e admin. A
-- diferenca e a ABA: so a ouvidoria tem `ver_ouvidoria`. Perguntando as duas
-- juntas, o resultado e identico ao de hoje — e passa a ser configuravel pelos
-- dois lados.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

UPDATE public.cargos_permissoes c
SET permissoes = c.permissoes || jsonb_build_object(
      'administrar_sistema',    c.cargo IN ('administrador','super_admin'),
      'comemoracoes_gerenciar', c.cargo IN ('administrador','super_admin','diretoria')
    ),
    atualizado_em = now();

-- ── Administracao da plataforma ─────────────────────────────────────────────
DROP POLICY IF EXISTS aceites_select_admin ON public.aceites_termo;
CREATE POLICY aceites_select_admin ON public.aceites_termo
FOR SELECT USING ((SELECT public.fn_user_tem('administrar_sistema')));

DROP POLICY IF EXISTS perfis_permissoes_select ON public.perfis_permissoes;
CREATE POLICY perfis_permissoes_select ON public.perfis_permissoes
FOR SELECT USING (
  usuario_id = (SELECT auth.uid())
  OR (SELECT public.fn_user_tem('administrar_sistema'))
);

DROP POLICY IF EXISTS perfis_permissoes_admin_escreve ON public.perfis_permissoes;
CREATE POLICY perfis_permissoes_admin_escreve ON public.perfis_permissoes
FOR ALL USING ((SELECT public.fn_user_tem('administrar_sistema')));

DROP POLICY IF EXISTS tickets_delete ON public.tickets;
CREATE POLICY tickets_delete ON public.tickets
FOR DELETE USING ((SELECT public.fn_user_tem('administrar_sistema')));

DROP POLICY IF EXISTS tickets_atend_write ON public.tickets_atendentes;
CREATE POLICY tickets_atend_write ON public.tickets_atendentes
FOR ALL USING ((SELECT public.fn_user_tem('administrar_sistema')));

DROP POLICY IF EXISTS tickets_config_write ON public.tickets_config;
CREATE POLICY tickets_config_write ON public.tickets_config
FOR ALL USING ((SELECT public.fn_user_tem('administrar_sistema')));

DROP POLICY IF EXISTS uso_telas_select ON public.uso_telas;
CREATE POLICY uso_telas_select ON public.uso_telas
FOR SELECT USING ((SELECT public.fn_user_tem('administrar_sistema')));

-- ── Comemoracoes ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS comemoracoes_update ON public.comemoracoes;
CREATE POLICY comemoracoes_update ON public.comemoracoes
FOR UPDATE USING ((SELECT public.fn_user_tem('comemoracoes_gerenciar')));

DROP POLICY IF EXISTS comemoracoes_delete ON public.comemoracoes;
CREATE POLICY comemoracoes_delete ON public.comemoracoes
FOR DELETE USING ((SELECT public.fn_user_tem('comemoracoes_gerenciar')));

DROP POLICY IF EXISTS comemoracao_midias_delete ON public.comemoracao_midias;
CREATE POLICY comemoracao_midias_delete ON public.comemoracao_midias
FOR DELETE USING ((SELECT public.fn_user_tem('comemoracoes_gerenciar')));

-- ── Configuracoes ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ai_config_admin_write ON public.ai_config;
CREATE POLICY ai_config_admin_write ON public.ai_config
FOR ALL USING ((SELECT public.fn_user_tem('ver_configuracoes')));

DROP POLICY IF EXISTS modelos_admin ON public.modelos_mensagem;
CREATE POLICY modelos_admin ON public.modelos_mensagem
FOR ALL USING ((SELECT public.fn_user_tem('ver_configuracoes')));

DROP POLICY IF EXISTS termos_uso_insert ON public.termos_uso;
CREATE POLICY termos_uso_insert ON public.termos_uso
FOR INSERT WITH CHECK ((SELECT public.fn_user_tem('ver_configuracoes')));

DROP POLICY IF EXISTS termos_uso_update ON public.termos_uso;
CREATE POLICY termos_uso_update ON public.termos_uso
FOR UPDATE USING ((SELECT public.fn_user_tem('ver_configuracoes')));

DROP POLICY IF EXISTS doc_lgpd_select ON public.documentos_lgpd;
CREATE POLICY doc_lgpd_select ON public.documentos_lgpd
FOR SELECT USING ((SELECT public.fn_user_tem('ver_configuracoes')));

DROP POLICY IF EXISTS doc_lgpd_insert ON public.documentos_lgpd;
CREATE POLICY doc_lgpd_insert ON public.documentos_lgpd
FOR INSERT WITH CHECK ((SELECT public.fn_user_tem('ver_configuracoes')));

DROP POLICY IF EXISTS doc_lgpd_update ON public.documentos_lgpd;
CREATE POLICY doc_lgpd_update ON public.documentos_lgpd
FOR UPDATE USING ((SELECT public.fn_user_tem('ver_configuracoes')));

DROP POLICY IF EXISTS pet_itens_admin_write ON public.pet_itens;
CREATE POLICY pet_itens_admin_write ON public.pet_itens
FOR ALL USING ((SELECT public.fn_user_tem('ver_configuracoes')));

DROP POLICY IF EXISTS pet_regras_admin_write ON public.pet_economia_regras;
CREATE POLICY pet_regras_admin_write ON public.pet_economia_regras
FOR UPDATE USING ((SELECT public.fn_user_tem('ver_configuracoes')));

-- ── Logs ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS logs_sis_admin ON public.logs_sistema;
CREATE POLICY logs_sis_admin ON public.logs_sistema
FOR SELECT USING ((SELECT public.fn_user_tem('ver_logs')));

-- ── Ouvidoria ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ouvidoria_acessos_select ON public.ouvidoria_acessos;
CREATE POLICY ouvidoria_acessos_select ON public.ouvidoria_acessos
FOR SELECT USING (
  (SELECT public.fn_user_tem('ver_ouvidoria'))
  AND (SELECT public.fn_user_tem('gerenciar_acessos_ouvidoria'))
);

DROP POLICY IF EXISTS ouvidoria_acessos_write ON public.ouvidoria_acessos;
CREATE POLICY ouvidoria_acessos_write ON public.ouvidoria_acessos
FOR ALL USING (
  (SELECT public.fn_user_tem('ver_ouvidoria'))
  AND (SELECT public.fn_user_tem('gerenciar_acessos_ouvidoria'))
);

DROP POLICY IF EXISTS ouvidoria_atend_delete ON public.ouvidoria_atendimentos;
CREATE POLICY ouvidoria_atend_delete ON public.ouvidoria_atendimentos
FOR DELETE USING (
  (SELECT public.fn_user_tem('ver_ouvidoria'))
  AND (SELECT public.fn_user_tem('editar_ouvidoria'))
);

-- ── Lideranca: alcance do Dashboard ─────────────────────────────────────────
-- Estas quatro tabelas nao tem aba propria; o que a lista de cargo dizia era
-- "quem enxerga alem de si mesmo", e essa pergunta ja tem dono.
DROP POLICY IF EXISTS atend_resp_insert ON public.atendimento_responsaveis;
CREATE POLICY atend_resp_insert ON public.atendimento_responsaveis
FOR INSERT WITH CHECK ((SELECT public.fn_user_escopo('dashboard')) >= 2);

DROP POLICY IF EXISTS atend_resp_delete ON public.atendimento_responsaveis;
CREATE POLICY atend_resp_delete ON public.atendimento_responsaveis
FOR DELETE USING ((SELECT public.fn_user_escopo('dashboard')) >= 2);

DROP POLICY IF EXISTS contrib_receptivo_insert ON public.contribuicao_receptivo;
CREATE POLICY contrib_receptivo_insert ON public.contribuicao_receptivo
FOR INSERT WITH CHECK ((SELECT public.fn_user_escopo('dashboard')) >= 2);

DROP POLICY IF EXISTS contrib_receptivo_update ON public.contribuicao_receptivo;
CREATE POLICY contrib_receptivo_update ON public.contribuicao_receptivo
FOR UPDATE USING ((SELECT public.fn_user_escopo('dashboard')) >= 2);

DROP POLICY IF EXISTS contrib_receptivo_delete ON public.contribuicao_receptivo;
CREATE POLICY contrib_receptivo_delete ON public.contribuicao_receptivo
FOR DELETE USING ((SELECT public.fn_user_escopo('dashboard')) >= 2);

DROP POLICY IF EXISTS historico_select ON public.historico_acordos;
CREATE POLICY historico_select ON public.historico_acordos
FOR SELECT USING ((SELECT public.fn_user_escopo('dashboard')) >= 2);

DROP POLICY IF EXISTS historico_insert ON public.historico_acordos;
CREATE POLICY historico_insert ON public.historico_acordos
FOR INSERT WITH CHECK ((SELECT public.fn_user_escopo('dashboard')) >= 2);

DROP POLICY IF EXISTS sol_wpp_delete ON public.solicitacoes_whatsapp;
CREATE POLICY sol_wpp_delete ON public.solicitacoes_whatsapp
FOR DELETE USING ((SELECT public.fn_user_escopo('dashboard')) >= 2);

-- ── Acordos: escrever segue a escada da leitura ─────────────────────────────
DROP POLICY IF EXISTS acordos_insert ON public.acordos;
CREATE POLICY acordos_insert ON public.acordos
FOR INSERT WITH CHECK (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    operador_id = (SELECT auth.uid())
    OR (SELECT public.fn_user_is_super_admin())
    OR (SELECT public.fn_user_escopo('acordos')) >= 3
    OR ((SELECT public.fn_user_escopo('acordos')) >= 2
        AND (setor_id = (SELECT public.fn_user_setor_id())
             OR (setor_id IS NULL
                 AND public.fn_operador_setor_id(operador_id) = (SELECT public.fn_user_setor_id()))
             OR public.fn_operador_clonado_no_setor(operador_id, (SELECT public.fn_user_setor_id()))))
  )
);

DROP POLICY IF EXISTS acordos_update ON public.acordos;
CREATE POLICY acordos_update ON public.acordos
FOR UPDATE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    operador_id = (SELECT auth.uid())
    OR (SELECT public.fn_user_is_super_admin())
    OR (SELECT public.fn_user_escopo('acordos')) >= 3
    OR ((SELECT public.fn_user_escopo('acordos')) >= 2
        AND (setor_id = (SELECT public.fn_user_setor_id())
             OR (setor_id IS NULL
                 AND public.fn_operador_setor_id(operador_id) = (SELECT public.fn_user_setor_id()))
             OR public.fn_operador_clonado_no_setor(operador_id, (SELECT public.fn_user_setor_id()))))
  )
);

DROP POLICY IF EXISTS acordos_delete_admin ON public.acordos;
CREATE POLICY acordos_delete_admin ON public.acordos
FOR DELETE USING (
  (SELECT public.fn_user_is_super_admin())
  OR (
    (SELECT public.fn_can_access_empresa(empresa_id))
    AND (
      (SELECT public.fn_user_escopo('acordos')) >= 3
      OR ((SELECT public.fn_user_escopo('acordos')) >= 2
          AND (setor_id = (SELECT public.fn_user_setor_id())
               OR (setor_id IS NULL
                   AND public.fn_operador_setor_id(operador_id) = (SELECT public.fn_user_setor_id()))
               OR public.fn_operador_clonado_no_setor(operador_id, (SELECT public.fn_user_setor_id()))))
    )
  )
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
    ('administrar_sistema',    NULL::TEXT[], ninguem, false),
    ('comemoracoes_gerenciar', NULL::TEXT[], ARRAY['diretoria'], false),
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
