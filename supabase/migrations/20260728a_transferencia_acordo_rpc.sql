-- ═══════════════════════════════════════════════════════════════════════════
-- 20260728a — Transferência de acordo entre operadores via RPC
-- ═══════════════════════════════════════════════════════════════════════════
-- Conserta DOIS bloqueios que vinham da RLS fail-closed de acordos (20260723f):
--
--   1. TRANSFERÊNCIA AUTORIZADA POR LÍDER estava quebrada.
--      O formulário autentica o líder num fetch à parte, recebe um token… e
--      descarta. O SELECT e o DELETE do acordo alheio seguiam saindo com a
--      SESSÃO DO OPERADOR, que a policy `acordos_select` barra. O `maybeSingle`
--      voltava nulo e a tela dizia "Acordo anterior não encontrado".
--
--   2. LIBERAÇÃO DE ACORDO DE DESLIGADO nunca disparava.
--      Descobrir a situação do outro operador exige ler `perfis`, e
--      `perfis_select` (step4_fix_rls_recursion) só deixa o operador ler a
--      PRÓPRIA linha. A checagem devolvia 'ativo' e o bloqueio continuava.
--
-- Ambas são operações legítimas que o operador não pode executar sozinho, então
-- passam a ser SECURITY DEFINER com a autorização verificada AQUI DENTRO.
--
-- Sem alteração de schema — só funções.

-- ─── 1. Situação de um operador da mesma empresa ─────────────────────────────
-- Só devolve a situação; nenhum outro dado do perfil. Escopo de empresa é
-- obrigatório, então ninguém enxerga usuário de outro tenant.
CREATE OR REPLACE FUNCTION public.fn_situacao_operador(p_operador_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa   UUID;
  v_situacao  TEXT;
BEGIN
  IF p_operador_id IS NULL THEN RETURN NULL; END IF;

  SELECT empresa_id, COALESCE(situacao, 'ativo')
    INTO v_empresa, v_situacao
    FROM public.perfis
   WHERE id = p_operador_id;

  IF v_empresa IS NULL THEN RETURN NULL; END IF;
  IF NOT public.fn_can_access_empresa(v_empresa) THEN RETURN NULL; END IF;

  RETURN v_situacao;
END;
$$;

-- ─── 2. Transferir (arquivar + excluir) um acordo de outro operador ──────────
-- Faz o snapshot na lixeira, exclui o acordo e registra o log, tudo numa
-- transação. NÃO grava o acordo novo: quem chama já sabe montar o payload e
-- tem permissão de inserir para si mesmo.
--
-- Duas bases de autorização, verificadas no servidor:
--
--   A) DONO DESLIGADO — quem chama está assumindo para si um acordo cujo dono
--      está marcado como 'desligado'. Não precisa de líder.
--
--   B) QUEM CHAMA É LÍDER+ — a RPC precisa ser invocada COM O TOKEN DO LÍDER
--      (o formulário já obtém esse token via senha). Passar só o id de um líder
--      não serve: qualquer operador saberia um id e burlaria a senha.
--
-- Devolve JSONB com os dados do acordo removido, para a mensagem de aviso.
CREATE OR REPLACE FUNCTION public.fn_transferir_acordo_nr(
  p_acordo_id        UUID,
  p_novo_operador_id UUID DEFAULT NULL,
  p_motivo           TEXT DEFAULT 'transferencia_nr'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_acordo     public.acordos%ROWTYPE;
  v_chamador   UUID := auth.uid();
  v_novo       UUID := COALESCE(p_novo_operador_id, auth.uid());
  v_sit_dono   TEXT;
  v_nome_dono  TEXT;
  v_nome_novo  TEXT;
  v_nome_chama TEXT;
  v_base       TEXT := NULL;   -- 'dono_desligado' | 'lider'
BEGIN
  IF v_chamador IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  SELECT * INTO v_acordo FROM public.acordos WHERE id = p_acordo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'acordo_inexistente');
  END IF;

  IF NOT public.fn_can_access_empresa(v_acordo.empresa_id) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'empresa_negada');
  END IF;

  -- O destinatário tem de ser da mesma empresa do acordo.
  IF NOT EXISTS (
    SELECT 1 FROM public.perfis
     WHERE id = v_novo AND empresa_id = v_acordo.empresa_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'destinatario_invalido');
  END IF;

  SELECT COALESCE(situacao, 'ativo'), nome
    INTO v_sit_dono, v_nome_dono
    FROM public.perfis WHERE id = v_acordo.operador_id;

  -- Base A: dono desligado, e quem chama está assumindo para si.
  IF v_sit_dono = 'desligado' AND v_novo = v_chamador THEN
    v_base := 'dono_desligado';
  END IF;

  -- Base B: quem chama é líder+ na empresa do acordo.
  IF v_base IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.perfis
       WHERE id = v_chamador
         AND empresa_id = v_acordo.empresa_id
         AND perfil IN ('lider','elite','gerencia','diretoria','administrador','super_admin')
    ) OR public.fn_user_is_super_admin() THEN
      v_base := 'lider';
    END IF;
  END IF;

  IF v_base IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  END IF;

  SELECT nome INTO v_nome_novo  FROM public.perfis WHERE id = v_novo;
  SELECT nome INTO v_nome_chama FROM public.perfis WHERE id = v_chamador;

  -- Snapshot na lixeira antes de excluir.
  INSERT INTO public.lixeira_acordos (
    acordo_id, empresa_id, operador_id, operador_nome,
    nome_cliente, nr_cliente, valor, vencimento, tipo, status,
    observacoes, instituicao, dados_completos, motivo,
    autorizado_por_id, autorizado_por_nome,
    transferido_para_id, transferido_para_nome
  ) VALUES (
    v_acordo.id, v_acordo.empresa_id, v_acordo.operador_id, v_nome_dono,
    v_acordo.nome_cliente, v_acordo.nr_cliente, v_acordo.valor, v_acordo.vencimento,
    v_acordo.tipo, v_acordo.status, v_acordo.observacoes, v_acordo.instituicao,
    to_jsonb(v_acordo), p_motivo,
    CASE WHEN v_base = 'lider' THEN v_chamador END,
    CASE WHEN v_base = 'lider' THEN v_nome_chama
         ELSE 'Sistema — operador desligado' END,
    v_novo, v_nome_novo
  );

  DELETE FROM public.acordos WHERE id = p_acordo_id;

  INSERT INTO public.logs_sistema (usuario_id, acao, tabela, registro_id, empresa_id, detalhes)
  VALUES (
    v_chamador,
    CASE WHEN v_base = 'dono_desligado' THEN 'transferencia_nr_desligado'
         ELSE 'transferencia_nr' END,
    'acordos', p_acordo_id, v_acordo.empresa_id,
    jsonb_build_object(
      'base_autorizacao',       v_base,
      'sem_autorizacao_lider',  v_base = 'dono_desligado',
      'motivo',                 p_motivo,
      'nr',                     COALESCE(v_acordo.nr_cliente, v_acordo.instituicao),
      'nome_cliente',           v_acordo.nome_cliente,
      'valor',                  v_acordo.valor,
      'operador_anterior',      v_acordo.operador_id,
      'operador_anterior_nome', v_nome_dono,
      'operador_novo',          v_novo,
      'operador_novo_nome',     v_nome_novo
    )
  );

  RETURN jsonb_build_object(
    'ok',                true,
    'base',              v_base,
    'operador_anterior', v_acordo.operador_id,
    'operador_ant_nome', v_nome_dono,
    'nome_cliente',      v_acordo.nome_cliente,
    'valor',             v_acordo.valor,
    'vencimento',        v_acordo.vencimento,
    'status',            v_acordo.status,
    'nr',                COALESCE(v_acordo.nr_cliente, v_acordo.instituicao)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_situacao_operador(UUID)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_transferir_acordo_nr(UUID, UUID, TEXT)   TO authenticated;
