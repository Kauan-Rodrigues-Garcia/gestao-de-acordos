-- ============================================================================
-- Auditoria de RAM na Medium, lote 2: acordos e ajustes em conjunto (09/11/2026)
-- ============================================================================
--
-- Pendente desde a auditoria de 30/10 (memória «auditoria-cpu-ram-3010») e
-- medido de novo em 09/11: as policies de LEITURA de `acordos` e de
-- `analitico_ajustes_manuais` chamam função POR LINHA. Mesmo padrão já usado em
-- `perfis_select` (20261013171000): a pergunta sobre QUEM lê vira um conjunto
-- calculado uma vez (InitPlan) e a linha só procura nele.
--
--   1. `acordos_select`. Quem tem escopo de setor (365 das 502 pessoas ativas,
--      operadores inclusive) pagava, em cada acordo de OUTRO setor,
--      `fn_operador_clonado_no_setor(operador_id, meu_setor)` — um join de
--      `equipe_operadores_clones` com `equipes`. Uma leitura da empresa passa
--      por ~29 mil linhas: é a origem das 58,8 M varreduras de `equipes` e de
--      boa parte dos 13,5% do banco que são leituras de acordos. Agora:
--        • clonado no meu setor  → `operador_id = ANY (fn_operadores_clonados_no_setor(meu_setor))`
--        • setor vazio, cadastro → `operador_id = ANY (fn_operadores_do_setor_cadastro(meu_setor))`
--      O escopo de equipe (= 1) fica como estava: hoje ninguém o tem.
--      E `fn_user_escopo_acordos()` aparecia três vezes (>= 3, >= 2, = 1): o
--      Postgres não junta InitPlans iguais, eram ~30 ms fixos por leitura.
--      Agora é um `CASE` simples, avaliado uma vez.
--      Medido antes (operador, acordos de novembro da BookPlay): 85 ms, sendo
--      ~50 ms de checagem de clone em 2.494 linhas e ~30 ms do escopo 3×.
--      Equivalência em produção (09/11, só leitura), para cada um dos 19
--      setores com gente ativa, sobre os 29.173 acordos: 0 diferenças;
--      9,2 s → 70 ms somando os 19.
--
--   2. `ajustes_select`. `fn_ajuste_alvo_no_meu_alcance(...)` por linha, com
--      até duas `fn_user_tem` e `fn_setores_do_operador` em cada. Agora as
--      permissões são InitPlans e «a pessoa está no alcance do meu setor» é o
--      conjunto inverso de `fn_setores_do_operador` (cadastro no setor, ou
--      clone/líder de equipe do setor): `fn_pessoas_no_alcance_do_setor`.
--      Equivalência em produção (09/11, só leitura), pessoa por pessoa, as 502
--      ativas sobre todos os ajustes: 0 diferenças; 23,8 s → 0,55 s.
--      `fn_user_equipes()` já inclui as equipes que a pessoa lidera, então o
--      EXISTS em `equipe_lideres` da função antiga é coberto por ela.
--
-- Só as policies de SELECT mudam. INSERT/UPDATE/DELETE gravam uma linha por
-- vez e continuam com as funções de antes, que também continuam existindo.
--
-- ATENÇÃO ao escrever `x = ANY ((SELECT fn_que_devolve_array()))`: com os
-- parênteses duplos o Postgres lê `(SELECT ...)` como SUBCONSULTA, não como
-- array, e compara uuid com uuid[] («operator does not exist: uuid = uuid[]»).
-- O cast `::uuid[]` força a forma de array (InitPlan). A primeira aplicação
-- desta migration, em 09/11 às 17:24, caiu exatamente aí e voltou atrás inteira.
--
-- A migration refaz as duas provas ANTES de trocar as policies (o
-- AccessExclusiveLock do ALTER POLICY só existe nos últimos milissegundos) e
-- volta tudo atrás se qualquer conjunto divergir.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '180s';

-- ── 1. Os conjuntos ─────────────────────────────────────────────────────────

-- Quem é clone de alguma equipe do setor (`fn_operador_clonado_no_setor` ao contrário).
CREATE OR REPLACE FUNCTION public.fn_operadores_clonados_no_setor(p_setor_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(array_agg(DISTINCT c.operador_id), '{}'::uuid[])
    FROM public.equipe_operadores_clones c
    JOIN public.equipes e ON e.id = c.equipe_id
   WHERE p_setor_id IS NOT NULL
     AND e.setor_id = p_setor_id
     AND c.operador_id IS NOT NULL;
$function$;

-- Quem tem o setor no cadastro (`fn_operador_setor_id(x) = setor` ao contrário).
CREATE OR REPLACE FUNCTION public.fn_operadores_do_setor_cadastro(p_setor_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(array_agg(p.id), '{}'::uuid[])
    FROM public.perfis p
   WHERE p_setor_id IS NOT NULL
     AND p.setor_id = p_setor_id;
$function$;

-- Quem tem o setor entre os seus (`setor IN fn_setores_do_operador(x)` ao contrário):
-- o cadastro, ou clone/líder de uma equipe do setor.
CREATE OR REPLACE FUNCTION public.fn_pessoas_no_alcance_do_setor(p_setor_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(array_agg(t.pessoa), '{}'::uuid[])
    FROM (
      SELECT p.id AS pessoa
        FROM public.perfis p
       WHERE p_setor_id IS NOT NULL AND p.setor_id = p_setor_id
      UNION
      SELECT m.pessoa_id
        FROM public.equipe_membros m
        JOIN public.equipes e ON e.id = m.equipe_id
       WHERE p_setor_id IS NOT NULL
         AND e.setor_id = p_setor_id
         AND m.papel IN ('clone', 'lider')
    ) t
   WHERE t.pessoa IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.fn_operadores_clonados_no_setor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_operadores_do_setor_cadastro(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pessoas_no_alcance_do_setor(uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_operadores_clonados_no_setor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_operadores_do_setor_cadastro(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_pessoas_no_alcance_do_setor(uuid)  TO authenticated, service_role;

-- ── 2. As provas, antes de trocar as policies ───────────────────────────────

-- 2a. Acordos: o trecho do escopo de setor só depende do setor de quem lê.
DO $prova_acordos$
DECLARE
  s       RECORD;
  v_velho TEXT;
  v_novo  TEXT;
BEGIN
  FOR s IN SELECT DISTINCT p.setor_id FROM public.perfis p WHERE p.ativo LOOP
    SELECT md5(COALESCE(string_agg(a.id::text, ',' ORDER BY a.id), '')) INTO v_velho
      FROM public.acordos a
     WHERE a.setor_id = s.setor_id
        OR (a.setor_id IS NULL AND public.fn_operador_setor_id(a.operador_id) = s.setor_id)
        OR public.fn_operador_clonado_no_setor(a.operador_id, s.setor_id);
    SELECT md5(COALESCE(string_agg(a.id::text, ',' ORDER BY a.id), '')) INTO v_novo
      FROM public.acordos a
     WHERE a.setor_id = s.setor_id
        OR (a.setor_id IS NULL AND a.operador_id = ANY (public.fn_operadores_do_setor_cadastro(s.setor_id)))
        OR a.operador_id = ANY (public.fn_operadores_clonados_no_setor(s.setor_id));
    IF v_velho IS DISTINCT FROM v_novo THEN
      RAISE EXCEPTION 'acordos: o setor % enxerga outro conjunto com a policy nova.', COALESCE(s.setor_id::text, 'NULL');
    END IF;
  END LOOP;
END
$prova_acordos$;

-- 2b. Ajustes: pessoa por pessoa (as permissões dependem de quem é).
DO $prova_ajustes$
DECLARE
  p       RECORD;
  v_velho TEXT;
  v_novo  TEXT;
  v_uid   uuid;
  v_adm   boolean;
  v_lan   boolean;
  v_set   uuid;
BEGIN
  FOR p IN SELECT pf.id FROM public.perfis pf WHERE pf.ativo LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
    SELECT md5(COALESCE(string_agg(a.id::text, ',' ORDER BY a.id), '')) INTO v_velho
      FROM public.analitico_ajustes_manuais a
     WHERE public.fn_ajuste_alvo_no_meu_alcance(a.alvo, a.operador_id, a.equipe_id, a.setor_id);
    v_uid := auth.uid();
    v_adm := public.fn_user_tem('ajuste_recebimento_administrar');
    v_lan := public.fn_user_tem('ajuste_recebimento_lancar');
    v_set := public.fn_user_setor_id();
    SELECT md5(COALESCE(string_agg(a.id::text, ',' ORDER BY a.id), '')) INTO v_novo
      FROM public.analitico_ajustes_manuais a
     WHERE v_adm
        OR (COALESCE(a.alvo, 'operador') = 'operador' AND a.operador_id = v_uid)
        OR (v_lan AND (
              (COALESCE(a.alvo, 'operador') = 'operador'
                 AND a.operador_id = ANY (public.fn_pessoas_no_alcance_do_setor(v_set)))
           OR (COALESCE(a.alvo, 'operador') <> 'operador' AND (
                  (a.setor_id IS NOT NULL AND a.setor_id = v_set)
               OR (a.equipe_id IS NOT NULL AND a.equipe_id = ANY (public.fn_user_equipes()))))));
    IF v_velho IS DISTINCT FROM v_novo THEN
      RAISE EXCEPTION 'ajustes: a pessoa % enxerga outro conjunto com a policy nova.', p.id;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
END
$prova_ajustes$;

-- ── 3. As policies ──────────────────────────────────────────────────────────

ALTER POLICY acordos_select ON public.acordos
  USING (
    (
      (SELECT public.fn_user_is_super_admin())
      OR (SELECT public.fn_user_acesso_multiempresa())
      OR empresa_id = (SELECT public.fn_user_empresa_id())
    )
    AND (
      operador_id = (SELECT auth.uid())
      OR (SELECT public.fn_user_is_super_admin())
      -- O escopo UMA vez: `CASE x WHEN` avalia x uma vez só; três comparações
      -- separadas viravam três InitPlans (~10 ms cada). O escopo é sempre
      -- 0..3 (MAX de pesos 0..3, com COALESCE 0), então `>= 3` é `3` e
      -- `>= 2` sem ser 3 é `2`.
      OR CASE (SELECT public.fn_user_escopo_acordos())
           WHEN 3 THEN TRUE
           WHEN 2 THEN (
             setor_id = (SELECT public.fn_user_setor_id())
             OR (setor_id IS NULL
                 AND operador_id = ANY ((SELECT public.fn_operadores_do_setor_cadastro((SELECT public.fn_user_setor_id())))::uuid[]))
             OR operador_id = ANY ((SELECT public.fn_operadores_clonados_no_setor((SELECT public.fn_user_setor_id())))::uuid[])
           )
           WHEN 1 THEN public.fn_operador_no_meu_alcance_de_equipe(operador_id)
           ELSE FALSE
         END
    )
  );

ALTER POLICY ajustes_select ON public.analitico_ajustes_manuais
  USING (
    (
      empresa_id = ANY ((SELECT public.fn_empresas_acessiveis())::uuid[])
      OR (SELECT public.fn_user_is_super_admin())
    )
    AND (
      (SELECT public.fn_user_tem('ajuste_recebimento_administrar'))
      OR (COALESCE(alvo, 'operador') = 'operador' AND operador_id = (SELECT auth.uid()))
      OR (
        (SELECT public.fn_user_tem('ajuste_recebimento_lancar'))
        AND (
          (COALESCE(alvo, 'operador') = 'operador'
             AND operador_id = ANY ((SELECT public.fn_pessoas_no_alcance_do_setor((SELECT public.fn_user_setor_id())))::uuid[]))
          OR (COALESCE(alvo, 'operador') <> 'operador' AND (
                (setor_id IS NOT NULL AND setor_id = (SELECT public.fn_user_setor_id()))
             OR (equipe_id IS NOT NULL AND equipe_id = ANY ((SELECT public.fn_user_equipes())::uuid[]))))
        )
      )
    )
  );

-- ── 4. Prova do que ficou no banco ──────────────────────────────────────────

DO $prova_final$
DECLARE v_q TEXT;
BEGIN
  SELECT qual INTO v_q FROM pg_policies WHERE schemaname = 'public' AND tablename = 'acordos' AND policyname = 'acordos_select';
  IF v_q IS NULL OR position('fn_operador_clonado_no_setor' IN v_q) > 0 OR position('fn_operador_setor_id' IN v_q) > 0 THEN
    RAISE EXCEPTION 'acordos_select ainda chama função por linha no escopo de setor.';
  END IF;
  IF (SELECT roles FROM pg_policies WHERE schemaname = 'public' AND tablename = 'acordos' AND policyname = 'acordos_select') <> '{authenticated}' THEN
    RAISE EXCEPTION 'acordos_select deixou de ser TO authenticated.';
  END IF;
  SELECT qual INTO v_q FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analitico_ajustes_manuais' AND policyname = 'ajustes_select';
  IF v_q IS NULL OR position('fn_ajuste_alvo_no_meu_alcance' IN v_q) > 0 THEN
    RAISE EXCEPTION 'ajustes_select ainda chama fn_ajuste_alvo_no_meu_alcance por linha.';
  END IF;
END
$prova_final$;

COMMIT;
