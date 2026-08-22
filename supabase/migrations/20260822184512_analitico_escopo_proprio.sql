-- ============================================================================
-- Analitico: escopo proprio — fase 4
-- ============================================================================
--
-- ## O que muda
--
-- O Analitico passa a ter escopo proprio e abas internas proprias:
--
--   analitico_escopo_individual | _setor | _todos_setores
--   analitico_sub_analitico | _recebimento_diario | _colchao
--   analitico_sub_por_operador | _formas_pagamento | _ranking
--   analitico_sub_destaques_dia | _sem_operador
--
-- Com isso saem as duas ultimas chamadas de veTodosOsSetores — a janela de
-- importacao (useAnaliticoImport) e o Recebimento Diario (DiarioLider) — e a
-- funcao inteira e aposentada. Era ela que fazia uma tela falar pela outra,
-- que e exatamente o defeito que esta reestruturacao existe para desfazer.
--
-- ## Tres niveis, e a ausencia de "equipe" e deliberada
--
-- A tela sempre teve tres alcances, nao dois:
--
--   operador ................................. so os proprios numeros
--   lider, elite, gerencia, ouvidoria ........ o setor inteiro
--   diretoria, administrador, super_admin .... escolhe entre os setores
--
-- O elite e o unico que hoje alterna entre dois ("Minha visao" x "Visao
-- geral") — e e por ter dois niveis, nao por ser elite.
--
-- "equipe" nao entra porque nunca existiu como ALCANCE aqui. O Recebimento
-- Diario tem seletor de equipe, mas ele recorta dentro do setor que a pessoa ja
-- enxerga: e filtro de tela, nao permissao. Registrar o nivel criaria um toggle
-- que liga, desliga e nao muda nada.
--
-- (O projeto em docs/PERMISSOES-POR-ABA-PROJETO.md secao 3.8 previa "propria" e
-- "geral". Estavam errados: "geral" teria que significar "setor" e "todos os
-- setores" ao mesmo tempo, e um lider ganharia o filtro de setor que nao tem
-- hoje. O documento foi corrigido junto com esta fase.)
--
-- ## Havia DUAS definicoes de "ve todos os setores", e elas concordam por sorte
--
-- A regua da aba usava isPerfilAdmin OU isPerfilDiretoria (so cargo). A
-- importacao e o diario usavam veTodosOsSetores (cargo OU ver_todos_setores OU
-- ver_analiticos_global). Hoje as duas dao o mesmo resultado porque nenhum
-- cargo tem as chaves globais sem ser cupula.
--
-- Isso e coincidencia de dado, nao garantia. Bastava alguem ligar
-- ver_analiticos_global num lider para a mesma pessoa ver o filtro de setor
-- numa metade da tela e nao ver na outra. Por isso a derivacao usa a definicao
-- mais ampla e o bloco de guarda ABORTA se as duas discordarem em qualquer
-- linha — a coincidencia vira pre-condicao verificada, em vez de fe.
--
-- ## As chaves filhas nascem do CARGO, nao do interruptor da aba
--
-- bookplay/ouvidoria tem ver_analitico = false. Ainda assim recebe os niveis
-- que o cargo teria, porque a dependencia da aba-mae e resolvida na LEITURA
-- (niveisLiberados devolve lista vazia com a aba desligada), nunca gravando
-- false nas filhas. E o mesmo principio da fase 1: religar a aba devolve uma
-- configuracao util, em vez de abrir uma tela vazia que obriga alguem a
-- remontar tudo de memoria.
--
-- Efeito hoje: nenhum. A aba esta desligada e o leitor curto-circuita.
--
-- ## ver_analiticos_global fica sem consumidor
--
-- Era a unica chave que so veTodosOsSetores lia. Sai do catalogo aqui, pelo
-- mesmo caminho de filtrar_por_setor e filtrar_por_equipe na fase 3b: o valor
-- gravado permanece como entrada orfa e inerte, e a faxina do JSON fica para a
-- fase 8. Apagar dado de permissao para nao ganhar nada nao se paga.
--
-- ## Nota para a fase 7 (RLS)
--
-- Estes escopos NAO levantam o teto de acordos. O Analitico le
-- analitico_recebimentos e as tabelas do diario, que tem RLS propria. Quando a
-- fase 7 for calcular o teto por tabela, analitico_escopo_* pesa nas tabelas do
-- analitico e em nenhuma outra — misturar as duas familias daria alcance de
-- acordos a quem so precisa do relatorio.
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
      'ver_analitico', 'ver_todos_setores', 'ver_analiticos_global'
    ]
  ) THEN
    RAISE EXCEPTION
      'Ha excecao por pessoa nas chaves do Analitico; derivacao individual precisa ser escrita antes.';
  END IF;
END
$guarda_excecoes$;

-- ── Guarda: as duas definicoes de "ve todos os setores" concordam hoje ──────
-- Se esta condicao ja estiver quebrada, derivar por qualquer uma das duas
-- mudaria a tela de alguem — e o contrato desta fase e que nada muda.
DO $guarda_divergencia$
DECLARE
  v_erro TEXT;
BEGIN
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE
    -- definicao da regua da aba: so cargo
    (c.cargo IN ('administrador', 'super_admin', 'diretoria'))
    IS DISTINCT FROM
    -- definicao de veTodosOsSetores: cargo OU as duas chaves globais
    (c.cargo IN ('administrador', 'super_admin', 'diretoria')
     OR COALESCE((c.permissoes->>'ver_todos_setores')::BOOLEAN, FALSE)
     OR COALESCE((c.permissoes->>'ver_analiticos_global')::BOOLEAN, FALSE));
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION
      'As duas definicoes de "ve todos os setores" do Analitico ja divergem em %. Derivar agora mudaria a tela desses cargos; decida qual vale antes de rodar.',
      v_erro;
  END IF;
END
$guarda_divergencia$;

-- ── Snapshot ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permissoes_backup_20260822_analitico AS
SELECT now() AS copiado_em, c.* FROM public.cargos_permissoes c WITH NO DATA;

INSERT INTO public.permissoes_backup_20260822_analitico
SELECT now(), c.* FROM public.cargos_permissoes c
WHERE NOT EXISTS (SELECT 1 FROM public.permissoes_backup_20260822_analitico);

ALTER TABLE public.permissoes_backup_20260822_analitico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.permissoes_backup_20260822_analitico FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.permissoes_backup_20260822_analitico IS
  'Snapshot de cargos_permissoes antes da fase 4 da reestruturacao por aba (Analitico).';

-- ── Derivacao ───────────────────────────────────────────────────────────────
-- Reproduz o que o CARGO decidia no codigo:
--
--   individual ..... isOperador OU isElite — quem nao e lideranca, mais o
--                    elite, que alterna entre as duas visoes
--   setor .......... isLiderMais = PERFIS_ADMIN + PERFIS_LIDER + diretoria.
--                    "ouvidoria" entra porque esta em PERFIS_LIDER
--   todos_setores .. veTodosOsSetores, a definicao mais ampla das duas
--   sub_* .......... TRUE: nenhuma aba interna e escondida hoje
WITH base AS (
  SELECT
    c.empresa_id,
    c.cargo,
    c.cargo IN (
      'administrador', 'super_admin', 'lider', 'elite',
      'gerencia', 'ouvidoria', 'diretoria'
    ) AS lider_mais,
    c.cargo IN ('administrador', 'super_admin', 'diretoria')
      OR COALESCE((c.permissoes->>'ver_todos_setores')::BOOLEAN, FALSE)
      OR COALESCE((c.permissoes->>'ver_analiticos_global')::BOOLEAN, FALSE) AS ve_todos
  FROM public.cargos_permissoes c
)
UPDATE public.cargos_permissoes c
SET permissoes = c.permissoes || jsonb_build_object(
      'analitico_escopo_individual',    (NOT b.lider_mais) OR b.cargo = 'elite',
      'analitico_escopo_setor',         b.lider_mais,
      'analitico_escopo_todos_setores', b.ve_todos,
      'analitico_sub_analitico',          TRUE,
      'analitico_sub_recebimento_diario', TRUE,
      'analitico_sub_colchao',            TRUE,
      'analitico_sub_por_operador',       TRUE,
      'analitico_sub_formas_pagamento',   TRUE,
      'analitico_sub_ranking',            TRUE,
      'analitico_sub_destaques_dia',      TRUE,
      'analitico_sub_sem_operador',       TRUE
    ),
    atualizado_em = now()
FROM base b
WHERE c.empresa_id = b.empresa_id AND c.cargo = b.cargo;

-- ── Prova de equivalencia ───────────────────────────────────────────────────
-- Compara ACESSO EFETIVO antigo x novo. Efetivo, e nao valor gravado: a aba-mae
-- (ver_analitico) gateia tudo dentro dela, na rota e no leitor.
DO $prova$
DECLARE
  v_erro TEXT;
BEGIN
  -- 1. Visao individual: quem via os proprios numeros continua vendo.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE (COALESCE((c.permissoes->>'ver_analitico')::BOOLEAN, FALSE)
         AND (c.permissoes->>'analitico_escopo_individual')::BOOLEAN)
        IS DISTINCT FROM (
          COALESCE((c.permissoes->>'ver_analitico')::BOOLEAN, FALSE)
          AND (c.cargo NOT IN (
                 'administrador', 'super_admin', 'lider', 'elite',
                 'gerencia', 'ouvidoria', 'diretoria')
               OR c.cargo = 'elite')
        );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Analitico: visao individual divergiu em %', v_erro;
  END IF;

  -- 2. Visao de setor: reproduz isLiderMais, que e quem monta o AnaliticoLider.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE (COALESCE((c.permissoes->>'ver_analitico')::BOOLEAN, FALSE)
         AND (c.permissoes->>'analitico_escopo_setor')::BOOLEAN)
        IS DISTINCT FROM (
          COALESCE((c.permissoes->>'ver_analitico')::BOOLEAN, FALSE)
          AND c.cargo IN (
            'administrador', 'super_admin', 'lider', 'elite',
            'gerencia', 'ouvidoria', 'diretoria')
        );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Analitico: visao de setor divergiu em %', v_erro;
  END IF;

  -- 3. Alcance total: reproduz veTodosOsSetores, cargo a cargo. A guarda la em
  --    cima ja provou que a outra definicao concorda com esta.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE (COALESCE((c.permissoes->>'ver_analitico')::BOOLEAN, FALSE)
         AND (c.permissoes->>'analitico_escopo_todos_setores')::BOOLEAN)
        IS DISTINCT FROM (
          COALESCE((c.permissoes->>'ver_analitico')::BOOLEAN, FALSE)
          AND (c.cargo IN ('administrador', 'super_admin', 'diretoria')
               OR COALESCE((c.permissoes->>'ver_todos_setores')::BOOLEAN, FALSE)
               OR COALESCE((c.permissoes->>'ver_analiticos_global')::BOOLEAN, FALSE))
        );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Analitico: alcance total divergiu em %', v_erro;
  END IF;

  -- 4. Nenhuma aba interna some: as oito nascem TRUE, sem excecao.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE NOT (
    (c.permissoes->>'analitico_sub_analitico')::BOOLEAN
    AND (c.permissoes->>'analitico_sub_recebimento_diario')::BOOLEAN
    AND (c.permissoes->>'analitico_sub_colchao')::BOOLEAN
    AND (c.permissoes->>'analitico_sub_por_operador')::BOOLEAN
    AND (c.permissoes->>'analitico_sub_formas_pagamento')::BOOLEAN
    AND (c.permissoes->>'analitico_sub_ranking')::BOOLEAN
    AND (c.permissoes->>'analitico_sub_destaques_dia')::BOOLEAN
    AND (c.permissoes->>'analitico_sub_sem_operador')::BOOLEAN
  );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Analitico: aba interna nasceu desligada em %', v_erro;
  END IF;

  -- 5. Toda linha recebeu as onze chaves.
  SELECT string_agg(e.slug || '/' || c.cargo, ', ')
    INTO v_erro
  FROM public.cargos_permissoes c
  JOIN public.empresas e ON e.id = c.empresa_id
  WHERE NOT (c.permissoes ?& ARRAY[
    'analitico_escopo_individual', 'analitico_escopo_setor',
    'analitico_escopo_todos_setores',
    'analitico_sub_analitico', 'analitico_sub_recebimento_diario',
    'analitico_sub_colchao', 'analitico_sub_por_operador',
    'analitico_sub_formas_pagamento', 'analitico_sub_ranking',
    'analitico_sub_destaques_dia', 'analitico_sub_sem_operador'
  ]);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Analitico: chaves faltando em %', v_erro;
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
