-- ============================================================================
-- Lixeira: escopo e acoes proprios — fase 1 da reestruturacao por aba
-- ============================================================================
--
-- ## O que muda
--
-- A Lixeira deixa de herdar alcance de `ver_acordos_gerais` — a mesma chave que
-- decide Acordos e Dashboard, e por isso mexer no alcance de uma mexia nas
-- tres. Ela passa a responder por chaves proprias:
--
--   lixeira_escopo_individual | _equipe | _setor | _todos_setores
--   lixeira_restaurar
--   lixeira_limpar
--
-- Os quatro niveis sao independentes, nao uma escada: ligar e desligar cada um
-- faz a opcao aparecer ou sumir do filtro daquela aba. Ver
-- `src/lib/permissoes-escopo.ts` e `docs/PERMISSOES-POR-ABA-PROJETO.md`.
--
-- ## Ninguem ganha nem perde acesso
--
-- Toda chave nova e calculada do estado EFETIVO atual do cargo. Nenhuma nasce
-- de valor padrao. O bloco de verificacao no fim aborta a migration se algum
-- cargo terminar diferente de onde comecou.
--
-- ### As acoes
--
--   lixeira_restaurar := ver_lixeira
--   lixeira_limpar    := ver_lixeira
--
-- Hoje a tela faz `podeEsvaziar = podeAcessar`: quem enxerga a lixeira pode
-- apaga-la inteira. Derivar `lixeira_limpar` de `excluir_em_lote` — que foi a
-- primeira ideia — teria tirado a acao da ouvidoria da BookPlay e da gerencia
-- da PaguePlay, os dois cargos com `ver_lixeira` e sem `excluir_em_lote`.
--
-- ### O escopo, e por que o teto do RLS entra na conta
--
-- Hoje a consulta da Lixeira so distingue dois casos: sem `ver_acordos_gerais`
-- ela filtra por pessoa; com ele, nao filtra nada e entrega o que o RLS
-- devolver. Portanto o alcance REAL de um cargo hoje e:
--
--   sem ver_acordos_gerais -> individual
--   com ver_acordos_gerais -> o teto do RLS daquele cargo
--
-- O teto vem da politica `acordos_select` e nao e simetrico entre as duas
-- operacoes:
--
--   BookPlay .... operador e ouvidoria: individual
--                 lider, elite, gerencia: setor
--                 diretoria: todos os setores
--   PaguePlay ... operador, ouvidoria, elite, gerencia: individual
--                 lider: todos os setores  (a politica cita apenas `lider`
--                                           fora da BookPlay)
--                 diretoria: todos os setores
--
-- Derivar sem esse teto seria concessao silenciosa. A ouvidoria da BookPlay tem
-- `ver_acordos_gerais = true` e teto individual: dar a ela `escopo_setor`
-- pareceria inofensivo hoje — a tela nao muda, porque o RLS nega — e viraria
-- acesso de verdade na fase 7, quando o escopo por aba passar a levantar o teto.
--
-- Por isso: escopo derivado = o teto, nunca acima dele.
--
-- ## Nao mexe em RLS
--
-- Esta migration nao cria nem altera politica nenhuma. O teto continua onde
-- esta. A fase 7 e que trata disso, depois de as abas funcionarem com o teto
-- atual — assim, se ela precisar voltar, esta fase continua de pe.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── Guarda: excecoes por pessoa ─────────────────────────────────────────────
-- Hoje nenhuma linha de `perfis_permissoes` carrega as chaves que governam a
-- Lixeira, entao nao ha excecao individual para derivar. Se isso mudar entre a
-- escrita e a aplicacao, a migration para em vez de deixar alguem para tras.
DO $guarda_excecoes$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.perfis_permissoes
    WHERE permissoes ?| ARRAY['ver_lixeira', 'ver_acordos_gerais', 'ver_todos_setores']
  ) THEN
    RAISE EXCEPTION
      'Ha excecao por pessoa nas chaves da Lixeira; derivacao individual precisa ser escrita antes.';
  END IF;
END
$guarda_excecoes$;

-- ── Snapshot, antes de qualquer transformacao ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.permissoes_backup_20260822_lixeira AS
SELECT now() AS copiado_em, c.* FROM public.cargos_permissoes c WITH NO DATA;

INSERT INTO public.permissoes_backup_20260822_lixeira
SELECT now(), c.* FROM public.cargos_permissoes c
WHERE NOT EXISTS (SELECT 1 FROM public.permissoes_backup_20260822_lixeira);

ALTER TABLE public.permissoes_backup_20260822_lixeira ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.permissoes_backup_20260822_lixeira FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.permissoes_backup_20260822_lixeira IS
  'Snapshot de cargos_permissoes antes da fase 1 da reestruturacao por aba (Lixeira).';

-- ── O teto do RLS, por empresa e cargo ──────────────────────────────────────
-- Lido da politica `acordos_select`. Numeros comparaveis: 0 individual,
-- 1 equipe, 2 setor, 3 todos os setores.
CREATE OR REPLACE FUNCTION public.fn_teto_rls_acordos(p_slug TEXT, p_cargo TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_cargo IN ('administrador', 'super_admin', 'diretoria') THEN 3
    WHEN p_slug = 'bookplay' AND p_cargo IN ('lider', 'elite', 'gerencia')  THEN 2
    WHEN p_slug <> 'bookplay' AND p_cargo = 'lider'                        THEN 3
    ELSE 0
  END;
$function$;

COMMENT ON FUNCTION public.fn_teto_rls_acordos(TEXT, TEXT) IS
  'Alcance maximo em acordos por empresa e cargo, espelhando a policy acordos_select. 0 individual, 1 equipe, 2 setor, 3 todos os setores. Usada pelas derivacoes de escopo por aba para nao conceder acima do teto.';

-- ── Derivacao ───────────────────────────────────────────────────────────────
WITH base AS (
  SELECT
    c.empresa_id,
    c.cargo,
    e.slug,
    COALESCE((c.permissoes->>'ver_lixeira')::BOOLEAN, TRUE)          AS ve_lixeira,
    COALESCE((c.permissoes->>'ver_acordos_gerais')::BOOLEAN, FALSE)  AS ve_gerais,
    public.fn_teto_rls_acordos(e.slug, c.cargo)                      AS teto
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
),
alvo AS (
  -- Alcance efetivo de HOJE: individual sem `ver_acordos_gerais`; com ele, o
  -- teto do RLS, porque a consulta atual nao aplica recorte nenhum.
  SELECT b.*, CASE WHEN b.ve_gerais THEN b.teto ELSE 0 END AS nivel
  FROM base b
)
UPDATE public.cargos_permissoes c
SET permissoes = c.permissoes || jsonb_build_object(
      -- A escada inteira ate o nivel efetivo fica ligada, para o filtro da aba
      -- ter como estreitar. O nivel mais amplo e o que a consulta carrega.
      'lixeira_escopo_individual',     TRUE,
      'lixeira_escopo_equipe',         a.nivel >= 1,
      'lixeira_escopo_setor',          a.nivel >= 2,
      'lixeira_escopo_todos_setores',  a.nivel >= 3,
      'lixeira_restaurar',             a.ve_lixeira,
      'lixeira_limpar',                a.ve_lixeira
    ),
    atualizado_em = now()
FROM alvo a
WHERE c.empresa_id = a.empresa_id AND c.cargo = a.cargo;

-- ── Prova de equivalencia ───────────────────────────────────────────────────
-- Roda contra o estado real das duas empresas. Foi o que faltou em 20/08: a
-- derivacao existia, a prova nao.
DO $prova$
DECLARE
  v_erro TEXT;
BEGIN
  -- 1. As acoes acompanham `ver_lixeira`, exatamente.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE (c.permissoes->>'lixeira_restaurar')::BOOLEAN
        IS DISTINCT FROM COALESCE((c.permissoes->>'ver_lixeira')::BOOLEAN, TRUE)
     OR (c.permissoes->>'lixeira_limpar')::BOOLEAN
        IS DISTINCT FROM COALESCE((c.permissoes->>'ver_lixeira')::BOOLEAN, TRUE);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Acoes da Lixeira divergiram de ver_lixeira em: %', v_erro;
  END IF;

  -- 2. Nenhum escopo acima do teto do RLS.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE (
      ((c.permissoes->>'lixeira_escopo_equipe')::BOOLEAN
        AND public.fn_teto_rls_acordos(e.slug, c.cargo) < 1)
   OR ((c.permissoes->>'lixeira_escopo_setor')::BOOLEAN
        AND public.fn_teto_rls_acordos(e.slug, c.cargo) < 2)
   OR ((c.permissoes->>'lixeira_escopo_todos_setores')::BOOLEAN
        AND public.fn_teto_rls_acordos(e.slug, c.cargo) < 3)
  );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Escopo da Lixeira acima do teto do RLS em: %', v_erro;
  END IF;

  -- 3. O alcance efetivo novo bate com o de antes, cargo a cargo.
  --    Antes: individual sem `ver_acordos_gerais`; com ele, o teto.
  --    Depois: o nivel mais amplo ligado.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE (
      CASE
        WHEN (c.permissoes->>'lixeira_escopo_todos_setores')::BOOLEAN THEN 3
        WHEN (c.permissoes->>'lixeira_escopo_setor')::BOOLEAN         THEN 2
        WHEN (c.permissoes->>'lixeira_escopo_equipe')::BOOLEAN        THEN 1
        ELSE 0
      END
    ) IS DISTINCT FROM (
      CASE
        WHEN COALESCE((c.permissoes->>'ver_acordos_gerais')::BOOLEAN, FALSE)
          THEN public.fn_teto_rls_acordos(e.slug, c.cargo)
        ELSE 0
      END
    );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Alcance da Lixeira mudou para: %', v_erro;
  END IF;

  -- 4. Toda linha recebeu as seis chaves. Sem isto, uma empresa nova ou uma
  --    linha fora do join sairia com a aba pela metade.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE NOT (c.permissoes ?& ARRAY[
    'lixeira_escopo_individual', 'lixeira_escopo_equipe',
    'lixeira_escopo_setor', 'lixeira_escopo_todos_setores',
    'lixeira_restaurar', 'lixeira_limpar'
  ]);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Chaves da Lixeira faltando em: %', v_erro;
  END IF;
END
$prova$;

-- ── Catalogo ────────────────────────────────────────────────────────────────
-- Espelha `src/lib/permissoes-catalogo.ts`. `permissoes-catalogo.sql.test.ts`
-- le a definicao mais recente e quebra a CI se as duas divergirem.
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
    -- Trilha de auditoria: NINGUEM por padrao. O RLS de `logs_sistema` e o piso
    -- real; conceder aqui a outro cargo entrega aba vazia. Ver o catalogo TS.
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
    -- Escrever em mes fechado: explicita, e desligada para todos.
    ('ignorar_fechamento_mes',      NULL::TEXT[],       ninguem,   true),
    -- Lixeira: a primeira aba com escopo proprio.
    ('lixeira_escopo_individual',   NULL::TEXT[],       todos,     false),
    ('lixeira_escopo_equipe',       NULL::TEXT[],       lideranca, false),
    ('lixeira_escopo_setor',        NULL::TEXT[],       lideranca, false),
    ('lixeira_escopo_todos_setores', NULL::TEXT[],      cupula,    false),
    ('lixeira_restaurar',           NULL::TEXT[],       todos,     false),
    ('lixeira_limpar',              NULL::TEXT[],       todos,     false)
  ) AS t(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo oficial de permissoes. Espelha src/lib/permissoes-catalogo.ts; os '
  'testes de contrato quebram a CI se divergirem.';

COMMIT;
