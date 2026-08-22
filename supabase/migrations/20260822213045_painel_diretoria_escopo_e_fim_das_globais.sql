-- ============================================================================
-- Painel Diretoria: escopo proprio — e o fim das chaves globais de escopo
-- fase 6a
-- ============================================================================
--
-- ## O que muda
--
--   painel_diretoria_escopo_setor | _todos_setores
--
-- E `ver_todos_setores` sai do catalogo — a ULTIMA das seis chaves globais de
-- escopo. Depois desta migration nenhuma pergunta de alcance no sistema e
-- respondida por uma chave que vale para mais de uma aba.
--
-- ## Por que o Painel Diretoria ganhou escopo, se o projeto dizia que nao teria
--
-- `docs/PERMISSOES-POR-ABA-PROJETO.md` secao 3.7 previa so a chave de aba,
-- "sem escopo e sem acoes". Isso valeria se a tela mostrasse a mesma coisa para
-- todo mundo que a abre. Nao mostra:
--
--   • `pagueplay/gerencia` tem `ver_painel_diretoria` e enxerga ali so o
--     PROPRIO SETOR — caia no ramo de lideranca de `useAnalytics`;
--   • diretoria, administrador e super_admin enxergam a empresa inteira.
--
-- Com dois alcances reais, "sem escopo" so teria duas saidas, e as duas sao
-- proibidas pelo pedido: fixar "empresa inteira" liberaria dados novos para a
-- gerencia da PaguePlay, e fixar "proprio setor" tiraria a visao da diretoria.
-- A terceira — ler o escopo do Dashboard — quebraria "uma aba nunca fala pela
-- outra", que e o §2 do pedido.
--
-- Entao a aba ganhou dois niveis, como o Painel Lider e pelo mesmo motivo:
-- `individual` nao faz sentido num painel de diretoria, e `equipe` nunca
-- existiu aqui — a tela so tem filtro de setor.
--
-- ## O `useAnalytics` servia DUAS abas com uma resposta so
--
-- Era o ultimo lugar onde isso acontecia. O hook decidia por cargo mais
-- `ver_todos_setores`, e Dashboard e Painel Diretoria herdavam a mesma
-- resposta. Agora quem chama passa os niveis da PROPRIA aba, e o parametro e
-- obrigatorio: um terceiro consumidor que esquecesse herdaria em silencio o
-- alcance de outra tela, entao o compilador cobra.
--
-- ## Um defeito encontrado e NAO corrigido, de proposito
--
-- Quem tem `todos_setores` recorta os KPIs so por `setorFiltro`: escolher "so
-- os meus" no filtro do Dashboard estreita a TABELA de acordos e nao estreita
-- os cartoes. Vale hoje para administrador, super_admin e diretoria.
--
-- Corrigir muda numero na tela de quem ja usa o painel, e o contrato desta
-- reestruturacao e que nada muda. Fica registrado no codigo e aqui, para ser
-- decidido a parte.
--
-- ## Prova
--
-- O bloco abaixo verifica, cargo a cargo nas duas empresas, que:
--
--   1. `painel_diretoria_escopo_todos_setores` reproduz a visao ampla antiga;
--   2. `dashboard_escopo_todos_setores` TAMBEM reproduz — porque o codigo do
--      Dashboard passou a ler essa chave no lugar da logica de cargo;
--   3. `dashboard_escopo_setor` cobre exatamente quem caia no ramo de setor.
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
    WHERE permissoes ?| ARRAY['ver_painel_diretoria', 'ver_todos_setores']
  ) THEN
    RAISE EXCEPTION
      'Ha excecao por pessoa nas chaves do Painel Diretoria; derivacao individual precisa ser escrita antes.';
  END IF;
END
$guarda_excecoes$;

-- ── Snapshot ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permissoes_backup_20260822_diretoria AS
SELECT now() AS copiado_em, c.* FROM public.cargos_permissoes c WITH NO DATA;

INSERT INTO public.permissoes_backup_20260822_diretoria
SELECT now(), c.* FROM public.cargos_permissoes c
WHERE NOT EXISTS (SELECT 1 FROM public.permissoes_backup_20260822_diretoria);

ALTER TABLE public.permissoes_backup_20260822_diretoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.permissoes_backup_20260822_diretoria FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.permissoes_backup_20260822_diretoria IS
  'Snapshot de cargos_permissoes antes da fase 6a (Painel Diretoria e fim das globais).';

-- ── Derivacao ───────────────────────────────────────────────────────────────
--   todos_setores .. a "visao ampla" de `useAnalytics`: cargo de cupula OU
--                    lideranca com `ver_todos_setores`
--   setor .......... quem caia no ramo de lideranca, mais a cupula (que nunca
--                    chega la porque `todos_setores` responde antes). So o
--                    operador fica de fora, e ele nao abre esta aba hoje
WITH base AS (
  SELECT
    c.empresa_id,
    c.cargo,
    c.cargo IN ('administrador', 'super_admin') AS acesso_total,
    c.cargo IN ('administrador', 'super_admin', 'diretoria')
      OR (c.cargo IN ('lider', 'elite', 'gerencia', 'ouvidoria')
          AND COALESCE((c.permissoes->>'ver_todos_setores')::BOOLEAN, FALSE)) AS ampla
  FROM public.cargos_permissoes c
)
UPDATE public.cargos_permissoes c
SET permissoes = c.permissoes || jsonb_build_object(
      'painel_diretoria_escopo_setor',
        b.acesso_total OR b.cargo <> 'operador',
      'painel_diretoria_escopo_todos_setores',
        b.acesso_total OR b.ampla
    ),
    atualizado_em = now()
FROM base b
WHERE c.empresa_id = b.empresa_id AND c.cargo = b.cargo;

-- ── Prova de equivalencia ───────────────────────────────────────────────────
DO $prova$
DECLARE
  v_erro TEXT;
  c_cupula   CONSTANT TEXT[] := ARRAY['administrador', 'super_admin', 'diretoria'];
  c_lideres  CONSTANT TEXT[] := ARRAY['lider', 'elite', 'gerencia', 'ouvidoria'];
  c_total    CONSTANT TEXT[] := ARRAY['administrador', 'super_admin'];
BEGIN
  -- 1. Painel Diretoria: alcance total reproduz a visao ampla antiga.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE NOT (c.cargo = ANY(c_total))
    AND (COALESCE((c.permissoes->>'ver_painel_diretoria')::BOOLEAN, FALSE)
         AND (c.permissoes->>'painel_diretoria_escopo_todos_setores')::BOOLEAN)
        IS DISTINCT FROM (
          COALESCE((c.permissoes->>'ver_painel_diretoria')::BOOLEAN, FALSE)
          AND (c.cargo = ANY(c_cupula)
               OR (c.cargo = ANY(c_lideres)
                   AND COALESCE((c.permissoes->>'ver_todos_setores')::BOOLEAN, FALSE)))
        );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Painel Diretoria: alcance total divergiu em %', v_erro;
  END IF;

  -- 2. Dashboard: a chave que o codigo passou a ler reproduz a MESMA visao
  --    ampla. Sem isto, trocar a logica de cargo por ela mudaria o alcance de
  --    quem abre o Dashboard — que e todo mundo.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE NOT (c.cargo = ANY(c_total))
    AND (c.permissoes->>'dashboard_escopo_todos_setores')::BOOLEAN
        IS DISTINCT FROM (
          c.cargo = ANY(c_cupula)
          OR (c.cargo = ANY(c_lideres)
              AND COALESCE((c.permissoes->>'ver_todos_setores')::BOOLEAN, FALSE))
        );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION
      'Dashboard: `dashboard_escopo_todos_setores` nao reproduz a visao ampla de useAnalytics em %',
      v_erro;
  END IF;

  -- 3. Dashboard: quem NAO tem alcance total cai no ramo de setor exatamente
  --    quando era lideranca. (Para a cupula a chave e irrelevante: o ramo de
  --    `todos_setores` responde antes.)
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE NOT (c.cargo = ANY(c_total))
    AND NOT (c.permissoes->>'dashboard_escopo_todos_setores')::BOOLEAN
    AND (c.permissoes->>'dashboard_escopo_setor')::BOOLEAN
        IS DISTINCT FROM (c.cargo = ANY(c_lideres));
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Dashboard: o ramo de setor divergiu em %', v_erro;
  END IF;

  -- 4. Toda linha recebeu as duas chaves novas.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE NOT (c.permissoes ?& ARRAY[
    'painel_diretoria_escopo_setor', 'painel_diretoria_escopo_todos_setores'
  ]);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Painel Diretoria: chaves faltando em %', v_erro;
  END IF;

  -- 5. INVARIANTE: acesso total nao tem chave desligada fora das explicitas.
  SELECT string_agg(e.slug || '/' || c.cargo || ': ' || x.key, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  CROSS JOIN LATERAL jsonb_each_text(c.permissoes) x
  WHERE c.cargo = ANY(c_total)
    AND x.value = 'false'
    AND x.key NOT IN (
      SELECT chave FROM public.fn_permissoes_catalogo() WHERE explicita
    );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION
      'Acesso total com chave desligada fora das de concessao explicita: %', v_erro;
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
    ('editar_usuarios',             NULL::TEXT[],       ninguem,   false),
    ('ver_equipes',                 NULL::TEXT[],       lideranca, false),
    ('editar_equipes',              NULL::TEXT[],       ninguem,   false),
    ('ver_operadores',              NULL::TEXT[],       lideranca, false),
    -- Metas
    ('ver_metas',                   NULL::TEXT[],       lideranca, false),
    ('gerenciar_metas',             NULL::TEXT[],       cupula,    false),
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
