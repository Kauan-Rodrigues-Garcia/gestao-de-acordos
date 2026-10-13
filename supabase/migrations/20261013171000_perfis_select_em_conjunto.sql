-- ============================================================================
-- perfis_select: setor e equipe calculados UMA vez por consulta (13/10/2026)
-- ============================================================================
--
-- `perfis_select` é o pedágio de toda leitura de perfil. Nos escopos 2 (setor —
-- que inclui todo operador) e 1 (equipe) ela chamava, POR LINHA de `perfis`:
--
--   EXISTS (SELECT 1 FROM fn_setores_do_operador(perfis.id) ...)
--   EXISTS (SELECT 1 FROM fn_equipes_com_lideranca(perfis.id) ...)
--
-- São SECURITY DEFINER — o Postgres não as embute —, e cada chamada junta
-- `equipe_membros` com `equipes`. Medido em 13/10: 20,5 milhões de leituras
-- sequenciais em `equipes` (48 linhas) em 5 dias, ~16 ms por listagem
-- completa de perfis.
--
-- Agora a pergunta se inverte: em vez de «os setores DESTA pessoa cruzam os
-- meus?», linha a linha, «quem está nos meus setores?», uma vez — e a policy
-- vira `perfis.id IN (SELECT …)` sem correlação, que o Postgres resolve com um
-- hash.
--
-- EQUIVALÊNCIA, conferida em produção em 13/10/2026 antes de escrever isto
-- (consulta como postgres, sem RLS, comparando md5 do conjunto ordenado de ids):
--   escopo 2 — os 521 perfis como «quem olha»: 0 diferenças;
--   escopo 1 — todos os líderes de equipe + 60 membros (92): 0 diferenças.
--
-- As definições espelham, termo a termo:
--   fn_setores_do_operador(P) = {P.setor_id} ∪ {setor das equipes onde P é
--                               clone ou líder}
--   fn_equipes_com_lideranca(P) = {equipes onde P é membro} ∪ {equipes que P
--                               lidera em equipe_lideres}
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 1. Quem está nos meus setores ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_perfis_dos_meus_setores()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH meus AS (
    SELECT x.s FROM public.fn_setores_do_operador((SELECT auth.uid())) x(s)
  )
  SELECT p.id
    FROM public.perfis p
   WHERE p.setor_id IN (SELECT s FROM meus)
  UNION
  SELECT m.pessoa_id
    FROM public.equipe_membros m
    JOIN public.equipes e ON e.id = m.equipe_id
   WHERE m.papel IN ('clone', 'lider')
     AND m.pessoa_id IS NOT NULL
     AND e.setor_id IN (SELECT s FROM meus);
$function$;

-- ── 2. Quem está nas minhas equipes ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_perfis_das_minhas_equipes()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH minhas AS (
    SELECT x.equipe_id FROM public.fn_equipes_com_lideranca((SELECT auth.uid())) x(equipe_id, setor_id)
  )
  SELECT m.pessoa_id
    FROM public.equipe_membros m
   WHERE m.equipe_id IN (SELECT equipe_id FROM minhas)
     AND m.pessoa_id IS NOT NULL
  UNION
  SELECT el.lider_id
    FROM public.equipe_lideres el
   WHERE el.equipe_id IN (SELECT equipe_id FROM minhas)
     AND el.lider_id IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.fn_perfis_dos_meus_setores()   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_perfis_das_minhas_equipes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_perfis_dos_meus_setores()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_perfis_das_minhas_equipes() TO authenticated;

COMMENT ON FUNCTION public.fn_perfis_dos_meus_setores() IS
  'Perfis visíveis no escopo 2 de perfis_select: quem tem setor de cadastro num setor meu, ou é clone/líder '
  'de equipe de um setor meu. Conjunto calculado uma vez por consulta (20261013171000).';
COMMENT ON FUNCTION public.fn_perfis_das_minhas_equipes() IS
  'Perfis visíveis no escopo 1 de perfis_select: membros e líderes das equipes que eu integro ou lidero. '
  'Conjunto calculado uma vez por consulta (20261013171000).';

-- ── 3. A policy ─────────────────────────────────────────────────────────────
--
-- Igual à de `pg_policies` em 13/10/2026 nos ramos de cima (eu mesmo,
-- super_admin, empresa, escopo 3); só os ramos 2 e 1 mudam.

ALTER POLICY perfis_select ON public.perfis
  USING (
    ((SELECT auth.uid()) = id)
    OR (SELECT public.fn_user_is_super_admin())
    OR (
      (empresa_id IN (SELECT public.fn_minhas_empresas()))
      AND CASE (SELECT public.fn_user_escopo_perfis())
            WHEN 3 THEN true
            WHEN 2 THEN (id IN (SELECT public.fn_perfis_dos_meus_setores()))
            WHEN 1 THEN (id IN (SELECT public.fn_perfis_das_minhas_equipes()))
            ELSE false
          END
    )
  );

-- ── 4. Verificação ──────────────────────────────────────────────────────────

DO $verificacao$
DECLARE
  v_qual text;
BEGIN
  SELECT qual INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'perfis' AND policyname = 'perfis_select';
  IF v_qual IS NULL OR v_qual LIKE '%fn_setores_do_operador(perfis.id)%'
     OR v_qual LIKE '%fn_equipes_com_lideranca(perfis.id)%' THEN
    RAISE EXCEPTION 'perfis_select ainda chama função por linha.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261013171000', 'perfis_select_em_conjunto', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
