-- ============================================================================
-- O painel manda: as 12 chaves que faltavam, e a ultima policy por cargo
-- ============================================================================
--
-- ## Por que
--
-- A conversao do BANCO terminou em 23/08 (`20260823010000`–`060000`): o teto
-- por cargo morreu e ~76 policies passaram a perguntar ao painel. Mesmo assim a
-- queixa voltou:
--
--   «eu libero na tela e nao acontece nada»
--
-- Porque o CARGO continuou decidindo em dois lugares que a conversao nao
-- alcancou:
--
--   1. **Uma policy.** `uso_telas_select` (monitoramento de uso) exige cargo
--      `administrador`, escrito dentro dela. E o exemplo que o Cleber deu:
--      ligar `ver_logs` para a diretoria abre a trilha e NAO abre o
--      monitoramento — duas travas diferentes na mesma tela, uma obedecendo ao
--      painel e a outra nao.
--
--   2. **~39 decisoes no frontend.** Telas e hooks perguntando
--      `isPerfilLider(cargo)`. Uma tela que decide por cargo produz exatamente
--      o mesmo sintoma de uma policy que decide por cargo.
--
-- Esta migration entrega as chaves de que o frontend precisa para parar de
-- perguntar o cargo, e converte a policy que faltava.
--
-- ## Nada muda hoje
--
-- Cada chave nasce ligada EXATAMENTE para quem ja podia, cargo a cargo, lido do
-- codigo que ela substitui. O bloco de prova no fim confere isso.
--
-- O que muda e que as doze viraram interruptor.
--
-- ## Uma consequencia deliberada: `acesso_multiempresa_permitido`
--
-- `administrador` responde `true` para toda chave nova, por ter acesso total
-- (`CARGOS_ACESSO_TOTAL`). Para onze das doze isso reproduz o que ele ja podia.
--
-- Para `acesso_multiempresa_permitido` e um GANHO: hoje o seletor de empresa
-- exige cargo `gerencia` ou `diretoria` MAIS a flag `acesso_multiempresa` na
-- pessoa. Um administrador com a flag ligada nao via as duas empresas.
--
-- Passa a ver. E coerente com «o painel manda» e continua trancado atras da
-- flag, que alguem precisa ligar por pessoa. Fica registrado aqui porque e a
-- unica linha desta migration que altera alcance.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. O catalogo, com as doze ─────────────────────────────────────────────
--
-- `fn_permissoes_catalogo()` e substituida por completo a cada migration que
-- acrescenta chave, e e o contrato com `src/lib/permissoes-catalogo.ts` — o
-- teste `permissoes-catalogo.sql.test.ts` confere chave a chave.
--
-- `padrao` vale para EMPRESA NOVA. Os cargos de acesso total nao aparecem nele:
-- eles respondem `true` por construcao, e listar seria dizer duas vezes.

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
    ('ver_tickets',                 NULL::TEXT[],       ARRAY['lider','elite','gerencia','diretoria','ouvidoria'], false),
    ('ver_lixeira',                 NULL::TEXT[],       todos,     false),
    ('ver_logs',                    NULL::TEXT[],       ninguem,   false),
    ('ver_configuracoes',           NULL::TEXT[],       ninguem,   false),
    -- Monitoramento de uso: aba interna de Logs, chave propria. Ate 24/08 a
    -- policy exigia cargo `administrador` e a sub-aba nao consultava nada —
    -- quem tinha `ver_logs` via a aba e recebia zero linhas.
    ('ver_monitoramento_uso',       NULL::TEXT[],       ninguem,   false),
    -- Banco de dados: sub-aba de Configuracoes, era `isPerfilAdmin` na tela.
    ('ver_banco_dados',             NULL::TEXT[],       ninguem,   false),
    -- Acordos
    ('acordos_escopo_individual',    ARRAY['bookplay'], todos,     false),
    ('acordos_escopo_equipe',        ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('acordos_escopo_setor',         ARRAY['bookplay'], lideranca, false),
    ('acordos_escopo_todos_setores', ARRAY['bookplay'], cupula,    false),
    ('criar_acordos',               NULL::TEXT[],       todos,     false),
    ('editar_acordos',              NULL::TEXT[],       todos,     false),
    ('excluir_acordos',             NULL::TEXT[],       todos,     false),
    ('excluir_em_lote',             NULL::TEXT[],       lideranca, false),
    -- Autorizar tabulacao (transferir NR, vinculo EXTRA, duplicados na
    -- importacao). Espelha `PERFIS_AUTORIZADORES` no frontend E a checagem de
    -- `fn_transferir_acordo_nr` no banco — as duas listas viram esta chave.
    ('acordos_autorizar_tabulacao', NULL::TEXT[],       lideranca, false),
    ('acordos_capturar_erp',        ARRAY['pagueplay'], ninguem,   false),
    ('acordos_campos_admin',        ARRAY['bookplay'],  ninguem,   false),
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
    -- Quem enxerga contas de administrador na LISTA de usuarios. E outro eixo
    -- que o escopo: «ate onde eu vejo» e «quem eu vejo» sao perguntas
    -- diferentes, e juntar as duas foi o que produziu o filtro atual.
    ('usuarios_ver_administradores',    NULL::TEXT[], ninguem, false),
    ('usuarios_desfazer_transferencia', NULL::TEXT[], ninguem, false),
    ('equipes_criar_editar',         NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('equipes_excluir',              NULL::TEXT[], ninguem, false),
    ('equipes_gerenciar_composicao', NULL::TEXT[], ARRAY['lider','gerencia'], false),
    ('metas_editar',                 NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('metas_excluir',                NULL::TEXT[], ninguem, false),
    ('metas_editar_dias_uteis',      NULL::TEXT[], ARRAY['lider'], false),
    ('metas_excluir_dias_uteis',     NULL::TEXT[], ninguem, false),
    -- Acesso as duas operacoes. A flag `acesso_multiempresa` continua sendo por
    -- PESSOA; esta chave e o cargo que a flag pode habilitar.
    ('acesso_multiempresa_permitido', NULL::TEXT[], cupula, false),
    -- Filtros e visao (globais — em desmonte pela reestruturacao por aba)
    ('filtrar_por_usuario',         NULL::TEXT[],       lideranca, false),
    -- Pix Automatico
    ('pix_escopo_individual',        ARRAY['bookplay'], todos,     false),
    ('pix_escopo_equipe',            ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_escopo_setor',             ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_escopo_todos_setores',     ARRAY['bookplay'], ARRAY['gerencia'], false),
    ('pix_editar_configuracoes',     ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_ajustar_saldo',            ARRAY['bookplay'], ARRAY['lider','elite','gerencia'], false),
    -- Painel Diretoria
    ('painel_diretoria_escopo_setor',         NULL::TEXT[], ARRAY['gerencia'],  false),
    ('painel_diretoria_escopo_todos_setores', NULL::TEXT[], ARRAY['diretoria'], false),
    -- Acoes especificas
    ('administrar_sistema',    NULL::TEXT[], ninguem, false),
    ('comemoracoes_gerenciar', NULL::TEXT[], ARRAY['diretoria'], false),
    ('editar_ouvidoria',            ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('gerenciar_acessos_ouvidoria', ARRAY['pagueplay'], ninguem,   false),
    -- Ser o RESPONSAVEL pela ouvidoria: enxerga tudo da aba sem depender de
    -- concessao em `ouvidoria_acessos`. Era `cargo === 'ouvidoria'` na tela.
    ('ouvidoria_responsavel',       ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('criar_solicitacao_whatsapp',  NULL::TEXT[],       todos,     false),
    ('aprovar_pix_automatico',      ARRAY['bookplay'],  lideranca, false),
    ('ignorar_fechamento_mes',      NULL::TEXT[],       ninguem,   true),
    -- Tickets. A aba ja tinha `ver_tickets`; o que decidia QUEM administra e
    -- quem abre chamado continuava sendo cargo, dentro de `useTicketsAcesso`.
    ('tickets_administrar',         NULL::TEXT[],       ninguem,   false),
    ('tickets_abrir',               NULL::TEXT[],       ARRAY['lider','elite','gerencia','diretoria','ouvidoria'], false),
    -- Lixeira
    ('lixeira_escopo_individual',   NULL::TEXT[],       todos,     false),
    ('lixeira_escopo_equipe',       NULL::TEXT[],       lideranca, false),
    ('lixeira_escopo_setor',        NULL::TEXT[],       lideranca, false),
    ('lixeira_escopo_todos_setores', NULL::TEXT[],      cupula,    false),
    ('lixeira_restaurar',           NULL::TEXT[],       todos,     false),
    ('lixeira_limpar',              NULL::TEXT[],       todos,     false),
    -- Painel Lider
    ('painel_lider_escopo_setor',            NULL::TEXT[], lideranca, false),
    ('painel_lider_escopo_todos_setores',    NULL::TEXT[], ARRAY['diretoria'], false),
    ('painel_lider_sub_acompanhamento',      NULL::TEXT[], lideranca, false),
    ('painel_lider_sub_desempenho_equipes',  NULL::TEXT[], lideranca, false),
    ('painel_lider_sub_quartis',             NULL::TEXT[], lideranca, false),
    ('painel_lider_sub_grafico_recebimento', NULL::TEXT[], lideranca, false),
    -- Dashboard
    ('dashboard_escopo_individual',    NULL::TEXT[], todos,     false),
    ('dashboard_escopo_equipe',        NULL::TEXT[], lideranca, false),
    ('dashboard_escopo_setor',         NULL::TEXT[], lideranca, false),
    ('dashboard_escopo_todos_setores', NULL::TEXT[], cupula,    false),
    -- Analitico
    ('analitico_escopo_individual',      NULL::TEXT[], ARRAY['operador','elite'], false),
    ('analitico_escopo_setor',           NULL::TEXT[], ARRAY['lider','elite','gerencia','ouvidoria','diretoria'], false),
    ('analitico_escopo_todos_setores',   NULL::TEXT[], cupula,    false),
    ('analitico_sub_analitico',          NULL::TEXT[], todos,     false),
    ('analitico_sub_recebimento_diario', NULL::TEXT[], todos,     false),
    ('analitico_sub_colchao',            NULL::TEXT[], todos,     false),
    ('analitico_sub_desafios',           NULL::TEXT[], todos,     false),
    ('analitico_sub_por_operador',       NULL::TEXT[], todos,     false),
    ('analitico_sub_formas_pagamento',   NULL::TEXT[], todos,     false),
    ('analitico_sub_ranking',            NULL::TEXT[], todos,     false),
    ('analitico_sub_destaques_dia',      NULL::TEXT[], todos,     false),
    ('analitico_sub_sem_operador',       NULL::TEXT[], todos,     false),
    -- Validar o relatorio importado. Era `isPerfilAdmin` na tela, e a diretoria
    -- ficava de fora de proposito — validacao desfaz numero ja publicado.
    ('analitico_validar_relatorio',      NULL::TEXT[], ninguem,   false),
    -- RH Gestao. O cargo `rh` entra nominalmente: ele NAO herda o atalho
    -- `todos`, que e da operacao.
    ('ver_rh_gestao',              NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','rh'], false),
    ('rh_escopo_equipe',           NULL::TEXT[], ARRAY['lider','elite'], false),
    ('rh_escopo_setor',            NULL::TEXT[], ARRAY['gerencia'], false),
    ('rh_escopo_todos_setores',    NULL::TEXT[], ARRAY['diretoria','rh'], false),
    ('rh_preencher',               NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('rh_validar',                 NULL::TEXT[], ARRAY['gerencia'], false),
    ('rh_enviar',                  NULL::TEXT[], ARRAY['gerencia'], false),
    ('rh_aprovar',                 NULL::TEXT[], ARRAY['gerencia','rh'], false),
    ('rh_devolver',                NULL::TEXT[], ARRAY['gerencia','rh'], false),
    ('rh_dispensar',               NULL::TEXT[], ARRAY['lider','elite','gerencia','rh'], false),
    ('rh_gerenciar_fechamento',    NULL::TEXT[], ARRAY['rh'], false),
    ('rh_reabrir_fechamento',      NULL::TEXT[], ninguem,   true),
    ('rh_configurar',              NULL::TEXT[], ARRAY['rh'], false),
    ('rh_editar_cracha',           NULL::TEXT[], ARRAY['rh'], false),
    -- Ajuste manual de recebimento
    ('painel_lider_sub_ajuste_recebimento', NULL::TEXT[], lideranca, false),
    ('ajuste_recebimento_lancar',           NULL::TEXT[], lideranca, false),
    ('ajuste_recebimento_administrar',      NULL::TEXT[], ninguem,   false),
    -- Desafios
    ('desafios_configurar',        NULL::TEXT[], ninguem,   false),
    ('desafios_configurar_setor',  NULL::TEXT[], lideranca, false)
  ) AS t(chave, tenants, padrao, explicita);
$function$;

-- ── 2. As doze nascem com quem ja podia ────────────────────────────────────
--
-- Cada expressao abaixo foi lida do codigo que a chave substitui. Os grupos
-- vem de `src/lib/index.ts`:
--
--   PERFIS_ADMIN ......... administrador, super_admin
--   PERFIS_LIDER ......... lider, elite, gerencia, ouvidoria
--   PERFIS_DIRETORIA ..... diretoria
--   isPerfilAdminOuLider . PERFIS_ADMIN + PERFIS_LIDER
--   PERFIS_AUTORIZADORES . lider, elite, gerencia, diretoria + PERFIS_ADMIN

UPDATE public.cargos_permissoes c
SET permissoes = c.permissoes || jsonb_build_object(
      -- uso_telas_select: `fn_user_has_any_role(['administrador'])` + super_admin
      'ver_monitoramento_uso',       c.cargo IN ('administrador','super_admin'),
      -- AdminConfiguracoes.tsx: `isPerfilAdmin`
      'ver_banco_dados',             c.cargo IN ('administrador','super_admin'),
      -- lib/index.ts: PERFIS_AUTORIZADORES
      'acordos_autorizar_tabulacao', c.cargo IN ('lider','elite','gerencia','diretoria','administrador','super_admin'),
      -- BotaoCapturaErpPP.tsx: `isPerfilAdmin`
      'acordos_capturar_erp',        c.cargo IN ('administrador','super_admin'),
      -- AcordoNovoInline/FormBP.tsx: `isPerfilAdmin`
      'acordos_campos_admin',        c.cargo IN ('administrador','super_admin'),
      -- Analitico/index.tsx: `isPerfilAdmin` (diretoria fora, de proposito)
      'analitico_validar_relatorio', c.cargo IN ('administrador','super_admin'),
      -- useTicketsAcesso.ts: `isPerfilAdmin`
      'tickets_administrar',         c.cargo IN ('administrador','super_admin'),
      -- useTicketsAcesso.ts: `isPerfilLider || isPerfilDiretoria`
      'tickets_abrir',               c.cargo IN ('lider','elite','gerencia','ouvidoria','diretoria'),
      -- useOuvidoriaAcesso.ts: `cargo === 'ouvidoria'` (admin ja tinha por isAdmin)
      'ouvidoria_responsavel',       c.cargo IN ('ouvidoria','administrador','super_admin'),
      -- AdminUsuarios.tsx: `isAdmin || isSuperAdmin`
      'usuarios_ver_administradores',    c.cargo IN ('administrador','super_admin'),
      -- AdminSetoresAba.tsx: `administrador || super_admin`
      'usuarios_desfazer_transferencia', c.cargo IN ('administrador','super_admin'),
      -- acessoMultiempresa.service.ts: `gerencia || diretoria`, alem da flag por
      -- pessoa. `administrador` entra aqui e GANHA — ver o cabecalho.
      'acesso_multiempresa_permitido',   c.cargo IN ('gerencia','diretoria','administrador','super_admin')
    ),
    atualizado_em = now();

-- ── 3. A ultima policy que decidia por cargo ───────────────────────────────
--
-- `uso_telas` e `uso_sessoes` exigiam cargo `administrador`. Era o exemplo que
-- originou este trabalho: ligar `ver_logs` para a diretoria abria a trilha e
-- nao o monitoramento, sem nada na tela dizendo por que.
--
-- O embrulho em `(SELECT ...)` fica: sem ele o Postgres avalia a funcao STABLE
-- uma vez POR LINHA, que foi a causa do `statement timeout` corrigido em
-- `20260824170000`. Com ele vira InitPlan, avaliado uma vez por consulta.

DROP POLICY IF EXISTS uso_telas_select ON public.uso_telas;
CREATE POLICY uso_telas_select ON public.uso_telas
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_is_super_admin())
    OR (empresa_id = (SELECT public.fn_user_empresa_id())
        AND (SELECT public.fn_user_tem('ver_monitoramento_uso')))
  );

DROP POLICY IF EXISTS uso_sessoes_select ON public.uso_sessoes;
CREATE POLICY uso_sessoes_select ON public.uso_sessoes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_is_super_admin())
    OR (empresa_id = (SELECT public.fn_user_empresa_id())
        AND (SELECT public.fn_user_tem('ver_monitoramento_uso')))
  );

-- ── 3b. A flag de multiempresa pergunta ao painel qual cargo ela habilita ──
--
-- `fn_user_acesso_multiempresa` exigia `acesso_multiempresa = true` E cargo em
-- ('gerencia','diretoria'), com a lista escrita dentro da funcao. A flag
-- continua sendo por PESSOA — sao duas travas, e so a segunda muda de dono.
--
-- O que NAO muda: o cargo continua conferido na hora, nao na hora de liberar.
-- Quem for rebaixado (ou tiver a chave desligada no painel) perde o acesso no
-- mesmo instante, sem depender de alguem lembrar de revogar a flag. Era a razao
-- declarada do desenho original e continua valendo — o que era lista de cargo
-- virou consulta ao painel, e nada mais.

CREATE OR REPLACE FUNCTION public.fn_user_acesso_multiempresa()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  -- A chave-mestra vem PRIMEIRO, e sem exigir a flag: o super_admin nunca
  -- recebeu `acesso_multiempresa = true` (ele atravessa por cargo desde
  -- 20260818300000), e o cliente sempre o tratou a parte. Sem esta linha,
  -- passar a perguntar so a esta funcao tiraria dele a troca de empresa.
  SELECT public.fn_user_is_super_admin()
     OR (
       EXISTS (
         SELECT 1 FROM public.perfis p
          WHERE p.id = auth.uid() AND p.acesso_multiempresa
       )
       AND public.fn_user_tem('acesso_multiempresa_permitido')
     );
$fn$;

COMMENT ON FUNCTION public.fn_user_acesso_multiempresa() IS
  'true para super_admin (chave-mestra, sem flag), ou quando a pessoa foi '
  'liberada pelo super_admin (flag em perfis) E o painel concede '
  'acesso_multiempresa_permitido ao cargo dela AGORA. As duas travas sao '
  'independentes; a segunda deixou de ser lista de cargo em 20260824200000.';

COMMENT ON COLUMN public.perfis.acesso_multiempresa IS
  'Liberado pelo super_admin para ver as duas empresas. So vale se o painel '
  'conceder acesso_multiempresa_permitido ao cargo — ver fn_user_acesso_multiempresa.';

-- ── 4. Prova ───────────────────────────────────────────────────────────────

DO $prova$
DECLARE
  v_falta   INTEGER;
  v_perdas  TEXT := '';
  v_r       RECORD;
  v_chaves  TEXT[] := ARRAY[
    'ver_monitoramento_uso','ver_banco_dados','acordos_autorizar_tabulacao',
    'acordos_capturar_erp','acordos_campos_admin','analitico_validar_relatorio',
    'tickets_administrar','tickets_abrir','ouvidoria_responsavel',
    'usuarios_ver_administradores','usuarios_desfazer_transferencia',
    'acesso_multiempresa_permitido'
  ];
  v_chave   TEXT;
BEGIN
  -- (a) O catalogo do banco conhece as doze. Chave que o frontend consulta e o
  --     catalogo nao lista vira permissao que nunca liga — o defeito de 15/08.
  FOREACH v_chave IN ARRAY v_chaves LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = v_chave) THEN
      RAISE EXCEPTION 'chave % ausente do catalogo', v_chave;
    END IF;
  END LOOP;

  -- (b) Toda linha de `cargos_permissoes` ganhou as doze. Chave ausente resolve
  --     como `false` em `fn_user_tem`, entao uma linha esquecida seria um cargo
  --     perdendo acesso em silencio.
  SELECT COUNT(*) INTO v_falta
    FROM public.cargos_permissoes c, unnest(v_chaves) k
   WHERE NOT (c.permissoes ? k);
  IF v_falta > 0 THEN
    RAISE EXCEPTION '% par(es) cargo/chave sem valor gravado', v_falta;
  END IF;

  -- (c) NINGUEM PERDE. Cargo a cargo, nas duas empresas: a chave nova precisa
  --     estar ligada para todo cargo que ja podia. Ganho e permitido (e o
  --     objetivo); perda seria erro de derivacao, nao decisao de ninguem.
  FOR v_r IN
    SELECT c.cargo, e.slug,
           (c.permissoes->>'tickets_administrar')::BOOLEAN         AS t_adm,
           (c.permissoes->>'tickets_abrir')::BOOLEAN               AS t_abr,
           (c.permissoes->>'acordos_autorizar_tabulacao')::BOOLEAN AS aut,
           (c.permissoes->>'ouvidoria_responsavel')::BOOLEAN       AS ouv,
           (c.permissoes->>'ver_monitoramento_uso')::BOOLEAN       AS uso
      FROM public.cargos_permissoes c
      JOIN public.empresas e ON e.id = c.empresa_id
  LOOP
    IF v_r.cargo IN ('administrador','super_admin') AND NOT (v_r.t_adm AND v_r.uso) THEN
      v_perdas := v_perdas || format('%s/%s perdeu admin; ', v_r.slug, v_r.cargo);
    END IF;
    IF v_r.cargo IN ('lider','elite','gerencia','ouvidoria','diretoria') AND NOT v_r.t_abr THEN
      v_perdas := v_perdas || format('%s/%s perdeu tickets_abrir; ', v_r.slug, v_r.cargo);
    END IF;
    IF v_r.cargo IN ('lider','elite','gerencia','diretoria') AND NOT v_r.aut THEN
      v_perdas := v_perdas || format('%s/%s perdeu autorizar; ', v_r.slug, v_r.cargo);
    END IF;
    IF v_r.cargo = 'ouvidoria' AND NOT v_r.ouv THEN
      v_perdas := v_perdas || format('%s/%s perdeu ouvidoria; ', v_r.slug, v_r.cargo);
    END IF;
  END LOOP;
  IF v_perdas <> '' THEN
    RAISE EXCEPTION 'PERDA de acesso detectada: %', v_perdas;
  END IF;

  -- (d) As policies de uso perguntam ao painel, e nao ao cargo.
  FOR v_r IN
    SELECT policyname, qual::TEXT AS expr
      FROM pg_policies
     WHERE schemaname = 'public'
       AND policyname IN ('uso_telas_select','uso_sessoes_select')
  LOOP
    IF v_r.expr !~ 'ver_monitoramento_uso' THEN
      RAISE EXCEPTION '% nao pergunta por ver_monitoramento_uso', v_r.policyname;
    END IF;
    IF v_r.expr ~ 'fn_user_has_any_role' THEN
      RAISE EXCEPTION '% voltou a decidir por lista de cargo', v_r.policyname;
    END IF;
  END LOOP;

  RAISE NOTICE 'Painel manda nas telas: 12 chaves novas, ninguem perdeu acesso, '
               'monitoramento de uso deixou de exigir cargo.';
END
$prova$;

COMMIT;
