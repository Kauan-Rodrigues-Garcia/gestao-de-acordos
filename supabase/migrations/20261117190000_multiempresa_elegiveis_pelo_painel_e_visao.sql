-- ============================================================================
-- Multiempresa: quem pode receber vem do PAINEL, e cada empresa diz a sua visão
-- ============================================================================
--
-- ## O bug (17/11/2026)
--
-- O Marcelinho foi criado como administrador e não aparecia em «Adicionar» na
-- aba Multiempresa. `fn_multiempresa_elegiveis` ainda tinha a lista escrita à
-- mão de 18/08 — `perfil IN ('gerencia', 'diretoria')` — enquanto o resto da
-- lógica já perguntava à chave `acesso_multiempresa_permitido` do painel desde
-- 20260824200000. O painel libera administrador (acesso total) e o cargo `rh`
-- da empresa RH; a lista de candidatos nunca soube disso.
--
-- ## O que muda
--
-- 1. `fn_multiempresa_cargo_permite(perfil)`: a MESMA pergunta que
--    `fn_user_tem('acesso_multiempresa_permitido')` faz, mas sobre outra pessoa
--    (acesso total do cargo > exceção por pessoa > mapa do cargo no setor das
--    permissões). Uma regra só, usada por candidatos, lista e concessão.
-- 2. `fn_multiempresa_elegiveis`: candidatos pela regra acima, com setor, regra
--    do setor e cidade para a tela mostrar de onde a pessoa é.
-- 3. `fn_multiempresa_listar`: devolve `cargo_permite` — quem tem concessão mas
--    o cargo já não deixa aparece marcado, em vez de parecer que vê e não ver.
-- 4. `fn_multiempresa_definir_empresa`: usa a regra única (antes ignorava a
--    exceção por pessoa e o setor das permissões).
-- 5. `fn_empresas_visao()`: para cada empresa ativa, as regras de negócio dos
--    setores (Nosso produto / Cofen) e as cidades. A tela rotula a empresa pela
--    VISÃO (regra), não pelo nome do cadastro: a empresa BOOKPLAY guarda os
--    setores de Birigui E de Marília, todos Nosso produto; a PAGUEPLAY guarda
--    o Conecta Play, Cofen. Ver CLAUDE.md, «Cofen não é PaguePlay».
-- ============================================================================

-- ── 1. A regra única ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_multiempresa_cargo_permite(p_perfil_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH ctx AS (
    SELECT p.id, p.perfil AS cargo, p.empresa_id,
           public.fn_setor_das_permissoes(p.id, p.setor_id) AS setor_id
      FROM public.perfis p
     WHERE p.id = p_perfil_id
  ),
  excecao AS (
    SELECT pp.permissoes->>'acesso_multiempresa_permitido' AS valor
      FROM public.perfis_permissoes pp
      JOIN ctx ON pp.usuario_id = ctx.id
     WHERE pp.permissoes ? 'acesso_multiempresa_permitido'
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM ctx) THEN FALSE
    -- Acesso total do cargo (administrador, super_admin). A chave não é
    -- explícita no catálogo, então o acesso total vale aqui como em fn_user_tem.
    WHEN EXISTS (SELECT 1 FROM ctx JOIN public.cargos c ON c.slug = ctx.cargo
                  WHERE c.acesso_total) THEN TRUE
    WHEN EXISTS (SELECT 1 FROM excecao)
      THEN COALESCE((SELECT valor FROM excecao)::boolean, FALSE)
    ELSE COALESCE((
      SELECT (public.fn_permissoes_do_cargo(ctx.empresa_id, ctx.cargo, ctx.setor_id)
                ->> 'acesso_multiempresa_permitido')::boolean
        FROM ctx), FALSE)
  END;
$function$;

REVOKE ALL ON FUNCTION public.fn_multiempresa_cargo_permite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_multiempresa_cargo_permite(uuid) TO authenticated, service_role;

-- ── 2. Candidatos ───────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_multiempresa_elegiveis();
CREATE FUNCTION public.fn_multiempresa_elegiveis()
RETURNS TABLE(usuario_id uuid, nome text, email text, perfil text, foto_url text,
              empresa_id uuid, empresa_nome text, setor_nome text, regra text, cidade text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.nome, p.email, p.perfil, p.foto_url,
         p.empresa_id, e.nome, s.nome, s.regra, c.nome
    FROM public.perfis p
    LEFT JOIN public.empresas   e ON e.id = p.empresa_id
    LEFT JOIN public.setores    s ON s.id = p.setor_id
    LEFT JOIN public.rh_celulas c ON c.id = s.cidade_id
   WHERE public.fn_user_is_super_admin()
     AND p.perfil <> 'super_admin'
     AND p.perfil <> 'operador'          -- atalho: operador nunca recebe no painel
     AND NOT EXISTS (SELECT 1 FROM public.perfis_empresas_acesso a WHERE a.perfil_id = p.id)
     AND COALESCE(p.arquivado, false) = false
     AND COALESCE(p.situacao, 'ativo') <> 'desligado'
     AND public.fn_multiempresa_cargo_permite(p.id)
   ORDER BY e.nome, p.nome;
$function$;

REVOKE ALL ON FUNCTION public.fn_multiempresa_elegiveis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_multiempresa_elegiveis() TO authenticated, service_role;

-- ── 3. Lista de quem atravessa ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_multiempresa_listar();
CREATE FUNCTION public.fn_multiempresa_listar()
RETURNS TABLE(usuario_id uuid, nome text, email text, perfil text, foto_url text,
              empresa_id uuid, empresa_nome text, e_super_admin boolean,
              concedido_por text, concedido_em timestamp with time zone,
              empresas_liberadas jsonb, cargo_permite boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.nome, p.email, p.perfil, p.foto_url,
         p.empresa_id, e.nome,
         p.perfil = 'super_admin',
         q.nome,
         p.acesso_multiempresa_em,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('id', ea.id, 'nome', ea.nome, 'slug', ea.slug)
                            ORDER BY ea.nome)
             FROM public.perfis_empresas_acesso a
             JOIN public.empresas ea ON ea.id = a.empresa_id
            WHERE a.perfil_id = p.id
         ), '[]'::jsonb),
         p.perfil = 'super_admin' OR public.fn_multiempresa_cargo_permite(p.id)
    FROM public.perfis p
    LEFT JOIN public.empresas e ON e.id = p.empresa_id
    LEFT JOIN public.perfis   q ON q.id = p.acesso_multiempresa_por_id
   WHERE public.fn_user_is_super_admin()
     AND COALESCE(p.arquivado, false) = false
     AND (
       p.perfil = 'super_admin'
       OR EXISTS (SELECT 1 FROM public.perfis_empresas_acesso a WHERE a.perfil_id = p.id)
     )
   ORDER BY (p.perfil = 'super_admin') DESC, p.nome;
$function$;

REVOKE ALL ON FUNCTION public.fn_multiempresa_listar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_multiempresa_listar() TO authenticated, service_role;

-- ── 4. Concessão pela regra única ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_multiempresa_definir_empresa(p_usuario_id uuid, p_empresa_id uuid, p_liberado boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_perfil       TEXT;
  v_nome         TEXT;
  v_empresa_dele UUID;
  v_empresa_nome TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  IF NOT public.fn_user_is_super_admin() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;

  SELECT p.perfil, p.nome, p.empresa_id
    INTO v_perfil, v_nome, v_empresa_dele
    FROM public.perfis p WHERE p.id = p_usuario_id;

  IF v_perfil IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'usuario_nao_encontrado');
  END IF;

  IF v_perfil = 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'super_admin_ja_tem');
  END IF;

  SELECT e.nome INTO v_empresa_nome FROM public.empresas e WHERE e.id = p_empresa_id;
  IF v_empresa_nome IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'empresa_nao_encontrada');
  END IF;

  -- A propria empresa nao e concessao.
  IF p_empresa_id = v_empresa_dele THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'empresa_propria');
  END IF;

  IF p_liberado THEN
    IF NOT public.fn_multiempresa_cargo_permite(p_usuario_id) THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'cargo_nao_elegivel', 'perfil', v_perfil);
    END IF;

    INSERT INTO public.perfis_empresas_acesso (perfil_id, empresa_id, concedido_por)
    VALUES (p_usuario_id, p_empresa_id, auth.uid())
    ON CONFLICT (perfil_id, empresa_id) DO NOTHING;
  ELSE
    DELETE FROM public.perfis_empresas_acesso
     WHERE perfil_id = p_usuario_id AND empresa_id = p_empresa_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'liberado', p_liberado,
    'nome', v_nome, 'empresa', v_empresa_nome
  );
END;
$function$;

-- ── 5. A visão de cada empresa ──────────────────────────────────────────────
-- Só metadado (regras e cidades dos setores ativos), sem dado de pessoa.
CREATE OR REPLACE FUNCTION public.fn_empresas_visao()
RETURNS TABLE(empresa_id uuid, nome text, slug text, produto text,
              regras text[], cidades text[], setores text[])
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT e.id, e.nome, e.slug, e.produto,
         COALESCE(array_agg(DISTINCT s.regra ORDER BY s.regra)
                    FILTER (WHERE s.regra IS NOT NULL), '{}'),
         COALESCE(array_agg(DISTINCT c.nome ORDER BY c.nome)
                    FILTER (WHERE c.nome IS NOT NULL), '{}'),
         COALESCE(array_agg(DISTINCT s.nome ORDER BY s.nome)
                    FILTER (WHERE s.nome IS NOT NULL), '{}')
    FROM public.empresas e
    LEFT JOIN public.setores    s ON s.empresa_id = e.id AND s.excluido_em IS NULL
    LEFT JOIN public.rh_celulas c ON c.id = s.cidade_id
   WHERE e.ativo
     AND auth.uid() IS NOT NULL
   GROUP BY e.id, e.nome, e.slug, e.produto
   ORDER BY e.nome;
$function$;

REVOKE ALL ON FUNCTION public.fn_empresas_visao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_empresas_visao() TO authenticated, service_role;
