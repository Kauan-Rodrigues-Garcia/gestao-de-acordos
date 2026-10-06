-- ============================================================================
-- Segurança: as funções do Painel Diretoria exigem a chave do painel
-- ============================================================================
--
-- Auditoria de segurança de 06/10/2026, item G (lido no banco).
--
-- As oito funções de leitura do Painel Diretoria checavam só
--
--     IF NOT (fn_user_is_super_admin() OR fn_can_access_empresa(p_empresa_id))
--
-- ou seja, «é da empresa». Qualquer conta da empresa — um operador — lia pela
-- API o painel inteiro: recebido por cidade, setor, equipe e operador. A tela
-- exige `ver_painel_diretoria`; o banco não. `fn_diretoria_cofen` e
-- `fn_diretoria_setores_do_mes` já exigiam a chave — as outras passam a exigir:
--
--     IF NOT (fn_user_is_super_admin()
--             OR (fn_can_access_empresa(p_empresa_id) AND fn_user_tem('ver_painel_diretoria')))
--
-- Só a trava muda: o corpo é o de produção (pg_get_functiondef), com a troca
-- feita aqui e conferida função a função. Nenhuma delas é chamada por outra
-- função nem pelo robô do 59 (conferido em 06/10/2026); quem chama é o Painel
-- Diretoria e o Painel Diretoria do Comercial, ambos atrás da mesma chave.
--
-- E `fn_mestre_diretoria_linhas`, que não tinha trava NENHUMA: só é chamada de
-- dentro das outras (SECURITY DEFINER, roda como o dono), e o app nunca a
-- chama. Sai o EXECUTE de PUBLIC, anon e authenticated.
--
-- Reaplicável: função que já exige a chave é pulada.
--
-- APLICADA em 06/10/2026 pelo SQL Editor (Cleber), conferida pelo MCP e
-- registrada em schema_migrations à mão.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

DO $g$
DECLARE
  v_funcoes CONSTANT TEXT[] := ARRAY[
    'public.fn_mestre_diretoria_alternativos(uuid,text,integer)',
    'public.fn_mestre_diretoria_cidades(uuid,text,integer)',
    'public.fn_mestre_diretoria_dia(uuid,text,integer,text,integer)',
    'public.fn_mestre_diretoria_equipe_operadores(uuid,text,uuid,text,text,integer)',
    'public.fn_mestre_diretoria_equipes_dos_setores(uuid,text,integer)',
    'public.fn_mestre_diretoria_setor(uuid,text,uuid,text,integer)',
    'public.fn_mestre_diretoria_setores(uuid,text,integer)',
    'public.fn_mestre_diretoria_visao_geral(uuid,text,integer)'
  ];
  v_assinatura TEXT;
  v_def        TEXT;
  v_nova       TEXT;
BEGIN
  FOREACH v_assinatura IN ARRAY v_funcoes LOOP
    v_def := pg_get_functiondef(v_assinatura::regprocedure);
    IF v_def ~* 'ver_painel_diretoria' THEN
      CONTINUE;
    END IF;
    v_nova := regexp_replace(
      v_def,
      'fn_user_is_super_admin\(\)\s+or\s+fn_can_access_empresa\(p_empresa_id\)',
      'fn_user_is_super_admin() OR (fn_can_access_empresa(p_empresa_id) AND fn_user_tem(''ver_painel_diretoria''))',
      'i'
    );
    IF v_nova = v_def THEN
      RAISE EXCEPTION 'A trava de % não tem a forma esperada; nada foi trocado.', v_assinatura;
    END IF;
    EXECUTE v_nova;
  END LOOP;
END
$g$;

REVOKE EXECUTE ON FUNCTION public.fn_mestre_diretoria_linhas(uuid, text, integer) FROM PUBLIC, anon, authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
DECLARE
  v_sem INTEGER;
BEGIN
  SELECT count(*) INTO v_sem
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname LIKE 'fn\_mestre\_diretoria\_%'
     AND p.proname <> 'fn_mestre_diretoria_linhas'
     AND p.prosrc !~* 'ver_painel_diretoria';
  IF v_sem > 0 THEN
    RAISE EXCEPTION '% função(ões) do Painel Diretoria seguem sem exigir a chave.', v_sem;
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_mestre_diretoria_linhas(uuid,text,integer)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_mestre_diretoria_linhas continua aberta para quem tem login.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_mestre_diretoria_cidades(uuid,text,integer)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'O painel perdeu o EXECUTE da Visão geral.';
  END IF;
END
$prova$;

COMMIT;
