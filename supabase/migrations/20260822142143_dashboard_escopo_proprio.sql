-- ============================================================================
-- Dashboard: escopo proprio — fase 3a
-- ============================================================================
--
-- ## O que muda
--
-- O Dashboard passa a ter escopo proprio:
--
--   dashboard_escopo_individual | _equipe | _setor | _todos_setores
--
-- Com isso saem as duas ultimas chamadas de `veTodosOsSetores` que serviam a
-- esta tela: o AnalyticsPanel e o BotaoFechamento, que vive dentro dele.
--
-- ## O Dashboard NAO ganha chave de aba, e isso e deliberado
--
-- Ele e a rota `/`. O login e tres redirecionamentos de `ProtectedRoute`
-- apontam para la. Um interruptor que o desligue tranca a pessoa fora do app, e
-- para onde ela deveria cair e decisao de produto, nao de implementacao.
-- Enquanto essa decisao nao existir, o Dashboard tem escopo e nenhum
-- interruptor. Ver `src/lib/permissoes-escopo.ts`.
--
-- ## Aqui a derivacao NAO e limitada pelo teto do RLS, e a fase 1 foi
--
-- Na Lixeira o corte pelo teto era invisivel: aquela tela nao tem filtro, entao
-- reduzir `setor` para `individual` num cargo cujo RLS so devolve os proprios
-- nao mudava nada na tela.
--
-- No Dashboard mudaria. `dashboard_escopo_equipe` nasce de `filtrar_por_equipe`,
-- que HOJE faz o seletor de equipe aparecer para elite e gerencia da PaguePlay —
-- cargos cujo teto e "so os proprios". Cortar pelo teto sumiria com um seletor
-- que a pessoa ve hoje. O seletor nao serve para nada la (o RLS devolve so os
-- proprios acordos de qualquer jeito), mas some-lo e mudanca visivel, e o
-- contrato desta fase e que nada muda.
--
-- Entao: derivacao fiel aqui, e o corte pelo teto vira responsabilidade
-- explicita da FASE 7, que e quem levanta o RLS. La a prova de equivalencia
-- daquela fase mostra, cargo a cargo, quem ganharia alcance — para ser
-- aprovado, e nao para acontecer sozinho.
--
-- Sem isso, `dashboard_escopo_setor` de elite/PaguePlay viraria setor de
-- verdade na fase 7, calado.
--
-- ## Nao mexe em RLS
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

DO $guarda_excecoes$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.perfis_permissoes
    WHERE permissoes ?| ARRAY[
      'ver_acordos_gerais', 'ver_todos_setores',
      'ver_analiticos_global', 'filtrar_por_equipe'
    ]
  ) THEN
    RAISE EXCEPTION
      'Ha excecao por pessoa nas chaves do Dashboard; derivacao individual precisa ser escrita antes.';
  END IF;
END
$guarda_excecoes$;

-- ── Snapshot ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permissoes_backup_20260822_dashboard AS
SELECT now() AS copiado_em, c.* FROM public.cargos_permissoes c WITH NO DATA;

INSERT INTO public.permissoes_backup_20260822_dashboard
SELECT now(), c.* FROM public.cargos_permissoes c
WHERE NOT EXISTS (SELECT 1 FROM public.permissoes_backup_20260822_dashboard);

ALTER TABLE public.permissoes_backup_20260822_dashboard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.permissoes_backup_20260822_dashboard FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.permissoes_backup_20260822_dashboard IS
  'Snapshot de cargos_permissoes antes da fase 3a da reestruturacao por aba (Dashboard).';

-- ── Derivacao ───────────────────────────────────────────────────────────────
-- Reproduz o que a tela faz hoje:
--
--   individual ..... sempre; todo mundo ve os proprios dados
--   equipe ......... `ver_acordos_gerais` E `filtrar_por_equipe`, que e o que
--                    faz o seletor de equipe aparecer
--   setor .......... `ver_acordos_gerais`, que e o que tira o recorte por
--                    operador da consulta
--   todos_setores .. `veTodosOsSetores`: o cargo de cupula OU uma das duas
--                    chaves globais
WITH base AS (
  SELECT
    c.empresa_id,
    c.cargo,
    COALESCE((c.permissoes->>'ver_acordos_gerais')::BOOLEAN, FALSE)    AS ve_gerais,
    -- Ausente vale FALSE, como toda chave: o fallback legado morreu com a
    -- migration 20260815154058, que preencheu o catalogo inteiro em todo
    -- cargo. `temPermissao` devolve false para chave ausente, sem excecao.
    COALESCE((c.permissoes->>'filtrar_por_equipe')::BOOLEAN, FALSE)    AS filtra_equipe,
    COALESCE((c.permissoes->>'ver_todos_setores')::BOOLEAN, FALSE)     AS ve_todos,
    COALESCE((c.permissoes->>'ver_analiticos_global')::BOOLEAN, FALSE) AS ve_global
  FROM public.cargos_permissoes c
)
UPDATE public.cargos_permissoes c
SET permissoes = c.permissoes || jsonb_build_object(
      'dashboard_escopo_individual',    TRUE,
      'dashboard_escopo_equipe',        b.ve_gerais AND b.filtra_equipe,
      'dashboard_escopo_setor',         b.ve_gerais,
      'dashboard_escopo_todos_setores',
        b.cargo IN ('diretoria', 'administrador', 'super_admin')
        OR b.ve_todos OR b.ve_global
    ),
    atualizado_em = now()
FROM base b
WHERE c.empresa_id = b.empresa_id AND c.cargo = b.cargo;

-- ── Prova de equivalencia ───────────────────────────────────────────────────
DO $prova$
DECLARE
  v_erro TEXT;
BEGIN
  -- 1. Individual e universal: ninguem perde a propria visao.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE (c.permissoes->>'dashboard_escopo_individual')::BOOLEAN IS DISTINCT FROM TRUE;
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Dashboard: escopo individual faltando em %', v_erro;
  END IF;

  -- 2. Setor reproduz `ver_acordos_gerais`, que e o que tira o recorte por
  --    operador da consulta de hoje.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE (c.permissoes->>'dashboard_escopo_setor')::BOOLEAN
        IS DISTINCT FROM COALESCE((c.permissoes->>'ver_acordos_gerais')::BOOLEAN, FALSE);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Dashboard: escopo de setor divergiu em %', v_erro;
  END IF;

  -- 3. Equipe reproduz o que faz o seletor de equipe aparecer hoje.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE (c.permissoes->>'dashboard_escopo_equipe')::BOOLEAN
        IS DISTINCT FROM (
          COALESCE((c.permissoes->>'ver_acordos_gerais')::BOOLEAN, FALSE)
          AND COALESCE((c.permissoes->>'filtrar_por_equipe')::BOOLEAN, FALSE)
        );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Dashboard: escopo de equipe divergiu em %', v_erro;
  END IF;

  -- 4. Todos os setores reproduz `veTodosOsSetores`, cargo a cargo.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE (c.permissoes->>'dashboard_escopo_todos_setores')::BOOLEAN
        IS DISTINCT FROM (
          c.cargo IN ('diretoria', 'administrador', 'super_admin')
          OR COALESCE((c.permissoes->>'ver_todos_setores')::BOOLEAN, FALSE)
          OR COALESCE((c.permissoes->>'ver_analiticos_global')::BOOLEAN, FALSE)
        );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Dashboard: alcance total divergiu em %', v_erro;
  END IF;

  -- 5. Toda linha recebeu as quatro chaves.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE NOT (c.permissoes ?& ARRAY[
    'dashboard_escopo_individual', 'dashboard_escopo_equipe',
    'dashboard_escopo_setor', 'dashboard_escopo_todos_setores'
  ]);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Dashboard: chaves faltando em %', v_erro;
  END IF;
END
$prova$;

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
    ('ver_acordos_gerais',          NULL::TEXT[],       lideranca, false),
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
    ('editar_usuarios',             NULL::TEXT[],       ninguem,   false),
    ('ver_equipes',                 NULL::TEXT[],       lideranca, false),
    ('editar_equipes',              NULL::TEXT[],       ninguem,   false),
    ('ver_operadores',              NULL::TEXT[],       lideranca, false),
    -- Metas
    ('ver_metas',                   NULL::TEXT[],       lideranca, false),
    ('gerenciar_metas',             NULL::TEXT[],       cupula,    false),
    -- Filtros e visao (globais — em desmonte pela reestruturacao por aba)
    ('ver_todos_setores',           NULL::TEXT[],       cupula,    false),
    ('ver_analiticos_global',       NULL::TEXT[],       cupula,    false),
    ('filtrar_por_setor',           NULL::TEXT[],       lideranca, false),
    ('filtrar_por_equipe',          NULL::TEXT[],       lideranca, false),
    ('filtrar_por_usuario',         NULL::TEXT[],       lideranca, false),
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
    ('dashboard_escopo_todos_setores', NULL::TEXT[], cupula,    false)
  ) AS t(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo oficial de permissoes. Espelha src/lib/permissoes-catalogo.ts; os '
  'testes de contrato quebram a CI se divergirem.';

COMMIT;
