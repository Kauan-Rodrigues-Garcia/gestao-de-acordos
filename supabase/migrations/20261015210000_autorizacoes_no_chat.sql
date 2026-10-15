-- ============================================================================
-- Autorizações no chat: o aviso vai para os líderes do setor e abre o chat
-- ============================================================================
--
-- ## Por que
--
-- Pedido do Cleber, 15/10/2026. O botão de autorizações no canto da tela
-- atrapalhava e líder não o achava. Os pedidos passam a morar no CHAT, numa
-- conversa fixa «Autorizações» do setor (a tela está em
-- `src/components/Chat/AutorizacoesChat.tsx`). Quem vê, quem decide e o que a
-- aprovação faz NÃO mudam — `fn_pode_autorizar_pedido`, a policy e
-- `fn_autorizacao_decidir` ficam como estão. Muda o aviso e o histórico:
--
-- 1. `fn_autorizacao_notificar(pedido, mensagem)` — um lugar só para avisar
--    quem decide. Vai para líder, elite e gerência dos setores do pedido
--    (`setores_escopo`: o do solicitante e os das equipes em que ele é clone),
--    com `rota = '/autorizacoes'`, que abre o chat na conversa. Diretoria e
--    administração SÓ recebem quando o setor não tem ninguém para avisar —
--    antes recebiam todo pedido de todo setor. Elas continuam vendo e podendo
--    decidir tudo, como antes.
--
-- 2. `fn_autorizacao_solicitar` e `fn_tornar_direto` — as duas portas que
--    criam pedido passam a avisar pela função acima. O resto de cada uma é a
--    cópia exata da definição anterior (20260818260000 e 20260930150000).
--
-- 3. `fn_autorizacao_faxina` — o decidido fica 30 dias (era até a meia-noite),
--    para a conversa ter histórico. O vencido continua virando «cancelado».
--
-- Reaplicável. Não altera nenhuma linha existente.

BEGIN;

-- ── 1. Avisar quem decide ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_autorizacao_notificar(p_pedido uuid, p_mensagem text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v   public.autorizacoes_pedidos%ROWTYPE;
  v_n integer := 0;
BEGIN
  SELECT * INTO v FROM public.autorizacoes_pedidos WHERE id = p_pedido;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Os líderes do setor do pedido (inclusive o setor em que o solicitante é clone).
  INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, autor_id, autor_nome, rota)
  SELECT p.id, 'Autorização solicitada', p_mensagem, v.empresa_id, v.solicitante_id, v.solicitante_nome,
         '/autorizacoes'
    FROM public.perfis p
   WHERE p.empresa_id = v.empresa_id
     AND p.ativo = true
     AND coalesce(p.situacao, 'ativo') = 'ativo'
     AND p.id <> v.solicitante_id
     AND p.perfil IN ('lider', 'elite', 'gerencia')
     AND p.setor_id IS NOT NULL
     AND p.setor_id = ANY (coalesce(v.setores_escopo, '{}'::uuid[]));
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- Setor sem ninguém para decidir: quem vê a empresa inteira é avisado,
  -- para o pedido não ficar parado sem que ninguém saiba.
  IF v_n = 0 THEN
    INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, autor_id, autor_nome, rota)
    SELECT p.id, 'Autorização solicitada', p_mensagem, v.empresa_id, v.solicitante_id, v.solicitante_nome,
           '/autorizacoes'
      FROM public.perfis p
     WHERE p.empresa_id = v.empresa_id
       AND p.ativo = true
       AND coalesce(p.situacao, 'ativo') = 'ativo'
       AND p.id <> v.solicitante_id
       AND p.perfil IN ('diretoria', 'administrador');
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION public.fn_autorizacao_notificar(uuid, text) IS
  'Avisa quem decide um pedido de autorização: líderes do setor (com rota para o chat); diretoria só se o setor não tiver ninguém. Ver 20261015210000.';

REVOKE ALL ON FUNCTION public.fn_autorizacao_notificar(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_autorizacao_notificar(uuid, text) TO service_role;

-- ── 2a. Solicitar (cópia de 20260818260000, com o aviso novo) ────────────────

create or replace function public.fn_autorizacao_solicitar(
  p_modo                text,
  p_nr_label            text,
  p_nr_valor            text,
  p_payload             jsonb,
  p_resumo              jsonb default '{}'::jsonb,
  p_acordo_alvo_id      uuid default null,
  p_dono_id             uuid default null,
  p_dono_nome           text default null,
  p_extra_atual_id      uuid default null,
  p_extra_atual_op_id   uuid default null,
  p_extra_atual_op_nome text default null,
  p_acordo_editado_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid     uuid := auth.uid();
  v_empresa uuid;
  v_setor   uuid;
  v_setores uuid[];
  v_nome    text;
  v_id      uuid;
  v_qtd     integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  end if;

  select p.empresa_id, p.setor_id, p.nome
    into v_empresa, v_setor, v_nome
    from public.perfis p where p.id = v_uid;

  if v_empresa is null then
    return jsonb_build_object('ok', false, 'erro', 'perfil_inexistente');
  end if;
  if p_modo not in ('transferencia_completa','troca_extra') then
    return jsonb_build_object('ok', false, 'erro', 'modo_invalido');
  end if;
  if coalesce(btrim(p_nr_valor), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'nr_vazio');
  end if;

  -- Editar acordo de OUTRA pessoa por este caminho seria escalada de
  -- privilegio: o pedido e aprovado por um lider, mas quem escolhe o alvo e o
  -- solicitante. So o proprio acordo entra.
  if p_acordo_editado_id is not null and not exists (
    select 1 from public.acordos
     where id = p_acordo_editado_id
       and operador_id = v_uid
       and empresa_id = v_empresa
  ) then
    return jsonb_build_object('ok', false, 'erro', 'acordo_editado_invalido');
  end if;

  v_setores := array(select public.fn_setores_do_operador(v_uid));

  -- Pedido repetido do mesmo operador para o mesmo NR nao vira fila.
  select id into v_id
    from public.autorizacoes_pedidos
   where solicitante_id = v_uid
     and status = 'pendente'
     and nr_valor = btrim(p_nr_valor)
     and expira_em > now()
   limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'repetido', true);
  end if;

  insert into public.autorizacoes_pedidos (
    empresa_id, solicitante_id, solicitante_nome, setor_id, setores_escopo, modo,
    nr_label, nr_valor, acordo_alvo_id, dono_id, dono_nome,
    extra_atual_id, extra_atual_op_id, extra_atual_op_nome,
    payload, acordo_editado_id, resumo
  ) values (
    v_empresa, v_uid, coalesce(v_nome, 'Operador'), v_setor, v_setores, p_modo,
    coalesce(nullif(btrim(p_nr_label), ''), 'NR'), btrim(p_nr_valor),
    p_acordo_alvo_id, p_dono_id, p_dono_nome,
    p_extra_atual_id, p_extra_atual_op_id, p_extra_atual_op_nome,
    p_payload, p_acordo_editado_id, coalesce(p_resumo, '{}'::jsonb)
  )
  returning id into v_id;

  -- Os lideres do setor, com o link que abre o chat em Autorizacoes
  -- (20261015210000). Era a empresa inteira para diretoria e administracao.
  v_qtd := public.fn_autorizacao_notificar(
    v_id,
    format('%s pediu autorização para registrar o %s %s%s.',
           coalesce(v_nome, 'Um operador'), coalesce(nullif(btrim(p_nr_label), ''), 'NR'),
           btrim(p_nr_valor),
           case when p_dono_nome is not null then ', hoje de ' || p_dono_nome else '' end));

  return jsonb_build_object('ok', true, 'id', v_id, 'notificados', v_qtd);
end;
$function$;

-- ── 2b. Tornar DIRETO (cópia de 20260930150000, com o aviso novo) ────────────

CREATE OR REPLACE FUNCTION public.fn_tornar_direto(p_acordo_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid     UUID := auth.uid();
  v_nome    TEXT;
  v_extra   public.acordos%ROWTYPE;
  v_alvo    RECORD;
  v_setores UUID[];
  v_autoriz BOOLEAN;
  v_dono    BOOLEAN;
  v_id      UUID;
  v_qtd     INTEGER := 0;
  v_res     JSONB;
  v_label   TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  SELECT * INTO v_extra FROM public.acordos WHERE id = p_acordo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'acordo_inexistente');
  END IF;
  IF NOT public.fn_can_access_empresa(v_extra.empresa_id) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'empresa_negada');
  END IF;
  IF COALESCE(v_extra.tipo_vinculo, 'direto') <> 'extra' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_e_extra');
  END IF;

  SELECT nome INTO v_nome FROM public.perfis WHERE id = v_uid;
  v_setores := array(SELECT public.fn_setores_do_operador(v_extra.operador_id));
  v_dono    := v_extra.operador_id = v_uid;
  v_autoriz := public.fn_pode_tornar_direto(v_extra.empresa_id, v_setores);

  IF NOT v_dono AND NOT v_autoriz THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  END IF;

  SELECT * INTO v_alvo FROM public.fn_tornar_direto_alvo(p_acordo_id);

  -- Manual, ou quem clica ja pode decidir: executa agora.
  IF v_alvo.direto_id IS NULL OR v_autoriz THEN
    v_res := public.fn_tornar_direto_executar(
      p_acordo_id,
      CASE WHEN v_alvo.direto_id IS NULL THEN NULL ELSE v_uid END,
      CASE WHEN v_alvo.direto_id IS NULL THEN NULL ELSE COALESCE(v_nome, 'Autorizador') END,
      CASE WHEN v_alvo.direto_id IS NULL THEN 'manual' ELSE 'autorizador' END);

    -- Quem autorizou pelo acordo de outra pessoa avisa o dono do EXTRA.
    IF COALESCE((v_res->>'ok')::BOOLEAN, false) AND NOT v_dono THEN
      INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, acordo_id, autor_id, autor_nome)
      VALUES (
        v_extra.operador_id, 'Seu acordo EXTRA virou DIRETO',
        format('%s passou o seu acordo %s para DIRETO.', COALESCE(v_nome, 'A liderança'),
               COALESCE(v_alvo.valor, '')),
        v_extra.empresa_id, v_extra.id, v_uid, COALESCE(v_nome, 'Autorizador'));
    END IF;

    RETURN v_res || jsonb_build_object('resultado', 'convertido');
  END IF;

  -- Vinculado, e o dono nao pode decidir sozinho: pedido na gaveta.
  v_label := CASE WHEN v_alvo.campo = 'instituicao' THEN 'Código' ELSE 'NR' END;

  SELECT id INTO v_id
    FROM public.autorizacoes_pedidos
   WHERE modo = 'tornar_direto' AND acordo_editado_id = p_acordo_id
     AND status = 'pendente' AND expira_em > now()
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'resultado', 'pedido', 'id', v_id, 'repetido', true);
  END IF;

  INSERT INTO public.autorizacoes_pedidos (
    empresa_id, solicitante_id, solicitante_nome, setor_id, setores_escopo, modo,
    nr_label, nr_valor, acordo_alvo_id, dono_id, dono_nome,
    payload, acordo_editado_id, resumo
  ) VALUES (
    v_extra.empresa_id, v_uid, COALESCE(v_nome, 'Operador'),
    (SELECT setor_id FROM public.perfis WHERE id = v_uid), v_setores, 'tornar_direto',
    v_label, v_alvo.valor, v_alvo.direto_id, v_alvo.dono_id, v_alvo.dono_nome,
    '{}'::JSONB, p_acordo_id,
    jsonb_build_object(
      'cliente',    v_extra.nome_cliente,
      'valor',      v_extra.valor,
      'vencimento', v_extra.vencimento,
      'parcelas',   v_extra.parcelas,
      'tipo',       v_extra.tipo)
  )
  RETURNING id INTO v_id;

  -- Os lideres do setor, com o link do chat (20261015210000).
  v_qtd := public.fn_autorizacao_notificar(
    v_id,
    format('%s pediu para tornar DIRETO o %s %s, hoje DIRETO de %s.',
           COALESCE(v_nome, 'Um operador'), v_label, v_alvo.valor, v_alvo.dono_nome));

  RETURN jsonb_build_object('ok', true, 'resultado', 'pedido', 'id', v_id,
                            'repetido', false, 'notificados', v_qtd);
END
$function$;

-- ── 3. Faxina: o decidido fica 30 dias ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_autorizacao_faxina()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  -- 30 dias contados da meia-noite de São Paulo, não de UTC.
  v_corte timestamptz :=
    (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '30 days')
    AT TIME ZONE 'America/Sao_Paulo';
  v_qtd   integer;
BEGIN
  UPDATE public.autorizacoes_pedidos
     SET status = 'cancelado',
         decidido_em = now(),
         motivo_recusa = coalesce(motivo_recusa, 'Pedido expirou sem decisão.')
   WHERE status = 'pendente'
     AND expira_em <= now();

  DELETE FROM public.autorizacoes_pedidos
   WHERE status <> 'pendente'
     AND coalesce(decidido_em, criado_em) < v_corte;
  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  RETURN v_qtd;
END;
$function$;

COMMENT ON FUNCTION public.fn_autorizacao_faxina() IS
  'Faxina diária das autorizações: vencidos viram cancelados; decididos há mais de 30 dias são apagados (a conversa Autorizações do chat mostra o histórico). Ver 20261015210000.';

REVOKE ALL ON FUNCTION public.fn_autorizacao_faxina() FROM public, anon, authenticated;

COMMIT;
