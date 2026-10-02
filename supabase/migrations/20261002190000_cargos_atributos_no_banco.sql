-- ============================================================================
-- Fase 3, parte do banco: as funcoes leem o cadastro de cargos
-- ============================================================================
--
-- Ate aqui duas funcoes repetiam, em literal, listas que agora sao atributos de
-- `public.cargos` (20261002173500):
--
--   fn_user_tem              IN ('administrador', 'super_admin')
--                            -> cargos.acesso_total
--   fn_perfis_escopo_empresa IN ('diretoria', 'administrador', 'super_admin')
--                            -> NOT cargos.pertence_a_setor
--
-- O resultado e o mesmo para os dez cargos de hoje — o bloco de prova recusa a
-- aplicacao se nao for. O que muda e que cargo novo passa a valer aqui sem
-- editar funcao.
--
-- Os corpos partem do que estava em producao em 02/10/2026
-- (pg_get_functiondef), nao dos arquivos de migration, que tem drift.
--
-- `fn_perfis_escopo_empresa` passa a SECURITY DEFINER: agora ela le uma
-- tabela, e o gatilho roda com o papel de quem grava em `perfis` — inclusive
-- os caminhos de servidor que nao sao `authenticated`. Ela so le `cargos` e
-- mexe em NEW; nao ganha nenhum outro poder.
--
-- `fn_perfis_cargo_do_nucleo` fica como esta: a troca dele e da fase 6, junto
-- com `setores.tipo`.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 0. O cadastro diz o mesmo que as listas que vao sair ───────────────────

DO $antes$
BEGIN
  IF (SELECT array_agg(slug ORDER BY slug) FROM public.cargos WHERE acesso_total)
     IS DISTINCT FROM ARRAY['administrador', 'super_admin'] THEN
    RAISE EXCEPTION 'cargos.acesso_total diverge de (administrador, super_admin).';
  END IF;
  IF (SELECT array_agg(slug ORDER BY slug) FROM public.cargos WHERE NOT pertence_a_setor)
     IS DISTINCT FROM ARRAY['administrador', 'diretoria', 'super_admin'] THEN
    RAISE EXCEPTION 'cargos.pertence_a_setor diverge de (diretoria, administrador, super_admin).';
  END IF;
END
$antes$;

-- ── 1. fn_user_tem ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_user_tem(p_chave text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
    -- 1. Acesso total (cargos.acesso_total), menos o que exige concessao nominal.
    WHEN EXISTS (
           SELECT 1 FROM ctx JOIN public.cargos c ON c.slug = ctx.cargo
            WHERE c.acesso_total
         )
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

-- ── 2. fn_perfis_escopo_empresa ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_perfis_escopo_empresa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- A cupula pertence a empresa, nao a um setor: `cargos.pertence_a_setor`
  -- falso. E o mesmo atributo de onde sai `PERFIS_ESCOPO_EMPRESA` no front.
  if exists (
    select 1 from public.cargos c
     where c.slug = new.perfil and not c.pertence_a_setor
  ) then
    new.setor_id  := null;
    new.equipe_id := null;
  end if;
  return new;
end;
$function$;

-- ── 3. Prova ────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF pg_get_functiondef('public.fn_user_tem(text)'::regprocedure) LIKE '%''administrador''%' THEN
    RAISE EXCEPTION 'fn_user_tem ainda tem a lista literal.';
  END IF;
  IF pg_get_functiondef('public.fn_perfis_escopo_empresa()'::regprocedure) LIKE '%''diretoria''%' THEN
    RAISE EXCEPTION 'fn_perfis_escopo_empresa ainda tem a lista literal.';
  END IF;
END
$prova$;

COMMIT;
