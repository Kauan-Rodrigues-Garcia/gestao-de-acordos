-- ============================================================================
-- O analítico do Dashboard passa a ler o painel (e não o cargo)
-- ============================================================================
--
-- ## A divergência relatada, com número
--
-- Liberou-se, no painel, `dashboard_escopo_setor` e `dashboard_escopo_equipe`
-- para `bookplay/operador`. Abrindo o Dashboard de agosto/2026 numa conta de
-- operador do Receptivo, o painel de metas mostrava o setor no ÚLTIMO quartil,
-- com mais de 2 milhões de diferença para a projeção. A mesma tela, na conta de
-- super_admin, mostrava o mesmo setor com 106% da meta, batida no primeiro
-- quartil.
--
-- Os dois números estavam certos para o que cada um somava. O que estava errado
-- é que eram duas contas diferentes na mesma tela.
--
-- ## Por que acontecia
--
-- O painel de metas cruza DUAS fontes que respondiam a autoridades diferentes:
--
--   o REALIZADO  vem de `fn_analitico_dashboard_mes_json`, que decidia por
--                CARGO:  v_is_lider := fn_user_has_any_role(ARRAY['lider',
--                'elite','gerencia','diretoria','administrador','super_admin'])
--                — `operador` não está na lista, então recebia só as PRÓPRIAS
--                linhas;
--
--   a META       vem de `useAnalytics`, que decide por PERMISSÃO: com
--                `dashboard_escopo_setor` ligado, a meta principal passa a ser
--                a do SETOR.
--
-- Resultado: o recebimento de UMA pessoa dividido pela meta do SETOR INTEIRO.
-- Daí o último quartil e o buraco de 2 milhões. Não era arredondamento, não era
-- clone, não era Receptivo: era o numerador de um e o denominador de outro.
--
-- É o mesmo defeito que `20260823010000` matou em `acordos` e `20260823030000`
-- em `analitico_recebimentos`. Estas duas RPCs são `SECURITY DEFINER` e passam
-- POR CIMA da RLS — a policy já lia o painel, a função não, e quem manda numa
-- função DEFINER é a função.
--
-- ## O que passa a valer
--
-- `fn_user_escopo_analitico()` — o MAIOR alcance entre as abas que consomem
-- este agregado (Dashboard, Analítico, Painel Líder, Painel Diretoria), pela
-- mesma receita de `fn_user_escopo_acordos()`. E as duas RPCs recortam assim:
--
--   3  todos os setores  → a empresa inteira, como a liderança recebe hoje
--   2  setor             → os meus setores: linhas carimbadas neles MAIS as
--                          pessoas que pertencem ou estão clonadas neles
--   1  equipe            → as pessoas no meu alcance de equipe (a chave
--                          `dashboard_escopo_equipe_todas` decide se isso é
--                          «as minhas equipes» ou «as equipes dos meus setores»)
--   0  nenhum            → só as minhas linhas, como antes
--
-- ## Quem ganha e quem perde
--
-- GANHA quem o painel já liberava e o cargo negava — o caso relatado:
-- `bookplay/operador` com `dashboard_escopo_setor` passa a somar o setor, e o
-- número dele passa a ser o MESMO do super_admin.
--
-- ESTREITA para duas famílias, e as duas de propósito:
--
--   • liderança com alcance de setor (nível 2) deixa de RECEBER a empresa
--     inteira e passa a receber os próprios setores. Não muda um único número
--     na tela: `AnalyticsPanel` já travava o recorte em `perfil.setor_id`
--     quando a pessoa não tem `todos_setores`, e o conjunto entregue aqui é um
--     superconjunto do que aquele recorte usa — inclusive para setor
--     alternativo, que soma por USUÁRIO e não pelo carimbo. O que sai é o
--     tráfego de linhas que a tela descartava.
--
--   • `bookplay/ouvidoria` cai para o nível 0. Ela está na lista de cargo
--     antiga, mas tem `ver_dashboard`, `ver_analitico`, `ver_painel_lider` e
--     `ver_painel_diretoria` DESLIGADOS — ou seja, não tem tela de onde chamar
--     estas RPCs. É o painel valendo, que é a regra do projeto.
--
-- O bloco de prova no fim imprime a lista completa, cargo a cargo, no log da
-- execução.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '180s';

-- ── O alcance, lido do painel ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_user_escopo_analitico()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  -- `fn_user_escopo` devolve -1 para aba desligada; o GREATEST com 0 faz o
  -- piso ser «só os próprios», que é o mesmo que a RLS de
  -- analitico_recebimentos já concede a qualquer pessoa sobre as linhas dela.
  SELECT GREATEST(
    0,
    public.fn_user_escopo('dashboard'),
    public.fn_user_escopo('analitico'),
    public.fn_user_escopo('painel_lider'),
    public.fn_user_escopo('painel_diretoria')
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_user_escopo_analitico() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_user_escopo_analitico() TO authenticated;

COMMENT ON FUNCTION public.fn_user_escopo_analitico() IS
  'Ate onde o usuario alcanca no agregado do analitico: 0=proprios, 1=equipe, '
  '2=setor, 3=todos os setores. E o MAIOR escopo entre as abas que consomem '
  'esse agregado (dashboard, analitico, painel_lider, painel_diretoria). '
  'Mesma receita de fn_user_escopo_acordos, sem teto acima do painel.';

-- ── Agregado do mês, em um JSONB (caminho principal) ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_analitico_dashboard_mes_json(
  p_empresa_id UUID, p_mes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_eu         UUID := (SELECT auth.uid());
  v_escopo     INTEGER;
  v_setores    UUID[] := ARRAY[]::UUID[];
  v_operadores UUID[] := ARRAY[]::UUID[];
  v_inicio     DATE := (p_mes || '-01')::DATE;
  v_fim        DATE := (DATE_TRUNC('month', (p_mes || '-01')::DATE)
                        + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_out        JSONB;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN '[]'::JSONB;
  END IF;

  v_escopo := public.fn_user_escopo_analitico();

  IF v_escopo = 2 THEN
    v_setores := ARRAY(SELECT public.fn_setores_do_operador(v_eu));
    -- Os conjuntos saem UMA vez, aqui, e entram na consulta como array. A
    -- alternativa — perguntar por linha do analitico — chamaria a funcao
    -- dezenas de milhares de vezes num mes cheio.
    v_operadores := ARRAY(
      SELECT p.id
        FROM public.perfis p
       WHERE p.empresa_id = p_empresa_id
         AND (
           p.setor_id = ANY(v_setores)
           -- Clonado numa equipe de um setor meu, ou lotado numa equipe dele.
           OR EXISTS (
             SELECT 1 FROM public.fn_equipes_do_operador(p.id) eq
              WHERE eq.setor_id = ANY(v_setores)
           )
         )
    );
  ELSIF v_escopo = 1 THEN
    v_operadores := ARRAY(
      SELECT p.id
        FROM public.perfis p
       WHERE p.empresa_id = p_empresa_id
         AND public.fn_operador_no_meu_alcance_de_equipe(p.id)
    );
  END IF;

  SELECT COALESCE(jsonb_agg(t), '[]'::JSONB)
    INTO v_out
    FROM (
      SELECT
        ar.data_pagamento               AS dia,
        ar.operador_id,
        -- Setor da linha: o carimbado na importação; na falta dele (linhas
        -- anteriores à 20260712a) o setor de quem importou.
        COALESCE(ar.setor_id, imp.setor_id) AS setor_id,
        ar.forma_pagamento,
        ar.forma_detalhe,
        ar.status_tabulacao,
        SUM(ar.valor_recebido)::NUMERIC AS total,
        SUM(ar.total_ho)::NUMERIC       AS total_ho,
        COUNT(*)::BIGINT                AS qtd
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis imp ON imp.id = ar.importado_por_id
      WHERE ar.empresa_id     = p_empresa_id
        AND ar.data_pagamento BETWEEN v_inicio AND v_fim
        AND (
          v_escopo >= 3
          -- As minhas linhas, sempre — o piso que nao depende de escopo.
          OR ar.operador_id = v_eu
          -- Nivel setor: pelo carimbo do relatorio.
          OR COALESCE(ar.setor_id, imp.setor_id) = ANY(v_setores)
          -- Nivel setor (alternativo) e nivel equipe: pela pessoa.
          OR ar.operador_id = ANY(v_operadores)
        )
      GROUP BY ar.data_pagamento, ar.operador_id,
               COALESCE(ar.setor_id, imp.setor_id),
               ar.forma_pagamento, ar.forma_detalhe, ar.status_tabulacao
    ) t;

  RETURN v_out;
END;
$function$;

REVOKE ALL     ON FUNCTION public.fn_analitico_dashboard_mes_json(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_analitico_dashboard_mes_json(UUID, TEXT)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_analitico_dashboard_mes_json(UUID, TEXT) IS
  'Agregado mensal do analitico para o dashboard, em um unico JSONB. Devolve '
  'setor_id (carimbo da importacao, com fallback no setor de quem importou) '
  'para o dashboard aplicar a MESMA regra de acumulado da aba Analitico. '
  'Escopo: fn_user_escopo_analitico() — o painel, nao o cargo.';

-- ── Mesmo agregado, em tabela (caminho legado paginado) ─────────────────────
-- `buscarAnaliticoDashboardMesPaginado` so cai aqui quando a RPC JSON nao
-- existe. Fica com a MESMA regra mesmo assim: um fallback que responde outra
-- coisa e um defeito esperando a proxima vez que alguem cair nele.
CREATE OR REPLACE FUNCTION public.fn_analitico_dashboard_mes(
  p_empresa_id UUID, p_mes TEXT
)
RETURNS TABLE(dia DATE, operador_id UUID, forma_pagamento TEXT, forma_detalhe TEXT,
              status_tabulacao TEXT, total NUMERIC, total_ho NUMERIC, qtd BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_eu         UUID := (SELECT auth.uid());
  v_escopo     INTEGER;
  v_setores    UUID[] := ARRAY[]::UUID[];
  v_operadores UUID[] := ARRAY[]::UUID[];
  v_inicio     DATE := (p_mes || '-01')::DATE;
  v_fim        DATE := (DATE_TRUNC('month', (p_mes || '-01')::DATE)
                        + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;

  v_escopo := public.fn_user_escopo_analitico();

  IF v_escopo = 2 THEN
    v_setores := ARRAY(SELECT public.fn_setores_do_operador(v_eu));
    v_operadores := ARRAY(
      SELECT p.id
        FROM public.perfis p
       WHERE p.empresa_id = p_empresa_id
         AND (
           p.setor_id = ANY(v_setores)
           OR EXISTS (
             SELECT 1 FROM public.fn_equipes_do_operador(p.id) eq
              WHERE eq.setor_id = ANY(v_setores)
           )
         )
    );
  ELSIF v_escopo = 1 THEN
    v_operadores := ARRAY(
      SELECT p.id
        FROM public.perfis p
       WHERE p.empresa_id = p_empresa_id
         AND public.fn_operador_no_meu_alcance_de_equipe(p.id)
    );
  END IF;

  RETURN QUERY
  SELECT
    ar.data_pagamento               AS dia,
    ar.operador_id,
    ar.forma_pagamento,
    ar.forma_detalhe,
    ar.status_tabulacao,
    SUM(ar.valor_recebido)::NUMERIC AS total,
    SUM(ar.total_ho)::NUMERIC       AS total_ho,
    COUNT(*)::BIGINT                AS qtd
  FROM public.analitico_recebimentos ar
  LEFT JOIN public.perfis imp ON imp.id = ar.importado_por_id
  WHERE ar.empresa_id     = p_empresa_id
    AND ar.data_pagamento BETWEEN v_inicio AND v_fim
    AND (
      v_escopo >= 3
      OR ar.operador_id = v_eu
      OR COALESCE(ar.setor_id, imp.setor_id) = ANY(v_setores)
      OR ar.operador_id = ANY(v_operadores)
    )
  GROUP BY ar.data_pagamento, ar.operador_id, ar.forma_pagamento,
           ar.forma_detalhe, ar.status_tabulacao
  -- Ordem TOTAL (todas as chaves do GROUP BY) — sem isso, paginar por range
  -- entre páginas fica indeterminado e o total pode duplicar/perder linhas.
  ORDER BY ar.data_pagamento,
           ar.operador_id      NULLS LAST,
           ar.forma_pagamento  NULLS LAST,
           ar.forma_detalhe    NULLS LAST,
           ar.status_tabulacao NULLS LAST;
END;
$function$;

REVOKE ALL     ON FUNCTION public.fn_analitico_dashboard_mes(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_analitico_dashboard_mes(UUID, TEXT)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_analitico_dashboard_mes(UUID, TEXT) IS
  'Caminho legado paginado do agregado mensal. Mesmo recorte da versao JSON: '
  'fn_user_escopo_analitico(), o painel e nao o cargo.';

-- ── Registro do que passou a valer, cargo a cargo ───────────────────────────
DO $prova$
DECLARE
  v_lista TEXT;
BEGIN
  WITH abas(aba, chave) AS (VALUES
    ('dashboard',        'ver_dashboard'),
    ('analitico',        'ver_analitico'),
    ('painel_lider',     'ver_painel_lider'),
    ('painel_diretoria', 'ver_painel_diretoria')
  ), niveis(nome, peso) AS (VALUES
    ('individual', 0), ('equipe', 1), ('setor', 2), ('todos_setores', 3)
  ), calc AS (
    SELECT e.slug, cp.cargo,
           -- Espelha fn_user_escopo_analitico() sem usuario logado.
           GREATEST(0, COALESCE(MAX(CASE
             WHEN COALESCE((cp.permissoes->>a.chave)::BOOLEAN, FALSE)
              AND COALESCE((cp.permissoes->>(a.aba || '_escopo_' || n.nome))::BOOLEAN, FALSE)
             THEN n.peso END), 0)) AS novo,
           -- A lista de cargo que saiu de cena.
           CASE WHEN cp.cargo = ANY(ARRAY['lider','elite','gerencia','diretoria',
                                          'administrador','super_admin'])
                THEN 3 ELSE 0 END AS antigo
      FROM public.cargos_permissoes cp
      JOIN public.empresas e ON e.id = cp.empresa_id
      CROSS JOIN abas a CROSS JOIN niveis n
     GROUP BY e.slug, cp.cargo
  )
  SELECT string_agg(slug || '/' || cargo || ': '
                    || (ARRAY['proprios','equipe','setor','todos os setores'])[antigo + 1]
                    || ' -> '
                    || (ARRAY['proprios','equipe','setor','todos os setores'])[novo + 1],
                    E'\n  ' ORDER BY slug, cargo)
    INTO v_lista
  FROM calc WHERE novo <> antigo;

  IF v_lista IS NOT NULL THEN
    RAISE NOTICE E'O analitico do dashboard passa a responder ao painel:\n  %', v_lista;
  ELSE
    RAISE NOTICE 'Nenhum cargo muda de alcance no analitico do dashboard.';
  END IF;
END
$prova$;

COMMIT;
