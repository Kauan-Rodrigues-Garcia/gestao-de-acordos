-- ============================================================================
-- RH Gestao — o fluxo: RPCs de transicao e RLS
-- ============================================================================
--
-- ## Por que TUDO passa por RPC
--
-- Cada passo do fluxo mexe em varias linhas e precisa de todas ou de nenhuma:
-- concluir uma equipe congela o percentual de N operadores E muda o status dos
-- N; devolver uma equipe reabre N linhas E escreve N eventos. Um UPDATE do
-- cliente faria isso em pedacos, e uma falha no meio deixaria metade da equipe
-- num estado e metade no outro.
--
-- Ha um segundo motivo, e ele e o pedido: "nao confiar somente em esconder
-- botoes no frontend". Cada RPC confere a permissao, o escopo e o ESTADO ATUAL
-- antes de agir. Chamar a funcao direto pelo Supabase, com o id de outra
-- equipe, encontra a mesma recusa que a tela encontraria.
--
-- ## Concorrencia: quem decide primeiro, decide
--
-- Lider, gerente e RH atuam ao mesmo tempo. Toda RPC trava as linhas alvo com
-- `FOR UPDATE` e confere o status ESPERADO antes de escrever. A segunda
-- chamada encontra o estado ja mudado e recusa com uma frase — em vez de
-- sobrescrever a decisao de quem chegou primeiro com dados de uma tela que
-- carregou ha cinco minutos.
--
-- ## RLS: ler e uma coisa, decidir e outra
--
-- As policies liberam LEITURA pelo escopo do painel (`fn_rh_lancamento_visivel`).
-- Escrita direta nao existe para ninguem: as tabelas do fluxo nao tem policy de
-- INSERT/UPDATE/DELETE. Quem escreve sao estas funcoes, que sao SECURITY
-- DEFINER e conferem tudo antes.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ── A aba entra no registro de escopo do banco ──────────────────────────────
-- Espelha ABAS_COM_ESCOPO de src/lib/permissoes-escopo.ts. Sem esta linha,
-- `fn_user_escopo('rh')` devolveria -1 para todo mundo, em silencio.
CREATE OR REPLACE FUNCTION public.fn_abas_escopo()
RETURNS TABLE(aba TEXT, chave_aba TEXT)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  VALUES
    ('dashboard',        NULL::TEXT),
    ('acordos',          'ver_acordos'),
    ('lixeira',          'ver_lixeira'),
    ('pix',              'ver_pix_automatico'),
    ('painel_lider',     'ver_painel_lider'),
    ('painel_diretoria', 'ver_painel_diretoria'),
    ('analitico',        'ver_analitico'),
    ('usuarios',         'ver_usuarios'),
    ('rh',               'ver_rh_gestao');
$function$;

COMMENT ON FUNCTION public.fn_abas_escopo() IS
  'Abas com escopo proprio. Espelha ABAS_COM_ESCOPO de permissoes-escopo.ts. '
  'chave_aba NULL = aba sem interruptor (o Dashboard, que e a rota /).';

-- ── Permissao do modulo ─────────────────────────────────────────────────────
--
-- Duas condicoes, sempre: a aba precisa estar aberta para o cargo (senao o
-- escopo devolve -1) E a chave da acao precisa estar ligada. Ligar
-- `rh_aprovar` em quem nao enxerga a aba seria dar um poder que nao tem onde
-- ser exercido — o defeito que o painel 2.0 existe para nao repetir.

CREATE OR REPLACE FUNCTION public.fn_rh_pode(p_chave TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT public.fn_user_is_super_admin()
      OR (public.fn_user_escopo('rh') >= 1 AND public.fn_user_tem(p_chave));
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_pode(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_pode(TEXT) TO authenticated;

-- ── Guarda: a competencia esta aberta? ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_rh_exigir_aberto(p_fechamento_id UUID)
RETURNS public.rh_fechamentos
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_f public.rh_fechamentos;
BEGIN
  SELECT * INTO v_f FROM public.rh_fechamentos WHERE id = p_fechamento_id;
  IF v_f.id IS NULL THEN
    RAISE EXCEPTION 'RH_FECHAMENTO_INEXISTENTE: competencia nao encontrada.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.fn_can_access_empresa(v_f.empresa_id) THEN
    RAISE EXCEPTION 'RH_EMPRESA: esta competencia e de outra empresa.'
      USING ERRCODE = '42501';
  END IF;
  IF v_f.status = 'finalizado' THEN
    RAISE EXCEPTION
      'RH_COMPETENCIA_FINALIZADA: a competencia ja foi finalizada. Reabra antes de alterar.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_f;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_exigir_aberto(UUID) FROM PUBLIC;

-- ============================================================================
-- Competencia
-- ============================================================================

/**
 * Abre a competencia e SEMEIA os lancamentos.
 *
 * Quem entra: operador ATIVO, nao arquivado, de um setor com configuracao de RH
 * ligada. O cargo nao filtra — um lider que tambem atende recebe premiacao como
 * qualquer um, e decidir isso por cargo aqui repetiria a mistura que o resto do
 * projeto esta desfazendo.
 *
 * Idempotente: chamar de novo numa competencia que ja existe ACRESCENTA quem
 * entrou depois (contratado no meio do mes) e nao toca em quem ja esta la. E o
 * que permite ao RH clicar "atualizar pessoas" sem medo de zerar valor digitado.
 */
CREATE OR REPLACE FUNCTION public.fn_rh_abrir_competencia(
  p_empresa_id   UUID,
  p_competencia  DATE,
  p_mes_apuracao DATE DEFAULT NULL,
  p_prazo        DATE DEFAULT NULL
)
RETURNS public.rh_fechamentos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_f      public.rh_fechamentos;
  v_comp   DATE := date_trunc('month', p_competencia)::DATE;
  v_apur   DATE := date_trunc('month', COALESCE(p_mes_apuracao, p_competencia - INTERVAL '1 month'))::DATE;
  v_nome   TEXT;
  v_novos  INTEGER;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'RH_EMPRESA: esta empresa nao e sua.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_rh_pode('rh_gerenciar_fechamento') THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode abrir competencia.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  INSERT INTO public.rh_fechamentos (
    empresa_id, competencia, mes_apuracao, prazo, aberto_por, aberto_por_nome
  ) VALUES (
    p_empresa_id, v_comp, v_apur, p_prazo, auth.uid(), v_nome
  )
  ON CONFLICT (empresa_id, competencia) DO UPDATE
    SET atualizado_em = NOW()
  RETURNING * INTO v_f;

  -- Semeadura. `ON CONFLICT DO NOTHING` e o que torna a chamada repetivel: quem
  -- ja tem linha (e talvez valor digitado) fica exatamente como esta.
  WITH elegiveis AS (
    SELECT
      p.id            AS operador_id,
      p.nome          AS nome,
      d.cracha        AS cracha,
      p.equipe_id     AS equipe_id,
      e.nome          AS equipe_nome,
      p.setor_id      AS setor_id,
      s.nome          AS setor_nome,
      c.nome          AS celula,
      cfg.tipo_remuneracao AS tipo
    FROM public.perfis p
    JOIN public.rh_config_setores cfg
      ON cfg.setor_id = p.setor_id AND cfg.empresa_id = p.empresa_id AND cfg.ativo
    JOIN public.setores    s ON s.id = p.setor_id
    JOIN public.rh_celulas c ON c.id = cfg.celula_id
    LEFT JOIN public.equipes e ON e.id = p.equipe_id
    LEFT JOIN public.rh_dados_operadores d
      ON d.operador_id = p.id AND d.empresa_id = p.empresa_id
    WHERE p.empresa_id = p_empresa_id
      AND p.ativo
      AND NOT p.arquivado
      AND COALESCE(p.situacao, 'ativo') = 'ativo'
      -- super_admin e conta de administracao, nao operador — mesma regra do
      -- resumo do analitico.
      AND p.perfil <> 'super_admin'
  )
  INSERT INTO public.rh_lancamentos (
    empresa_id, fechamento_id, operador_id,
    nome_snapshot, cracha_snapshot,
    equipe_id_snapshot, equipe_nome_snapshot,
    setor_id_snapshot, setor_nome_snapshot,
    celula_snapshot, tipo_remuneracao_snapshot
  )
  SELECT
    p_empresa_id, v_f.id, x.operador_id,
    x.nome, x.cracha,
    x.equipe_id, x.equipe_nome,
    x.setor_id, x.setor_nome,
    x.celula, x.tipo
  FROM elegiveis x
  ON CONFLICT (fechamento_id, operador_id) DO NOTHING;

  GET DIAGNOSTICS v_novos = ROW_COUNT;

  PERFORM public.fn_rh_evento(
    v_f.id, NULL, 'competencia', 'competencia_aberta',
    'Abriu a competencia ' || to_char(v_comp, 'MM/YYYY')
      || ' com ' || v_novos || ' operador(es)'
      || COALESCE(' e prazo ' || to_char(p_prazo, 'DD/MM/YYYY'), ' sem prazo definido'));

  RETURN v_f;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_abrir_competencia(UUID, DATE, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_abrir_competencia(UUID, DATE, DATE, DATE) TO authenticated;

/**
 * Define ou prorroga o prazo.
 *
 * Motivo OBRIGATORIO quando ja havia prazo: mudar a data depois que os gestores
 * se organizaram por ela e uma decisao, nao um ajuste. Definir o prazo pela
 * primeira vez nao precisa de motivo — nao ha o que justificar.
 */
CREATE OR REPLACE FUNCTION public.fn_rh_definir_prazo(
  p_fechamento_id UUID, p_prazo DATE, p_motivo TEXT DEFAULT NULL
)
RETURNS public.rh_fechamentos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_f      public.rh_fechamentos;
  v_antes  DATE;
BEGIN
  PERFORM public.fn_rh_exigir_aberto(p_fechamento_id);
  IF NOT public.fn_rh_pode('rh_gerenciar_fechamento') THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode alterar o prazo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_f FROM public.rh_fechamentos WHERE id = p_fechamento_id FOR UPDATE;
  v_antes := v_f.prazo;

  IF v_antes IS NOT NULL AND v_antes IS DISTINCT FROM p_prazo
     AND COALESCE(TRIM(p_motivo), '') = '' THEN
    RAISE EXCEPTION
      'RH_MOTIVO_OBRIGATORIO: informe o motivo para alterar um prazo ja publicado.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.rh_fechamentos
     SET prazo = p_prazo, atualizado_em = NOW()
   WHERE id = p_fechamento_id
  RETURNING * INTO v_f;

  PERFORM public.fn_rh_evento(
    p_fechamento_id, NULL, 'competencia',
    CASE WHEN v_antes IS NULL THEN 'prazo_definido' ELSE 'prazo_alterado' END,
    CASE WHEN v_antes IS NULL
         THEN 'Definiu o prazo em ' || to_char(p_prazo, 'DD/MM/YYYY')
         ELSE 'Alterou o prazo de ' || to_char(v_antes, 'DD/MM/YYYY')
              || ' para ' || COALESCE(to_char(p_prazo, 'DD/MM/YYYY'), 'sem prazo')
    END,
    p_motivo);

  RETURN v_f;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_definir_prazo(UUID, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_definir_prazo(UUID, DATE, TEXT) TO authenticated;

-- ============================================================================
-- Lancamento
-- ============================================================================

/**
 * Preenche ou corrige o valor de um operador.
 *
 * Aceita nos estados em que o valor ainda e do preenchedor: `pendente`,
 * `preenchido` e `devolvido_rh`. Corrigir um devolvido devolve a linha para
 * `preenchido` — e dai ela refaz o caminho inteiro, passando pela gerencia de
 * novo. E o requisito 18: correcao de lider nao altera em silencio algo que a
 * gerencia ja tinha validado.
 *
 * `validado_gerencia` e `enviado_rh` NAO aceitam: mudar o valor por baixo de uma
 * conferencia ja feita e o que a devolucao existe para evitar.
 */
CREATE OR REPLACE FUNCTION public.fn_rh_salvar_lancamento(
  p_lancamento_id UUID, p_valor NUMERIC, p_observacao TEXT DEFAULT NULL
)
RETURNS public.rh_lancamentos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_l     public.rh_lancamentos;
  v_antes NUMERIC(12,2);
  v_nome  TEXT;
BEGIN
  SELECT * INTO v_l FROM public.rh_lancamentos WHERE id = p_lancamento_id FOR UPDATE;
  IF v_l.id IS NULL THEN
    RAISE EXCEPTION 'RH_LANCAMENTO_INEXISTENTE: registro nao encontrado — recarregue a tela.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_rh_exigir_aberto(v_l.fechamento_id);

  IF NOT public.fn_rh_pode('rh_preencher') THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode preencher premiacao.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_rh_lancamento_visivel(
       v_l.empresa_id, v_l.setor_id_snapshot, v_l.equipe_id_snapshot) THEN
    RAISE EXCEPTION 'RH_FORA_DO_ESCOPO: este operador nao esta sob sua responsabilidade.'
      USING ERRCODE = '42501';
  END IF;
  -- `concluido_lider` tambem aceita: corrigir depois de concluir e legitimo, e o
  -- efeito e voltar a linha para `preenchido` — a equipe deixa de estar concluida
  -- e o lider precisa concluir de novo. Isso e visivel, e e o ponto: uma correcao
  -- depois da conclusao nao pode passar despercebida pela gerencia.
  IF v_l.status NOT IN ('pendente', 'preenchido', 'concluido_lider', 'devolvido_rh') THEN
    RAISE EXCEPTION
      'RH_ESTADO_INVALIDO: o lancamento de % esta como "%" e nao pode ser editado agora.',
      v_l.nome_snapshot, v_l.status USING ERRCODE = 'check_violation';
  END IF;
  IF p_valor IS NULL OR p_valor < 0 THEN
    RAISE EXCEPTION 'RH_VALOR_INVALIDO: informe um valor maior ou igual a zero.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  v_antes := v_l.valor;

  UPDATE public.rh_lancamentos
     SET valor = ROUND(p_valor, 2),
         observacao = NULLIF(TRIM(p_observacao), ''),
         status = 'preenchido',
         -- Corrigir um devolvido limpa a marca da devolucao: a pendencia foi
         -- tratada, e manter o motivo faria a linha continuar parecendo com erro.
         devolucao_escopo = NULL,
         motivo_devolucao = NULL,
         preenchido_por = auth.uid(),
         preenchido_por_nome = v_nome,
         preenchido_em = NOW(),
         atualizado_em = NOW()
   WHERE id = p_lancamento_id
  RETURNING * INTO v_l;

  PERFORM public.fn_rh_evento(
    v_l.fechamento_id, v_l.id, 'operador',
    CASE WHEN v_antes IS NULL THEN 'valor_informado' ELSE 'valor_alterado' END,
    CASE WHEN v_antes IS NULL
         THEN 'Informou R$ ' || public.fn_pix_valor_br(v_l.valor) || ' para ' || v_l.nome_snapshot
         ELSE 'Alterou o valor de ' || v_l.nome_snapshot
              || ': R$ ' || public.fn_pix_valor_br(v_antes)
              || ' -> R$ ' || public.fn_pix_valor_br(v_l.valor)
    END,
    NULL, v_antes, v_l.valor, v_l.setor_id_snapshot, v_l.equipe_id_snapshot);

  RETURN v_l;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_salvar_lancamento(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_salvar_lancamento(UUID, NUMERIC, TEXT) TO authenticated;

/**
 * Congela o percentual, a meta e o recebido de um lancamento.
 *
 * O numero vem do CLIENTE, e isso e deliberado: `calcularProjecao`
 * (`src/lib/projecaoMetas.ts`) e a unica definicao de "181%" no projeto, e
 * reescreve-la em SQL criaria um segundo resultado para a mesma pergunta.
 *
 * O banco nao confia cegamente: so aceita gravar enquanto o lancamento ainda
 * esta em maos de quem preenche, e recusa depois que a gerencia validou — a
 * fotografia que a gerencia conferiu nao pode ser trocada por baixo.
 */
CREATE OR REPLACE FUNCTION public.fn_rh_congelar_percentual(
  p_lancamento_id UUID,
  p_percentual NUMERIC, p_meta NUMERIC, p_recebido NUMERIC
)
RETURNS public.rh_lancamentos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_l public.rh_lancamentos;
BEGIN
  SELECT * INTO v_l FROM public.rh_lancamentos WHERE id = p_lancamento_id FOR UPDATE;
  IF v_l.id IS NULL THEN
    RAISE EXCEPTION 'RH_LANCAMENTO_INEXISTENTE: registro nao encontrado.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_rh_exigir_aberto(v_l.fechamento_id);

  IF NOT public.fn_rh_pode('rh_preencher') THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode alterar este lancamento.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_rh_lancamento_visivel(
       v_l.empresa_id, v_l.setor_id_snapshot, v_l.equipe_id_snapshot) THEN
    RAISE EXCEPTION 'RH_FORA_DO_ESCOPO: este operador nao esta sob sua responsabilidade.'
      USING ERRCODE = '42501';
  END IF;
  IF v_l.status NOT IN ('pendente', 'preenchido', 'concluido_lider', 'devolvido_rh') THEN
    RAISE EXCEPTION
      'RH_ESTADO_INVALIDO: o percentual de % ja foi conferido e nao pode ser recalculado.',
      v_l.nome_snapshot USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.rh_lancamentos
     SET percentual_snapshot = ROUND(p_percentual, 2),
         meta_snapshot       = ROUND(p_meta, 2),
         recebido_snapshot   = ROUND(p_recebido, 2),
         atualizado_em       = NOW()
   WHERE id = p_lancamento_id
  RETURNING * INTO v_l;

  RETURN v_l;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_congelar_percentual(UUID, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_congelar_percentual(UUID, NUMERIC, NUMERIC, NUMERIC) TO authenticated;

-- ============================================================================
-- Transicoes de equipe e setor
-- ============================================================================

/**
 * O lider conclui a equipe.
 *
 * NAO se chama "aprovar": aprovacao e o que a gerencia e o RH fazem depois, e
 * usar a mesma palavra em tres etapas diferentes e o caminho mais curto para
 * alguem achar que ja acabou.
 *
 * Recusa com a lista de nomes quando falta valor. Um "concluido" silencioso com
 * tres pendentes dentro e o defeito que o requisito 8 descreve.
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

  -- Trava a equipe inteira antes de decidir. Sem isto, dois lideres da mesma
  -- equipe concluindo ao mesmo tempo passariam os dois pela conferencia de
  -- pendencia e escreveriam dois conjuntos de eventos.
  PERFORM 1 FROM public.rh_lancamentos
   WHERE fechamento_id = p_fechamento_id AND equipe_id_snapshot = p_equipe_id
     FOR UPDATE;

  SELECT string_agg(l.nome_snapshot, ', ' ORDER BY l.nome_snapshot)
    INTO v_pendentes
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id
     AND l.equipe_id_snapshot = p_equipe_id
     AND l.valor IS NULL;

  IF v_pendentes IS NOT NULL THEN
    RAISE EXCEPTION
      'RH_PENDENTES: ainda falta preencher: %', v_pendentes
      USING ERRCODE = 'check_violation';
  END IF;

  /*
   * Devolucao aberta tambem trava a conclusao.
   *
   * Um devolvido quase sempre TEM valor — foi o valor que o RH questionou —,
   * entao a conferencia de campo vazio acima nao o pegaria. Sem esta segunda,
   * concluir "daria certo" deixando a linha devolvida para tras, a equipe
   * continuaria com pendencia e o lider clicaria de novo sem entender.
   */
  SELECT string_agg(l.nome_snapshot, ', ' ORDER BY l.nome_snapshot)
    INTO v_pendentes
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id
     AND l.equipe_id_snapshot = p_equipe_id
     AND l.status = 'devolvido_rh';

  IF v_pendentes IS NOT NULL THEN
    RAISE EXCEPTION
      'RH_PENDENTES: ainda ha devolucao do RH sem correcao: %', v_pendentes
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT MIN(l.setor_id_snapshot), MIN(l.equipe_nome_snapshot)
    INTO v_setor, v_equipe
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id AND l.equipe_id_snapshot = p_equipe_id;

  IF v_setor IS NULL THEN
    RAISE EXCEPTION 'RH_EQUIPE_VAZIA: esta equipe nao tem operadores nesta competencia.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Escopo conferido sobre a equipe de verdade, e nao sobre o id recebido:
  -- passar o id de outra equipe na requisicao cai aqui.
  IF NOT public.fn_rh_lancamento_visivel(
       public.fn_user_empresa_id(), v_setor, p_equipe_id) THEN
    RAISE EXCEPTION 'RH_FORA_DO_ESCOPO: esta equipe nao esta sob sua lideranca.'
      USING ERRCODE = '42501';
  END IF;

  -- So o que esta em maos do lider avanca. Uma linha ja validada ou no RH fica
  -- onde esta: concluir de novo nao pode puxar para tras o que ja seguiu.
  UPDATE public.rh_lancamentos
     SET status = 'concluido_lider', atualizado_em = NOW()
   WHERE fechamento_id = p_fechamento_id
     AND equipe_id_snapshot = p_equipe_id
     AND status IN ('pendente', 'preenchido');

  SELECT COUNT(*) INTO v_qtd FROM public.rh_lancamentos
   WHERE fechamento_id = p_fechamento_id AND equipe_id_snapshot = p_equipe_id;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  PERFORM public.fn_rh_evento(
    p_fechamento_id, NULL, 'equipe', 'equipe_concluida',
    'Concluiu a equipe ' || COALESCE(v_equipe, '—') || ' com ' || v_qtd || ' operador(es)',
    NULL, NULL, NULL, v_setor, p_equipe_id);

  RETURN v_qtd;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_concluir_equipe(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_concluir_equipe(UUID, UUID) TO authenticated;

/** A gerencia valida a equipe: `preenchido` -> `validado_gerencia`. */
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
   WHERE fechamento_id = p_fechamento_id AND equipe_id_snapshot = p_equipe_id
     FOR UPDATE;

  SELECT MIN(l.setor_id_snapshot), MIN(l.equipe_nome_snapshot)
    INTO v_setor, v_equipe
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id AND l.equipe_id_snapshot = p_equipe_id;

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
     AND l.equipe_id_snapshot = p_equipe_id
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
     AND equipe_id_snapshot = p_equipe_id
     AND status = 'concluido_lider';

  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  PERFORM public.fn_rh_evento(
    p_fechamento_id, NULL, 'equipe', 'equipe_validada',
    'Validou a equipe ' || COALESCE(v_equipe, '—') || ' (' || v_qtd || ' operador(es))',
    NULL, NULL, NULL, v_setor, p_equipe_id);

  RETURN v_qtd;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_validar_equipe(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_validar_equipe(UUID, UUID) TO authenticated;

/**
 * A gerencia envia um SETOR ao RH: `validado_gerencia` -> `enviado_rh`.
 *
 * Envia-se o setor, e nao a equipe, porque e o setor que o RH conferencia na
 * visao consolidada. Exige todas as equipes do setor validadas — enviar metade
 * de um setor deixaria o RH com um numero que ainda vai mudar.
 */
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

  SELECT MIN(l.setor_nome_snapshot), MIN(l.empresa_id) INTO v_setor, v_emp
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

REVOKE ALL ON FUNCTION public.fn_rh_enviar_setor(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_enviar_setor(UUID, UUID) TO authenticated;

-- ============================================================================
-- Decisao do RH
-- ============================================================================

/** Aprova um operador. `enviado_rh` -> `aprovado_rh`. */
CREATE OR REPLACE FUNCTION public.fn_rh_aprovar_operador(p_lancamento_id UUID)
RETURNS public.rh_lancamentos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_l    public.rh_lancamentos;
  v_nome TEXT;
BEGIN
  SELECT * INTO v_l FROM public.rh_lancamentos WHERE id = p_lancamento_id FOR UPDATE;
  IF v_l.id IS NULL THEN
    RAISE EXCEPTION 'RH_LANCAMENTO_INEXISTENTE: registro nao encontrado.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_rh_exigir_aberto(v_l.fechamento_id);

  IF NOT public.fn_rh_pode('rh_aprovar') THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode aprovar.' USING ERRCODE = '42501';
  END IF;
  IF v_l.status <> 'enviado_rh' THEN
    RAISE EXCEPTION
      'RH_ESTADO_INVALIDO: % esta como "%" — so o que foi enviado ao RH pode ser aprovado.',
      v_l.nome_snapshot, v_l.status USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.rh_lancamentos
     SET status = 'aprovado_rh',
         decidido_por = auth.uid(), decidido_por_nome = v_nome,
         decidido_em = NOW(), atualizado_em = NOW(),
         devolucao_escopo = NULL, motivo_devolucao = NULL
   WHERE id = p_lancamento_id
  RETURNING * INTO v_l;

  PERFORM public.fn_rh_evento(
    v_l.fechamento_id, v_l.id, 'operador', 'aprovado',
    'Aprovou ' || v_l.nome_snapshot || ' — R$ ' || public.fn_pix_valor_br(v_l.valor),
    NULL, NULL, v_l.valor, v_l.setor_id_snapshot, v_l.equipe_id_snapshot);

  RETURN v_l;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_aprovar_operador(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_aprovar_operador(UUID) TO authenticated;

/** Aprova de uma vez os enviados de uma equipe. Atalho, mesma regra por linha. */
CREATE OR REPLACE FUNCTION public.fn_rh_aprovar_equipe(
  p_fechamento_id UUID, p_equipe_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_qtd    INTEGER := 0;
  v_id     UUID;
BEGIN
  FOR v_id IN
    SELECT l.id FROM public.rh_lancamentos l
     WHERE l.fechamento_id = p_fechamento_id
       AND l.equipe_id_snapshot = p_equipe_id
       AND l.status = 'enviado_rh'
     ORDER BY l.nome_snapshot
  LOOP
    PERFORM public.fn_rh_aprovar_operador(v_id);
    v_qtd := v_qtd + 1;
  END LOOP;

  RETURN v_qtd;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_aprovar_equipe(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_aprovar_equipe(UUID, UUID) TO authenticated;

/**
 * Devolve UM operador. Motivo obrigatorio.
 *
 * Os demais da equipe nao sao tocados — e o requisito 15, e a razao de o estado
 * de equipe ser derivado: nao existe um `status` de equipe para "reprovar" por
 * engano junto.
 *
 * Notifica quem preencheu e quem validou: os dois precisam saber, e o gerente e
 * quem vai conferir de novo depois da correcao.
 */
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

  RETURN v_l;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_devolver_operador(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_devolver_operador(UUID, TEXT) TO authenticated;

/**
 * Devolve a EQUIPE inteira. Motivo obrigatorio.
 *
 * As outras equipes ja aprovadas nao perdem o estado — o UPDATE recorta pela
 * equipe, e nada aqui olha para o setor.
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
   WHERE fechamento_id = p_fechamento_id AND equipe_id_snapshot = p_equipe_id
     FOR UPDATE;

  SELECT MIN(l.setor_id_snapshot), MIN(l.equipe_nome_snapshot), MIN(l.empresa_id)
    INTO v_setor, v_equipe, v_emp
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id AND l.equipe_id_snapshot = p_equipe_id;

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
     AND equipe_id_snapshot = p_equipe_id
     AND status IN ('enviado_rh', 'aprovado_rh');

  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  IF v_qtd = 0 THEN
    RAISE EXCEPTION
      'RH_ESTADO_INVALIDO: nenhum lancamento desta equipe chegou ao RH — nao ha o que devolver.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_rh_evento(
    p_fechamento_id, NULL, 'equipe', 'devolvido_equipe',
    'Devolveu a equipe ' || COALESCE(v_equipe, '—') || ' (' || v_qtd || ' operador(es))',
    p_motivo, NULL, NULL, v_setor, p_equipe_id);

  v_rota := '/rh-gestao?fechamento=' || p_fechamento_id || '&equipe=' || p_equipe_id;

  -- Uma notificacao por PESSOA responsavel, e nao uma por lancamento: seis
  -- avisos identicos no sino nao dizem mais do que um.
  FOR v_alvo IN
    SELECT DISTINCT alvo FROM (
      SELECT preenchido_por AS alvo FROM public.rh_lancamentos
       WHERE fechamento_id = p_fechamento_id AND equipe_id_snapshot = p_equipe_id
      UNION
      SELECT validado_por FROM public.rh_lancamentos
       WHERE fechamento_id = p_fechamento_id AND equipe_id_snapshot = p_equipe_id
    ) x WHERE alvo IS NOT NULL
  LOOP
    PERFORM public.fn_rh_notificar(
      v_alvo.alvo, v_emp,
      'RH devolveu a equipe ' || COALESCE(v_equipe, ''),
      'Motivo: ' || TRIM(p_motivo), v_rota);
  END LOOP;

  RETURN v_qtd;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_devolver_equipe(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_devolver_equipe(UUID, UUID, TEXT) TO authenticated;

-- ============================================================================
-- Finalizacao e reabertura
-- ============================================================================

/** Finaliza a competencia. Exige tudo aprovado. */
CREATE OR REPLACE FUNCTION public.fn_rh_finalizar_competencia(p_fechamento_id UUID)
RETURNS public.rh_fechamentos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_f    public.rh_fechamentos;
  v_fora TEXT;
  v_nome TEXT;
BEGIN
  PERFORM public.fn_rh_exigir_aberto(p_fechamento_id);

  IF NOT public.fn_rh_pode('rh_gerenciar_fechamento') THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode finalizar a competencia.'
      USING ERRCODE = '42501';
  END IF;

  SELECT string_agg(DISTINCT l.status, ', ') INTO v_fora
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id AND l.status <> 'aprovado_rh';

  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION
      'RH_ESTADO_INVALIDO: ainda ha lancamento em "%" — finalize so com tudo aprovado.',
      v_fora USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.rh_fechamentos
     SET status = 'finalizado',
         finalizado_por = auth.uid(), finalizado_por_nome = v_nome,
         finalizado_em = NOW(), atualizado_em = NOW()
   WHERE id = p_fechamento_id
  RETURNING * INTO v_f;

  PERFORM public.fn_rh_evento(
    p_fechamento_id, NULL, 'competencia', 'competencia_finalizada',
    'Finalizou a competencia ' || to_char(v_f.competencia, 'MM/YYYY'));

  RETURN v_f;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_finalizar_competencia(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_finalizar_competencia(UUID) TO authenticated;

/**
 * Reabre uma competencia finalizada. Motivo obrigatorio.
 *
 * Mesmo desenho da reabertura de meta (`fn_metas_reabrir_setor`): reabrir e
 * desfazer um fato ja publicado, entao exige permissao propria e deixa rastro.
 */
CREATE OR REPLACE FUNCTION public.fn_rh_reabrir_competencia(
  p_fechamento_id UUID, p_motivo TEXT
)
RETURNS public.rh_fechamentos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_f    public.rh_fechamentos;
  v_nome TEXT;
BEGIN
  IF COALESCE(TRIM(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'RH_MOTIVO_OBRIGATORIO: informe o motivo da reabertura.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_f FROM public.rh_fechamentos WHERE id = p_fechamento_id FOR UPDATE;
  IF v_f.id IS NULL THEN
    RAISE EXCEPTION 'RH_FECHAMENTO_INEXISTENTE: competencia nao encontrada.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.fn_can_access_empresa(v_f.empresa_id) THEN
    RAISE EXCEPTION 'RH_EMPRESA: esta competencia e de outra empresa.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_rh_pode('rh_reabrir_fechamento') THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode reabrir competencia.'
      USING ERRCODE = '42501';
  END IF;
  IF v_f.status <> 'finalizado' THEN
    RAISE EXCEPTION 'RH_ESTADO_INVALIDO: esta competencia nao esta finalizada.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.rh_fechamentos
     SET status = 'aberto', finalizado_por = NULL, finalizado_por_nome = NULL,
         finalizado_em = NULL, atualizado_em = NOW()
   WHERE id = p_fechamento_id
  RETURNING * INTO v_f;

  PERFORM public.fn_rh_evento(
    p_fechamento_id, NULL, 'competencia', 'competencia_reaberta',
    'Reabriu a competencia ' || to_char(v_f.competencia, 'MM/YYYY'), p_motivo);

  RETURN v_f;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_reabrir_competencia(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_reabrir_competencia(UUID, TEXT) TO authenticated;

-- ============================================================================
-- Cracha
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_rh_salvar_cracha(
  p_empresa_id UUID, p_operador_id UUID, p_cracha TEXT
)
RETURNS public.rh_dados_operadores
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_d    public.rh_dados_operadores;
  v_nome TEXT;
  v_op   RECORD;
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

  RETURN v_d;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_salvar_cracha(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_salvar_cracha(UUID, UUID, TEXT) TO authenticated;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.rh_celulas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_config_setores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_dados_operadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_fechamentos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_lancamentos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_eventos          ENABLE ROW LEVEL SECURITY;

-- Celulas e configuracao: qualquer pessoa COM A ABA le, porque e o que rotula
-- a tela. Escrever exige a chave de configuracao.
DROP POLICY IF EXISTS rh_celulas_select ON public.rh_celulas;
CREATE POLICY rh_celulas_select ON public.rh_celulas FOR SELECT TO authenticated
USING ((SELECT public.fn_can_access_empresa(empresa_id))
       AND (SELECT public.fn_user_escopo('rh')) >= 1);

DROP POLICY IF EXISTS rh_celulas_write ON public.rh_celulas;
CREATE POLICY rh_celulas_write ON public.rh_celulas FOR ALL TO authenticated
USING ((SELECT public.fn_can_access_empresa(empresa_id))
       AND (SELECT public.fn_rh_pode('rh_configurar')))
WITH CHECK ((SELECT public.fn_can_access_empresa(empresa_id))
       AND (SELECT public.fn_rh_pode('rh_configurar')));

DROP POLICY IF EXISTS rh_cfg_select ON public.rh_config_setores;
CREATE POLICY rh_cfg_select ON public.rh_config_setores FOR SELECT TO authenticated
USING ((SELECT public.fn_can_access_empresa(empresa_id))
       AND (SELECT public.fn_user_escopo('rh')) >= 1);

DROP POLICY IF EXISTS rh_cfg_write ON public.rh_config_setores;
CREATE POLICY rh_cfg_write ON public.rh_config_setores FOR ALL TO authenticated
USING ((SELECT public.fn_can_access_empresa(empresa_id))
       AND (SELECT public.fn_rh_pode('rh_configurar')))
WITH CHECK ((SELECT public.fn_can_access_empresa(empresa_id))
       AND (SELECT public.fn_rh_pode('rh_configurar')));

/*
 * O CRACHA e o dado mais restrito do modulo.
 *
 * Le quem enxerga aquela pessoa no escopo do RH — e a propria pessoa, que tem
 * direito ao proprio numero. Nao ha policy de escrita: o caminho e
 * `fn_rh_salvar_cracha`, que confere escopo antes.
 *
 * ## Por que a resolucao passa por uma funcao, e nao por subconsulta na policy
 *
 * O setor e a equipe da pessoa moram em `perfis`, que TAMBEM tem RLS. Uma
 * subconsulta escrita dentro da policy roda com os privilegios de quem le, e o
 * operador so enxerga a propria linha de `perfis` — entao a subconsulta
 * devolveria NULL para todo mundo menos ele, e o lider nao veria cracha nenhum.
 *
 * Falharia FECHADO, o que e o lado seguro do erro, mas continuaria sendo um
 * recurso que nao funciona. `fn_rh_cracha_visivel` e SECURITY DEFINER: le o
 * perfil sem o recorte e faz a pergunta de escopo uma vez so.
 */
CREATE OR REPLACE FUNCTION public.fn_rh_cracha_visivel(
  p_empresa_id UUID, p_operador_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.fn_rh_lancamento_visivel(p_empresa_id, p.setor_id, p.equipe_id)
    FROM public.perfis p
   WHERE p.id = p_operador_id;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_cracha_visivel(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_cracha_visivel(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_rh_cracha_visivel(UUID, UUID) IS
  'O cracha desta pessoa esta no meu escopo de RH? SECURITY DEFINER porque '
  'precisa ler setor e equipe em perfis, que tem RLS propria.';

DROP POLICY IF EXISTS rh_cracha_select ON public.rh_dados_operadores;
CREATE POLICY rh_cracha_select ON public.rh_dados_operadores FOR SELECT TO authenticated
USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    operador_id = (SELECT auth.uid())
    OR public.fn_rh_cracha_visivel(empresa_id, operador_id)
  )
);

-- Fechamento: quem tem a aba enxerga a competencia. Escrita so por RPC.
DROP POLICY IF EXISTS rh_fech_select ON public.rh_fechamentos;
CREATE POLICY rh_fech_select ON public.rh_fechamentos FOR SELECT TO authenticated
USING ((SELECT public.fn_can_access_empresa(empresa_id))
       AND (SELECT public.fn_user_escopo('rh')) >= 1);

-- Lancamento: o escopo do painel decide, e a funcao unica evita divergencia.
DROP POLICY IF EXISTS rh_lanc_select ON public.rh_lancamentos;
CREATE POLICY rh_lanc_select ON public.rh_lancamentos FOR SELECT TO authenticated
USING (public.fn_rh_lancamento_visivel(empresa_id, setor_id_snapshot, equipe_id_snapshot));

COMMENT ON POLICY rh_lanc_select ON public.rh_lancamentos IS
  'Leitura pelo escopo da aba RH, tal como o painel diz. Escrita nao tem policy: '
  'passa toda pelas RPCs fn_rh_*, que conferem permissao, escopo e estado.';

-- Eventos: quem ve o lancamento ve a trilha dele. Append-only.
DROP POLICY IF EXISTS rh_ev_select ON public.rh_eventos;
CREATE POLICY rh_ev_select ON public.rh_eventos FOR SELECT TO authenticated
USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    -- Evento de competencia/setor: quem tem alcance de setor para cima.
    ((SELECT public.fn_user_escopo('rh')) >= 2 AND lancamento_id IS NULL)
    OR EXISTS (
      SELECT 1 FROM public.rh_lancamentos l
       WHERE l.id = rh_eventos.lancamento_id
         AND public.fn_rh_lancamento_visivel(l.empresa_id, l.setor_id_snapshot, l.equipe_id_snapshot)
    )
    OR (SELECT public.fn_user_escopo('rh')) >= 3
  )
);

-- ── Auditoria geral ─────────────────────────────────────────────────────────
-- A trilha do modulo responde "o que aconteceu neste fechamento"; a do sistema
-- responde "quem mexeu nesta linha". As duas, porque e dinheiro.
DROP TRIGGER IF EXISTS trg_log_rh_lancamentos ON public.rh_lancamentos;
CREATE TRIGGER trg_log_rh_lancamentos
AFTER INSERT OR DELETE OR UPDATE ON public.rh_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria(
  'financeiro', 'rh_lancamento', 'o lancamento de premiacao',
  'nome_snapshot', 'atualizado_em', 'empresa_id', 'aviso');

DROP TRIGGER IF EXISTS trg_log_rh_fechamentos ON public.rh_fechamentos;
CREATE TRIGGER trg_log_rh_fechamentos
AFTER INSERT OR DELETE OR UPDATE ON public.rh_fechamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria(
  'financeiro', 'rh_fechamento', 'a competencia do RH',
  'competencia', 'atualizado_em', 'empresa_id', 'critico');

DROP TRIGGER IF EXISTS trg_log_rh_config ON public.rh_config_setores;
CREATE TRIGGER trg_log_rh_config
AFTER INSERT OR DELETE OR UPDATE ON public.rh_config_setores
FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria(
  'configuracao', 'rh_config_setor', 'a configuracao de RH do setor',
  '', 'atualizado_em', 'empresa_id', 'aviso');

COMMIT;
