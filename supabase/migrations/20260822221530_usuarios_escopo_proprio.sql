-- ============================================================================
-- Usuarios: escopo proprio — fase 6b
-- ============================================================================
--
-- ## O que muda
--
--   usuarios_escopo_setor | usuarios_escopo_todos_setores
--
-- Quem aparece na lista de gestao de pessoas deixa de sair de listas de cargo
-- escritas dentro de `aplicarFiltroAcesso`.
--
-- ## A ouvidoria via a empresa inteira sem que uma linha dissesse isso
--
-- O filtro antigo tinha tres saidas: `['operador','lider','elite']` viam o
-- proprio setor, `['gerencia','diretoria']` viam a empresa, e o `return` final
-- pegava todo o resto. `ouvidoria` — que tem `ver_usuarios = true` nas duas
-- empresas — caia nesse `return` e via a empresa inteira. Nao por decisao: por
-- nao estar em nenhuma das duas listas.
--
-- A derivacao abaixo preserva isso na letra (`NOT IN` das tres). Se a intencao
-- era outra, agora da para mudar no painel, que e o ponto.
--
-- ## Dois eixos, e so um virou escopo
--
-- A tela responde duas perguntas diferentes:
--
--   1. ATE ONDE eu enxergo — proprio setor ou empresa. Virou escopo de aba.
--   2. QUEM eu enxergo — se contas de `administrador` e `super_admin` aparecem
--      na lista. Continua saindo do cargo de quem olha.
--
-- Juntar as duas num nivel so misturaria "alcance" com "hierarquia", e o
-- resultado seria um toggle que faz duas coisas sem avisar.
--
-- ## Tickets e Configuracoes NAO entraram, e nao e esquecimento
--
-- • **Tickets** nao e governado por permissao: quem ve a aba sai de
--   `useTicketsAcesso` — uma flag por empresa, mais o cadastro de atendentes,
--   mais o cargo. Criar `tickets_escopo_*` produziria chaves sem consumidor, e
--   o teste de contrato reprova chave decorativa — com razao, porque foi
--   exatamente isso que gerou o defeito de 15/08.
--
-- • **Configuracoes** ja e uma aba unica atras de `ver_configuracoes`, com
--   acesso so de `administrador`. Sub-chaves ali seriam recorte de uma tela
--   que um cargo so abre.
--
-- Se um dia Tickets passar a ter escopo de verdade, a chave nasce junto com o
-- codigo que a le — que e a regra do §2.4-b.
--
-- ## Nao mexe em RLS
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

DO $guarda_excecoes$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.perfis_permissoes WHERE permissoes ? 'ver_usuarios'
  ) THEN
    RAISE EXCEPTION
      'Ha excecao por pessoa em ver_usuarios; derivacao individual precisa ser escrita antes.';
  END IF;
END
$guarda_excecoes$;

-- ── Snapshot ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permissoes_backup_20260822_usuarios AS
SELECT now() AS copiado_em, c.* FROM public.cargos_permissoes c WITH NO DATA;

INSERT INTO public.permissoes_backup_20260822_usuarios
SELECT now(), c.* FROM public.cargos_permissoes c
WHERE NOT EXISTS (SELECT 1 FROM public.permissoes_backup_20260822_usuarios);

ALTER TABLE public.permissoes_backup_20260822_usuarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.permissoes_backup_20260822_usuarios FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.permissoes_backup_20260822_usuarios IS
  'Snapshot de cargos_permissoes antes da fase 6b da reestruturacao por aba (Usuarios).';

-- ── Derivacao ───────────────────────────────────────────────────────────────
--   setor .......... sempre: quem abre a aba enxerga ao menos o proprio setor
--   todos_setores .. tudo que NAO caia no ramo de setor. E `NOT IN` e nao uma
--                    lista positiva porque era assim no codigo — o `return`
--                    final pegava qualquer cargo fora das duas listas
UPDATE public.cargos_permissoes c
SET permissoes = c.permissoes || jsonb_build_object(
      'usuarios_escopo_setor',         TRUE,
      'usuarios_escopo_todos_setores',
        c.cargo IN ('administrador', 'super_admin')
        OR c.cargo NOT IN ('operador', 'lider', 'elite')
    ),
    atualizado_em = now();

-- ── Prova de equivalencia ───────────────────────────────────────────────────
DO $prova$
DECLARE
  v_erro TEXT;
  c_total CONSTANT TEXT[] := ARRAY['administrador', 'super_admin'];
BEGIN
  -- 1. Setor e universal.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE (c.permissoes->>'usuarios_escopo_setor')::BOOLEAN IS DISTINCT FROM TRUE;
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Usuarios: escopo de setor faltando em %', v_erro;
  END IF;

  -- 2. Alcance total reproduz o filtro antigo, cargo a cargo.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE NOT (c.cargo = ANY(c_total))
    AND (COALESCE((c.permissoes->>'ver_usuarios')::BOOLEAN, FALSE)
         AND (c.permissoes->>'usuarios_escopo_todos_setores')::BOOLEAN)
        IS DISTINCT FROM (
          COALESCE((c.permissoes->>'ver_usuarios')::BOOLEAN, FALSE)
          AND c.cargo NOT IN ('operador', 'lider', 'elite')
        );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Usuarios: alcance total divergiu em %', v_erro;
  END IF;

  -- 3. A ouvidoria continua enxergando a empresa — era o caso implicito.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE c.cargo = 'ouvidoria'
    AND (c.permissoes->>'usuarios_escopo_todos_setores')::BOOLEAN IS DISTINCT FROM TRUE;
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Usuarios: a ouvidoria perdeu o alcance que tinha, em %', v_erro;
  END IF;

  -- 4. Toda linha recebeu as duas chaves.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE NOT (c.permissoes ?& ARRAY[
    'usuarios_escopo_setor', 'usuarios_escopo_todos_setores'
  ]);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Usuarios: chaves faltando em %', v_erro;
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
    ('usuarios_escopo_setor',         NULL::TEXT[], todos, false),
    ('usuarios_escopo_todos_setores', NULL::TEXT[], ARRAY['gerencia','diretoria','ouvidoria'], false),
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
