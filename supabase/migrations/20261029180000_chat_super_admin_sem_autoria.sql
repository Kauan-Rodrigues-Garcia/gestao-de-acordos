-- ============================================================================
-- Chat: o que o super admin muda num grupo não leva o nome dele
-- 29/10/2026 · pedido do Kauan
-- ============================================================================
--
-- «Quando eu configurar grupos, não aparecer que fui eu que configurei.»
--
-- Os avisos do grupo («Kauan adicionou Fulano», «Kauan mudou a foto») são
-- mensagens com `sistema` preenchido, gravadas por `fn_chat_avisar` com o autor
-- = quem fez. Agora, quando quem faz é o super admin, o aviso sai SEM autor
-- (`autor_id` nulo, que a coluna já aceita) e a conversa escreve na voz
-- passiva: «Fulano foi adicionado ao grupo», «A foto do grupo mudou».
--
-- Vale para tudo que é configurar: criar, adicionar, remover, administrador,
-- nome, foto e trava de escrita. NÃO vale para «saiu»: sair é dele, não é
-- configurar o grupo.
--
-- Nada que dependa do autor quebra: a notificação push já pula aviso de
-- sistema, o gatilho da conversa só marca leitura de quem escreveu (ninguém,
-- aqui) e a empresa da mensagem vem da conversa.
--
-- Os avisos que já existem não mudam (o UPDATE opcional está no fim, comentado).
-- Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_chat_avisar(
  p_conversa UUID, p_tipo TEXT, p_dados JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa UUID;
  v_autor   UUID := (SELECT auth.uid());
BEGIN
  -- O super admin configura sem assinar (20261029180000).
  IF p_tipo IS DISTINCT FROM 'saiu' AND (SELECT public.fn_user_is_super_admin()) THEN
    v_autor := NULL;
  END IF;

  SELECT empresa_id INTO v_empresa FROM public.chat_conversas WHERE id = p_conversa;
  INSERT INTO public.chat_mensagens (conversa_id, empresa_id, autor_id, texto, sistema, sistema_dados)
  VALUES (p_conversa, v_empresa, v_autor, NULL, p_tipo, COALESCE(p_dados, '{}'::JSONB));

  UPDATE public.chat_conversas SET ultima_mensagem_em = NOW() WHERE id = p_conversa;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_avisar(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chat_avisar(UUID, TEXT, JSONB) TO service_role;

COMMENT ON FUNCTION public.fn_chat_avisar(UUID, TEXT, JSONB) IS
  'Grava o aviso de sistema do grupo. Feito pelo super admin (menos «saiu»), o aviso sai sem '
  'autor e a conversa escreve na voz passiva (20261029180000).';

-- ── Prova ──────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF position('fn_user_is_super_admin' IN pg_get_functiondef('public.fn_chat_avisar(uuid,text,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'chat: fn_chat_avisar sem a regra do super admin';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_chat_avisar(uuid,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'chat: fn_chat_avisar aberta demais';
  END IF;
END;
$prova$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Opcional: tirar o nome dos avisos que o super admin JÁ deixou ───────────
-- Muda dados existentes. Rodar só se quiser, separado:
--
-- UPDATE public.chat_mensagens m
--    SET autor_id = NULL
--   FROM public.perfis p
--  WHERE p.id = m.autor_id
--    AND p.perfil = 'super_admin'
--    AND m.sistema IS NOT NULL
--    AND m.sistema <> 'saiu';
--
-- ── Para desfazer ──────────────────────────────────────────────────────────
-- Reaplicar fn_chat_avisar de 20260901120000 (autor sempre = auth.uid()).
