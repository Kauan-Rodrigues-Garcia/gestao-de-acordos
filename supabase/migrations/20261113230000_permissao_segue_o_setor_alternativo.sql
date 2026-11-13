-- ============================================================================
-- Permissão por setor segue o setor ALTERNATIVO (13/11/2026)
-- ============================================================================
--
-- Relato do Cleber: liberou a Campanha Fácil no mapa do setor Marília Digital
-- (Configurações › Permissões, «Operador - Marília Digital») e os operadores
-- de lá continuaram sem a aba.
--
-- Conferido no banco: o mapa do Marília Digital tem ver_campanha_facil = true,
-- mas os 23 operadores de lá são CLONES — o cadastro (`perfis.setor_id`) é do
-- setor de origem (Play 5, Play Mix Marília, Play Night), e toda leitura do
-- mapa por setor usava o setor do cadastro. O mapa do alternativo nunca era
-- lido para quem está nele.
--
-- Regra do Cleber: «se a pessoa tem só um setor, segue a regra do setor
-- original; se tem um setor alternativo e um original, segue a regra do
-- alternativo, enquanto estiver nele».
--
-- ## O que muda
--
-- `fn_setor_das_permissoes(pessoa, setor_do_cadastro)` devolve o setor
-- alternativo em que a pessoa é clone (mesma empresa, ativo, não excluído);
-- sem isso, o setor do cadastro. As funções que leem o mapa por setor passam a
-- perguntar por ele:
--
--   fn_user_tem, fn_perfil_tem, fn_user_escopos_por_aba, fn_user_escopo_acordos,
--   fn_cf_tem, fn_cf_pode_liberar (Campanha Fácil), fn_chat_contatos.
--
-- Cada uma é reescrita A PARTIR DA DEFINIÇÃO QUE ESTÁ NO BANCO (várias foram
-- mexidas pelo SQL Editor): troca-se só o trecho que escolhe o setor, e a
-- migration falha se o trecho não estiver lá exatamente uma vez. Nada mais na
-- função muda.
--
-- `fn_meu_setor_das_permissoes()` dá ao front o mesmo setor (useCargoPermissoes).
--
-- Não muda: o setor do cadastro em si, o dinheiro (que é da origem), a regra
-- do setor (Nosso produto / Cofen) e a liderança.
--
-- Reverter: reaplicar as definições anteriores (guardadas em
-- `_definicoes_antes_20261113230000`, criada aqui) e dropar as duas funções.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. O setor que vale para as permissões ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_setor_das_permissoes(p_perfil uuid, p_setor uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE((
    SELECT e.setor_id
      FROM public.equipe_operadores_clones c
      JOIN public.equipes  e ON e.id = c.equipe_id
      JOIN public.setores  s ON s.id = e.setor_id
      JOIN public.perfis   p ON p.id = c.operador_id
     WHERE c.operador_id = p_perfil
       AND s.alternativo
       AND COALESCE(s.ativo, true)
       AND s.excluido_em IS NULL
       AND s.empresa_id = p.empresa_id
       AND e.setor_id IS DISTINCT FROM p_setor
     ORDER BY s.nome
     LIMIT 1
  ), p_setor);
$function$;

COMMENT ON FUNCTION public.fn_setor_das_permissoes(uuid, uuid) IS
  'O setor cujo mapa de permissões vale para a pessoa: o ALTERNATIVO em que ela é clone, '
  'senão o do cadastro. Regra do Cleber, 20261113230000.';

REVOKE ALL ON FUNCTION public.fn_setor_das_permissoes(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_setor_das_permissoes(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_meu_setor_das_permissoes()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_setor_das_permissoes(p.id, p.setor_id)
    FROM public.perfis p
   WHERE p.id = (SELECT auth.uid());
$function$;

REVOKE ALL ON FUNCTION public.fn_meu_setor_das_permissoes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_meu_setor_das_permissoes() TO authenticated;

-- ── 2. As funções que leem o mapa por setor ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public._definicoes_antes_20261113230000 (
  funcao text PRIMARY KEY,
  definicao text NOT NULL
);
REVOKE ALL ON public._definicoes_antes_20261113230000 FROM anon, authenticated;

DO $troca$
DECLARE
  r RECORD;
  v_def text;
  v_novo text;
  v_vezes int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.fn_user_tem(text)'::regprocedure,
     'p.id AS usuario_id, p.setor_id',
     'p.id AS usuario_id, public.fn_setor_das_permissoes(p.id, p.setor_id) AS setor_id'),
    ('public.fn_perfil_tem(uuid,text)'::regprocedure,
     'p.id AS usuario_id, p.setor_id',
     'p.id AS usuario_id, public.fn_setor_das_permissoes(p.id, p.setor_id) AS setor_id'),
    ('public.fn_user_escopos_por_aba()'::regprocedure,
     'p.id as usuario_id, p.setor_id',
     'p.id as usuario_id, public.fn_setor_das_permissoes(p.id, p.setor_id) as setor_id'),
    ('public.fn_user_escopo_acordos()'::regprocedure,
     'public.fn_user_setor_id()   AS setor_id',
     'public.fn_setor_das_permissoes((SELECT auth.uid()), public.fn_user_setor_id()) AS setor_id'),
    ('public.fn_cf_tem(uuid,text)'::regprocedure,
     'public.fn_permissoes_do_cargo(p_empresa, p.perfil, p.setor_id)',
     'public.fn_permissoes_do_cargo(p_empresa, p.perfil, public.fn_setor_das_permissoes(p.id, p.setor_id))'),
    ('public.fn_cf_pode_liberar(uuid)'::regprocedure,
     'public.fn_permissoes_do_cargo(p_empresa, p.perfil, p.setor_id)',
     'public.fn_permissoes_do_cargo(p_empresa, p.perfil, public.fn_setor_das_permissoes(p.id, p.setor_id))'),
    ('public.fn_chat_contatos()'::regprocedure,
     'cs.setor_id = p.setor_id AND cs.cargo = p.perfil',
     'cs.setor_id = public.fn_setor_das_permissoes(p.id, p.setor_id) AND cs.cargo = p.perfil')
  ) AS t(fn, antigo, novo)
  LOOP
    v_def := pg_get_functiondef(r.fn);
    -- Idempotente: já trocada, segue.
    IF strpos(v_def, 'fn_setor_das_permissoes') > 0 THEN
      CONTINUE;
    END IF;
    v_vezes := (length(v_def) - length(replace(v_def, r.antigo, ''))) / length(r.antigo);
    IF v_vezes <> 1 THEN
      RAISE EXCEPTION '%: o trecho «%» aparece % vezes (esperado 1). Nada aplicado.', r.fn, r.antigo, v_vezes;
    END IF;
    INSERT INTO public._definicoes_antes_20261113230000 VALUES (r.fn::text, v_def)
      ON CONFLICT (funcao) DO NOTHING;
    v_novo := replace(v_def, r.antigo, r.novo);
    EXECUTE v_novo;
  END LOOP;
END
$troca$;

COMMIT;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prosrc like '%fn_setor_das_permissoes%';
--   -- 8: as 7 trocadas e fn_meu_setor_das_permissoes. Aplicada e conferida em 13/11:
--   -- clone do Marília Digital passou a ter ver_campanha_facil; operador comum
--   -- do Play 5 continuou sem.
