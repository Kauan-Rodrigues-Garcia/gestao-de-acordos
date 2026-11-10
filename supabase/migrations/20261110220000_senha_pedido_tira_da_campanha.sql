-- ============================================================================
-- Reset por pedido tira a pessoa da campanha da senha inicial (10/11/2026)
-- ============================================================================
--
-- `fn_senha_pedido_concluir` liga `senha_troca_obrigatoria`, mas deixava
-- `senha_inicial_pendente` ligada. A senha da pessoa já não é a inicial — é a
-- provisória que o super admin acabou de gerar. Se ela não entrasse até o
-- prazo (13/11 23:59), `fn_senha_inicial_expirar` anulava a senha PROVISÓRIA
-- que o líder já tinha entregado, e o reset ia para o lixo. Ela também
-- continuava contada como «pendente» no andamento da campanha.
--
-- Agora concluir o pedido desliga `senha_inicial_pendente`. A trava que vale
-- passa a ser só a de sempre (`senha_troca_obrigatoria`), que já vencia a
-- campanha na tela (`modoDaTroca` = 'pedido'). `senha_inicial_trocada_em`
-- fica NULL: a pessoa ainda não criou a senha dela.
--
-- O reset direto (api/alterar-senha) faz o mesmo no próprio arquivo da API.
-- Reexecutável.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_senha_pedido_concluir(p_pedido uuid, p_senha text, p_por uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_p    public.senha_pedidos%ROWTYPE;
  v_nome TEXT;
BEGIN
  SELECT * INTO v_p FROM public.senha_pedidos WHERE id = p_pedido FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'erro', 'pedido_inexistente'); END IF;
  IF v_p.status <> 'executando' OR v_p.reservado_por IS DISTINCT FROM p_por THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'nao_reservado');
  END IF;
  IF p_senha IS NULL OR length(p_senha) < 6 OR length(p_senha) > 72 THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'senha_invalida');
  END IF;

  SELECT nome INTO v_nome FROM public.perfis WHERE id = p_por;

  UPDATE public.senha_pedidos
     SET status = 'aprovado', decidido_por_id = p_por, decidido_por_nome = v_nome,
         decidido_em = now(), senha_provisoria = p_senha, erro = NULL, trocada_em = NULL
   WHERE id = v_p.id;

  PERFORM set_config('app.senha_troca', 'ok', true);
  UPDATE public.perfis
     SET senha_troca_obrigatoria = TRUE,
         senha_alterada          = FALSE,
         senha_inicial_pendente  = FALSE
   WHERE id = v_p.alvo_id;
  PERFORM set_config('app.senha_troca', '', true);

  IF v_p.solicitante_id IS NOT NULL THEN
    INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, rota, autor_id, autor_nome)
    SELECT v_p.solicitante_id, 'Senha resetada',
           format('A senha de %s foi resetada. Veja a senha provisória no chat, canal «Senhas».', v_p.alvo_nome),
           s.empresa_id, '/senhas', p_por, v_nome
      FROM public.perfis s WHERE s.id = v_p.solicitante_id;
  END IF;

  RETURN jsonb_build_object('ok', TRUE);
END;
$function$;

-- CREATE OR REPLACE mantém os privilégios; reafirmados por garantia (só service_role).
REVOKE ALL ON FUNCTION public.fn_senha_pedido_concluir(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_senha_pedido_concluir(uuid, text, uuid) TO service_role;
