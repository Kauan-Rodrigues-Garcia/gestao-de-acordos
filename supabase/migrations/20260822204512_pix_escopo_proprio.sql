-- ============================================================================
-- Pix Automatico: escopo proprio — fase 5b
-- ============================================================================
--
-- ## O que muda
--
--   pix_escopo_individual | _equipe | _setor | _todos_setores
--   pix_editar_configuracoes
--
-- O Pix era a ultima tela grande onde o alcance saia inteiramente de listas de
-- cargo escritas no arquivo: `isPerfilAdminOuLider(cargo)` decidia se a
-- consulta trazia registros de outras pessoas, e uma constante local
-- `CARGOS_MULTI_SETOR` decidia se via alem do proprio setor. Nenhuma das duas
-- era configuravel — "quem enxerga o que no Pix" so mudava mexendo em codigo.
--
-- ## O que estes niveis NAO decidem, de proposito
--
-- Aprovar Pix mexe em COMISSAO. Juntar isso com alcance de leitura seria
-- refazer a mistura que esta reestruturacao esta desfazendo, e num lugar caro.
--
-- Entao a conversao aqui e cirurgica: os niveis governam o que a pessoa VE —
-- quais registros a consulta traz, quais filtros aparecem, se a coluna Operador
-- existe, o que a lixeira do Pix lista. Aprovar, reprovar, editar registro
-- alheio, restaurar e registrar em nome de outro continuam onde estavam:
-- `aprovar_pix_automatico` e a lista de cargo, agora chamada
-- `podeAgirSobreOutros` no arquivo, com o nome dizendo o que ela e.
--
-- Separar as acoes do cargo e trabalho de uma fase de acoes, e faze-lo junto
-- com o escopo arriscaria tirar de alguem um botao que hoje funciona.
--
-- ## `pix_editar_configuracoes` NAO nasce de `aprovar_pix_automatico`
--
-- O projeto (docs/PERMISSOES-POR-ABA-PROJETO.md secao 4.3) mandava deriva-la
-- de `aprovar_pix_automatico`. Estava errado, e nos dois sentidos:
--
--   • `elite` e `ouvidoria` tem o painel de configuracao hoje e NAO tem
--     `aprovar_pix_automatico` — perderiam o percentual de comissao do setor;
--   • `diretoria` tem `aprovar_pix_automatico` e NAO tem o painel — ganharia
--     poder de editar comissao que nunca teve.
--
-- Quem acende o painel hoje e `isPerfilAdminOuLider(cargo)`, e e dai que a
-- chave nasce. O documento foi corrigido junto com esta fase. E o mesmo tipo de
-- erro da fase 1, quando `lixeira_limpar` quase nasceu de `excluir_em_lote`.
--
-- ## `diretoria` fica so com `individual`, e isso e fiel
--
-- `diretoria` esta em CARGOS_MULTI_SETOR mas nao em `isPerfilAdminOuLider`, e o
-- filtro de setor do Pix esta ANINHADO dentro do bloco de lider. Resultado: a
-- diretoria nunca viu registro de outra pessoa nesta aba. Derivar
-- `todos_setores` sem `setor` produziria um nivel largo sem o estreito embaixo,
-- e `escopoEfetivo` devolveria `todos_setores` — a diretoria ganharia a visao
-- de lider inteira, calada. Por isso a derivacao e `ehLider AND ehMultiSetor`.
--
-- ## Invariante do acesso total
--
-- Chave nova nasce `true` para `administrador`/`super_admin`, exceto as de
-- concessao explicita. Ver o cabecalho da fase 5a; o bloco de prova verifica.
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
    WHERE permissoes ?| ARRAY['ver_pix_automatico', 'aprovar_pix_automatico']
  ) THEN
    RAISE EXCEPTION
      'Ha excecao por pessoa nas chaves do Pix; derivacao individual precisa ser escrita antes.';
  END IF;
END
$guarda_excecoes$;

-- ── Snapshot ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permissoes_backup_20260822_pix AS
SELECT now() AS copiado_em, c.* FROM public.cargos_permissoes c WITH NO DATA;

INSERT INTO public.permissoes_backup_20260822_pix
SELECT now(), c.* FROM public.cargos_permissoes c
WHERE NOT EXISTS (SELECT 1 FROM public.permissoes_backup_20260822_pix);

ALTER TABLE public.permissoes_backup_20260822_pix ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.permissoes_backup_20260822_pix FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.permissoes_backup_20260822_pix IS
  'Snapshot de cargos_permissoes antes da fase 5b da reestruturacao por aba (Pix Automatico).';

-- ── Derivacao ───────────────────────────────────────────────────────────────
--   individual ..... sempre; todo mundo ve os proprios registros
--   equipe ......... `isPerfilAdminOuLider(cargo)` — quem tem o filtro de
--                    equipe, que so existe dentro do bloco de lider
--   setor .......... o mesmo: e o que solta a consulta do proprio operador e
--                    acende a coluna Operador
--   todos_setores .. lider E multi-setor. Ver o cabecalho: sem o `AND` a
--                    diretoria ganharia a visao de lider inteira
--   editar_config .. `isPerfilAdminOuLider(cargo)`, que e quem ve o painel
--
-- So na BookPlay: Pix Automatico nao existe na PaguePlay.
WITH base AS (
  SELECT
    c.empresa_id,
    c.cargo,
    c.cargo IN ('administrador', 'super_admin') AS acesso_total,
    c.cargo IN (
      'administrador', 'super_admin', 'lider', 'elite', 'gerencia', 'ouvidoria'
    ) AS eh_lider,
    c.cargo IN (
      'gerencia', 'diretoria', 'administrador', 'super_admin'
    ) AS multi_setor
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE e.slug = 'bookplay'
)
UPDATE public.cargos_permissoes c
SET permissoes = c.permissoes || jsonb_build_object(
      'pix_escopo_individual',     TRUE,
      'pix_escopo_equipe',         b.acesso_total OR b.eh_lider,
      'pix_escopo_setor',          b.acesso_total OR b.eh_lider,
      'pix_escopo_todos_setores',  b.acesso_total OR (b.eh_lider AND b.multi_setor),
      'pix_editar_configuracoes',  b.acesso_total OR b.eh_lider
    ),
    atualizado_em = now()
FROM base b
WHERE c.empresa_id = b.empresa_id AND c.cargo = b.cargo;

-- ── Prova de equivalencia ───────────────────────────────────────────────────
-- `administrador`/`super_admin` ficam de fora: `temPermissao` sempre devolveu
-- `true` para eles, entao o valor gravado nunca foi lido pelo app.
DO $prova$
DECLARE
  v_erro TEXT;
  c_lider CONSTANT TEXT[] :=
    ARRAY['administrador', 'super_admin', 'lider', 'elite', 'gerencia', 'ouvidoria'];
  c_multi CONSTANT TEXT[] :=
    ARRAY['gerencia', 'diretoria', 'administrador', 'super_admin'];
BEGIN
  -- 1. Individual e universal.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE e.slug = 'bookplay'
    AND (c.permissoes->>'pix_escopo_individual')::BOOLEAN IS DISTINCT FROM TRUE;
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Pix: escopo individual faltando em %', v_erro;
  END IF;

  -- 2. Equipe e setor reproduzem `isPerfilAdminOuLider`.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE e.slug = 'bookplay'
    AND NOT (c.cargo = ANY(ARRAY['administrador', 'super_admin']))
    AND (
      (COALESCE((c.permissoes->>'ver_pix_automatico')::BOOLEAN, FALSE)
       AND (c.permissoes->>'pix_escopo_setor')::BOOLEAN)
      IS DISTINCT FROM (
        COALESCE((c.permissoes->>'ver_pix_automatico')::BOOLEAN, FALSE)
        AND c.cargo = ANY(c_lider)
      )
      OR
      (COALESCE((c.permissoes->>'ver_pix_automatico')::BOOLEAN, FALSE)
       AND (c.permissoes->>'pix_escopo_equipe')::BOOLEAN)
      IS DISTINCT FROM (
        COALESCE((c.permissoes->>'ver_pix_automatico')::BOOLEAN, FALSE)
        AND c.cargo = ANY(c_lider)
      )
    );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Pix: escopo de equipe/setor divergiu em %', v_erro;
  END IF;

  -- 3. Todos os setores reproduz lider E multi-setor — com o AND, nao so o
  --    multi-setor. Sem ele a diretoria ganharia a visao de lider.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE e.slug = 'bookplay'
    AND NOT (c.cargo = ANY(ARRAY['administrador', 'super_admin']))
    AND (COALESCE((c.permissoes->>'ver_pix_automatico')::BOOLEAN, FALSE)
         AND (c.permissoes->>'pix_escopo_todos_setores')::BOOLEAN)
        IS DISTINCT FROM (
          COALESCE((c.permissoes->>'ver_pix_automatico')::BOOLEAN, FALSE)
          AND c.cargo = ANY(c_lider) AND c.cargo = ANY(c_multi)
        );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Pix: alcance de todos os setores divergiu em %', v_erro;
  END IF;

  -- 4. A diretoria nao pode sair daqui com escopo alem do proprio: e o caso
  --    que o `AND` acima existe para impedir, e vale travar explicitamente.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE e.slug = 'bookplay'
    AND c.cargo = 'diretoria'
    AND ((c.permissoes->>'pix_escopo_setor')::BOOLEAN
         OR (c.permissoes->>'pix_escopo_todos_setores')::BOOLEAN
         OR (c.permissoes->>'pix_escopo_equipe')::BOOLEAN);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Pix: diretoria ganhou alcance que nao tinha, em %', v_erro;
  END IF;

  -- 5. Configuracao do setor reproduz quem ve o painel hoje — NAO
  --    `aprovar_pix_automatico`. Ver o cabecalho.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE e.slug = 'bookplay'
    AND NOT (c.cargo = ANY(ARRAY['administrador', 'super_admin']))
    AND (COALESCE((c.permissoes->>'ver_pix_automatico')::BOOLEAN, FALSE)
         AND (c.permissoes->>'pix_editar_configuracoes')::BOOLEAN)
        IS DISTINCT FROM (
          COALESCE((c.permissoes->>'ver_pix_automatico')::BOOLEAN, FALSE)
          AND c.cargo = ANY(c_lider)
        );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Pix: quem edita a configuracao do setor divergiu em %', v_erro;
  END IF;

  -- 6. Toda linha da BookPlay recebeu as cinco chaves, e nenhuma da PaguePlay.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE (e.slug = 'bookplay') <> (c.permissoes ?& ARRAY[
    'pix_escopo_individual', 'pix_escopo_equipe', 'pix_escopo_setor',
    'pix_escopo_todos_setores', 'pix_editar_configuracoes'
  ]);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Pix: chaves na empresa errada, ou faltando, em %', v_erro;
  END IF;

  -- 7. INVARIANTE: acesso total nao tem chave desligada fora das explicitas.
  SELECT string_agg(e.slug || '/' || c.cargo || ': ' || x.key, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  CROSS JOIN LATERAL jsonb_each_text(c.permissoes) x
  WHERE c.cargo IN ('administrador', 'super_admin')
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
    ('ver_todos_setores',           NULL::TEXT[],       cupula,    false),
    ('filtrar_por_usuario',         NULL::TEXT[],       lideranca, false),
    -- Pix Automatico: escopo por aba (fase 5b)
    ('pix_escopo_individual',        ARRAY['bookplay'], todos,     false),
    ('pix_escopo_equipe',            ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_escopo_setor',             ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_escopo_todos_setores',     ARRAY['bookplay'], ARRAY['gerencia'], false),
    ('pix_editar_configuracoes',     ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
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
