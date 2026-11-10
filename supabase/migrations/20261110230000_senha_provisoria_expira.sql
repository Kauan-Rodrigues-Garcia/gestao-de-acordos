-- ============================================================================
-- Senha provisória vale 2 horas (pedido do Cleber, 10/11/2026)
-- ============================================================================
--
-- Antes: a senha provisória de um pedido aprovado abria a conta até a pessoa
-- trocar — sem prazo. A tela obrigava a troca, mas a API aceitava a
-- provisória para sempre, e o texto dela ficava no pedido por 7 dias.
--
-- Agora:
--
--   • aprovar dá 2 horas (`senha_pedidos.expira_em`). Passou sem a pessoa
--     trocar, `fn_senha_pedidos_expirar` (pg_cron, todo minuto) anula a senha
--     (aleatória que ninguém conhece), derruba as sessões, apaga o texto da
--     provisória e o pedido vira `expirado`. A trava `senha_troca_obrigatoria`
--     continua ligada;
--   • cartão expirado, super admin: «Gerar senha nova» — o mesmo caminho de
--     aprovar (`api/aprovar-pedido-senha`): reservar aceita `expirado`, o
--     servidor gera outra senha, mais 2 horas, e o líder é avisado de novo;
--   • cartão expirado, quem pediu: «Solicitar novamente»
--     (`fn_senha_pedido_repetir`) — o MESMO pedido volta a `pendente`, com o
--     mesmo motivo, e os super admins são avisados de novo;
--   • `movido_em`: quando o pedido foi (re)enviado. O canal ordena por ele, e
--     é o que faz o cartão descer para o fim da conversa.
--
-- O pedido que já estava aprovado e sem troca ganha decidido_em + 2 horas.
-- Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. Colunas e status ─────────────────────────────────────────────────────

ALTER TABLE public.senha_pedidos
  ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS movido_em TIMESTAMPTZ;

UPDATE public.senha_pedidos SET movido_em = criado_em WHERE movido_em IS NULL;
ALTER TABLE public.senha_pedidos
  ALTER COLUMN movido_em SET DEFAULT now(),
  ALTER COLUMN movido_em SET NOT NULL;

UPDATE public.senha_pedidos
   SET expira_em = decidido_em + INTERVAL '2 hours'
 WHERE status = 'aprovado' AND trocada_em IS NULL AND expira_em IS NULL AND decidido_em IS NOT NULL;

ALTER TABLE public.senha_pedidos DROP CONSTRAINT IF EXISTS senha_pedidos_status_check;
ALTER TABLE public.senha_pedidos ADD CONSTRAINT senha_pedidos_status_check
  CHECK (status IN ('pendente', 'executando', 'aprovado', 'recusado', 'cancelado', 'expirado'));

COMMENT ON COLUMN public.senha_pedidos.expira_em IS
  'Até quando a senha provisória vale (aprovação + 2 h). Depois, fn_senha_pedidos_expirar anula a senha. 20261110230000.';
COMMENT ON COLUMN public.senha_pedidos.movido_em IS
  'Quando o pedido foi enviado ou reenviado (senha nova, novo pedido). Ordena o canal «Senhas». 20261110230000.';

-- O que o cron procura, todo minuto.
CREATE INDEX IF NOT EXISTS idx_senha_pedidos_a_expirar
  ON public.senha_pedidos (expira_em)
  WHERE status = 'aprovado' AND trocada_em IS NULL;

-- ── 2. Aprovar dá 2 horas e move o cartão ───────────────────────────────────

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
         decidido_em = now(), senha_provisoria = p_senha, erro = NULL, trocada_em = NULL,
         expira_em = now() + INTERVAL '2 hours', movido_em = now()
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
           format('A senha de %s foi resetada. Veja a senha provisória no chat, canal «Senhas». Ela vale 2 horas.', v_p.alvo_nome),
           s.empresa_id, '/senhas', p_por, v_nome
      FROM public.perfis s WHERE s.id = v_p.solicitante_id;
  END IF;

  RETURN jsonb_build_object('ok', TRUE);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_pedido_concluir(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_senha_pedido_concluir(uuid, text, uuid) TO service_role;

-- ── 3. Reservar aceita o expirado («Gerar senha nova») ──────────────────────

CREATE OR REPLACE FUNCTION public.fn_senha_pedido_reservar(p_pedido uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_eu    UUID := (SELECT auth.uid());
  v_p     public.senha_pedidos%ROWTYPE;
  v_alvo  public.perfis%ROWTYPE;
  v_outro TEXT;
BEGIN
  IF v_eu IS NULL OR NOT public.fn_user_is_super_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'so_super_admin');
  END IF;

  SELECT * INTO v_p FROM public.senha_pedidos WHERE id = p_pedido FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'erro', 'pedido_inexistente'); END IF;

  IF v_p.status = 'executando' AND v_p.reservado_em >= now() - INTERVAL '5 minutes'
     AND v_p.reservado_por IS DISTINCT FROM v_eu THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'em_andamento',
      'por', (SELECT nome FROM public.perfis WHERE id = v_p.reservado_por));
  END IF;
  IF v_p.status NOT IN ('pendente', 'executando', 'expirado') THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'ja_decidido', 'por', v_p.decidido_por_nome);
  END IF;

  -- Expirado, mas a liderança já abriu OUTRO pedido para a mesma pessoa: é
  -- aquele que se aprova (o índice de um aberto por pessoa barraria aqui).
  IF v_p.status = 'expirado' THEN
    SELECT sp.solicitante_nome INTO v_outro
      FROM public.senha_pedidos sp
     WHERE sp.alvo_id = v_p.alvo_id AND sp.id <> v_p.id AND sp.status IN ('pendente', 'executando')
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', FALSE, 'erro', 'ja_pedido', 'por', v_outro);
    END IF;
  END IF;

  SELECT * INTO v_alvo FROM public.perfis WHERE id = v_p.alvo_id;
  IF NOT FOUND OR NOT public.fn_senha_pode_ser_pedido(v_alvo) THEN
    UPDATE public.senha_pedidos
       SET status = 'cancelado', decidido_por_id = v_eu,
           decidido_por_nome = (SELECT nome FROM public.perfis WHERE id = v_eu),
           decidido_em = now(), erro = 'A pessoa foi desligada, excluída ou mudou para um cargo de cúpula.'
     WHERE id = v_p.id;
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'sem_efeito');
  END IF;

  UPDATE public.senha_pedidos
     SET status = 'executando', reservado_por = v_eu, reservado_em = now()
   WHERE id = v_p.id;

  RETURN jsonb_build_object('ok', TRUE, 'alvo_id', v_alvo.id, 'alvo_nome', v_alvo.nome,
                            'alvo_usuario', v_alvo.usuario, 'empresa_id', v_alvo.empresa_id,
                            'solicitante_nome', v_p.solicitante_nome);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_pedido_reservar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_senha_pedido_reservar(uuid) TO authenticated;

-- ── 4. Solicitar novamente (quem pediu, cartão expirado) ────────────────────

CREATE OR REPLACE FUNCTION public.fn_senha_pedido_repetir(p_pedido uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_eu    public.perfis%ROWTYPE;
  v_p     public.senha_pedidos%ROWTYPE;
  v_alvo  public.perfis%ROWTYPE;
  v_outro TEXT;
BEGIN
  IF NOT public.fn_senha_posso_pedir() THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'sem_permissao');
  END IF;
  SELECT * INTO v_eu FROM public.perfis WHERE id = (SELECT auth.uid());
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'erro', 'sem_permissao'); END IF;

  SELECT * INTO v_p FROM public.senha_pedidos WHERE id = p_pedido FOR UPDATE;
  IF NOT FOUND OR v_p.solicitante_id IS DISTINCT FROM v_eu.id THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'pedido_inexistente');
  END IF;
  IF v_p.status <> 'expirado' THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'ja_decidido', 'por', v_p.decidido_por_nome);
  END IF;

  SELECT * INTO v_alvo FROM public.perfis WHERE id = v_p.alvo_id;
  IF NOT FOUND OR NOT public.fn_senha_pode_ser_pedido(v_alvo) THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'alvo_invalido');
  END IF;
  IF v_alvo.setor_id IS NULL
     OR v_alvo.setor_id NOT IN (SELECT public.fn_transferencia_meus_setores()) THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'fora_do_seu_setor');
  END IF;

  SELECT sp.solicitante_nome INTO v_outro
    FROM public.senha_pedidos sp
   WHERE sp.alvo_id = v_p.alvo_id AND sp.id <> v_p.id AND sp.status IN ('pendente', 'executando')
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'ja_pedido', 'por', v_outro);
  END IF;

  UPDATE public.senha_pedidos
     SET status = 'pendente', reservado_por = NULL, reservado_em = NULL,
         decidido_por_id = NULL, decidido_por_nome = NULL, decidido_em = NULL,
         erro = NULL, senha_provisoria = NULL, expira_em = NULL, movido_em = now()
   WHERE id = v_p.id;

  INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, rota, autor_id, autor_nome, autor_foto)
  SELECT sa.id,
         'Pedido de reset de senha',
         format('%s (%s) pede de novo resetar a senha de %s (a provisória expirou).',
                v_eu.nome,
                COALESCE((SELECT s.nome FROM public.setores s WHERE s.id = v_eu.setor_id), 'sem setor'),
                v_p.alvo_nome),
         sa.empresa_id, '/senhas', v_eu.id, v_eu.nome, v_eu.foto_url
    FROM public.perfis sa
   WHERE sa.perfil::TEXT = 'super_admin' AND COALESCE(sa.ativo, TRUE) AND NOT COALESCE(sa.arquivado, FALSE);

  RETURN jsonb_build_object('ok', TRUE, 'id', v_p.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_pedido_repetir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_senha_pedido_repetir(uuid) TO authenticated;

-- ── 5. Expirar (pg_cron) ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_senha_pedidos_expirar()
 RETURNS integer
 LANGUAGE plpgsql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_pedidos UUID[];
  v_alvos   UUID[];
BEGIN
  SELECT array_agg(sp.id), array_agg(DISTINCT sp.alvo_id) FILTER (WHERE sp.alvo_id IS NOT NULL)
    INTO v_pedidos, v_alvos
    FROM public.senha_pedidos sp
   WHERE sp.status = 'aprovado' AND sp.trocada_em IS NULL
     AND sp.expira_em IS NOT NULL AND sp.expira_em <= now();
  IF v_pedidos IS NULL THEN
    RETURN 0;
  END IF;

  IF v_alvos IS NOT NULL THEN
    -- Senha aleatória que não é guardada em lugar nenhum: a provisória morre.
    UPDATE auth.users u
       SET encrypted_password = extensions.crypt(
             encode(extensions.gen_random_bytes(24), 'base64'), extensions.gen_salt('bf', 10)),
           updated_at = now()
     WHERE u.id = ANY (v_alvos);

    BEGIN
      DELETE FROM auth.sessions s WHERE s.user_id = ANY (v_alvos);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'senha provisória: sessões não encerradas (%)', SQLERRM;
    END;

    PERFORM set_config('app.senha_troca', 'ok', true);
    UPDATE public.perfis p
       SET senha_troca_obrigatoria = TRUE, senha_alterada = FALSE
     WHERE p.id = ANY (v_alvos) AND p.senha_troca_obrigatoria IS DISTINCT FROM TRUE;
    PERFORM set_config('app.senha_troca', '', true);
  END IF;

  UPDATE public.senha_pedidos
     SET status = 'expirado', senha_provisoria = NULL
   WHERE id = ANY (v_pedidos);

  RETURN cardinality(v_pedidos);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_pedidos_expirar() FROM PUBLIC, anon, authenticated;

-- ── 6. A leitura: expira na hora, sem esperar o cron ────────────────────────

CREATE OR REPLACE FUNCTION public.fn_senha_pedidos_listar()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_super BOOLEAN := public.fn_user_is_super_admin();
  v_eu    UUID := (SELECT auth.uid());
BEGIN
  IF v_eu IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', t.id,
             'empresa_id', t.empresa_id,
             'solicitante_id', t.solicitante_id,
             'solicitante_nome', t.solicitante_nome,
             'solicitante_cargo', t.solicitante_cargo,
             'solicitante_setor', ss.nome,
             'solicitante_foto', sp.foto_url,
             'alvo_id', t.alvo_id,
             'alvo_nome', t.alvo_nome,
             'alvo_usuario', COALESCE(ap.usuario, t.alvo_usuario),
             'alvo_cargo', t.alvo_cargo,
             'alvo_setor', sa.nome,
             'alvo_foto', ap.foto_url,
             'motivo', t.motivo,
             'status', CASE
                         WHEN t.status = 'executando' AND t.reservado_em < now() - INTERVAL '5 minutes' THEN 'pendente'
                         WHEN t.status = 'aprovado' AND t.trocada_em IS NULL AND t.expira_em <= now() THEN 'expirado'
                         ELSE t.status END,
             'decidido_por_nome', t.decidido_por_nome,
             'decidido_em', t.decidido_em,
             'motivo_recusa', t.motivo_recusa,
             'erro', t.erro,
             'senha', CASE WHEN t.status = 'aprovado' AND t.trocada_em IS NULL
                                AND COALESCE(t.expira_em, t.decidido_em + INTERVAL '2 hours') > now()
                           THEN t.senha_provisoria END,
             'trocada_em', t.trocada_em,
             'expira_em', t.expira_em,
             'movido_em', t.movido_em,
             'criado_em', t.criado_em
           ) ORDER BY t.movido_em DESC)
      FROM public.senha_pedidos t
      LEFT JOIN public.perfis sp  ON sp.id = t.solicitante_id
      LEFT JOIN public.setores ss ON ss.id = t.solicitante_setor_id
      LEFT JOIN public.perfis ap  ON ap.id = t.alvo_id
      LEFT JOIN public.setores sa ON sa.id = t.alvo_setor_id
     WHERE (v_super OR t.solicitante_id = v_eu)
       AND (t.status IN ('pendente', 'executando') OR t.movido_em > now() - INTERVAL '30 days')
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_pedidos_listar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_senha_pedidos_listar() TO authenticated;

-- ── 7. Todo minuto ──────────────────────────────────────────────────────────

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('senha-pedidos-expirar', '* * * * *',
      $job$SELECT public.fn_senha_pedidos_expirar()$job$);
  END IF;
END
$cron$;

COMMIT;
