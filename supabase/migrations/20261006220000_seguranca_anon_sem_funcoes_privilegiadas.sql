-- ============================================================================
-- Segurança: visitante sem login não chama função privilegiada
-- ============================================================================
--
-- Auditoria de segurança de 06/10/2026, item E. O `get_advisors` apontou 221
-- funções SECURITY DEFINER do schema public executáveis pelo papel `anon`
-- (quem chama a API só com a chave pública, sem login). A maioria recusa por
-- dentro, mas não todas: `fn_mestre_emprestimo_do_setor` devolvia o recebido
-- por setor de qualquer empresa sem login nenhum.
--
-- A regra passa a ser: `anon` só executa o que a tela sem login usa, mais os
-- ajudantes que as policies para `anon`/`public` chamam (sem eles, ler a tela
-- de login daria «permission denied for function»):
--
--   login   buscar_email_por_usuario, buscar_email_por_usuario_empresa,
--           fn_log_login_recusado
--   TV      fn_tv_palco, fn_tv_sinal_vida (TvPalco, sem login)
--   policy  toda função citada em policy cujo papel inclui anon ou public
--           (hoje: fn_empresas_acessiveis, fn_user_escopo, fn_user_has_any_role,
--           fn_user_is_super_admin, fn_user_tem — para anon respondem «não»)
--
-- As outras perdem o EXECUTE de PUBLIC e de anon. Quem tinha EXECUTE como
-- `authenticated` continua tendo (GRANT explícito, porque parte vinha só de
-- PUBLIC); a service_role também. Função de extensão fica de fora.
--
-- E daqui para a frente: função nova criada pelo postgres no schema public não
-- nasce mais executável por PUBLIC nem por anon (ALTER DEFAULT PRIVILEGES).
-- Quem precisar abrir uma para o anon faz GRANT explícito, na migration dela.
--
-- Prévia lida no banco antes de escrever (06/10/2026): 211 saem, 10 ficam.
-- Só privilégios. Reaplicável.
--
-- APLICADA em 06/10/2026 pelo SQL Editor (Cleber), conferida pelo MCP: 10
-- funções SECURITY DEFINER seguem para anon (as listadas acima),
-- fn_mestre_emprestimo_do_setor fechou, painel e calendário seguem para
-- authenticated. Registrada em schema_migrations à mão (20261006220000).
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

DO $e$
DECLARE
  v_fica CONSTANT TEXT[] := ARRAY[
    'buscar_email_por_usuario', 'buscar_email_por_usuario_empresa', 'fn_log_login_recusado',
    'fn_tv_palco', 'fn_tv_sinal_vida'
  ];
  r        RECORD;
  v_saiu   INTEGER := 0;
  v_ficou  INTEGER := 0;
BEGIN
  FOR r IN
    WITH alvo AS (
      SELECT p.oid, p.proname, p.oid::regprocedure AS assinatura,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS logado_tinha
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosecdef
         AND has_function_privilege('anon', p.oid, 'EXECUTE')
         AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    ),
    pol AS (
      SELECT coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
        FROM pg_policies
       WHERE roles && ARRAY['public', 'anon']::name[]
    )
    SELECT a.*,
           (a.proname = ANY (v_fica)
            OR EXISTS (SELECT 1 FROM pol WHERE pol.expr ~ ('\m' || a.proname || '\('))) AS fica
      FROM alvo a
  LOOP
    IF r.fica THEN
      v_ficou := v_ficou + 1;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.assinatura);
    IF r.logado_tinha THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.assinatura);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.assinatura);
    v_saiu := v_saiu + 1;
  END LOOP;
  RAISE NOTICE 'anon sem EXECUTE: % funções; mantidas: %', v_saiu, v_ficou;
END
$e$;

-- Função nova não nasce aberta para quem não fez login.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
DECLARE
  v_resto INTEGER;
BEGIN
  IF has_function_privilege('anon', 'public.fn_mestre_emprestimo_do_setor(uuid,text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon continua executando fn_mestre_emprestimo_do_setor.';
  END IF;
  IF NOT has_function_privilege('anon', 'public.buscar_email_por_usuario_empresa(text,text)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.fn_tv_palco(text,uuid)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.fn_user_tem(text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'O login, a TV ou as policies perderam uma função que precisam.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_mestre_diretoria_cidades(uuid,text,integer)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'Quem tem login perdeu acesso às funções do painel.';
  END IF;
  SELECT count(*) INTO v_resto
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
  IF v_resto > 15 THEN
    RAISE EXCEPTION 'Sobraram % funções SECURITY DEFINER para anon.', v_resto;
  END IF;
END
$prova$;

COMMIT;
