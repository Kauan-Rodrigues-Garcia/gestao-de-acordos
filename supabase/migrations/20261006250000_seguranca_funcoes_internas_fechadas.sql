-- ============================================================================
-- Segurança: funções internas sem trava saem da API
-- ============================================================================
--
-- Auditoria de segurança de 06/10/2026, item H. Depois de E (anon) e G
-- (Painel Diretoria), sobravam funções SECURITY DEFINER que qualquer pessoa
-- LOGADA chamava direto pela API e que não checam nada — porque nunca foram
-- feitas para isso: são ajudantes de outras funções. Duas entregavam dinheiro
-- de qualquer empresa:
--
--   fn_mestre_emprestimo_do_setor   recebido por setor do 59, qualquer empresa
--   fn_tv_metricas_setor            meta/recebido do setor, qualquer empresa
--
-- e as demais devolvem cargo, setor, login ou configuração de qualquer pessoa
-- ou empresa.
--
-- Conferido no banco em 06/10/2026, para cada uma das doze:
--   • o app não chama (nem src/, nem api/, nem a Edge Function);
--   • nenhuma policy e nenhuma view a usa;
--   • quem a chama é SECURITY DEFINER (roda como o dono, que continua com o
--     EXECUTE) — incluindo os dois gatilhos de números.
--
-- Sai o EXECUTE de PUBLIC, anon e authenticated; a service_role fica.
-- Ficaram de fora, de propósito, as que aparecem em policy
-- (fn_operador_setor_id, fn_operador_clonado_no_setor, fn_meta_esta_bloqueada,
-- fn_empresa_e_cobranca, fn_rh_cracha_visivel, fn_vendas_equipe_que_credita):
-- policy roda como quem consulta, e fechar quebraria a tabela.
--
-- Só privilégios. Reaplicável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

DO $h$
DECLARE
  v_funcoes CONSTANT TEXT[] := ARRAY[
    'public.fn_mestre_emprestimo_do_setor(uuid,text)',
    'public.fn_tv_metricas_setor(uuid,uuid,date)',
    'public.fn_empresa_id_bookplay()',
    'public.fn_get_perfil_usuario(uuid)',
    'public.fn_get_setor_usuario(uuid)',
    'public.fn_metas_esta_validada(uuid,uuid,integer,integer)',
    'public.fn_numeros_setor_e_da_empresa(uuid,uuid)',
    'public.fn_perfil_tem(uuid,text)',
    'public.fn_vendas_dia_util(uuid,date)',
    'public.fn_vendas_franquia_resolver(uuid,text,text)',
    'public.fn_vendas_ia_credito(uuid,date)',
    'public.fn_vendas_perfil_do_login(uuid,text)'
  ];
  v_f TEXT;
BEGIN
  FOREACH v_f IN ARRAY v_funcoes LOOP
    IF to_regprocedure(v_f) IS NULL THEN
      RAISE NOTICE 'Não existe (pulada): %', v_f;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_f);
    -- postgres é o dono das chamadoras; GRANT é inócuo quando já é o dono.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role, postgres', v_f);
  END LOOP;
END
$h$;

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF has_function_privilege('authenticated', 'public.fn_mestre_emprestimo_do_setor(uuid,text)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_tv_metricas_setor(uuid,uuid,date)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_perfil_tem(uuid,text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'Função interna continua aberta para quem tem login.';
  END IF;
  -- As que as policies usam continuam executáveis.
  IF NOT has_function_privilege('authenticated', 'public.fn_operador_setor_id(uuid)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_vendas_equipe_que_credita(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'Uma função usada em policy perdeu o EXECUTE.';
  END IF;
  -- A TV sem login continua: fn_tv_palco chama fn_tv_metricas_setor como dona.
  IF NOT has_function_privilege('anon', 'public.fn_tv_palco(text,uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'A TV perdeu o fn_tv_palco.';
  END IF;
END
$prova$;

COMMIT;
