-- ============================================================================
-- Permissões 2.0 — duas correções que sobraram da migration 20260815154058
-- ============================================================================
--
-- 1. `ignorar_fechamento_mes` entra no catálogo
--
--    O cadeado de mês fechado (feature de 2026-08-15) nasceu com a exceção
--    cravada em código: `CARGOS_QUE_IGNORAM_FECHAMENTO = ['super_admin']`. Isso
--    deixava o administrador sem saída pela tela — para reabrir um mês, só
--    entrando como super admin ou editando o repositório.
--
--    A chave passa a existir, e nasce DESLIGADA para todo mundo. Ninguém ganha
--    poder com esta migration; o que muda é que ampliar a exceção vira uma
--    decisão registrada, com log de auditoria, em vez de um deploy.
--
-- 2. Empresa nova nasce com os padrões do catálogo, não negando tudo
--
--    A `fn_permissoes_semear_empresa` original resolvia chave ausente como
--    `false`. Era o certo naquele momento: as duas empresas já existiam e o
--    objetivo era acabar com a divergência entre a tela e o sistema, onde
--    ausência significava «provavelmente pode».
--
--    Para uma empresa NOVA a mesma regra fica errada: ela nasceria com os oito
--    cargos zerados, e o primeiro administrador teria de ligar 33 toggles à mão
--    antes de qualquer pessoa conseguir usar o sistema — sem nenhuma pista de
--    quais eram os valores certos.
--
--    A regra passa a ser: valor já gravado manda, chave nova cai no padrão do
--    catálogo. As duas empresas atuais não mudam em nada, porque todas as suas
--    chaves já estão gravadas.
--
-- Idempotente: pode rodar duas vezes.
-- ============================================================================

-- ── 1. O catálogo, agora com padrão por cargo ───────────────────────────────
--
-- Ganha duas colunas, então precisa de DROP: `CREATE OR REPLACE` não muda o
-- tipo de retorno. A única dependente é `fn_permissoes_semear_empresa`, que esta
-- mesma migration recria logo abaixo.
--
-- `padrao` são os cargos que nascem com a permissão LIGADA. Espelha, uma a uma,
-- as constantes `LIDERANCA` e `TODOS` de `src/lib/permissoes-catalogo.ts` — e o
-- teste `permissoes-catalogo.test.ts` é quem garante que os dois lados não
-- divergem, do mesmo jeito que garante a lista de chaves.
--
-- `explicita` marca o poder que o acesso total NÃO concede sozinho. Ver o
-- comentário de `PERMISSOES_EXPLICITAS` no catálogo em TypeScript.

DROP FUNCTION IF EXISTS public.fn_permissoes_catalogo();

CREATE FUNCTION public.fn_permissoes_catalogo()
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
  -- `t.*`, nunca `*`: as colunas de `atalhos` também entrariam no retorno e o
  -- tipo declarado não bateria.
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
    ('ver_logs',                    NULL::TEXT[],       cupula,    false),
    ('ver_configuracoes',           NULL::TEXT[],       ninguem,   false),
    -- Acordos
    ('ver_acordos_gerais',          NULL::TEXT[],       lideranca, false),
    ('criar_acordos',               NULL::TEXT[],       todos,     false),
    ('editar_acordos',              NULL::TEXT[],       todos,     false),
    ('excluir_acordos',             NULL::TEXT[],       todos,     false),
    ('excluir_em_lote',             NULL::TEXT[],       lideranca, false),
    -- Importações
    ('importar_excel',              NULL::TEXT[],       todos,     false),
    ('importar_analitico',          NULL::TEXT[],       lideranca, false),
    ('importar_diario',             NULL::TEXT[],       lideranca, false),
    -- Gestão de pessoas
    ('ver_usuarios',                NULL::TEXT[],       lideranca, false),
    ('editar_usuarios',             NULL::TEXT[],       ninguem,   false),
    ('ver_equipes',                 NULL::TEXT[],       lideranca, false),
    ('editar_equipes',              NULL::TEXT[],       ninguem,   false),
    ('ver_operadores',              NULL::TEXT[],       lideranca, false),
    -- Metas
    ('ver_metas',                   NULL::TEXT[],       lideranca, false),
    ('gerenciar_metas',             NULL::TEXT[],       cupula,    false),
    -- Filtros e visão
    ('ver_todos_setores',           NULL::TEXT[],       cupula,    false),
    ('ver_analiticos_global',       NULL::TEXT[],       cupula,    false),
    ('filtrar_por_setor',           NULL::TEXT[],       lideranca, false),
    ('filtrar_por_equipe',          NULL::TEXT[],       lideranca, false),
    ('filtrar_por_usuario',         NULL::TEXT[],       lideranca, false),
    -- Ações específicas
    ('editar_ouvidoria',            ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('gerenciar_acessos_ouvidoria', ARRAY['pagueplay'], ninguem,   false),
    ('criar_solicitacao_whatsapp',  NULL::TEXT[],       todos,     false),
    ('aprovar_pix_automatico',      ARRAY['bookplay'],  lideranca, false),
    -- Escrever em mês fechado: explícita, e desligada para todos.
    ('ignorar_fechamento_mes',      NULL::TEXT[],       ninguem,   true)
  ) AS t(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catálogo oficial de permissões. Espelha src/lib/permissoes-catalogo.ts; os '
  'testes de contrato quebram a CI se divergirem.';

-- ── 2. A semeadura ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_permissoes_semear_empresa(p_empresa_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_slug    TEXT;
  v_cargo   TEXT;
  v_mapa    JSONB;
  v_atual   JSONB;
  r         RECORD;
  v_total   INTEGER := 0;
BEGIN
  SELECT slug INTO v_slug FROM public.empresas WHERE id = p_empresa_id;

  FOREACH v_cargo IN ARRAY ARRAY[
    'operador','ouvidoria','lider','elite','gerencia','diretoria',
    'administrador','super_admin'
  ] LOOP
    SELECT COALESCE(permissoes, '{}'::jsonb) INTO v_atual
      FROM public.cargos_permissoes
     WHERE empresa_id = p_empresa_id AND cargo = v_cargo;
    v_atual := COALESCE(v_atual, '{}'::jsonb);

    v_mapa := '{}'::jsonb;

    FOR r IN
      SELECT c.chave, c.tenants, c.padrao, c.explicita
        FROM public.fn_permissoes_catalogo() c
    LOOP
      -- Permissão de outra operação não entra: um toggle de Ouvidoria na
      -- BookPlay controlaria um módulo que não existe lá.
      CONTINUE WHEN r.tenants IS NOT NULL
                AND (v_slug IS NULL OR NOT (v_slug = ANY(r.tenants)));

      v_mapa := v_mapa || jsonb_build_object(
        r.chave,
        CASE
          -- Acesso total por construção (20260812b) — menos o que exige
          -- concessão nominal, que cai nas regras de baixo como qualquer cargo.
          WHEN v_cargo IN ('administrador','super_admin') AND NOT r.explicita
            THEN true
          -- Valor já gravado manda. É o que preserva a configuração que o
          -- administrador ajustou na tela, inclusive uma chave explícita que ele
          -- tenha concedido de propósito.
          WHEN v_atual ? r.chave
            THEN (v_atual -> r.chave)::boolean
          -- Chave nova (ou empresa nova) nasce no padrão do catálogo, e não
          -- negada: uma empresa recém-criada com os oito cargos zerados não
          -- deixa ninguém trabalhar, e não dá pista de quais eram os valores
          -- certos.
          ELSE (v_cargo = ANY(COALESCE(r.padrao, ARRAY[]::TEXT[])))
        END
      );
    END LOOP;

    INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes)
    VALUES (p_empresa_id, v_cargo, v_mapa)
    ON CONFLICT (empresa_id, cargo) DO UPDATE SET permissoes = EXCLUDED.permissoes;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$function$;

-- ── 3. Aplicar nas empresas existentes ──────────────────────────────────────
-- Só acrescenta `ignorar_fechamento_mes` (desligada). Todo o resto já está
-- gravado e é preservado pela regra do `v_atual`.

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id, slug FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- ── 4. Verificação ──────────────────────────────────────────────────────────
-- A migration falha em vez de deixar o banco meio-arrumado.

DO $$
DECLARE
  v_faltando TEXT;
  v_ligada   TEXT;
BEGIN
  -- (a) Todo cargo de toda empresa tem o catálogo inteiro da sua operação.
  SELECT string_agg(DISTINCT format('%s/%s/%s', emp.slug, cp.cargo, cat.chave), ', ')
    INTO v_faltando
    FROM public.empresas emp
    JOIN public.cargos_permissoes cp ON cp.empresa_id = emp.id
    CROSS JOIN public.fn_permissoes_catalogo() cat
   WHERE (cat.tenants IS NULL OR emp.slug = ANY(cat.tenants))
     AND NOT (cp.permissoes ? cat.chave);

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Chaves ausentes após semear: %', v_faltando;
  END IF;

  -- (b) Ninguém saiu desta migration podendo escrever em mês fechado. É a
  --     promessa que a acompanha: a chave passa a existir sem conceder nada.
  SELECT string_agg(format('%s/%s', emp.slug, cp.cargo), ', ')
    INTO v_ligada
    FROM public.empresas emp
    JOIN public.cargos_permissoes cp ON cp.empresa_id = emp.id
   WHERE (cp.permissoes -> 'ignorar_fechamento_mes')::boolean IS TRUE;

  IF v_ligada IS NOT NULL THEN
    RAISE EXCEPTION 'ignorar_fechamento_mes nasceu ligada em: %', v_ligada;
  END IF;
END $$;
