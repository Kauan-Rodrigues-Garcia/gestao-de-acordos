-- ============================================================================
-- RH Gestao — as tres arestas que faltavam para o modulo fechar
-- ============================================================================
--
-- O modulo entrou completo no desenho e incompleto na pratica. Tres coisas
-- ficaram para tras, e as tres so aparecem depois que alguem usa a tela de
-- verdade:
--
--   1. o cracha cadastrado NUNCA aparecia;
--   2. quem nao tem equipe travava o setor inteiro, para sempre;
--   3. as RPCs de equipe recusavam o balde «Sem equipe» por construcao.
--
-- ── 1. O cracha que nao aparecia ───────────────────────────────────────────
--
-- `fn_rh_salvar_cracha` grava em `rh_dados_operadores`. A tela e a exportacao
-- leem `rh_lancamentos.cracha_snapshot`, que so e preenchido na SEMEADURA da
-- competencia, e a semeadura e `ON CONFLICT DO NOTHING` — quem ja tem linha
-- fica como esta.
--
-- Resultado: cadastrar o cracha gravava a tabela certa e a coluna «Cracha»
-- continuava «—» para sempre, inclusive na planilha que o RH usa para pagar.
-- Reabrir a competencia nao resolvia; a semeadura nao toca em linha existente.
--
-- A correcao propaga o cracha para os lancamentos das competencias ABERTAS.
-- Competencia finalizada nao e tocada, e isso e a regra do modulo, nao um
-- descuido: folha que ja circulou e fotografia, e cracha novo nao reescreve
-- pagamento antigo. O que muda e o significado de «snapshot» enquanto a
-- competencia esta aberta — ali ela ainda esta sendo montada.
--
-- ── 2 e 3. O balde «Sem equipe» ────────────────────────────────────────────
--
-- `perfis.equipe_id` e opcional, e a semeadura traz todo mundo do setor
-- configurado: lider sem equipe propria, gerente, quem foi admitido e ainda
-- nao foi alocado. Esses lancamentos nascem com `equipe_id_snapshot IS NULL`.
--
-- Todas as RPCs de equipe comparam com `=`:
--
--     WHERE equipe_id_snapshot = p_equipe_id
--
-- e em SQL `NULL = NULL` e NULO, nao verdadeiro. Nenhuma linha era encontrada,
-- entao concluir e validar o balde «Sem equipe» era impossivel — e
-- `fn_rh_enviar_setor` exige TODOS os lancamentos do setor em
-- `validado_gerencia` ou adiante.
--
-- Um unico operador sem equipe travava o setor inteiro, sem mensagem que
-- explicasse o que fazer: o botao «Concluir equipe» nem aparecia para aquele
-- bloco, porque a tela tambem exigia um id.
--
-- A correcao troca `=` por `IS NOT DISTINCT FROM` nas cinco RPCs de equipe.
-- Nao ha afrouxamento de escopo: `fn_rh_lancamento_visivel` ja exige nivel de
-- SETOR quando a equipe e nula (o ramo de nivel 1 tem `p_equipe_id IS NOT
-- NULL`), entao quem lidera equipe continua sem enxergar — e sem poder mexer
-- — o balde de quem nao tem equipe. Quem responde por ele e a gerencia, que e
-- exatamente quem responde pelo setor.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ════════════════════════════════════════════════════════════════════════════
-- 1. O CRACHA CHEGA AO LANCAMENTO
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_rh_salvar_cracha(
  p_empresa_id UUID, p_operador_id UUID, p_cracha TEXT
)
RETURNS public.rh_dados_operadores
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_d      public.rh_dados_operadores;
  v_nome   TEXT;
  v_op     RECORD;
  v_qtd    INTEGER;
  v_fech   UUID;
  v_alvo   TEXT;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'RH_EMPRESA: esta empresa nao e sua.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_rh_pode('rh_editar_cracha') THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode editar cracha.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.setor_id, p.equipe_id INTO v_op
    FROM public.perfis p
   WHERE p.id = p_operador_id AND p.empresa_id = p_empresa_id;

  IF v_op.id IS NULL THEN
    RAISE EXCEPTION 'RH_OPERADOR_INEXISTENTE: operador nao encontrado nesta empresa.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- O cracha respeita o mesmo escopo do resto do modulo: quem nao enxerga a
  -- pessoa nao cadastra o cracha dela.
  IF NOT public.fn_rh_lancamento_visivel(p_empresa_id, v_op.setor_id, v_op.equipe_id) THEN
    RAISE EXCEPTION 'RH_FORA_DO_ESCOPO: este operador nao esta no seu escopo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  INSERT INTO public.rh_dados_operadores (
    empresa_id, operador_id, cracha, atualizado_por, atualizado_por_nome
  ) VALUES (
    p_empresa_id, p_operador_id, NULLIF(TRIM(p_cracha), ''), auth.uid(), v_nome
  )
  ON CONFLICT (empresa_id, operador_id) DO UPDATE
    SET cracha = EXCLUDED.cracha,
        atualizado_por = EXCLUDED.atualizado_por,
        atualizado_por_nome = EXCLUDED.atualizado_por_nome,
        atualizado_em = NOW()
  RETURNING * INTO v_d;

  -- O snapshot das competencias ABERTAS acompanha. Finalizada nao: folha que
  -- ja circulou nao muda porque alguem cadastrou um numero hoje.
  UPDATE public.rh_lancamentos l
     SET cracha_snapshot = v_d.cracha,
         atualizado_em = NOW()
    FROM public.rh_fechamentos f
   WHERE f.id = l.fechamento_id
     AND f.status = 'aberto'
     AND l.empresa_id = p_empresa_id
     AND l.operador_id = p_operador_id
     AND l.cracha_snapshot IS DISTINCT FROM v_d.cracha;

  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  -- A trilha registra so quando o snapshot mudou de fato. `rh_eventos` exige
  -- um fechamento, entao sem competencia aberta nao ha evento a escrever — o
  -- cadastro vale para a proxima, e a tabela `rh_dados_operadores` ja guarda
  -- autor e data.
  IF v_qtd > 0 THEN
    SELECT l.fechamento_id INTO v_fech
      FROM public.rh_lancamentos l
      JOIN public.rh_fechamentos f ON f.id = l.fechamento_id
     WHERE l.operador_id = p_operador_id
       AND l.empresa_id = p_empresa_id
       AND f.status = 'aberto'
     ORDER BY f.competencia DESC
     LIMIT 1;

    SELECT COALESCE(NULLIF(TRIM(p.nome), ''), '—') INTO v_alvo
      FROM public.perfis p WHERE p.id = p_operador_id;

    IF v_fech IS NOT NULL THEN
      PERFORM public.fn_rh_evento(
        v_fech, NULL, 'operador', 'cracha_definido',
        'Definiu o cracha de ' || v_alvo
          || COALESCE(' como ' || v_d.cracha, ' como vazio'));
    END IF;
  END IF;

  RETURN v_d;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_salvar_cracha(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_salvar_cracha(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_rh_salvar_cracha(UUID, UUID, TEXT) IS
  'Grava o cracha e propaga para o snapshot dos lancamentos das competencias '
  'ABERTAS. Competencia finalizada nao e tocada. Ver 20260824120000.';

-- ── O passivo: quem ja tinha cracha e nunca o viu na tela ───────────────────
--
-- Sem isto, a correcao so valeria para cracha cadastrado DEPOIS desta
-- migration, e todo mundo que ja esta cadastrado continuaria com «—».
UPDATE public.rh_lancamentos l
   SET cracha_snapshot = d.cracha,
       atualizado_em = NOW()
  FROM public.rh_fechamentos f, public.rh_dados_operadores d
 WHERE f.id = l.fechamento_id
   AND f.status = 'aberto'
   AND d.empresa_id = l.empresa_id
   AND d.operador_id = l.operador_id
   AND l.cracha_snapshot IS DISTINCT FROM d.cracha;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. AS RPCs DE EQUIPE ACEITAM O BALDE «SEM EQUIPE»
-- ════════════════════════════════════════════════════════════════════════════

/**
 * Concluir a equipe: `pendente`/`preenchido` -> `concluido_lider`.
 *
 * `p_equipe_id` NULL e o balde de quem nao tem equipe. `IS NOT DISTINCT FROM`
 * e o que faz isso funcionar — com `=`, NULL nunca casa e o bloco ficava
 * eternamente pendente, travando o envio do setor.
 *
 * Quem esta fora da folha (`dispensado`) nao e cobrado: nao ha valor a
 * informar. Antes, ele segurava a equipe e o lider digitava zero so para
 * destravar — e zero digitado e um pagamento de zero na folha.
 */
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

  SELECT MIN(l.setor_id_snapshot), MIN(l.equipe_nome_snapshot)
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

/**
 * A gerencia valida a equipe: `concluido_lider` -> `validado_gerencia`.
 *
 * Mesma correcao de NULL: o balde «Sem equipe» so e visto pela gerencia, e era
 * justamente ela quem nao conseguia valida-lo.
 */
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

  SELECT MIN(l.setor_id_snapshot), MIN(l.equipe_nome_snapshot)
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

/** Aprovar em lote o que chegou ao RH — inclusive o balde «Sem equipe». */
CREATE OR REPLACE FUNCTION public.fn_rh_aprovar_equipe(
  p_fechamento_id UUID, p_equipe_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_qtd INTEGER := 0;
  v_id  UUID;
BEGIN
  FOR v_id IN
    SELECT l.id FROM public.rh_lancamentos l
     WHERE l.fechamento_id = p_fechamento_id
       AND l.equipe_id_snapshot IS NOT DISTINCT FROM p_equipe_id
       AND l.status = 'enviado_rh'
     ORDER BY l.nome_snapshot
  LOOP
    PERFORM public.fn_rh_aprovar_operador(v_id);
    v_qtd := v_qtd + 1;
  END LOOP;

  RETURN v_qtd;
END;
$function$;

/**
 * Devolve a EQUIPE inteira. Motivo obrigatorio.
 *
 * Alem do NULL, a rota da notificacao mudou: `'…&equipe=' || NULL` produz NULL
 * em Postgres, e a notificacao do balde «Sem equipe» ficaria sem link nenhum.
 */
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

  SELECT MIN(l.setor_id_snapshot), MIN(l.equipe_nome_snapshot), MIN(l.empresa_id)
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

-- ════════════════════════════════════════════════════════════════════════════
-- 3. A DEVOLUCAO DE UM OPERADOR AVISA A GERENCIA QUANDO NINGUEM PREENCHEU
-- ════════════════════════════════════════════════════════════════════════════
--
-- `fn_rh_devolver_operador` notifica `preenchido_por` e `validado_por`. Uma
-- linha DISPENSADA chega ao RH sem nunca ter sido preenchida: `preenchido_por`
-- e nulo, e se ela tambem nao passou por validacao individual o aviso nao ia
-- para ninguem — a devolucao acontecia em silencio.
--
-- Agora, quando nao ha um responsavel nominal, o aviso vai para quem dispensou.

CREATE OR REPLACE FUNCTION public.fn_rh_devolver_operador(
  p_lancamento_id UUID, p_motivo TEXT
)
RETURNS public.rh_lancamentos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_l    public.rh_lancamentos;
  v_nome TEXT;
  v_rota TEXT;
BEGIN
  IF COALESCE(TRIM(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'RH_MOTIVO_OBRIGATORIO: informe o motivo da devolucao.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_l FROM public.rh_lancamentos WHERE id = p_lancamento_id FOR UPDATE;
  IF v_l.id IS NULL THEN
    RAISE EXCEPTION 'RH_LANCAMENTO_INEXISTENTE: registro nao encontrado.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_rh_exigir_aberto(v_l.fechamento_id);

  IF NOT public.fn_rh_pode('rh_devolver') THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode devolver.' USING ERRCODE = '42501';
  END IF;
  IF v_l.status NOT IN ('enviado_rh', 'aprovado_rh') THEN
    RAISE EXCEPTION
      'RH_ESTADO_INVALIDO: % esta como "%" — so o que chegou ao RH pode ser devolvido.',
      v_l.nome_snapshot, v_l.status USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.rh_lancamentos
     SET status = 'devolvido_rh',
         devolucao_escopo = 'operador',
         motivo_devolucao = TRIM(p_motivo),
         decidido_por = auth.uid(), decidido_por_nome = v_nome,
         decidido_em = NOW(), atualizado_em = NOW()
   WHERE id = p_lancamento_id
  RETURNING * INTO v_l;

  PERFORM public.fn_rh_evento(
    v_l.fechamento_id, v_l.id, 'operador', 'devolvido_operador',
    'Devolveu o lancamento de ' || v_l.nome_snapshot,
    p_motivo, NULL, v_l.valor, v_l.setor_id_snapshot, v_l.equipe_id_snapshot);

  v_rota := '/rh-gestao?fechamento=' || v_l.fechamento_id || '&lancamento=' || v_l.id;

  PERFORM public.fn_rh_notificar(
    v_l.preenchido_por, v_l.empresa_id,
    'RH devolveu um lancamento',
    v_l.nome_snapshot || ' precisa de correcao: ' || TRIM(p_motivo), v_rota);

  -- A gerencia acompanha mesmo sem ter sido ela a preencher: e ela quem vai
  -- reconferir depois da correcao.
  IF v_l.validado_por IS DISTINCT FROM v_l.preenchido_por THEN
    PERFORM public.fn_rh_notificar(
      v_l.validado_por, v_l.empresa_id,
      'RH devolveu um lancamento que voce validou',
      v_l.nome_snapshot || ': ' || TRIM(p_motivo), v_rota);
  END IF;

  -- Ninguem preencheu nem validou: e o caso da linha DISPENSADA, que chega ao
  -- RH sem valor. Quem a tirou da folha e quem precisa saber que o RH nao
  -- aceitou.
  IF v_l.preenchido_por IS NULL AND v_l.validado_por IS NULL THEN
    PERFORM public.fn_rh_notificar(
      v_l.dispensado_por, v_l.empresa_id,
      'RH devolveu um lancamento fora da folha',
      v_l.nome_snapshot || ': ' || TRIM(p_motivo), v_rota);
  END IF;

  RETURN v_l;
END;
$function$;

COMMIT;
