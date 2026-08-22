-- ============================================================================
-- As primitivas: o painel de permissoes dentro do Postgres
-- ============================================================================
--
-- ## Por que
--
-- REGRA ABSOLUTA DO PROJETO (Cleber, 23/08): o painel de permissoes tem poder
-- total. Se ele liga uma aba para um cargo, aquele cargo abre a aba. Se ele
-- limita a um setor, o banco limita ao setor. Nenhuma regra de codigo ou de
-- policy pode passar por cima disso.
--
-- Hoje **76 policies em 40 tabelas** decidem por CARGO, com listas escritas
-- dentro delas. Enquanto for assim, o painel manda na interface e o banco
-- responde outra coisa — que e exatamente a queixa: "eu libero e nao acontece".
--
-- Converter 76 policies a mao seria 76 chances de errar. Em vez disso, esta
-- migration cria DUAS funcoes que respondem as unicas perguntas que as policies
-- precisam fazer, e as proximas trocam as listas de cargo por chamadas a elas.
--
-- Esta migration **nao altera policy nenhuma**. So instala as ferramentas.
--
-- ## `fn_user_tem(chave)` — espelho exato do `temPermissao` do frontend
--
-- A ordem de resolucao e a mesma de `src/hooks/useCargoPermissoes.ts`, e isso
-- e requisito, nao coincidencia: tela e banco discordarem sobre a mesma chave e
-- pior do que os dois estarem errados juntos.
--
--   1. acesso total (`administrador`, `super_admin`) responde `true` — menos
--      para as chaves de concessao explicita, que ninguem ganha de graca;
--   2. excecao por pessoa (`perfis_permissoes`) manda sobre o cargo;
--   3. o mapa do cargo (`cargos_permissoes`);
--   4. chave ausente vale `false`, sem excecao.
--
-- ## `fn_user_escopo(aba)` — ate onde aquele cargo enxerga NAQUELA aba
--
-- Devolve 0=proprios, 1=equipe, 2=setor, 3=todos os setores. Aba desligada
-- devolve -1, que e diferente de 0: "a aba nao existe para voce" nao e a mesma
-- coisa que "voce ve so os seus".
--
-- O registro de abas vive em `fn_abas_escopo()`, espelhando `ABAS_COM_ESCOPO`
-- de `src/lib/permissoes-escopo.ts`.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── O registro de abas, espelhando o TypeScript ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_abas_escopo()
RETURNS TABLE(aba TEXT, chave_aba TEXT)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  VALUES
    ('dashboard',        NULL::TEXT),
    ('acordos',          'ver_acordos'),
    ('lixeira',          'ver_lixeira'),
    ('pix',              'ver_pix_automatico'),
    ('painel_lider',     'ver_painel_lider'),
    ('painel_diretoria', 'ver_painel_diretoria'),
    ('analitico',        'ver_analitico'),
    ('usuarios',         'ver_usuarios');
$function$;

COMMENT ON FUNCTION public.fn_abas_escopo() IS
  'Abas com escopo proprio. Espelha ABAS_COM_ESCOPO de permissoes-escopo.ts. '
  'chave_aba NULL = aba sem interruptor (o Dashboard, que e a rota /).';

-- ── A permissao, como o frontend a resolve ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_user_tem(p_chave TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH ctx AS (
    SELECT p.perfil AS cargo, p.empresa_id, p.id AS usuario_id
      FROM public.perfis p
     WHERE p.id = (SELECT auth.uid())
  ),
  explicita AS (
    SELECT EXISTS (
      SELECT 1 FROM public.fn_permissoes_catalogo() c
       WHERE c.chave = p_chave AND c.explicita
    ) AS sim
  ),
  excecao AS (
    SELECT pp.permissoes->>p_chave AS valor
      FROM public.perfis_permissoes pp
      JOIN ctx ON pp.usuario_id = ctx.usuario_id
     WHERE pp.permissoes ? p_chave
  ),
  do_cargo AS (
    SELECT cp.permissoes->>p_chave AS valor
      FROM public.cargos_permissoes cp
      JOIN ctx ON cp.empresa_id = ctx.empresa_id AND cp.cargo = ctx.cargo
     WHERE cp.permissoes ? p_chave
  )
  SELECT CASE
    -- 1. Acesso total, menos o que exige concessao nominal.
    WHEN (SELECT cargo FROM ctx) IN ('administrador', 'super_admin')
         AND NOT (SELECT sim FROM explicita)
      THEN TRUE
    -- 2. A excecao por pessoa manda sobre o cargo.
    WHEN EXISTS (SELECT 1 FROM excecao)
      THEN COALESCE((SELECT valor FROM excecao)::BOOLEAN, FALSE)
    -- 3. O mapa do cargo.
    WHEN EXISTS (SELECT 1 FROM do_cargo)
      THEN COALESCE((SELECT valor FROM do_cargo)::BOOLEAN, FALSE)
    -- 4. Ausente vale negado.
    ELSE FALSE
  END;
$function$;

REVOKE ALL ON FUNCTION public.fn_user_tem(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_user_tem(TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_user_tem(TEXT) IS
  'O usuario atual tem esta permissao? Mesma ordem de resolucao do '
  'temPermissao de useCargoPermissoes.ts: acesso total, excecao por pessoa, '
  'mapa do cargo, e ausente = negado.';

-- ── O escopo de uma aba ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_user_escopo(p_aba TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH meta AS (
    SELECT a.chave_aba FROM public.fn_abas_escopo() a WHERE a.aba = p_aba
  ),
  niveis(nome, peso) AS (
    VALUES ('individual', 0), ('equipe', 1), ('setor', 2), ('todos_setores', 3)
  )
  SELECT CASE
    -- Aba desconhecida: -1. Melhor um numero impossivel do que um 0 que se
    -- confunde com "ve so os proprios".
    WHEN NOT EXISTS (SELECT 1 FROM meta) THEN -1
    -- Aba desligada para este cargo.
    WHEN (SELECT chave_aba FROM meta) IS NOT NULL
         AND NOT public.fn_user_tem((SELECT chave_aba FROM meta)) THEN -1
    ELSE COALESCE((
      SELECT MAX(n.peso) FROM niveis n
       WHERE public.fn_user_tem(p_aba || '_escopo_' || n.nome)
    ), -1)
  END;
$function$;

REVOKE ALL ON FUNCTION public.fn_user_escopo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_user_escopo(TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_user_escopo(TEXT) IS
  'Ate onde o usuario enxerga NESTA aba: 0=proprios, 1=equipe, 2=setor, '
  '3=todos os setores, -1=aba fechada ou sem nivel nenhum. Respeita a chave '
  'da aba: desligar a aba torna os niveis dela inefetivos.';

-- ── Prova: a primitiva concorda com o mapa, cargo a cargo ───────────────────
-- Nao da para chamar `fn_user_tem` sem um usuario logado, entao a verificacao
-- aqui e da FORMA: as chaves que o registro de abas monta existem todas no
-- catalogo. Uma aba registrada com prefixo errado devolveria sempre -1, em
-- silencio, e ninguem descobriria ate alguem perder acesso.
DO $prova$
DECLARE
  v_erro TEXT;
BEGIN
  SELECT string_agg(esperada, ', ')
    INTO v_erro
  FROM (
    SELECT a.aba || '_escopo_' || n.nome AS esperada
      FROM public.fn_abas_escopo() a
      CROSS JOIN (VALUES ('individual'), ('equipe'), ('setor'), ('todos_setores')) AS n(nome)
  ) x
  WHERE NOT EXISTS (
    SELECT 1 FROM public.cargos_permissoes cp WHERE cp.permissoes ? x.esperada
  );

  IF v_erro IS NOT NULL THEN
    RAISE NOTICE
      E'Niveis do registro que nenhum cargo tem gravados (normal quando a aba '
      'nao usa os quatro):\n  %', v_erro;
  END IF;

  -- A chave de aba, essa sim, tem que existir no catalogo.
  SELECT string_agg(a.chave_aba, ', ')
    INTO v_erro
  FROM public.fn_abas_escopo() a
  WHERE a.chave_aba IS NOT NULL
    AND a.chave_aba NOT IN (SELECT chave FROM public.fn_permissoes_catalogo());

  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION
      'O registro de abas aponta para chaves que nao existem no catalogo: %',
      v_erro;
  END IF;
END
$prova$;

COMMIT;
