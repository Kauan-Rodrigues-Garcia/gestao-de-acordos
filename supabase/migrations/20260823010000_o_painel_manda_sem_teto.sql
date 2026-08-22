-- ============================================================================
-- O painel manda: fim do teto em acordos
-- ============================================================================
--
-- ## Por que isto existe
--
-- A fase 7 fez o RLS de `acordos` ler o mapa de permissoes, mas cortando o
-- resultado por `fn_teto_rls_acordos` — um teto que eu escrevi, com listas de
-- cargo dentro, acima do painel. Na pratica: o administrador podia ligar um
-- escopo na tela e o banco continuar negando, sem dizer por que.
--
-- Isso contraria a regra do projeto, dita pelo Cleber em 2026-08-23:
--
--   "Eu quero ter o poder absoluto dessa aba de permissoes. Nao quero nenhum
--    tipo de regra que bloqueie uma decisao minha. Eu quero definir o teto."
--
-- Entao o teto sai. O que o painel diz passa a valer no banco, sem intermediario.
--
-- ## O que muda AGORA, na pratica
--
-- Os escopos ja gravados passam a valer de verdade. Cinco cargos alcancavam
-- menos do que o painel dizia, e passam a alcancar o que ele diz:
--
--   bookplay/gerencia .... setor          -> todos os setores   (4 pessoas)
--   pagueplay/ouvidoria .. so os proprios -> setor              (1 pessoa)
--   bookplay/ouvidoria ... so os proprios -> setor              (0 pessoas)
--   pagueplay/elite ...... so os proprios -> setor              (0 pessoas)
--   pagueplay/gerencia ... so os proprios -> setor              (0 pessoas)
--
-- Esses valores foram DERIVADOS por mim do codigo antigo, nao escolhidos na
-- tela. Se alguma linha nao for o desejado, agora o lugar de corrigir e o
-- painel — e a correcao passa a ter efeito no banco.
--
-- ## O cargo tambem sai da policy
--
-- `administrador` e `diretoria` estavam como piso por cargo dentro da propria
-- policy. Piso e teto sao o mesmo problema visto de lados opostos: os dois
-- passam por cima do painel. Com o piso, desligar um escopo da diretoria na
-- tela nao teria efeito.
--
-- Hoje as duas linhas tem todas as chaves ligadas, entao o alcance delas nao
-- muda. O que muda e que agora da para mexer.
--
-- ## O que NAO sai: a chave-mestra do super_admin
--
-- `super_admin` continua passando por cima de tudo, e isso e proposital — e a
-- garantia de que ninguem se tranca para fora editando o proprio painel. E o
-- unico cargo que o painel nao consegue reduzir, e existe para proteger quem
-- configura, nao para limita-lo.
--
-- ## O que ainda NAO obedece ao painel
--
-- Esta migration resolve `acordos`. Outras 39 tabelas ainda decidem leitura e
-- escrita por CARGO, dentro das proprias policies — `analitico_recebimentos`,
-- `diario_recebimentos`, `perfis`, `equipes`, `metas`, Pix, Tickets e as demais.
-- Liberar uma aba dessas no painel continua sem efeito no banco ate que cada
-- uma passe pelo mesmo tratamento.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── A funcao passa a devolver o que o painel diz, e ponto ───────────────────
CREATE OR REPLACE FUNCTION public.fn_user_escopo_acordos()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH ctx AS (
    SELECT public.fn_user_perfil()     AS cargo,
           public.fn_user_empresa_id() AS empresa_id
  ),
  mapa AS (
    SELECT cp.permissoes
      FROM public.cargos_permissoes cp
      JOIN ctx ON cp.empresa_id = ctx.empresa_id AND cp.cargo = ctx.cargo
  ),
  -- As abas que leem `acordos`. Analitico e Usuarios ficam de fora: leem outras
  -- tabelas, com RLS propria.
  abas(aba, chave) AS (VALUES
    ('dashboard',        NULL::TEXT),
    ('acordos',          'ver_acordos'),
    ('lixeira',          'ver_lixeira'),
    ('pix',              'ver_pix_automatico'),
    ('painel_lider',     'ver_painel_lider'),
    ('painel_diretoria', 'ver_painel_diretoria')
  ),
  niveis(nome, peso) AS (VALUES
    ('individual', 0), ('equipe', 1), ('setor', 2), ('todos_setores', 3)
  )
  SELECT COALESCE(MAX(CASE
    WHEN (a.chave IS NULL
          OR COALESCE((m.permissoes->>a.chave)::BOOLEAN, FALSE))
     AND COALESCE((m.permissoes->>(a.aba || '_escopo_' || n.nome))::BOOLEAN, FALSE)
    THEN n.peso
  END), 0)
  FROM mapa m CROSS JOIN abas a CROSS JOIN niveis n;
$function$;

COMMENT ON FUNCTION public.fn_user_escopo_acordos() IS
  'Ate onde o cargo alcanca em acordos: 0=proprios, 1=equipe, 2=setor, '
  '3=todos os setores. E o MAIOR escopo entre as abas que leem acordos, tal '
  'como o painel de permissoes diz — sem teto. Quem define o limite e quem '
  'edita o painel.';

-- ── O teto morre ────────────────────────────────────────────────────────────
-- Nao fica desligado nem comentado: fica FORA. Funcao de teto parada no schema
-- e convite para alguem religar.
DROP FUNCTION IF EXISTS public.fn_teto_rls_acordos(TEXT, TEXT);

-- ── A policy, sem piso e sem teto de cargo ──────────────────────────────────
DROP POLICY IF EXISTS acordos_select ON public.acordos;

CREATE POLICY acordos_select ON public.acordos
FOR SELECT
USING (
  (
    (SELECT public.fn_user_is_super_admin())
    OR (SELECT public.fn_user_acesso_multiempresa())
    OR empresa_id = (SELECT public.fn_user_empresa_id())
  )
  AND (
    -- Os proprios acordos. Nao e regra de cargo: e o piso de qualquer pessoa
    -- sobre o proprio trabalho, e o painel nao precisa conceder isso.
    operador_id = (SELECT auth.uid())

    -- Chave-mestra: existe para que ninguem se tranque para fora editando o
    -- painel. E o unico cargo que a tela nao consegue reduzir.
    OR (SELECT public.fn_user_is_super_admin())

    -- Daqui para baixo quem manda e o painel, sem intermediario.
    OR (SELECT public.fn_user_escopo_acordos()) >= 3

    OR (
      (SELECT public.fn_user_escopo_acordos()) >= 2
      AND (
        setor_id = (SELECT public.fn_user_setor_id())
        OR (setor_id IS NULL
            AND public.fn_operador_setor_id(operador_id) = (SELECT public.fn_user_setor_id()))
        OR public.fn_operador_clonado_no_setor(operador_id, (SELECT public.fn_user_setor_id()))
      )
    )
  )
);

COMMENT ON POLICY acordos_select ON public.acordos IS
  'Leitura de acordos. O alcance vem de fn_user_escopo_acordos(), que espelha '
  'o painel de permissoes sem teto. As unicas regras acima do painel sao os '
  'proprios acordos da pessoa e a chave-mestra do super_admin.';

-- ── Registro do que passou a valer ──────────────────────────────────────────
DO $registro$
DECLARE
  v_lista TEXT;
BEGIN
  WITH abas(aba, chave) AS (VALUES
    ('dashboard', NULL::TEXT), ('acordos', 'ver_acordos'), ('lixeira', 'ver_lixeira'),
    ('pix', 'ver_pix_automatico'), ('painel_lider', 'ver_painel_lider'),
    ('painel_diretoria', 'ver_painel_diretoria')
  ), niveis(nome, peso) AS (VALUES
    ('individual', 0), ('equipe', 1), ('setor', 2), ('todos_setores', 3)
  ), calc AS (
    SELECT e.slug, cp.cargo,
           COALESCE(MAX(CASE
             WHEN (a.chave IS NULL OR COALESCE((cp.permissoes->>a.chave)::BOOLEAN, FALSE))
              AND COALESCE((cp.permissoes->>(a.aba || '_escopo_' || n.nome))::BOOLEAN, FALSE)
             THEN n.peso END), 0) AS escopo,
           (SELECT count(*) FROM public.perfis p
             WHERE p.empresa_id = cp.empresa_id AND p.perfil = cp.cargo AND p.ativo) AS pessoas
      FROM public.cargos_permissoes cp
      JOIN public.empresas e ON e.id = cp.empresa_id
      CROSS JOIN abas a CROSS JOIN niveis n
     GROUP BY e.slug, cp.cargo, cp.empresa_id
  )
  SELECT string_agg(slug || '/' || cargo || ' = '
                    || (ARRAY['proprios','equipe','setor','todos os setores'])[escopo + 1]
                    || ' (' || pessoas || ' pessoas)', E'\n  ' ORDER BY slug, cargo)
    INTO v_lista
  FROM calc;

  RAISE NOTICE E'Alcance em acordos, agora ditado pelo painel:\n  %', v_lista;
END
$registro$;

COMMIT;
