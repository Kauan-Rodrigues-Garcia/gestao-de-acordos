-- ============================================================================
-- RLS de acordos passa a ler o escopo por aba — fase 7
-- ============================================================================
--
-- ## O que muda, e o que NAO muda
--
-- A policy de SELECT de `acordos` deixa de decidir por listas de cargo escritas
-- dentro dela e passa a ler o MAPA DE PERMISSOES, pela funcao nova
-- `fn_user_escopo_acordos()`.
--
-- **Ninguem ganha acesso nesta migration.** O escopo lido e cortado pelo teto
-- atual (`fn_teto_rls_acordos`), e hoje nenhum cargo tem escopo MENOR que o
-- teto — entao o resultado e identico ao de agora, linha por linha. O bloco de
-- prova verifica isso e aborta se deixar de valer.
--
-- O que se ganha: dali em diante, BAIXAR um escopo no painel baixa o acesso no
-- BANCO, e nao so na tela. Era a metade que faltava da reestruturacao — ate
-- aqui as permissoes governavam o que a interface mostrava, e o banco continuava
-- respondendo por cargo.
--
-- ## O teto continua no lugar, e e uma decisao pendente
--
-- Cinco cargos JA tem, no mapa, escopo maior do que o teto permite. Se o teto
-- fosse levantado agora, eles passariam a alcancar dados que hoje o banco nega:
--
--   bookplay/gerencia .... setor           -> todos os setores   (vem do Pix)
--   bookplay/ouvidoria ... so os proprios  -> setor
--   pagueplay/elite ...... so os proprios  -> setor
--   pagueplay/gerencia ... so os proprios  -> setor
--   pagueplay/ouvidoria .. so os proprios  -> setor
--
-- Isso NAO acontece aqui. Levantar o teto e uma decisao de quem responde pelo
-- dado, cargo a cargo, e o lugar de tomar essa decisao e `fn_teto_rls_acordos`
-- — uma funcao de quatro linhas, feita para ser editada com nome e data.
--
-- O RAISE NOTICE no fim imprime a lista de novo, para ficar no log da execucao.
--
-- ## Por que `SECURITY DEFINER`
--
-- A funcao le `cargos_permissoes`, que tem RLS propria. Sem DEFINER a policy
-- consultaria uma tabela que o proprio usuario pode nao ler, e devolveria zero.
--
-- E o mesmo padrao das outras auxiliares desta base (`fn_user_perfil`,
-- `fn_user_setor_id`, `fn_user_has_any_role`): sem argumentos, somente leitura,
-- devolve um inteiro de 0 a 3. Nao e o desenho de 20/08, que passava TODA
-- leitura por RPC privilegiada — aqui o RLS continua sendo a barreira, e a
-- funcao so responde "ate onde este cargo pode ir".
--
-- ## Mapa ausente nao bloqueia
--
-- Se o cargo do usuario nao tiver linha em `cargos_permissoes`, a funcao devolve
-- o TETO, e nao zero. Um mapa faltando e falha de dado, e a resposta certa para
-- falha de dado nao e trancar alguem para fora — e continuar como antes.
--
-- ## So `acordos`
--
-- `analitico_escopo_*`, `pix_escopo_*` e `usuarios_escopo_*` NAO entram no
-- calculo de tabelas que nao sejam `acordos`... e o inverso tambem vale: o Pix
-- e a Lixeira LEEM `acordos`, entao os escopos deles contam aqui. O que fica de
-- fora sao os escopos de abas que leem OUTRAS tabelas — o Analitico
-- (`analitico_recebimentos`, diario) e Usuarios (`perfis`), que tem RLS propria.
-- Misturar as familias daria alcance de acordos a quem so precisa do relatorio.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── A funcao ────────────────────────────────────────────────────────────────
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
  emp AS (
    SELECT e.slug FROM public.empresas e JOIN ctx ON e.id = ctx.empresa_id
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
  ),
  maior AS (
    SELECT COALESCE(MAX(CASE
      WHEN (a.chave IS NULL
            OR COALESCE((m.permissoes->>a.chave)::BOOLEAN, FALSE))
       AND COALESCE((m.permissoes->>(a.aba || '_escopo_' || n.nome))::BOOLEAN, FALSE)
      THEN n.peso
    END), 0) AS peso
    FROM mapa m CROSS JOIN abas a CROSS JOIN niveis n
  )
  SELECT CASE
    -- Mapa ausente: continua como antes, nunca tranca.
    WHEN NOT EXISTS (SELECT 1 FROM mapa)
      THEN public.fn_teto_rls_acordos((SELECT slug FROM emp), (SELECT cargo FROM ctx))
    ELSE LEAST(
      (SELECT peso FROM maior),
      public.fn_teto_rls_acordos((SELECT slug FROM emp), (SELECT cargo FROM ctx))
    )
  END;
$function$;

REVOKE ALL ON FUNCTION public.fn_user_escopo_acordos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_user_escopo_acordos() TO authenticated;

COMMENT ON FUNCTION public.fn_user_escopo_acordos() IS
  'Ate onde o cargo do usuario alcanca em acordos: 0=proprios, 1=equipe, '
  '2=setor, 3=todos os setores. E o MAIOR escopo entre as abas que leem '
  'acordos, cortado por fn_teto_rls_acordos. Levantar o teto e decisao humana.';

-- ── Prova: com o teto no lugar, nada muda ───────────────────────────────────
DO $prova$
DECLARE
  v_erro TEXT;
  v_lista TEXT;
BEGIN
  -- Para cada cargo, o escopo cortado tem que dar exatamente o teto de hoje.
  -- Se algum cargo tiver escopo MENOR que o teto, esta migration reduziria o
  -- acesso dele — e reduzir tambem e mudar.
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
             THEN n.peso END), 0) AS maior,
           public.fn_teto_rls_acordos(e.slug, cp.cargo) AS teto
      FROM public.cargos_permissoes cp
      JOIN public.empresas e ON e.id = cp.empresa_id
      CROSS JOIN abas a CROSS JOIN niveis n
     GROUP BY e.slug, cp.cargo
  )
  SELECT string_agg(slug || '/' || cargo || ' (escopo ' || maior || ' < teto ' || teto || ')', ', ')
    INTO v_erro
  FROM calc WHERE maior < teto;

  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION
      'Esta migration REDUZIRIA o acesso de %. Nenhum cargo pode ter escopo '
      'menor que o teto ao ligar a leitura do mapa.', v_erro;
  END IF;

  -- Quem o teto esta segurando. Nao e erro: e a decisao pendente.
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
             THEN n.peso END), 0) AS maior,
           public.fn_teto_rls_acordos(e.slug, cp.cargo) AS teto
      FROM public.cargos_permissoes cp
      JOIN public.empresas e ON e.id = cp.empresa_id
      CROSS JOIN abas a CROSS JOIN niveis n
     GROUP BY e.slug, cp.cargo
  )
  SELECT string_agg(slug || '/' || cargo || ': teto '
                    || (ARRAY['proprios','equipe','setor','todos os setores'])[teto + 1]
                    || ' segura escopo '
                    || (ARRAY['proprios','equipe','setor','todos os setores'])[maior + 1],
                    E'\n  ' ORDER BY slug, cargo)
    INTO v_lista
  FROM calc WHERE maior > teto;

  IF v_lista IS NOT NULL THEN
    RAISE NOTICE E'Fase 7 — o teto esta segurando estes cargos:\n  %', v_lista;
  END IF;
END
$prova$;

-- ── A policy ────────────────────────────────────────────────────────────────
-- A porta de empresa fica exatamente como estava. Muda so a decisao de LINHA.
--
-- VOLTA ATRAS, se precisar: a definicao anterior, copiavel como esta.
--
--   DROP POLICY acordos_select ON public.acordos;
--   CREATE POLICY acordos_select ON public.acordos FOR SELECT USING (
--     ((SELECT fn_user_is_super_admin())
--      OR (SELECT fn_user_acesso_multiempresa())
--      OR empresa_id = (SELECT fn_user_empresa_id()))
--     AND (
--       operador_id = (SELECT auth.uid())
--       OR (SELECT fn_user_is_super_admin())
--       OR (SELECT fn_user_has_any_role(ARRAY['administrador','diretoria']))
--       OR (empresa_id = (SELECT fn_empresa_id_bookplay())
--           AND (SELECT fn_user_has_any_role(ARRAY['lider','elite','gerencia']))
--           AND (setor_id = (SELECT fn_user_setor_id())
--                OR (setor_id IS NULL
--                    AND fn_operador_setor_id(operador_id) = (SELECT fn_user_setor_id()))
--                OR fn_operador_clonado_no_setor(operador_id, (SELECT fn_user_setor_id()))))
--       OR (NOT (empresa_id = (SELECT fn_empresa_id_bookplay()))
--           AND (SELECT fn_user_has_any_role(ARRAY['lider'])))
--     )
--   );
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
    -- Os proprios acordos, sempre. Nao depende de escopo nenhum.
    operador_id = (SELECT auth.uid())

    -- Chave-mestra operacional, como antes.
    OR (SELECT public.fn_user_is_super_admin())

    -- Piso que nao se mexe: administrador e diretoria seguem alcancando a
    -- empresa por cargo. Manter esta linha e o que garante que a migration nao
    -- possa TIRAR acesso de ninguem, mesmo se o mapa estiver incompleto.
    OR (SELECT public.fn_user_has_any_role(ARRAY['administrador', 'diretoria']))

    -- Daqui para baixo quem decide e o mapa de permissoes, cortado pelo teto.
    OR (SELECT public.fn_user_escopo_acordos()) >= 3

    OR (
      (SELECT public.fn_user_escopo_acordos()) >= 2
      AND (
        setor_id = (SELECT public.fn_user_setor_id())
        -- Linha sem setor carimbado: vale o setor de quem a criou.
        OR (setor_id IS NULL
            AND public.fn_operador_setor_id(operador_id) = (SELECT public.fn_user_setor_id()))
        -- BookPlay: operador clonado numa equipe deste setor.
        OR public.fn_operador_clonado_no_setor(operador_id, (SELECT public.fn_user_setor_id()))
      )
    )
  )
);

COMMENT ON POLICY acordos_select ON public.acordos IS
  'Leitura de acordos. O alcance vem de fn_user_escopo_acordos() — o maior '
  'escopo entre as abas que leem acordos, cortado por fn_teto_rls_acordos. '
  'As linhas de super_admin, administrador e diretoria sao piso: existem para '
  'que a troca nunca tire acesso de ninguem.';

COMMIT;
