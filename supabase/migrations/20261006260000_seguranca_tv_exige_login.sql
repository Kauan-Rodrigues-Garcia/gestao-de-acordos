-- ============================================================================
-- Segurança: a TV exige login e só mostra a própria empresa
-- ============================================================================
--
-- Auditoria de segurança de 06/10/2026. O palco da TV (`/tv/:slug`) rodava
-- sem sessão: `fn_tv_palco` devolvia nome, foto e recebido das pessoas do
-- setor para quem soubesse o endereço da tela, e `fn_tv_sinal_vida` marcava a
-- tela como viva para qualquer um. O modo TV ainda não está em uso (Cleber,
-- 06/10/2026: «pode fazer o que deixa mais seguro»).
--
--   • as duas saem do `anon` (e de PUBLIC): a tela da TV passa a exigir login
--     — a rota ganha `ProtectedRoute` no mesmo commit;
--   • com login, só a própria empresa: `fn_tv_palco` responde «não
--     encontrada» para tela de empresa que a pessoa não alcança, e
--     `fn_tv_sinal_vida` só marca tela dessas empresas.
--
-- O corpo das duas é o de produção (pg_get_functiondef); só entra a trava,
-- com prova de que entrou. A mídia da TV (balde `tv`) continua pública: é o
-- que o administrador sobe para passar na tela.
--
-- Reaplicável: função que já tem a trava é pulada.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

DO $tv$
DECLARE
  v_def  TEXT;
  v_nova TEXT;
BEGIN
  -- fn_tv_palco: depois de achar a tela, confere a empresa.
  v_def := pg_get_functiondef('public.fn_tv_palco(text,uuid)'::regprocedure);
  IF v_def !~ 'fn_can_access_empresa' THEN
    v_nova := regexp_replace(
      v_def,
      '(IF\s+v_tela\.id\s+IS\s+NULL\s+THEN\s+RETURN\s+jsonb_build_object\(''encontrada'',\s*FALSE\);\s+END\s+IF;)',
      E'\\1\n  -- Só a empresa de quem olha (20261006260000).\n'
      || E'  IF NOT (public.fn_user_is_super_admin() OR public.fn_can_access_empresa(v_tela.empresa_id)) THEN\n'
      || E'    RETURN jsonb_build_object(''encontrada'', FALSE);\n'
      || E'  END IF;',
      'i'
    );
    IF v_nova = v_def THEN
      RAISE EXCEPTION 'fn_tv_palco não tem a forma esperada; nada foi trocado.';
    END IF;
    EXECUTE v_nova;
  END IF;

  -- fn_tv_sinal_vida: só marca tela de empresa que a pessoa alcança.
  v_def := pg_get_functiondef('public.fn_tv_sinal_vida(text)'::regprocedure);
  IF v_def !~ 'fn_can_access_empresa' THEN
    v_nova := regexp_replace(
      v_def,
      '\mAND\s+ativa\s+AND',
      'AND ativa AND (public.fn_user_is_super_admin() OR public.fn_can_access_empresa(empresa_id)) AND',
      'i'
    );
    IF v_nova = v_def THEN
      RAISE EXCEPTION 'fn_tv_sinal_vida não tem a forma esperada; nada foi trocado.';
    END IF;
    EXECUTE v_nova;
  END IF;
END
$tv$;

REVOKE EXECUTE ON FUNCTION public.fn_tv_palco(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_tv_sinal_vida(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_tv_palco(text, uuid) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_tv_sinal_vida(text) TO authenticated, service_role;

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF has_function_privilege('anon', 'public.fn_tv_palco(text,uuid)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_tv_sinal_vida(text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'A TV continua aberta sem login.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_tv_palco(text,uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'Quem tem login perdeu o palco.';
  END IF;
  IF pg_get_functiondef('public.fn_tv_palco(text,uuid)'::regprocedure) !~ 'fn_can_access_empresa\(v_tela\.empresa_id\)'
     OR pg_get_functiondef('public.fn_tv_sinal_vida(text)'::regprocedure) !~ 'fn_can_access_empresa\(empresa_id\)' THEN
    RAISE EXCEPTION 'A trava de empresa não entrou nas funções da TV.';
  END IF;
END
$prova$;

COMMIT;
