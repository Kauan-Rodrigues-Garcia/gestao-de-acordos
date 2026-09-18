-- ════════════════════════════════════════════════════════════════════════════
-- MIN(uuid) NAO EXISTE NO POSTGRES — E ERA ELE QUE TRAVAVA O FLUXO DO RH
-- ════════════════════════════════════════════════════════════════════════════
--
-- Quatro RPCs do RH Gestao resumiam a equipe (ou o setor) com
-- `SELECT MIN(l.setor_id_snapshot), ...` para descobrir a qual setor aquele
-- grupo pertence. `setor_id_snapshot` e `empresa_id` sao UUID, e o Postgres nao
-- tem agregado `min(uuid)`: a chamada morria com
--
--     42883: function min(uuid) does not exist
--
-- O erro so aparecia ao EXECUTAR a linha, nunca ao criar a funcao — por isso as
-- migrations passaram, as funcoes existem no banco, e mesmo assim
-- «Concluir equipe» nunca funcionou uma vez. Validar, enviar ao RH e devolver
-- caiam no mesmo ponto: depois de preencher, o modulo inteiro estava parado.
--
-- A correcao e o idioma que o resto do projeto ja usa desde o baseline —
-- `MIN(x::text)::uuid`. A ordenacao passa a ser a do texto, o que aqui nao muda
-- nada: todas as linhas do grupo carregam o MESMO setor, e o valor so serve
-- como representante. O `IS NULL` que detecta grupo vazio continua valendo,
-- porque agregado sem linha nenhuma segue devolvendo NULL.
--
-- Nenhum outro comportamento muda: os corpos abaixo sao os que ja estavam no
-- banco, com essa unica troca.

BEGIN;

-- fn_rh_concluir_equipe: 1 agregado(s) sobre UUID
CREATE OR REPLACE FUNCTION public.fn_rh_concluir_equipe(
  p_fechamento_id UUID, p_equipe_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_pendentes TEXT;
  v_qtd       INTEGER;
  v_nome      TEXT;
  v_equipe    TEXT;
  v_setor     UUID;
BEGIN
  PERFORM public.fn_rh_exigir_aberto(p_fechamento_id);

  IF NOT public.fn_rh_pode('rh_preencher') THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode concluir equipe.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.rh_lancamentos
   WHERE fechamento_id = p_fechamento_id
     AND equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id
     FOR UPDATE;

  SELECT string_agg(l.nome_snapshot, ', ' ORDER BY l.nome_snapshot)
    INTO v_pendentes
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id
     AND l.equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id
     AND l.valor IS NULL
     AND l.dispensado IS NOT TRUE;

  IF v_pendentes IS NOT NULL THEN
    RAISE EXCEPTION
      'RH_PENDENTES: ainda falta preencher: %', v_pendentes
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT string_agg(l.nome_snapshot, ', ' ORDER BY l.nome_snapshot)
    INTO v_pendentes
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id
     AND l.equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id
     AND l.status = 'devolvido_rh';

  IF v_pendentes IS NOT NULL THEN
    RAISE EXCEPTION
      'RH_PENDENTES: ainda ha devolucao do RH sem correcao: %', v_pendentes
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT MIN(l.setor_id_snapshot::text)::uuid, MIN(l.equipe_nome_snapshot)
    INTO v_setor, v_equipe
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id
     AND l.equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id;

  IF v_setor IS NULL THEN
    RAISE EXCEPTION 'RH_EQUIPE_VAZIA: esta equipe nao tem operadores nesta competencia.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Com equipe nula, `fn_rh_lancamento_visivel` so responde SIM a partir do
  -- nivel de setor: o balde de quem nao tem equipe e responsabilidade da
  -- gerencia, e nao de um lider de equipe qualquer do mesmo setor.
  IF NOT public.fn_rh_lancamento_visivel(
       public.fn_user_empresa_id(), v_setor, p_equipe_id) THEN
    RAISE EXCEPTION 'RH_FORA_DO_ESCOPO: esta equipe nao esta sob sua lideranca.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.rh_lancamentos
     SET status = 'concluido_lider', atualizado_em = NOW()
   WHERE fechamento_id = p_fechamento_id
     AND equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id
     AND status IN ('pendente', 'preenchido');

  SELECT COUNT(*) INTO v_qtd FROM public.rh_lancamentos
   WHERE fechamento_id = p_fechamento_id
     AND equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  PERFORM public.fn_rh_evento(
    p_fechamento_id, NULL, 'equipe', 'equipe_concluida',
    'Concluiu a equipe ' || COALESCE(v_equipe, 'Sem equipe')
      || ' com ' || v_qtd || ' operador(es)',
    NULL, NULL, NULL, v_setor, p_equipe_id);

  RETURN v_qtd;
END;
$function$;

-- fn_rh_validar_equipe: 1 agregado(s) sobre UUID
CREATE OR REPLACE FUNCTION public.fn_rh_validar_equipe(
  p_fechamento_id UUID, p_equipe_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_fora   TEXT;
  v_qtd    INTEGER;
  v_nome   TEXT;
  v_equipe TEXT;
  v_setor  UUID;
BEGIN
  PERFORM public.fn_rh_exigir_aberto(p_fechamento_id);

  IF NOT public.fn_rh_pode('rh_validar') THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode validar equipe.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.rh_lancamentos
   WHERE fechamento_id = p_fechamento_id
     AND equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id
     FOR UPDATE;

  SELECT MIN(l.setor_id_snapshot::text)::uuid, MIN(l.equipe_nome_snapshot)
    INTO v_setor, v_equipe
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id
     AND l.equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id;

  IF v_setor IS NULL THEN
    RAISE EXCEPTION 'RH_EQUIPE_VAZIA: esta equipe nao tem operadores nesta competencia.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.fn_rh_lancamento_visivel(
       public.fn_user_empresa_id(), v_setor, p_equipe_id) THEN
    RAISE EXCEPTION 'RH_FORA_DO_ESCOPO: esta equipe nao esta no seu escopo.'
      USING ERRCODE = '42501';
  END IF;

  -- Validar exige a equipe INTEIRA conferida. Validar metade e o estado
  -- contraditorio que este modulo evita por construcao.
  SELECT string_agg(DISTINCT l.status, ', ') INTO v_fora
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id
     AND l.equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id
     AND l.status <> 'concluido_lider';

  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION
      'RH_ESTADO_INVALIDO: a equipe ainda tem lancamento em "%" — so equipe concluida pelo lider pode ser validada.',
      v_fora USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.rh_lancamentos
     SET status = 'validado_gerencia',
         validado_por = auth.uid(), validado_por_nome = v_nome,
         validado_em = NOW(), atualizado_em = NOW()
   WHERE fechamento_id = p_fechamento_id
     AND equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id
     AND status = 'concluido_lider';

  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  PERFORM public.fn_rh_evento(
    p_fechamento_id, NULL, 'equipe', 'equipe_validada',
    'Validou a equipe ' || COALESCE(v_equipe, 'Sem equipe')
      || ' (' || v_qtd || ' operador(es))',
    NULL, NULL, NULL, v_setor, p_equipe_id);

  RETURN v_qtd;
END;
$function$;

-- fn_rh_devolver_equipe: 2 agregado(s) sobre UUID
CREATE OR REPLACE FUNCTION public.fn_rh_devolver_equipe(
  p_fechamento_id UUID, p_equipe_id UUID, p_motivo TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_qtd    INTEGER;
  v_nome   TEXT;
  v_equipe TEXT;
  v_setor  UUID;
  v_emp    UUID;
  v_rota   TEXT;
  v_alvo   RECORD;
BEGIN
  IF COALESCE(TRIM(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'RH_MOTIVO_OBRIGATORIO: informe o motivo da devolucao.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_rh_exigir_aberto(p_fechamento_id);

  IF NOT public.fn_rh_pode('rh_devolver') THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode devolver.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.rh_lancamentos
   WHERE fechamento_id = p_fechamento_id
     AND equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id
     FOR UPDATE;

  SELECT MIN(l.setor_id_snapshot::text)::uuid, MIN(l.equipe_nome_snapshot), MIN(l.empresa_id::text)::uuid
    INTO v_setor, v_equipe, v_emp
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id
     AND l.equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id;

  IF v_setor IS NULL THEN
    RAISE EXCEPTION 'RH_EQUIPE_VAZIA: esta equipe nao tem operadores nesta competencia.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.rh_lancamentos
     SET status = 'devolvido_rh',
         devolucao_escopo = 'equipe',
         motivo_devolucao = TRIM(p_motivo),
         decidido_por = auth.uid(), decidido_por_nome = v_nome,
         decidido_em = NOW(), atualizado_em = NOW()
   WHERE fechamento_id = p_fechamento_id
     AND equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id
     AND status IN ('enviado_rh', 'aprovado_rh');

  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  IF v_qtd = 0 THEN
    RAISE EXCEPTION
      'RH_ESTADO_INVALIDO: nenhum lancamento desta equipe chegou ao RH — nao ha o que devolver.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_rh_evento(
    p_fechamento_id, NULL, 'equipe', 'devolvido_equipe',
    'Devolveu a equipe ' || COALESCE(v_equipe, 'Sem equipe')
      || ' (' || v_qtd || ' operador(es))',
    p_motivo, NULL, NULL, v_setor, p_equipe_id);

  v_rota := '/rh-gestao?fechamento=' || p_fechamento_id
            || COALESCE('&equipe=' || p_equipe_id, '&setor=' || v_setor);

  -- Uma notificacao por PESSOA responsavel, e nao uma por lancamento: seis
  -- avisos identicos no sino nao dizem mais do que um.
  FOR v_alvo IN
    SELECT DISTINCT alvo FROM (
      SELECT preenchido_por AS alvo FROM public.rh_lancamentos
       WHERE fechamento_id = p_fechamento_id
         AND equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id
      UNION
      SELECT validado_por FROM public.rh_lancamentos
       WHERE fechamento_id = p_fechamento_id
         AND equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id
    ) x WHERE alvo IS NOT NULL
  LOOP
    PERFORM public.fn_rh_notificar(
      v_alvo.alvo, v_emp,
      'RH devolveu a equipe ' || COALESCE(v_equipe, 'Sem equipe'),
      'Motivo: ' || TRIM(p_motivo), v_rota);
  END LOOP;

  RETURN v_qtd;
END;
$function$;

-- fn_rh_enviar_setor: 1 agregado(s) sobre UUID
CREATE OR REPLACE FUNCTION public.fn_rh_enviar_setor(
  p_fechamento_id UUID, p_setor_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_fora  TEXT;
  v_qtd   INTEGER;
  v_setor TEXT;
  v_emp   UUID;
BEGIN
  PERFORM public.fn_rh_exigir_aberto(p_fechamento_id);

  IF NOT public.fn_rh_pode('rh_enviar') THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode enviar ao RH.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.rh_lancamentos
   WHERE fechamento_id = p_fechamento_id AND setor_id_snapshot = p_setor_id
     FOR UPDATE;

  SELECT MIN(l.setor_nome_snapshot), MIN(l.empresa_id::text)::uuid INTO v_setor, v_emp
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id AND l.setor_id_snapshot = p_setor_id;

  IF v_setor IS NULL THEN
    RAISE EXCEPTION 'RH_SETOR_VAZIO: este setor nao tem operadores nesta competencia.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Escopo de SETOR: a equipe nao entra na conta aqui, porque enviar e ato de
  -- gerencia sobre o setor inteiro.
  IF NOT (public.fn_user_is_super_admin()
          OR public.fn_user_escopo('rh') >= 3
          OR (public.fn_user_escopo('rh') >= 2
              AND p_setor_id IS NOT DISTINCT FROM public.fn_user_setor_id())) THEN
    RAISE EXCEPTION 'RH_FORA_DO_ESCOPO: este setor nao esta no seu escopo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT string_agg(DISTINCT l.status, ', ') INTO v_fora
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id
     AND l.setor_id_snapshot = p_setor_id
     AND l.status NOT IN ('validado_gerencia', 'enviado_rh', 'aprovado_rh');

  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION
      'RH_ESTADO_INVALIDO: o setor ainda tem lancamento em "%" — valide todas as equipes antes de enviar.',
      v_fora USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.rh_lancamentos
     SET status = 'enviado_rh', enviado_em = NOW(), atualizado_em = NOW()
   WHERE fechamento_id = p_fechamento_id
     AND setor_id_snapshot = p_setor_id
     AND status = 'validado_gerencia';

  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  PERFORM public.fn_rh_evento(
    p_fechamento_id, NULL, 'setor', 'setor_enviado',
    'Enviou ao RH o setor ' || v_setor || ' (' || v_qtd || ' operador(es))',
    NULL, NULL, NULL, p_setor_id, NULL);

  RETURN v_qtd;
END;
$function$;

COMMIT;
