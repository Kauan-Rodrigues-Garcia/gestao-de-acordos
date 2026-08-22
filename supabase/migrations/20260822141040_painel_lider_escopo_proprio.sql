-- ============================================================================
-- Painel Lider: escopo e abas internas proprios — fase 2
-- ============================================================================
--
-- ## O que muda
--
-- O alcance do Painel Lider vinha de `veTodosOsSetores(cargo, temPermissao)`,
-- que respondia de dois jeitos ao mesmo tempo:
--
--   * por CARGO — `administrador`, `super_admin` e `diretoria` recebiam "todos
--     os setores" por estarem numa lista dentro do codigo;
--   * por PERMISSAO GLOBAL — `ver_todos_setores` ou `ver_analiticos_global`,
--     as mesmas chaves que decidem Dashboard, Analitico e Recebimento.
--
-- Agora quem decide sao as chaves da propria aba:
--
--   painel_lider_escopo_setor | painel_lider_escopo_todos_setores
--   painel_lider_sub_acompanhamento
--   painel_lider_sub_desempenho_equipes
--   painel_lider_sub_quartis
--   painel_lider_sub_grafico_recebimento
--
-- ## So dois niveis, e isso e proposital
--
-- A aba nasceu para a lideranca olhar o proprio setor, e a unica pergunta que
-- ela faz e se essa pessoa enxerga alem dele. `individual` nao faria sentido —
-- um painel de equipe com uma pessoa so nao e painel — e `equipe` ja e o
-- recorte interno da tela, escolhido no filtro, nao uma permissao.
--
-- ## O que fica configuravel e antes nao era
--
-- A diretoria continua enxergando todos os setores: a derivacao abaixo liga a
-- chave para ela. A diferenca e que isso passa a ser editavel no painel de
-- permissoes, em vez de estar escrito no codigo — que era o pedido.
--
-- `administrador` e `super_admin` nao dependem disso: `temPermissao` devolve
-- true para eles antes de consultar tabela nenhuma.
--
-- ## Abas internas
--
-- As quatro nascem ligadas para quem tem `ver_painel_lider`. Nenhuma era
-- escondida antes, entao nascer desligada removeria conteudo que ja existe.
--
-- ## Nao mexe em RLS
--
-- Como a fase 1. O teto continua onde esta; a fase 7 e que trata disso.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── Guarda: excecoes por pessoa ─────────────────────────────────────────────
DO $guarda_excecoes$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.perfis_permissoes
    WHERE permissoes ?| ARRAY['ver_painel_lider', 'ver_todos_setores', 'ver_analiticos_global']
  ) THEN
    RAISE EXCEPTION
      'Ha excecao por pessoa nas chaves do Painel Lider; derivacao individual precisa ser escrita antes.';
  END IF;
END
$guarda_excecoes$;

-- ── Snapshot ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permissoes_backup_20260822_painel_lider AS
SELECT now() AS copiado_em, c.* FROM public.cargos_permissoes c WITH NO DATA;

INSERT INTO public.permissoes_backup_20260822_painel_lider
SELECT now(), c.* FROM public.cargos_permissoes c
WHERE NOT EXISTS (SELECT 1 FROM public.permissoes_backup_20260822_painel_lider);

ALTER TABLE public.permissoes_backup_20260822_painel_lider ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.permissoes_backup_20260822_painel_lider FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.permissoes_backup_20260822_painel_lider IS
  'Snapshot de cargos_permissoes antes da fase 2 da reestruturacao por aba (Painel Lider).';

-- ── Derivacao ───────────────────────────────────────────────────────────────
-- Reproduz `veTodosOsSetores` exatamente: o cargo `diretoria` OU uma das duas
-- chaves globais. `administrador` e `super_admin` ficam de fora da conta porque
-- o app ja os trata como acesso total antes de olhar o mapa — mas a linha deles
-- recebe as chaves do mesmo jeito, para o painel de permissoes desenhar a
-- matriz completa.
WITH base AS (
  SELECT
    c.empresa_id,
    c.cargo,
    -- Ausente vale FALSE: nenhuma destas esta em PERMISSOES_LEGADAS_PADRAO_TRUE.
    -- Ver REGRAS-DE-NEGOCIO 2.4.
    COALESCE((c.permissoes->>'ver_painel_lider')::BOOLEAN, FALSE)      AS ve_painel,
    COALESCE((c.permissoes->>'ver_todos_setores')::BOOLEAN, FALSE)     AS ve_todos,
    COALESCE((c.permissoes->>'ver_analiticos_global')::BOOLEAN, FALSE) AS ve_global
  FROM public.cargos_permissoes c
),
alvo AS (
  SELECT
    b.*,
    b.ve_painel AND (
      b.cargo IN ('diretoria', 'administrador', 'super_admin')
      OR b.ve_todos
      OR b.ve_global
    ) AS ve_todos_setores_no_painel
  FROM base b
)
UPDATE public.cargos_permissoes c
SET permissoes = c.permissoes || jsonb_build_object(
      'painel_lider_escopo_setor',            a.ve_painel,
      'painel_lider_escopo_todos_setores',    a.ve_todos_setores_no_painel,
      'painel_lider_sub_acompanhamento',      a.ve_painel,
      'painel_lider_sub_desempenho_equipes',  a.ve_painel,
      'painel_lider_sub_quartis',             a.ve_painel,
      'painel_lider_sub_grafico_recebimento', a.ve_painel
    ),
    atualizado_em = now()
FROM alvo a
WHERE c.empresa_id = a.empresa_id AND c.cargo = a.cargo;

-- ── Prova de equivalencia ───────────────────────────────────────────────────
DO $prova$
DECLARE
  v_erro TEXT;
BEGIN
  -- 1. Escopo de setor e as quatro abas internas acompanham `ver_painel_lider`.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE EXISTS (
    SELECT 1 FROM unnest(ARRAY[
      'painel_lider_escopo_setor',
      'painel_lider_sub_acompanhamento',
      'painel_lider_sub_desempenho_equipes',
      'painel_lider_sub_quartis',
      'painel_lider_sub_grafico_recebimento'
    ]) AS k
    WHERE (c.permissoes->>k)::BOOLEAN
          IS DISTINCT FROM COALESCE((c.permissoes->>'ver_painel_lider')::BOOLEAN, FALSE)
  );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Chaves do Painel Lider divergiram de ver_painel_lider em: %', v_erro;
  END IF;

  -- 2. "Todos os setores" reproduz `veTodosOsSetores`, cargo a cargo.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE (c.permissoes->>'painel_lider_escopo_todos_setores')::BOOLEAN
        IS DISTINCT FROM (
          COALESCE((c.permissoes->>'ver_painel_lider')::BOOLEAN, FALSE)
          AND (
            c.cargo IN ('diretoria', 'administrador', 'super_admin')
            OR COALESCE((c.permissoes->>'ver_todos_setores')::BOOLEAN, FALSE)
            OR COALESCE((c.permissoes->>'ver_analiticos_global')::BOOLEAN, FALSE)
          )
        );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Alcance do Painel Lider mudou para: %', v_erro;
  END IF;

  -- 3. Toda linha recebeu as seis chaves.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE NOT (c.permissoes ?& ARRAY[
    'painel_lider_escopo_setor', 'painel_lider_escopo_todos_setores',
    'painel_lider_sub_acompanhamento', 'painel_lider_sub_desempenho_equipes',
    'painel_lider_sub_quartis', 'painel_lider_sub_grafico_recebimento'
  ]);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Chaves do Painel Lider faltando em: %', v_erro;
  END IF;
END
$prova$;

-- ── Catalogo ────────────────────────────────────────────────────────────────
-- Espelha `src/lib/permissoes-catalogo.ts`.
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
    ('painel_lider_sub_grafico_recebimento', NULL::TEXT[], lideranca, false)
  ) AS t(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo oficial de permissoes. Espelha src/lib/permissoes-catalogo.ts; os '
  'testes de contrato quebram a CI se divergirem.';

COMMIT;
