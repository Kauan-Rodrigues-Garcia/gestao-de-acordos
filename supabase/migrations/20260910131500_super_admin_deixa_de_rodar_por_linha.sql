-- ─────────────────────────────────────────────────────────────────────────────
-- `fn_user_is_super_admin()` deixa de ser perguntada uma vez por linha
--
-- ── O sintoma ────────────────────────────────────────────────────────────────
-- 64 dos 70 `canceling statement due to statement timeout` de um dia caíram na
-- mesma consulta: a listagem de acordos, pela view `acordos_deduplicados`.
--
-- ── O que a EXPLAIN mostrou ──────────────────────────────────────────────────
-- A tabela `acordos` tem 9.769 linhas e 11 MB — nada que justifique estourar o
-- tempo. Mas o filtro de RLS aparecia assim:
--
--     Filter: (fn_user_is_super_admin() OR ((InitPlan 13).col1 OR ...))
--     Rows Removed by Filter: 9595
--     Buffers: shared hit=46776
--
-- 46 mil buffers para varrer 9,7 mil linhas: quase cinco páginas lidas POR
-- LINHA. O motivo está na primeira metade do OR. As policies `*_select` já
-- foram escritas com `(SELECT fn(...))` — a forma que o Postgres promove a
-- InitPlan e resolve UMA vez. Já as `*_super_admin_total` ficaram com a chamada
-- crua, e chamada crua de função STABLE dentro de policy é reavaliada a cada
-- linha varrida.
--
-- Como as duas policies são permissivas, o planejador as junta num OR e a
-- chamada crua vem primeiro — então ela roda 9.769 vezes por consulta, e a
-- consulta ainda roda duas vezes (o PostgREST pede `count=exact`, que refaz o
-- `DISTINCT ON` inteiro só para contar).
--
-- ── A correção ───────────────────────────────────────────────────────────────
-- Envolver a chamada num subselect escalar: `(SELECT fn_user_is_super_admin())`.
-- Mesma resposta, mesma semântica — a função é STABLE e não lê coluna nenhuma
-- da linha, então o valor não pode mudar no meio da varredura. O que muda é
-- quando ela é executada: uma vez por consulta, não uma vez por linha. É a
-- própria recomendação do advisor `auth_rls_initplan`.
--
-- Medido em produção, mesma consulta e mesmo usuário:
--     buffers no scan de acordos   46.776 → 17.478   (−63%)
--     tempo do nó da view           253,6 ms → 101,7 ms (−60%)
--
-- ── Por que o laço tem retentativa ───────────────────────────────────────────
-- `ALTER POLICY` pega AccessExclusiveLock na tabela. A primeira tentativa desta
-- migration levou as 59 numa transação só e morreu em `deadlock detected`
-- contra o tráfego de produção — a transação inteira voltou atrás, o que é o
-- comportamento certo, mas não aplica nada.
--
-- Daí a forma abaixo: `lock_timeout` curto e até 12 tentativas por policy, com
-- um segundo de espera entre elas. Assim a migration espera a janela em vez de
-- enfileirar consulta de usuário atrás de um lock longo — e as tabelas quentes
-- (`acordos`, `perfis`) entram quando dá, sem derrubar o resto do lote.
--
-- É idempotente: quem já está na forma `(SELECT ...)` não casa com o filtro e
-- fica de fora.
--
-- ── Escopo ───────────────────────────────────────────────────────────────────
-- Só as 59 policies cujo corpo é EXATAMENTE `fn_user_is_super_admin()` em
-- USING e em WITH CHECK — o padrão `<tabela>_super_admin_total`. As outras 8
-- que citam a função no meio de expressão maior (`ai_config_select_auth`,
-- `chat_config_update`, `desafios_setores_escreve`, `menu_lateral_ordem_*`,
-- `notificacoes_own`, `perfis_empresas_acesso_select`) ficaram de fora de
-- propósito: reescrever expressão composta não é troca mecânica e merece
-- passagem própria.
--
-- ── Como voltar atrás ────────────────────────────────────────────────────────
--     ALTER POLICY <nome> ON public.<tabela>
--       USING (fn_user_is_super_admin()) WITH CHECK (fn_user_is_super_admin());
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r         record;
  tentativa integer;
  ok        boolean;
  feitas    text[] := '{}';
  falhou    text[] := '{}';
BEGIN
  FOR r IN
    SELECT pol.schemaname, pol.tablename, pol.policyname
      FROM pg_policies pol
     WHERE pol.schemaname = 'public'
       AND pol.qual       = 'fn_user_is_super_admin()'
       AND pol.with_check = 'fn_user_is_super_admin()'
     ORDER BY pol.tablename, pol.policyname
  LOOP
    ok := false;

    FOR tentativa IN 1..12 LOOP
      BEGIN
        SET LOCAL lock_timeout = '2s';
        EXECUTE format(
          'ALTER POLICY %I ON %I.%I USING ((SELECT public.fn_user_is_super_admin())) WITH CHECK ((SELECT public.fn_user_is_super_admin()))',
          r.policyname, r.schemaname, r.tablename
        );
        ok := true;
        EXIT;
      EXCEPTION WHEN lock_not_available THEN
        PERFORM pg_sleep(1);
      END;
    END LOOP;

    IF ok THEN feitas := feitas || r.tablename;
          ELSE falhou := falhou || r.tablename;
    END IF;
  END LOOP;

  RAISE NOTICE 'promovidas: % | sem janela de lock: %',
    array_to_string(feitas, ','), array_to_string(falhou, ',');
END
$$;
