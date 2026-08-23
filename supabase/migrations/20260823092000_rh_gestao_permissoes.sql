-- ============================================================================
-- RH Gestao — permissoes e configuracao inicial
-- ============================================================================
--
-- ## As chaves
--
-- A aba entra em `Abas e telas` (`ver_rh_gestao`) e ganha tres niveis de
-- escopo, como as outras abas convertidas. As ACOES ficam separadas do
-- alcance, pelo mesmo motivo de `aprovar_pix_automatico` estar separado de
-- `pix_escopo_setor`: enxergar e decidir sao perguntas diferentes, e juntar as
-- duas foi o que este projeto passou dez migrations desfazendo.
--
-- ## Por que as chaves do RH nascem DESLIGADAS para todo cargo
--
-- `rh_aprovar`, `rh_devolver`, `rh_gerenciar_fechamento`, `rh_configurar` e
-- `rh_editar_cracha` nascem em `ninguem`. Nao e esquecimento: o pedido diz para
-- NAO criar um cargo `rh` se as permissoes existentes bastarem, e bastam — o
-- administrador abre o painel e concede nominalmente a quem e do RH, por pessoa
-- (`perfis_permissoes`) ou por cargo.
--
-- Semear qualquer uma delas em `gerencia` daria a quatro pessoas o poder de
-- aprovar a propria folha, sem ninguem ter decidido isso.
--
-- ## `rh_reabrir_fechamento` exige concessao NOMINAL
--
-- Ela entra em `PERMISSOES_EXPLICITAS` (a coluna `explicita` do catalogo), ao
-- lado de `ignorar_fechamento_mes` e pela mesma razao: reabrir uma competencia
-- finalizada desfaz um fato ja publicado — a folha ja circulou. O acesso total
-- do administrador nao concede isso sozinho; alguem precisa ligar.
--
-- ## A semeadura inicial de celulas e setores
--
-- Birigui/Premiacao e Marilia/Comissao com os setores que o pedido lista. O
-- vinculo e feito por NOME de setor e so quando o nome existe naquela empresa:
-- inventar setor aqui criaria cadastro fantasma, e este script roda nas duas
-- operacoes.
--
-- Isto e ponto de PARTIDA, nao regra: a partir daqui, mudar celula ou tipo de
-- remuneracao e edicao de tela, nao migration.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── Catalogo SQL ────────────────────────────────────────────────────────────
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
    ('pix_ajustar_saldo',            ARRAY['bookplay'], ARRAY['lider','elite','gerencia'], false),
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
    ('analitico_sub_sem_operador',       NULL::TEXT[], todos,     false),
    -- RH Gestao (Premiacao e Comissao)
    ('ver_rh_gestao',              NULL::TEXT[], lideranca, false),
    ('rh_escopo_equipe',           NULL::TEXT[], ARRAY['lider','elite'], false),
    ('rh_escopo_setor',            NULL::TEXT[], ARRAY['gerencia'], false),
    ('rh_escopo_todos_setores',    NULL::TEXT[], ARRAY['diretoria'], false),
    ('rh_preencher',               NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('rh_validar',                 NULL::TEXT[], ARRAY['gerencia'], false),
    ('rh_enviar',                  NULL::TEXT[], ARRAY['gerencia'], false),
    ('rh_aprovar',                 NULL::TEXT[], ninguem,   false),
    ('rh_devolver',                NULL::TEXT[], ninguem,   false),
    ('rh_gerenciar_fechamento',    NULL::TEXT[], ninguem,   false),
    ('rh_reabrir_fechamento',      NULL::TEXT[], ninguem,   true),
    ('rh_configurar',              NULL::TEXT[], ninguem,   false),
    ('rh_editar_cracha',           NULL::TEXT[], ninguem,   false)
  ) AS t(chave, tenants, padrao, explicita);
$function$;


COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo oficial de permissoes. Espelha src/lib/permissoes-catalogo.ts; os '
  'testes de contrato quebram a CI se divergirem.';

-- ── As chaves nos cargos que ja existem ─────────────────────────────────────
-- `fn_permissoes_catalogo` semeia empresa NOVA. As que ja existem precisam das
-- chaves acrescentadas aqui, com o mesmo padrao — senao a ausencia vale
-- NEGADO e o modulo nasce invisivel ate alguem descobrir por que.
DO $semear$
DECLARE
  v_chave RECORD;
BEGIN
  FOR v_chave IN SELECT chave, padrao, explicita FROM public.fn_permissoes_catalogo()
                  WHERE chave LIKE 'rh_%' OR chave = 'ver_rh_gestao'
  LOOP
    UPDATE public.cargos_permissoes cp
       SET permissoes = cp.permissoes || jsonb_build_object(
             v_chave.chave,
             CASE
               WHEN cp.cargo IN ('administrador', 'super_admin')
                 THEN NOT v_chave.explicita
               ELSE cp.cargo = ANY(v_chave.padrao)
             END),
           atualizado_em = NOW()
     WHERE NOT (cp.permissoes ? v_chave.chave);
  END LOOP;
END
$semear$;

-- ── Ponto de partida: celulas e setores ─────────────────────────────────────
--
-- Birigui trabalha PREMIACAO; Marilia, COMISSAO. Os nomes de setor sao os que o
-- pedido lista. O vinculo so acontece quando o setor EXISTE com aquele nome na
-- empresa — este script roda nas duas operacoes, e criar setor aqui inventaria
-- cadastro que ninguem pediu.
DO $partida$
DECLARE
  v_emp        RECORD;
  v_birigui    UUID;
  v_marilia    UUID;
  v_faltando   TEXT;
  c_birigui CONSTANT TEXT[] := ARRAY[
    'Jornada', 'Manutenção', 'Play 1', 'Play 2', 'Play 3', 'Receptivo'];
  c_marilia CONSTANT TEXT[] := ARRAY[
    'Play 4', 'Play 5', 'Amauri Digital', 'Play Mix Marília'];
BEGIN
  FOR v_emp IN SELECT id, nome FROM public.empresas LOOP
    INSERT INTO public.rh_celulas (empresa_id, nome, ordem)
    VALUES (v_emp.id, 'Birigui', 1)
    ON CONFLICT (empresa_id, nome) DO NOTHING;

    INSERT INTO public.rh_celulas (empresa_id, nome, ordem)
    VALUES (v_emp.id, 'Marília', 2)
    ON CONFLICT (empresa_id, nome) DO NOTHING;

    SELECT id INTO v_birigui FROM public.rh_celulas WHERE empresa_id = v_emp.id AND nome = 'Birigui';
    SELECT id INTO v_marilia FROM public.rh_celulas WHERE empresa_id = v_emp.id AND nome = 'Marília';

    INSERT INTO public.rh_config_setores (empresa_id, setor_id, celula_id, tipo_remuneracao)
    SELECT v_emp.id, s.id, v_birigui, 'premiacao'
      FROM public.setores s
     WHERE s.empresa_id = v_emp.id AND s.nome = ANY(c_birigui)
    ON CONFLICT (empresa_id, setor_id) DO NOTHING;

    INSERT INTO public.rh_config_setores (empresa_id, setor_id, celula_id, tipo_remuneracao)
    SELECT v_emp.id, s.id, v_marilia, 'comissao'
      FROM public.setores s
     WHERE s.empresa_id = v_emp.id AND s.nome = ANY(c_marilia)
    ON CONFLICT (empresa_id, setor_id) DO NOTHING;

    -- Nome que o pedido lista e a empresa nao tem. Nao e erro — a lista veio de
    -- uma operacao so —, mas quem aplicar a migration precisa ver.
    SELECT string_agg(n, ', ') INTO v_faltando
      FROM unnest(c_birigui || c_marilia) AS n
     WHERE NOT EXISTS (
       SELECT 1 FROM public.setores s WHERE s.empresa_id = v_emp.id AND s.nome = n);

    IF v_faltando IS NOT NULL THEN
      RAISE NOTICE 'RH Gestao — % nao tem estes setores (nada foi criado): %', v_emp.nome, v_faltando;
    END IF;
  END LOOP;
END
$partida$;

COMMIT;
