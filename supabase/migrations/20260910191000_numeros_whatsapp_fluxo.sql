-- ============================================================================
-- Controle de Numeros de WhatsApp — o fluxo e a RLS
-- ============================================================================
--
-- A migration anterior (20260910190000) criou as tabelas e ligou a RLS SEM
-- policy nenhuma. Esta acrescenta as policies e as cinco transicoes.
--
-- ## Por que as transicoes sao RPC, e o cadastro nao
--
-- Cadastrar celular e numero e `INSERT` comum sob RLS: a pergunta e so "voce
-- pode?", e a policy responde.
--
-- As TRANSICOES sao outra coisa. Cada uma precisa, na mesma transacao:
--
--   1. conferir quem chama (permissao E alcance),
--   2. conferir o estado de origem (nao adianta liberar o que ja foi liberado),
--   3. mexer em duas ou tres colunas juntas,
--   4. gravar a movimentacao.
--
-- Nada disso pode depender de o cliente lembrar de fazer o passo 4. Uma tela
-- que esqueca a movimentacao produz exatamente o que o pedido proibiu: o estado
-- atual no lugar do historico.
--
-- ## O cadastro grava historico por GATILHO, nao por chamada
--
-- Pelo mesmo motivo. `trg_numeros_registra_cadastro` dispara depois do INSERT,
-- entao a primeira linha da trilha existe mesmo que o INSERT venha do SQL
-- Editor, de um script, ou de uma tela futura que ninguem escreveu ainda.
--
-- ## Quem altera situacao e SO o Nucleo
--
-- A lideranca que ve um numero banido nao marca "banido": ela relanca com
-- motivo `banido`, e o Nucleo aplica a situacao ao tratar. E uma dona so para a
-- coluna — dois donos produzem dois numeros discordando sobre o mesmo fato, que
-- e o padrao de bug que este projeto passou dez migrations desfazendo.
--
-- ## Ordem de aplicacao
--
-- As chaves (`ver_controle_numeros`, `chips_*`, `numeros_*`) nascem na proxima
-- migration. Ate ela rodar, `fn_user_tem` devolve FALSE para todas (ausente
-- vale negado) e `fn_user_escopo('chips')` devolve -1 (aba desconhecida).
--
-- O efeito e desejado: com 1 e 2 aplicadas, o modulo existe e nao abre para
-- ninguem. Falha fechada nas duas janelas.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ============================================================================
-- Duas perguntas que se repetem
-- ============================================================================

-- ── Eu mando neste setor? ───────────────────────────────────────────────────
--
-- A lideranca, pela escada da aba. Duas RPCs e uma policy perguntam isso, e uma
-- funcao so evita que as tres divirjam com o tempo.

CREATE OR REPLACE FUNCTION public.fn_numeros_manda_no_setor(p_setor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.fn_user_is_super_admin()
      OR (public.fn_user_escopo('chips') >= 2
          AND p_setor_id IS NOT DISTINCT FROM public.fn_user_setor_id());
$function$;

REVOKE ALL ON FUNCTION public.fn_numeros_manda_no_setor(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_numeros_manda_no_setor(UUID) TO authenticated;

-- ── Este APARELHO esta no meu alcance? ──────────────────────────────────────
--
-- Pergunta diferente da do numero, e por isso funcao diferente.
--
-- O celular nao tem operador: ele pertence ao setor e pronto. Se a policy dele
-- usasse `fn_numeros_visivel` com operador nulo, o operador — que enxerga pelo
-- eixo individual — ficaria sem ler NENHUM aparelho, e a tela "Meus Chips" dele
-- nao conseguiria dizer em que celular esta o numero que ele recebeu.
--
-- O nome de um aparelho do proprio setor nao e informacao sensivel; os NUMEROS
-- dentro dele continuam filtrados um a um por `fn_numeros_visivel`.

CREATE OR REPLACE FUNCTION public.fn_numeros_celular_visivel(
  p_empresa_id UUID, p_setor_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.fn_can_access_empresa(p_empresa_id)
     AND (
       public.fn_user_is_super_admin()
       OR (public.fn_numeros_sou_do_nucleo(p_empresa_id)
           AND public.fn_user_tem('ver_controle_numeros'))
       -- Qualquer nivel da aba `chips`, dentro do proprio setor. -1 (aba
       -- fechada) nao passa.
       OR (public.fn_user_escopo('chips') >= 0
           AND p_setor_id IS NOT DISTINCT FROM public.fn_user_setor_id())
     );
$function$;

REVOKE ALL ON FUNCTION public.fn_numeros_celular_visivel(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_numeros_celular_visivel(UUID, UUID) TO authenticated;

-- ── O Nucleo administra? ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_nucleo_administra(p_empresa_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.fn_user_is_super_admin()
      OR (public.fn_numeros_sou_do_nucleo(p_empresa_id)
          AND public.fn_user_tem('ver_controle_numeros')
          AND public.fn_user_tem('numeros_administrar'));
$function$;

REVOKE ALL ON FUNCTION public.fn_numeros_nucleo_administra(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_numeros_nucleo_administra(UUID) TO authenticated;

-- ============================================================================
-- O cadastro entra na trilha por gatilho
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_numeros_registra_cadastro()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_numeros_movimentacao(
    p_numero_id        => NEW.id,
    p_tipo             => 'cadastro',
    p_setor_destino_id => NEW.setor_id,
    p_situacao_nova    => NEW.situacao
  );
  RETURN NULL;  -- AFTER trigger: o retorno e ignorado.
END;
$function$;

DROP TRIGGER IF EXISTS trg_numeros_registra_cadastro ON public.numeros_whatsapp;
CREATE TRIGGER trg_numeros_registra_cadastro
  AFTER INSERT ON public.numeros_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.fn_numeros_registra_cadastro();

-- ============================================================================
-- As cinco transicoes
-- ============================================================================

-- ── 1. O Nucleo libera ao setor ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_liberar_ao_setor(p_numero_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  n public.numeros_whatsapp%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.numeros_whatsapp WHERE id = p_numero_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numero nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.fn_numeros_sou_do_nucleo(n.empresa_id)
          AND public.fn_user_tem('numeros_liberar_ao_setor'))
     AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'Somente o Nucleo pode liberar numero ao setor.'
      USING ERRCODE = '42501';
  END IF;

  IF n.posse <> 'nucleo' THEN
    RAISE EXCEPTION 'Este numero ja esta com o setor.' USING ERRCODE = '22023';
  END IF;

  -- A regra do pedido: so numero pronto sai do Nucleo. Liberar o que ainda
  -- aquece entrega ao setor um numero que nao funciona, e ele volta.
  IF n.situacao <> 'ativo' THEN
    RAISE EXCEPTION
      'Só número ativo pode ser liberado. Este está como %.',
      public.fn_numeros_rotulo_situacao(n.situacao)
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.numeros_whatsapp
     SET posse = 'setor',
         -- O motivo do ultimo retorno morre aqui: ele foi tratado, e deixar
         -- pendurado faria a tela do setor mostrar "banido" num numero ativo.
         -- O historico guarda o que houve.
         motivo_retorno = NULL,
         observacao_retorno = NULL,
         atualizado_em = NOW()
   WHERE id = p_numero_id;

  PERFORM public.fn_numeros_movimentacao(
    p_numero_id        => p_numero_id,
    p_tipo             => 'liberado_ao_setor',
    p_setor_destino_id => n.setor_id,
    p_situacao_nova    => n.situacao
  );
END;
$function$;

-- ── 2. A lideranca lanca ao operador ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_lancar_ao_operador(
  p_numero_id UUID, p_operador_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  n            public.numeros_whatsapp%ROWTYPE;
  v_op_setor   UUID;
  v_op_empresa UUID;
  v_op_ativo   BOOLEAN;
BEGIN
  SELECT * INTO n FROM public.numeros_whatsapp WHERE id = p_numero_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numero nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_user_tem('chips_lancar_ao_operador')
     AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'Voce nao tem permissao para lancar numero a operador.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_numeros_manda_no_setor(n.setor_id) THEN
    RAISE EXCEPTION 'Este numero nao pertence ao seu setor.' USING ERRCODE = '42501';
  END IF;

  IF n.posse <> 'setor' THEN
    RAISE EXCEPTION
      'Este numero ainda nao foi liberado pelo Nucleo.' USING ERRCODE = '22023';
  END IF;

  IF n.situacao = 'banido' THEN
    RAISE EXCEPTION
      'Numero banido nao e lancado a operador. Relance ao Nucleo.'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.setor_id, p.empresa_id, p.ativo
    INTO v_op_setor, v_op_empresa, v_op_ativo
    FROM public.perfis p WHERE p.id = p_operador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operador nao encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_op_ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'Operador inativo.' USING ERRCODE = '22023';
  END IF;
  -- O isolamento por setor vale tambem para quem RECEBE: lancar para alguem de
  -- outro setor daria a essa pessoa um numero que ela nem enxerga.
  IF v_op_empresa IS DISTINCT FROM n.empresa_id
     OR v_op_setor IS DISTINCT FROM n.setor_id THEN
    RAISE EXCEPTION 'O operador precisa ser do mesmo setor do numero.'
      USING ERRCODE = '22023';
  END IF;

  IF n.operador_id IS NOT DISTINCT FROM p_operador_id THEN
    RAISE EXCEPTION 'Este numero ja esta com esta pessoa.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.numeros_whatsapp
     SET operador_id = p_operador_id,
         atualizado_em = NOW()
   WHERE id = p_numero_id;

  PERFORM public.fn_numeros_movimentacao(
    p_numero_id           => p_numero_id,
    p_tipo                => 'lancado_ao_operador',
    p_setor_origem_id     => n.setor_id,
    p_setor_destino_id    => n.setor_id,
    p_operador_origem_id  => n.operador_id,
    p_operador_destino_id => p_operador_id
  );
END;
$function$;

-- ── 3. O operador devolve a lideranca ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_devolver_a_lideranca(
  p_numero_id UUID, p_motivo TEXT, p_observacao TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  n      public.numeros_whatsapp%ROWTYPE;
  v_eu   UUID := (SELECT auth.uid());
BEGIN
  SELECT * INTO n FROM public.numeros_whatsapp WHERE id = p_numero_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numero nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_user_tem('chips_devolver_a_lideranca')
     AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'Voce nao tem permissao para devolver numero.'
      USING ERRCODE = '42501';
  END IF;

  -- So o dono devolve. O passo e curto de proposito: o operador nao precisa de
  -- ninguem quando o numero para de servir, e mesmo assim nada sai do setor.
  IF n.operador_id IS NULL OR n.operador_id IS DISTINCT FROM v_eu THEN
    RAISE EXCEPTION 'Este numero nao esta lancado para voce.' USING ERRCODE = '42501';
  END IF;

  IF p_motivo IS NULL
     OR p_motivo NOT IN ('banido', 'sem_uso', 'problema_tecnico', 'outro') THEN
    RAISE EXCEPTION 'Informe o motivo da devolucao.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.numeros_whatsapp
     SET operador_id = NULL,
         motivo_retorno = p_motivo,
         observacao_retorno = NULLIF(TRIM(p_observacao), ''),
         atualizado_em = NOW()
   WHERE id = p_numero_id;

  PERFORM public.fn_numeros_movimentacao(
    p_numero_id          => p_numero_id,
    p_tipo               => 'devolvido_a_lideranca',
    p_setor_origem_id    => n.setor_id,
    p_setor_destino_id   => n.setor_id,
    p_operador_origem_id => v_eu,
    p_motivo             => p_motivo,
    p_observacao         => p_observacao
  );
END;
$function$;

-- ── 4. A lideranca relanca ao Nucleo ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_relancar_ao_nucleo(
  p_numero_id UUID, p_motivo TEXT, p_observacao TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  n public.numeros_whatsapp%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.numeros_whatsapp WHERE id = p_numero_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numero nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_user_tem('chips_relancar_ao_nucleo')
     AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'Voce nao tem permissao para relancar numero ao Nucleo.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_numeros_manda_no_setor(n.setor_id) THEN
    RAISE EXCEPTION 'Este numero nao pertence ao seu setor.' USING ERRCODE = '42501';
  END IF;

  IF n.posse <> 'setor' THEN
    RAISE EXCEPTION 'Este numero ja esta com o Nucleo.' USING ERRCODE = '22023';
  END IF;

  -- Motivo obrigatorio: sem ele o Nucleo recebe o numero de volta sem saber o
  -- que tratar, que e exatamente o que o pedido manda evitar.
  IF p_motivo IS NULL
     OR p_motivo NOT IN ('banido', 'sem_uso', 'problema_tecnico', 'outro') THEN
    RAISE EXCEPTION 'Informe o motivo do relancamento.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.numeros_whatsapp
     SET posse = 'nucleo',
         operador_id = NULL,
         motivo_retorno = p_motivo,
         observacao_retorno = NULLIF(TRIM(p_observacao), ''),
         atualizado_em = NOW()
   WHERE id = p_numero_id;

  PERFORM public.fn_numeros_movimentacao(
    p_numero_id          => p_numero_id,
    p_tipo               => 'relancado_ao_nucleo',
    p_setor_origem_id    => n.setor_id,
    p_operador_origem_id => n.operador_id,
    p_motivo             => p_motivo,
    p_observacao         => p_observacao
  );
END;
$function$;

-- ── 5. O Nucleo altera a situacao ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_alterar_situacao(
  p_numero_id UUID, p_situacao TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  n public.numeros_whatsapp%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.numeros_whatsapp WHERE id = p_numero_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numero nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_numeros_nucleo_administra(n.empresa_id) THEN
    RAISE EXCEPTION 'Somente o Nucleo altera a situacao de um numero.'
      USING ERRCODE = '42501';
  END IF;

  IF p_situacao NOT IN ('em_aquecimento', 'ativo', 'banido') THEN
    RAISE EXCEPTION 'Situacao invalida.' USING ERRCODE = '22023';
  END IF;

  -- Trocar por igual nao e movimentacao. Gravar produziria linha de historico
  -- que nao conta nada.
  IF n.situacao = p_situacao THEN
    RETURN;
  END IF;

  UPDATE public.numeros_whatsapp
     SET situacao = p_situacao, atualizado_em = NOW()
   WHERE id = p_numero_id;

  PERFORM public.fn_numeros_movimentacao(
    p_numero_id         => p_numero_id,
    p_tipo              => 'situacao_alterada',
    p_situacao_anterior => n.situacao,
    p_situacao_nova     => p_situacao
  );
END;
$function$;

-- ── Privilegio das cinco ────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.fn_numeros_liberar_ao_setor(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_numeros_lancar_ao_operador(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_numeros_devolver_a_lideranca(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_numeros_relancar_ao_nucleo(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_numeros_alterar_situacao(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_numeros_liberar_ao_setor(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_numeros_lancar_ao_operador(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_numeros_devolver_a_lideranca(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_numeros_relancar_ao_nucleo(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_numeros_alterar_situacao(UUID, TEXT) TO authenticated;

-- ============================================================================
-- As policies
-- ============================================================================
--
-- Toda chamada de funcao vem envolta em `(SELECT ...)`. Nao e estilo: sem isso
-- o Postgres avalia a funcao POR LINHA, e cada avaliacao de `fn_user_escopo`
-- percorre o catalogo de permissoes inteiro. E a licao medida em
-- 20260910180000 — 0,53 ms por linha viraram 0,002 ms com essa mudanca.

-- ── numeros_config ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS numeros_config_select ON public.numeros_config;
CREATE POLICY numeros_config_select ON public.numeros_config
FOR SELECT TO authenticated
USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    (SELECT public.fn_user_is_super_admin())
    OR (SELECT public.fn_user_tem('numeros_configurar'))
    OR (SELECT public.fn_numeros_sou_do_nucleo(empresa_id))
  )
);

-- Apontar o setor do Nucleo e escalonamento de privilegio: quem muda esta
-- linha decide qual setor manda no modulo inteiro. Dai a chave propria, que o
-- catalogo marca como `explicita` — nem administrador a recebe por heranca.
DROP POLICY IF EXISTS numeros_config_write ON public.numeros_config;
CREATE POLICY numeros_config_write ON public.numeros_config
FOR ALL TO authenticated
USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('numeros_configurar'))
)
WITH CHECK (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('numeros_configurar'))
);

-- ── numeros_celulares ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS numeros_celulares_select ON public.numeros_celulares;
CREATE POLICY numeros_celulares_select ON public.numeros_celulares
FOR SELECT TO authenticated
USING ((SELECT public.fn_numeros_celular_visivel(empresa_id, setor_id)));

DROP POLICY IF EXISTS numeros_celulares_write ON public.numeros_celulares;
CREATE POLICY numeros_celulares_write ON public.numeros_celulares
FOR ALL TO authenticated
USING ((SELECT public.fn_numeros_nucleo_administra(empresa_id)))
WITH CHECK ((SELECT public.fn_numeros_nucleo_administra(empresa_id)));

-- ── numeros_whatsapp ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS numeros_whatsapp_select ON public.numeros_whatsapp;
CREATE POLICY numeros_whatsapp_select ON public.numeros_whatsapp
FOR SELECT TO authenticated
USING ((SELECT public.fn_numeros_visivel(empresa_id, setor_id, operador_id)));

/*
 * Escrita direta e SO do Nucleo, e cobre cadastrar, corrigir digitacao e
 * apagar um cadastro errado.
 *
 * As transicoes NAO passam por aqui: as cinco RPCs sao `SECURITY DEFINER` e
 * rodam como dona da tabela. E o que permite a lideranca lancar um numero sem
 * ter permissao de UPDATE na tabela — ela nao escreve, ela pede.
 */
DROP POLICY IF EXISTS numeros_whatsapp_write ON public.numeros_whatsapp;
CREATE POLICY numeros_whatsapp_write ON public.numeros_whatsapp
FOR ALL TO authenticated
USING ((SELECT public.fn_numeros_nucleo_administra(empresa_id)))
WITH CHECK ((SELECT public.fn_numeros_nucleo_administra(empresa_id)));

-- ── numeros_movimentacoes ───────────────────────────────────────────────────
--
-- SELECT segue a visibilidade do NUMERO: quem enxerga o registro enxerga o
-- caminho dele. O `EXISTS` bate na chave primaria, entao e uma busca por indice.
--
-- E so isso. NAO existe policy de INSERT, de UPDATE nem de DELETE, e a ausencia
-- e a regra: append-only de verdade. `fn_numeros_movimentacao` escreve porque e
-- `SECURITY DEFINER` e roda como dona da tabela — nenhum cliente escreve aqui,
-- nem o Nucleo, nem o administrador.

DROP POLICY IF EXISTS numeros_movimentacoes_select ON public.numeros_movimentacoes;
CREATE POLICY numeros_movimentacoes_select ON public.numeros_movimentacoes
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.numeros_whatsapp n
     WHERE n.id = numero_id
       AND (SELECT public.fn_numeros_visivel(n.empresa_id, n.setor_id, n.operador_id))
  )
);

COMMIT;
