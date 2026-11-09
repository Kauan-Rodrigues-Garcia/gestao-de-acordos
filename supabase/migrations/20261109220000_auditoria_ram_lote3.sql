-- ============================================================================
-- Auditoria de RAM na Medium, lote 3 (09/11/2026)
-- ============================================================================
--
-- Pedido do Cleber (09/11/2026): «cache para as leituras pequenas de perfis,
-- autorizacoes_pedidos mais leve, o mês do analítico já somado no banco».
-- Medindo as leituras de perfis apareceu o alvo maior, que está nas três:
--
--   1. `fn_empresas_acessiveis()` e `fn_minhas_empresas()` chamavam
--      `fn_can_access_empresa(e.id)` para CADA uma das 5 empresas, e cada
--      chamada refazia `fn_user_tem('acesso_multiempresa_permitido')` (que
--      percorre o catálogo de permissões). `fn_empresas_acessiveis` está em 124
--      policies de 71 tabelas: ~5 ms em quase toda leitura do app só para
--      descobrir a mesma lista. Agora as perguntas sobre a pessoa são feitas
--      UMA vez. Mesma regra de `fn_can_access_empresa`, aberta: super admin, a
--      própria empresa, ou a concessão nominal com a permissão de cargo.
--      Equivalência em produção (09/11, só leitura), as 502 pessoas ativas:
--      0 diferenças nas duas; 4,8 s → 0,6 s somando todas.
--      `fn_can_access_empresa` não muda (continua sendo a pergunta de UMA empresa).
--
--   2. `autorizacoes_select` chamava `fn_pode_autorizar_pedido(empresa_id,
--      setores_escopo)` por linha, e ela `fn_can_access_empresa` — a tela lê
--      os 167 pedidos por data: 166 ms por leitura (293 ms na borda). Agora
--      cargo, setor e empresas acessíveis são InitPlans e a linha só compara.
--      Equivalência em produção (09/11, só leitura), um representante de cada
--      um dos 47 grupos (cargo × setor × empresas × super admin), sobre todos
--      os pedidos que não são da própria pessoa (esses são iguais nas duas):
--      0 diferenças. `fn_pode_autorizar_pedido` continua existindo (as RPCs de
--      decidir o pedido usam).
--
--   3. `fn_analitico_mes_agregado`: o mês do analítico JÁ SOMADO. O app só
--      soma valor e H.O. e conta pagamentos dessas linhas, agrupando por
--      operador, setor, dia e procedência — então o banco devolve um grupo por
--      (operador, setor, dia, procedência, setor de origem, espelho), com
--      `qtd` = quantas linhas. `importado_por_id` só vai quando a linha NÃO tem
--      `setor_id` (é só a reserva do setor; todo uso é `setor_id ?? ...`).
--      Outubro da BookPlay: 24.751 linhas (~8 MB de JSON) → 5.293 grupos.
--      `fn_analitico_mes_linhas` fica: é a reserva das abas abertas antes do
--      deploy, e do app se esta não existir.
--
-- Provas no fim de cada parte: as duas funções e a policy são comparadas com a
-- versão de antes ANTES da troca, e o mês agregado é conferido contra a tabela
-- (soma, H.O. e contagem por setor e dia). Qualquer divergência volta tudo.
--
-- Cuidado lembrado de 20261109210000: `x = ANY ((SELECT fn()))` sem `::uuid[]`
-- vira subconsulta. Toda ocorrência aqui tem o cast.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '180s';

-- ── 1. As empresas que a pessoa alcança, perguntando uma vez ────────────────

-- O que as duas devolvem hoje, por pessoa ativa, para comparar depois da troca.
CREATE TEMP TABLE _empresas_antes ON COMMIT DROP AS
SELECT NULL::uuid AS pessoa, NULL::uuid[] AS acessiveis, NULL::uuid[] AS minhas WITH NO DATA;

DO $antes$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT pf.id FROM public.perfis pf WHERE pf.ativo LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
    INSERT INTO _empresas_antes VALUES (
      p.id,
      ARRAY(SELECT x FROM unnest(public.fn_empresas_acessiveis()) x ORDER BY 1),
      ARRAY(SELECT x FROM public.fn_minhas_empresas() x ORDER BY 1));
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
END
$antes$;

CREATE OR REPLACE FUNCTION public.fn_empresas_acessiveis()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- A pergunta de acesso a UMA empresa, aberta para todas de uma vez, com as
  -- perguntas sobre a pessoa feitas uma vez só (antes: uma `fn_user_tem` por
  -- empresa). Ver 20261109220000.
  WITH eu AS MATERIALIZED (
    SELECT public.fn_user_is_super_admin()                       AS super,
           public.fn_user_empresa_id()                           AS minha,
           public.fn_user_tem('acesso_multiempresa_permitido')   AS multi
  )
  SELECT COALESCE(array_agg(e.id), '{}'::uuid[])
    FROM public.empresas e
   CROSS JOIN eu
   WHERE eu.super
      OR e.id = eu.minha
      OR (eu.multi AND EXISTS (
            SELECT 1 FROM public.perfis_empresas_acesso a
             WHERE a.perfil_id = auth.uid()
               AND a.empresa_id = e.id));
$function$;

CREATE OR REPLACE FUNCTION public.fn_minhas_empresas()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT unnest(public.fn_empresas_acessiveis());
$function$;

DO $prova_empresas$
DECLARE p RECORD; v_dif INT := 0; v_ex uuid;
BEGIN
  FOR p IN SELECT * FROM _empresas_antes LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p.pessoa, 'role', 'authenticated')::text, true);
    IF ARRAY(SELECT x FROM unnest(public.fn_empresas_acessiveis()) x ORDER BY 1) IS DISTINCT FROM p.acessiveis
       OR ARRAY(SELECT x FROM public.fn_minhas_empresas() x ORDER BY 1) IS DISTINCT FROM p.minhas THEN
      v_dif := v_dif + 1; v_ex := COALESCE(v_ex, p.pessoa);
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_dif > 0 THEN
    RAISE EXCEPTION 'empresas acessíveis: % pessoas mudaram (ex.: %).', v_dif, v_ex;
  END IF;
END
$prova_empresas$;

-- ── 2. Pedidos de autorização em conjunto ───────────────────────────────────

-- A prova primeiro: um representante por grupo de quem vê a mesma coisa.
DO $prova_autorizacoes$
DECLARE
  p       RECORD;
  grupos  JSONB := '{}';
  k       TEXT;
  rep     uuid;
  v_velho TEXT;
  v_novo  TEXT;
  v_sa    BOOLEAN;
  v_cargo TEXT;
  v_setor uuid;
  v_emp   uuid[];
BEGIN
  FOR p IN SELECT pf.id FROM public.perfis pf WHERE pf.ativo LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
    k := concat_ws('|', public.fn_user_perfil(), public.fn_user_setor_id(), public.fn_user_is_super_admin(),
                   array_to_string(ARRAY(SELECT x FROM unnest(public.fn_empresas_acessiveis()) x ORDER BY 1), ','));
    IF NOT grupos ? k THEN grupos := grupos || jsonb_build_object(k, p.id); END IF;
  END LOOP;

  FOR k, rep IN SELECT key, value #>> '{}' FROM jsonb_each(grupos) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', rep, 'role', 'authenticated')::text, true);
    SELECT md5(COALESCE(string_agg(a.id::text, ',' ORDER BY a.id), '')) INTO v_velho
      FROM public.autorizacoes_pedidos a
     WHERE a.solicitante_id IS DISTINCT FROM rep
       AND public.fn_pode_autorizar_pedido(a.empresa_id, a.setores_escopo);
    v_sa := public.fn_user_is_super_admin();
    v_cargo := public.fn_user_perfil();
    v_setor := public.fn_user_setor_id();
    v_emp := public.fn_empresas_acessiveis();
    SELECT md5(COALESCE(string_agg(a.id::text, ',' ORDER BY a.id), '')) INTO v_novo
      FROM public.autorizacoes_pedidos a
     WHERE a.solicitante_id IS DISTINCT FROM rep
       AND (v_sa
         OR (a.empresa_id = ANY (v_emp)
             AND (v_cargo IN ('diretoria', 'administrador', 'super_admin')
                  OR (v_cargo IN ('lider', 'elite', 'gerencia')
                      AND v_setor IS NOT NULL
                      AND v_setor = ANY (COALESCE(a.setores_escopo, '{}'::uuid[]))))));
    IF v_velho IS DISTINCT FROM v_novo THEN
      RAISE EXCEPTION 'autorizacoes: o grupo % enxerga outros pedidos com a policy nova.', k;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
END
$prova_autorizacoes$;

ALTER POLICY autorizacoes_select ON public.autorizacoes_pedidos
  USING (
    solicitante_id = (SELECT auth.uid())
    OR (SELECT public.fn_user_is_super_admin())
    OR (
      empresa_id = ANY ((SELECT public.fn_empresas_acessiveis())::uuid[])
      AND (
        (SELECT public.fn_user_perfil()) IN ('diretoria', 'administrador', 'super_admin')
        OR (
          (SELECT public.fn_user_perfil()) IN ('lider', 'elite', 'gerencia')
          AND (SELECT public.fn_user_setor_id()) IS NOT NULL
          AND (SELECT public.fn_user_setor_id()) = ANY (COALESCE(setores_escopo, '{}'::uuid[]))
        )
      )
    )
  );

-- ── 3. O mês do analítico já somado ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_analitico_mes_agregado(
  p_empresa_id uuid,
  p_inicio     date,
  p_fim        date,
  p_operadores uuid[] DEFAULT NULL::uuid[]
)
RETURNS json
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
  v_grupos json;
BEGIN
  -- Invocadora: a RLS de quem chama, como `fn_analitico_mes_linhas`.
  -- plpgsql com `SELECT ... INTO` (ver 20261109200000: em SQL, o resultado
  -- grande passava por um tuplestore de work_mem e espalhava em disco).
  SELECT COALESCE(json_agg(json_build_object(
           'operador_id',              g.operador_id,
           'setor_id',                 g.setor_id,
           'importado_por_id',         g.importado_por_id,
           'valor_recebido',           g.valor_recebido,
           'total_ho',                 g.total_ho,
           'data_pagamento',           g.data_pagamento,
           'procedencia',              g.procedencia,
           'contribuicao_de_setor_id', g.contribuicao_de_setor_id,
           'espelho_extra',            g.espelho_extra,
           'qtd',                      g.qtd
         ) ORDER BY g.data_pagamento, g.setor_id, g.operador_id, g.procedencia,
                    g.contribuicao_de_setor_id, g.espelho_extra, g.importado_por_id), '[]'::json)
    INTO v_grupos
    FROM (
      SELECT r.operador_id,
             r.setor_id,
             -- Só a reserva do setor: com `setor_id` ele não é lido.
             CASE WHEN r.setor_id IS NULL THEN r.importado_por_id END AS importado_por_id,
             r.data_pagamento,
             r.procedencia,
             r.contribuicao_de_setor_id,
             r.espelho_extra,
             SUM(r.valor_recebido) AS valor_recebido,
             SUM(r.total_ho)       AS total_ho,
             COUNT(*)::int         AS qtd
        FROM public.analitico_recebimentos r
       WHERE r.empresa_id = p_empresa_id
         AND r.data_pagamento >= p_inicio
         AND r.data_pagamento <= p_fim
         AND (p_operadores IS NULL OR r.operador_id = ANY (p_operadores))
       GROUP BY 1, 2, 3, 4, 5, 6, 7
    ) g;
  RETURN v_grupos;
END;
$function$;

COMMENT ON FUNCTION public.fn_analitico_mes_agregado(uuid, date, date, uuid[]) IS
  'O mês de analitico_recebimentos já somado por operador, setor, dia e procedência, '
  'com qtd = linhas do grupo. RLS de quem chama. Ver 20261109220000.';

REVOKE ALL ON FUNCTION public.fn_analitico_mes_agregado(uuid, date, date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_analitico_mes_agregado(uuid, date, date, uuid[]) TO authenticated, service_role;

DO $prova_mes$
DECLARE
  e        RECORD;
  v_tabela TEXT;
  v_funcao TEXT;
BEGIN
  -- Para cada empresa com mês corrente, soma/H.O./contagem por setor e dia:
  -- direto da tabela × somando os grupos da função.
  FOR e IN SELECT DISTINCT r.empresa_id FROM public.analitico_recebimentos r
            WHERE r.data_pagamento >= date_trunc('month', now() - INTERVAL '1 month')::date LOOP
    SELECT md5(COALESCE(string_agg(concat_ws('|', s, d, v, h, q), ',' ORDER BY s, d), '')) INTO v_tabela
      FROM (SELECT COALESCE(r.setor_id::text, '-') s, r.data_pagamento::text d,
                   SUM(r.valor_recebido)::text v, COALESCE(SUM(r.total_ho), 0)::text h, COUNT(*)::text q
              FROM public.analitico_recebimentos r
             WHERE r.empresa_id = e.empresa_id
               AND r.data_pagamento >= date_trunc('month', now() - INTERVAL '1 month')::date
               AND r.data_pagamento <= now()::date
             GROUP BY 1, 2) t;
    SELECT md5(COALESCE(string_agg(concat_ws('|', s, d, v, h, q), ',' ORDER BY s, d), '')) INTO v_funcao
      FROM (SELECT COALESCE(x->>'setor_id', '-') s, x->>'data_pagamento' d,
                   SUM((x->>'valor_recebido')::numeric)::text v, COALESCE(SUM((x->>'total_ho')::numeric), 0)::text h,
                   SUM((x->>'qtd')::int)::text q
              FROM json_array_elements(public.fn_analitico_mes_agregado(
                     e.empresa_id, date_trunc('month', now() - INTERVAL '1 month')::date, now()::date)) x
             GROUP BY 1, 2) t;
    IF v_tabela IS DISTINCT FROM v_funcao THEN
      RAISE EXCEPTION 'fn_analitico_mes_agregado: a empresa % não fecha com a tabela.', e.empresa_id;
    END IF;
  END LOOP;
END
$prova_mes$;

-- ── 4. Prova do que ficou ───────────────────────────────────────────────────

DO $prova_final$
DECLARE v_q TEXT;
BEGIN
  SELECT qual INTO v_q FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'autorizacoes_pedidos' AND policyname = 'autorizacoes_select';
  IF v_q IS NULL OR position('fn_pode_autorizar_pedido' IN v_q) > 0 THEN
    RAISE EXCEPTION 'autorizacoes_select ainda chama fn_pode_autorizar_pedido por linha.';
  END IF;
  IF position('fn_can_access_empresa' IN pg_get_functiondef('public.fn_empresas_acessiveis()'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'fn_empresas_acessiveis ainda pergunta empresa por empresa.';
  END IF;
  IF to_regprocedure('public.fn_analitico_mes_agregado(uuid, date, date, uuid[])') IS NULL THEN
    RAISE EXCEPTION 'Faltou fn_analitico_mes_agregado.';
  END IF;
END
$prova_final$;

COMMIT;
