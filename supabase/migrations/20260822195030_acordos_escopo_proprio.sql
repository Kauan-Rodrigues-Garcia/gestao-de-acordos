-- ============================================================================
-- Acordos: escopo proprio — fase 5a
-- ============================================================================
--
-- ## O que muda
--
-- A aba Acordos passa a ter os quatro niveis proprios:
--
--   acordos_escopo_individual | _equipe | _setor | _todos_setores
--
-- Com isso `ver_acordos_gerais` fica sem nenhum consumidor e sai do catalogo.
-- Era a chave global mais usada do sistema: sozinha decidia o alcance de
-- Acordos, Dashboard e Lixeira. As tres agora respondem cada uma pela sua.
--
-- ## `todos_setores` aqui NAO e filtro de setor
--
-- A tela de Acordos nunca teve seletor de setor, e esta fase nao cria um. O
-- nivel amplia as LISTAS — quais equipes e quais pessoas aparecem nos
-- seletores — de "o meu setor" para "a empresa". Quantas linhas chegam continua
-- sendo decisao do RLS.
--
-- Dizer isso importa porque o mesmo nome significa coisas diferentes por aba:
-- no Dashboard `todos_setores` acende um seletor de setor; aqui nao ha o que
-- acender.
--
-- ## Dois resquicios da fase 3, fechados aqui
--
-- O Dashboard ainda lia `ver_acordos_gerais` em dois pontos (o recorte da
-- consulta e o carregamento dos nomes de operador), enquanto o filtro da mesma
-- tela ja usava `dashboard_escopo_*`. Como `dashboard_escopo_setor` foi
-- derivada exatamente dessa chave na fase 3a, a troca e inerte por construcao.
--
-- ## Linha de administrador nao pode ter chave desligada
--
-- `temPermissao` devolve `true` para TUDO quando o cargo e `administrador` ou
-- `super_admin` — e o semeador de `permissoes_2_0` grava `true` por construcao
-- para esses dois. A unica excecao legitima e `ignorar_fechamento_mes`, que
-- exige concessao explicita.
--
-- A fase 4 quebrou esse invariante sem querer: derivou
-- `analitico_escopo_individual = false` para admin, porque a formula saiu do
-- cargo. Hoje e inerte (o app curto-circuita), mas e uma armadilha para a fase
-- 7: uma policy que calcule o teto lendo o JSON nao tem curto-circuito nenhum,
-- e leria `false` como restricao de verdade.
--
-- Esta migration corrige aquela linha, grava `true` para admin nas chaves novas
-- e passa a VERIFICAR o invariante no fim. Regra daqui para a frente: chave
-- nova nasce `true` para acesso total, exceto as de concessao explicita.
--
-- ## O que muda de visivel
--
-- `administrador` e `super_admin` ganham os atalhos de equipe e o "Individual"
-- em Acordos, que antes eram `isPerfilLider(cargo)` e `isElite` escritos a mao
-- — listas de cargo das quais o admin nao fazia parte. Lider, gerencia e
-- ouvidoria ganham o "Individual" pelo mesmo motivo.
--
-- Os dois casos sao ESTREITAMENTO: a opcao oferecida mostra menos dados, nunca
-- mais. Nenhum cargo passa a alcancar linha que nao alcancava.
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
      'ver_acordos', 'ver_acordos_gerais', 'ver_todos_setores'
    ]
  ) THEN
    RAISE EXCEPTION
      'Ha excecao por pessoa nas chaves de Acordos; derivacao individual precisa ser escrita antes.';
  END IF;
END
$guarda_excecoes$;

-- ── Snapshot ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permissoes_backup_20260822_acordos AS
SELECT now() AS copiado_em, c.* FROM public.cargos_permissoes c WITH NO DATA;

INSERT INTO public.permissoes_backup_20260822_acordos
SELECT now(), c.* FROM public.cargos_permissoes c
WHERE NOT EXISTS (SELECT 1 FROM public.permissoes_backup_20260822_acordos);

ALTER TABLE public.permissoes_backup_20260822_acordos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.permissoes_backup_20260822_acordos FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.permissoes_backup_20260822_acordos IS
  'Snapshot de cargos_permissoes antes da fase 5a da reestruturacao por aba (Acordos).';

-- ── Correcao da fase 4 ──────────────────────────────────────────────────────
-- Ver o cabecalho: linha de acesso total nao pode ter chave desligada fora das
-- de concessao explicita. Inerte no app; tira a armadilha da fase 7.
UPDATE public.cargos_permissoes
SET permissoes = permissoes || jsonb_build_object('analitico_escopo_individual', TRUE),
    atualizado_em = now()
WHERE cargo IN ('administrador', 'super_admin')
  AND (permissoes->>'analitico_escopo_individual')::BOOLEAN IS DISTINCT FROM TRUE;

-- ── Derivacao ───────────────────────────────────────────────────────────────
-- Reproduz o que a tela faz hoje:
--
--   individual ..... sempre; todo mundo ve os proprios acordos, e e o que a
--                    consulta faz ao prender `operador_id` no proprio perfil
--   equipe ......... `isPerfilLider(cargo)` — o que faz os atalhos de equipe
--                    aparecerem. `ouvidoria` entra porque esta em PERFIS_LIDER
--   setor .......... `ver_acordos_gerais`, que e o que solta a consulta do
--                    proprio operador e acende a coluna Operador
--   todos_setores .. `ver_todos_setores`, que amplia as LISTAS dos seletores
--
-- So na BookPlay: a chave da aba (`ver_acordos`) e bookplay-only, e a PaguePlay
-- le acordos pelo Dashboard, que tem os proprios niveis.
WITH base AS (
  SELECT
    c.empresa_id,
    c.cargo,
    c.cargo IN ('administrador', 'super_admin') AS acesso_total,
    c.cargo IN ('lider', 'elite', 'gerencia', 'ouvidoria')            AS perfil_lider,
    COALESCE((c.permissoes->>'ver_acordos_gerais')::BOOLEAN, FALSE)   AS ve_gerais,
    COALESCE((c.permissoes->>'ver_todos_setores')::BOOLEAN, FALSE)    AS ve_todos
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE e.slug = 'bookplay'
)
UPDATE public.cargos_permissoes c
SET permissoes = c.permissoes || jsonb_build_object(
      'acordos_escopo_individual',    TRUE,
      'acordos_escopo_equipe',        b.acesso_total OR b.perfil_lider,
      'acordos_escopo_setor',         b.acesso_total OR b.ve_gerais,
      'acordos_escopo_todos_setores', b.acesso_total OR b.ve_todos
    ),
    atualizado_em = now()
FROM base b
WHERE c.empresa_id = b.empresa_id AND c.cargo = b.cargo;

-- ── Prova de equivalencia ───────────────────────────────────────────────────
-- Compara ACESSO EFETIVO antigo x novo, so nos cargos configuraveis.
--
-- `administrador` e `super_admin` ficam de fora de proposito: para eles
-- `temPermissao` sempre devolveu `true`, entao o valor gravado nunca foi lido
-- pelo app. Compara-los seria comparar com o que a tela nao consultava. A
-- mudanca visivel que isso produz esta declarada no cabecalho.
DO $prova$
DECLARE
  v_erro TEXT;
BEGIN
  -- 1. Individual e universal: ninguem perde a propria lista.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE e.slug = 'bookplay'
    AND (c.permissoes->>'acordos_escopo_individual')::BOOLEAN IS DISTINCT FROM TRUE;
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Acordos: escopo individual faltando em %', v_erro;
  END IF;

  -- 2. Equipe reproduz `isPerfilLider`, que e quem acende os atalhos de equipe.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE e.slug = 'bookplay'
    AND c.cargo NOT IN ('administrador', 'super_admin')
    AND (COALESCE((c.permissoes->>'ver_acordos')::BOOLEAN, FALSE)
         AND (c.permissoes->>'acordos_escopo_equipe')::BOOLEAN)
        IS DISTINCT FROM (
          COALESCE((c.permissoes->>'ver_acordos')::BOOLEAN, FALSE)
          AND c.cargo IN ('lider', 'elite', 'gerencia', 'ouvidoria')
        );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Acordos: escopo de equipe divergiu em %', v_erro;
  END IF;

  -- 3. Setor reproduz `ver_acordos_gerais`.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE e.slug = 'bookplay'
    AND c.cargo NOT IN ('administrador', 'super_admin')
    AND (COALESCE((c.permissoes->>'ver_acordos')::BOOLEAN, FALSE)
         AND (c.permissoes->>'acordos_escopo_setor')::BOOLEAN)
        IS DISTINCT FROM (
          COALESCE((c.permissoes->>'ver_acordos')::BOOLEAN, FALSE)
          AND COALESCE((c.permissoes->>'ver_acordos_gerais')::BOOLEAN, FALSE)
        );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Acordos: escopo de setor divergiu em %', v_erro;
  END IF;

  -- 4. Todos os setores reproduz `ver_todos_setores`.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE e.slug = 'bookplay'
    AND c.cargo NOT IN ('administrador', 'super_admin')
    AND (COALESCE((c.permissoes->>'ver_acordos')::BOOLEAN, FALSE)
         AND (c.permissoes->>'acordos_escopo_todos_setores')::BOOLEAN)
        IS DISTINCT FROM (
          COALESCE((c.permissoes->>'ver_acordos')::BOOLEAN, FALSE)
          AND COALESCE((c.permissoes->>'ver_todos_setores')::BOOLEAN, FALSE)
        );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Acordos: alcance total divergiu em %', v_erro;
  END IF;

  -- 5. Toda linha da BookPlay recebeu as quatro chaves — e nenhuma linha da
  --    PaguePlay recebeu, porque a aba nao existe la.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE (e.slug = 'bookplay') <> (c.permissoes ?& ARRAY[
    'acordos_escopo_individual', 'acordos_escopo_equipe',
    'acordos_escopo_setor', 'acordos_escopo_todos_setores'
  ]);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Acordos: chaves na empresa errada, ou faltando, em %', v_erro;
  END IF;

  -- 6. INVARIANTE: linha de acesso total nao tem chave desligada, exceto as de
  --    concessao explicita. E o que o app assume e o que a fase 7 vai ler.
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
