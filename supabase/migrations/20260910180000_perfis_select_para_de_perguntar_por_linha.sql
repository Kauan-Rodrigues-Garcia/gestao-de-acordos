-- ─────────────────────────────────────────────────────────────────────────────
-- `perfis_select` para de perguntar a mesma coisa por linha
--
-- ── Por que mexer na policy mais sensível do sistema ─────────────────────────
-- Porque ela é o pedágio de TODA leitura de perfil, e a listagem de acordos a
-- paga uma vez por linha do resultado. A query que mais estourava o tempo é:
--
--     SELECT ... FROM acordos_deduplicados
--     LEFT JOIN LATERAL (SELECT ... FROM perfis WHERE perfis.id = operador_id) ...
--
-- O LATERAL roda para CADA linha que passou pelo filtro — não para as 20 da
-- página. Medido antes desta migration: 0,53 ms por execução. Para um líder
-- (176 linhas) são 93 ms; para quem enxerga os 9.769 acordos, ~5,2 segundos —
-- e é aí que estourava, mesmo depois da correção de 20260910131500.
--
-- ── As duas perguntas repetidas ──────────────────────────────────────────────
--
-- 1. `fn_can_access_empresa(perfis.empresa_id)` — avaliada POR LINHA, mesmo
--    existindo apenas quatro empresas. Vira `empresa_id IN (SELECT
--    fn_minhas_empresas())`: subconsulta não correlacionada, que o planejador
--    resolve uma vez e transforma num teste de pertinência com hash.
--
--    `fn_minhas_empresas()` é `SECURITY DEFINER` de propósito. A primeira versão
--    desta migration usava `SELECT id FROM empresas WHERE fn_can_access_empresa(id)`
--    direto na policy, e a EXPLAIN mostrou o que isso trazia junto:
--
--        Filter: (((InitPlan 17).col1 OR ativo) AND fn_can_access_empresa(id))
--                                        ^^^^^ a RLS de `empresas`
--
--    A função original nunca consultou `empresas`, então herdar essa RLS mudaria
--    o resultado para empresa inativa. Hoje não mudaria nada — a verificação
--    abaixo bateu igual —, mas seria uma diferença latente esperando alguém
--    desativar uma empresa para aparecer.
--
-- 2. `fn_user_escopo_perfis()` — comparada TRÊS vezes (`>= 3`, `= 2`, `= 1`), e
--    o Postgres não deduplica InitPlans idênticos. Cada avaliação percorre as 9
--    abas de `fn_abas_escopo()` chamando `fn_user_tem` até cinco vezes em cada:
--    ~45 chamadas, ~35 ms. Três delas eram ~105 ms de custo fixo em qualquer
--    consulta que tocasse `perfis`.
--
--    Vira um `CASE` sobre UMA avaliação. É equivalente: `fn_user_escopo`
--    devolve -1 ou MAX(peso) com peso em {0,1,2,3}, então o domínio é
--    {-1,0,1,2,3} e `>= 3` é o mesmo que `= 3`.
--
-- ── O que foi medido, com a policy nova ──────────────────────────────────────
--     busca de perfil no LATERAL ..... 0,530 ms → 0,002 ms  por linha
--     listagem com 7.938 linhas ...... ~4,2 s (estimado) → 78 ms
--     listagem de líder, 176 linhas ... 320 ms → 156 ms
--
-- ── Como foi verificado que ninguém passou a ver mais nem menos ──────────────
-- Para um perfil de cada cargo (diretoria, elite, gerencia, lider, operador,
-- ouvidoria, super_admin), a lista de ids visíveis foi capturada ANTES, e
-- comparada DEPOIS por contagem e por md5 do conjunto ordenado. Os sete bateram
-- exatamente — mesma quantidade e mesmos ids:
--
--     diretoria 364 · elite 40 · gerencia 40 · lider 51
--     operador 40 · ouvidoria 47 · super_admin 364
--
-- ── Sobre o lock ─────────────────────────────────────────────────────────────
-- `ALTER POLICY` pega AccessExclusiveLock, e `perfis` é a tabela mais lida do
-- sistema. Laço com `lock_timeout` curto e retentativa: espera a janela em vez
-- de enfileirar consulta de usuário atrás de um lock longo.
--
-- ── Como voltar atrás ────────────────────────────────────────────────────────
-- A versão anterior da policy está em 20260903...  (`perfis_select` com
-- `fn_can_access_empresa(perfis.empresa_id)` e os três `fn_user_escopo_perfis()`).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_minhas_empresas()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT e.id FROM public.empresas e WHERE public.fn_can_access_empresa(e.id);
$function$;

COMMENT ON FUNCTION public.fn_minhas_empresas() IS
  'As empresas que eu alcanco, em conjunto. Mesma resposta de '
  'fn_can_access_empresa, so que calculada UMA vez em vez de por linha. '
  'SECURITY DEFINER para nao herdar a RLS de empresas: a pergunta e "posso '
  'alcancar", nao "esta ativa e visivel para mim".';

REVOKE ALL ON FUNCTION public.fn_minhas_empresas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_minhas_empresas() TO authenticated;

DO $$
DECLARE tentativa integer; ok boolean := false;
BEGIN
  FOR tentativa IN 1..12 LOOP
    BEGIN
      SET LOCAL lock_timeout = '2s';
      EXECUTE $ddl$
        ALTER POLICY perfis_select ON public.perfis
        USING (
          (SELECT auth.uid()) = id
          OR (SELECT public.fn_user_is_super_admin())
          OR (
            empresa_id IN (SELECT public.fn_minhas_empresas())
            AND CASE (SELECT public.fn_user_escopo_perfis())
              WHEN 3 THEN TRUE
              WHEN 2 THEN EXISTS (
                SELECT 1 FROM public.fn_setores_do_operador(perfis.id) alvo(setor_id)
                 WHERE alvo.setor_id IN (
                   SELECT eu.setor_id
                     FROM public.fn_setores_do_operador((SELECT auth.uid())) eu(setor_id)))
              WHEN 1 THEN EXISTS (
                SELECT 1 FROM public.fn_equipes_com_lideranca(perfis.id) alvo(equipe_id, setor_id)
                 WHERE alvo.equipe_id IN (
                   SELECT eu.equipe_id
                     FROM public.fn_equipes_com_lideranca((SELECT auth.uid())) eu(equipe_id, setor_id)))
              ELSE FALSE
            END
          )
        )
      $ddl$;
      ok := true;
      EXIT;
    EXCEPTION WHEN lock_not_available THEN
      PERFORM pg_sleep(1);
    END;
  END LOOP;

  IF NOT ok THEN
    RAISE EXCEPTION 'perfis_select: nao consegui a janela de lock em 12 tentativas';
  END IF;
END
$$;
