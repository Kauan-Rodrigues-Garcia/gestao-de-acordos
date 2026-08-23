-- ============================================================================
-- Pix Automatico — saldo de divergencia: corrigir o que foi pago a mais ou a menos
-- ============================================================================
--
-- ## O problema
--
-- O pagamento da comissao acontece FORA do sistema: alguem olha a lista, soma
-- e manda o Pix. Quando esse alguem erra o valor, o sistema nao tem onde
-- registrar o erro — a linha continua dizendo que a comissao daquele NR foi
-- paga, e o que ficou faltando (ou sobrando) so existe na memoria de quem
-- pagou. O acerto vira combinado verbal: "no mes que vem eu tiro".
--
-- ## O desenho
--
-- Duas pecas, e a separacao entre elas e o ponto:
--
--   `pix_automatico_saldos` — o que a empresa DEVE (positivo) ou tem A
--     DESCONTAR (negativo) de uma pessoa. Uma linha viva por operador. Nasce
--     quando a lideranca anota, e so morre quando o acerto e efetivamente pago.
--
--   `pix_automatico_acordos.ajuste_*` — o acerto CARIMBADO num pagamento
--     especifico. Fica na linha para sempre, mesmo depois do saldo sumir: e o
--     historico de "este pagamento levou R$ 10,00 a mais, e por que".
--
-- ## O ciclo, e por que ele tem duas etapas
--
--   1. lideranca anota o saldo do operador           -> saldo vivo, livre
--   2. lideranca aplica o saldo num acordo APROVADO
--      e ainda NAO PAGO                               -> saldo RESERVADO nele
--   3. aquele acordo e marcado como pago              -> saldo QUITADO (some)
--
-- O pedido diz exatamente isso: "so e limpo o valor ao selecionar essa opcao E
-- apos esse acordo que tem a correcao ser marcado como pago". Limpar na etapa 2
-- seria dar por acertado um dinheiro que ainda nao saiu — e se o pagamento for
-- desfeito, o acerto teria sumido sem nunca ter acontecido.
--
-- Por isso desfazer o pagamento RESSUSCITA o saldo, reservado no mesmo acordo.
-- Sem isso, "Pagar" seguido de "Desfazer" apagaria a divergencia de graca.
--
-- ## Uma reserva por vez, e por que o saldo trava enquanto reservado
--
-- O valor do acerto e congelado no acordo no momento em que a reserva acontece.
-- Se o saldo pudesse ser editado depois, a linha carregaria um numero e a
-- tabela de saldos outro — e o segundo pagamento acertaria a diferenca errada.
-- Enquanto ha reserva, mudar o saldo exige tirar a correcao do acordo primeiro.
--
-- ## Tudo passa por RPC, e nao por UPDATE do cliente
--
-- Aplicar e remover mexem em DUAS tabelas e precisam das duas ou de nenhuma.
-- Duas telas abertas aplicando o mesmo saldo em acordos diferentes e o caso
-- real: as RPCs travam a linha do saldo (`FOR UPDATE`) antes de decidir, entao
-- a segunda encontra a reserva ja feita e recusa com uma frase, em vez de
-- carimbar o mesmo dinheiro duas vezes.
--
-- ## Permissao
--
-- `pix_ajustar_saldo` entra no catalogo (TS e SQL) e nasce para a lideranca.
-- Anotar saldo mexe em dinheiro que vai sair — e decisao separada de ver a aba,
-- do mesmo jeito que `aprovar_pix_automatico` ja e.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── A tabela do saldo ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pix_automatico_saldos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  operador_id   UUID NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  -- Copia do nome, como no resto do modulo: a lista abre sem JOIN e sobrevive
  -- a exclusao do perfil.
  operador_nome TEXT,
  -- Setor CARIMBADO na criacao. E o que recorta a leitura do lider — o mesmo
  -- criterio de `pix_automatico_acordos.setor_id`.
  setor_id      UUID REFERENCES public.setores(id) ON DELETE SET NULL,

  -- Positivo: a empresa DEVE ao operador (pagou de menos).
  -- Negativo: a empresa tem A DESCONTAR (pagou de mais).
  -- Zero nao existe: saldo zerado e saldo inexistente, e uma linha com 0
  -- apareceria na tela como pendencia que nao pende.
  valor         NUMERIC(12,2) NOT NULL CHECK (valor <> 0),
  motivo        TEXT,

  -- Reserva: em qual acordo este saldo esta carimbado esperando o pagamento.
  acordo_id     UUID REFERENCES public.pix_automatico_acordos(id) ON DELETE SET NULL,
  reservado_em  TIMESTAMPTZ,

  criado_por      UUID,
  criado_por_nome TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Um saldo aberto por pessoa. Dois saldos vivos para o mesmo operador
  -- obrigariam a tela a perguntar "qual deles?" a cada correcao, e a resposta
  -- certa e sempre "o total" — que e o que o UPSERT abaixo mantem somado.
  UNIQUE (empresa_id, operador_id)
);

CREATE INDEX IF NOT EXISTS idx_pix_saldos_empresa_operador
  ON public.pix_automatico_saldos(empresa_id, operador_id);
CREATE INDEX IF NOT EXISTS idx_pix_saldos_setor
  ON public.pix_automatico_saldos(empresa_id, setor_id);
-- Parcial: a consulta que importa e "qual saldo esta preso neste acordo?".
CREATE INDEX IF NOT EXISTS idx_pix_saldos_acordo
  ON public.pix_automatico_saldos(acordo_id) WHERE acordo_id IS NOT NULL;

COMMENT ON TABLE public.pix_automatico_saldos IS
  'Divergencia de pagamento por operador no Pix automatico. Positivo = a '
  'empresa deve; negativo = a empresa tem a descontar. Uma linha viva por '
  'pessoa; some quando o acerto e pago.';
COMMENT ON COLUMN public.pix_automatico_saldos.acordo_id IS
  'Acordo em que o saldo esta reservado, esperando o pagamento. NULL = livre.';

-- ── O carimbo do acerto no acordo ───────────────────────────────────────────

ALTER TABLE public.pix_automatico_acordos
  ADD COLUMN IF NOT EXISTS ajuste_valor    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS ajuste_motivo   TEXT,
  ADD COLUMN IF NOT EXISTS ajuste_em       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ajuste_por      UUID,
  ADD COLUMN IF NOT EXISTS ajuste_por_nome TEXT;

COMMENT ON COLUMN public.pix_automatico_acordos.ajuste_valor IS
  'Correcao de divergencia somada (ou subtraida) da comissao DESTE pagamento. '
  'Congelada no momento em que o saldo foi aplicado; permanece depois de o '
  'saldo ser quitado, como historico.';

-- O operador nao carimba o proprio acerto. O gatilho ja devolvia status, pago e
-- avaliacao ao valor antigo quando quem escreve nao e lideranca; sem as linhas
-- abaixo, as colunas novas seriam a unica porta aberta.
CREATE OR REPLACE FUNCTION public.fn_pix_congela_campos_do_operador()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF public.fn_user_has_any_role(
       ARRAY['lider','elite','gerencia','administrador','super_admin']) THEN
    RETURN NEW;
  END IF;

  NEW.empresa_id        := OLD.empresa_id;
  NEW.operador_id       := OLD.operador_id;
  NEW.operador_nome     := OLD.operador_nome;
  NEW.setor_id          := OLD.setor_id;
  NEW.status            := OLD.status;
  NEW.pct_comissao      := OLD.pct_comissao;
  NEW.avaliado_por      := OLD.avaliado_por;
  NEW.avaliado_por_nome := OLD.avaliado_por_nome;
  NEW.avaliado_em       := OLD.avaliado_em;
  NEW.pago              := OLD.pago;
  NEW.pago_em           := OLD.pago_em;
  NEW.pago_por          := OLD.pago_por;
  NEW.pago_por_nome     := OLD.pago_por_nome;
  NEW.criado_em         := OLD.criado_em;
  NEW.ajuste_valor      := OLD.ajuste_valor;
  NEW.ajuste_motivo     := OLD.ajuste_motivo;
  NEW.ajuste_em         := OLD.ajuste_em;
  NEW.ajuste_por        := OLD.ajuste_por;
  NEW.ajuste_por_nome   := OLD.ajuste_por_nome;
  RETURN NEW;
END;
$function$;

-- ── O log da aba aceita os eventos do saldo ─────────────────────────────────
--
-- `acordo_id` deixa de ser obrigatorio: anotar um saldo e um fato do OPERADOR,
-- e ainda nao existe acordo nenhum envolvido. Sem isto o evento mais importante
-- do ciclo — o momento em que alguem decide que ha divergencia — ficaria de
-- fora justamente do historico que a aba mostra.
ALTER TABLE public.pix_automatico_log
  ALTER COLUMN acordo_id DROP NOT NULL;

ALTER TABLE public.pix_automatico_log
  DROP CONSTRAINT IF EXISTS pix_automatico_log_acao_check;

ALTER TABLE public.pix_automatico_log
  ADD CONSTRAINT pix_automatico_log_acao_check CHECK (acao IN (
    'registrado', 'restaurado', 'editado',
    'aprovado', 'desaprovado', 'voltou_pendente',
    'pago', 'pagamento_desfeito', 'excluido',
    'saldo_anotado', 'saldo_alterado', 'saldo_removido',
    'saldo_aplicado', 'saldo_retirado', 'saldo_quitado', 'saldo_devolvido'
  ));

-- `nr_cliente` continua NOT NULL; os eventos sem acordo gravam um tracinho.
-- Trocar a coluna por nula obrigaria a mexer nos seis pontos que a leem.

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.pix_automatico_saldos ENABLE ROW LEVEL SECURITY;

-- Ler: o dono sempre (a pessoa precisa saber que ha um acerto no nome dela) e
-- quem enxerga alem dos proprios registros na aba, tal como o painel diz.
DROP POLICY IF EXISTS pix_saldos_select ON public.pix_automatico_saldos;
CREATE POLICY pix_saldos_select ON public.pix_automatico_saldos
FOR SELECT TO authenticated
USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    operador_id = (SELECT auth.uid())
    OR (SELECT public.fn_user_escopo('pix')) >= 2
  )
);

-- Escrever: so pela RPC, que e SECURITY DEFINER. Nao ha policy de INSERT,
-- UPDATE nem DELETE de proposito — um UPDATE direto conseguiria mudar o valor
-- de um saldo ja reservado, que e exatamente o que as RPCs existem para impedir.
-- O super_admin tambem passa pela RPC: chave-mestra nao e desculpa para ter um
-- segundo caminho de escrita que ninguem testa.

COMMENT ON POLICY pix_saldos_select ON public.pix_automatico_saldos IS
  'Le o proprio saldo, ou os do escopo da aba Pix segundo o painel. Escrita '
  'nao tem policy: passa toda por fn_pix_saldo_*.';

-- ── Quem pode mexer no saldo ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pix_pode_ajustar_saldo()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT public.fn_user_is_super_admin()
      OR (public.fn_user_escopo('pix') >= 2
          AND public.fn_user_tem('pix_ajustar_saldo'));
$function$;

REVOKE ALL ON FUNCTION public.fn_pix_pode_ajustar_saldo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_pix_pode_ajustar_saldo() TO authenticated;

COMMENT ON FUNCTION public.fn_pix_pode_ajustar_saldo() IS
  'Anotar e aplicar saldo de divergencia. Exige alcance alem dos proprios '
  'registros na aba Pix E a chave pix_ajustar_saldo — as duas vindas do painel.';

-- ── Anotar / alterar / apagar o saldo ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pix_saldo_definir(
  p_empresa_id  UUID,
  p_operador_id UUID,
  p_valor       NUMERIC,
  p_motivo      TEXT DEFAULT NULL,
  -- TRUE soma ao que ja existe; FALSE substitui. A tela oferece os dois porque
  -- "achei mais uma divergencia" e "eu tinha digitado errado" sao coisas
  -- diferentes, e adivinhar qual delas seria errar metade das vezes.
  p_somar       BOOLEAN DEFAULT FALSE
)
RETURNS public.pix_automatico_saldos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_atual   public.pix_automatico_saldos;
  v_antes   NUMERIC(12,2);
  v_novo    NUMERIC(12,2);
  v_nome    TEXT;
  v_setor   UUID;
  v_autor   UUID := auth.uid();
  v_autor_n TEXT;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'PIX_SALDO_EMPRESA: esta empresa nao e sua.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_pix_pode_ajustar_saldo() THEN
    RAISE EXCEPTION 'PIX_SALDO_SEM_PERMISSAO: voce nao pode anotar saldo de divergencia.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.nome, p.setor_id INTO v_nome, v_setor
    FROM public.perfis p
   WHERE p.id = p_operador_id AND p.empresa_id = p_empresa_id;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'PIX_SALDO_OPERADOR: operador nao encontrado nesta empresa.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_autor_n
    FROM public.perfis p WHERE p.id = v_autor;

  -- Trava a linha antes de decidir: duas telas anotando ao mesmo tempo
  -- entrariam as duas no ramo "nao existe" e a segunda estouraria no UNIQUE.
  SELECT * INTO v_atual
    FROM public.pix_automatico_saldos
   WHERE empresa_id = p_empresa_id AND operador_id = p_operador_id
     FOR UPDATE;

  -- Reservado nao muda. O valor ja esta carimbado num acordo esperando
  -- pagamento; mexer aqui deixaria os dois numeros diferentes.
  IF v_atual.id IS NOT NULL AND v_atual.acordo_id IS NOT NULL THEN
    RAISE EXCEPTION
      'PIX_SALDO_RESERVADO: este saldo esta aplicado num acordo aguardando pagamento. Retire a correcao do acordo antes de alterar o valor.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_antes := v_atual.valor;   -- antes de qualquer RETURNING sobrescrever a variavel
  v_novo  := ROUND(
    CASE WHEN p_somar THEN COALESCE(v_antes, 0) + p_valor ELSE p_valor END, 2);

  -- Zerou: a pendencia acabou. Apagar e o certo — uma linha com 0 apareceria na
  -- tela como divergencia que nao diverge.
  IF v_novo = 0 THEN
    IF v_atual.id IS NOT NULL THEN
      DELETE FROM public.pix_automatico_saldos WHERE id = v_atual.id;
      PERFORM public.fn_pix_log(
        p_empresa_id, NULL, '—', 'saldo_removido',
        'Zerou o saldo de divergencia de ' || v_nome,
        v_antes, p_operador_id, v_nome,
        jsonb_build_object('valor', v_antes), NULL);
    END IF;
    RETURN NULL;
  END IF;

  IF v_atual.id IS NULL THEN
    INSERT INTO public.pix_automatico_saldos (
      empresa_id, operador_id, operador_nome, setor_id, valor, motivo,
      criado_por, criado_por_nome
    ) VALUES (
      p_empresa_id, p_operador_id, v_nome, v_setor, v_novo, NULLIF(TRIM(p_motivo), ''),
      v_autor, v_autor_n
    )
    RETURNING * INTO v_atual;

    PERFORM public.fn_pix_log(
      p_empresa_id, NULL, '—', 'saldo_anotado',
      'Anotou saldo de R$ ' || public.fn_pix_valor_br(v_novo) || ' para ' || v_nome
        || COALESCE(' — ' || NULLIF(TRIM(p_motivo), ''), ''),
      v_novo, p_operador_id, v_nome,
      NULL, jsonb_build_object('valor', v_novo, 'motivo', p_motivo));
  ELSE
    UPDATE public.pix_automatico_saldos
       SET valor         = v_novo,
           motivo        = COALESCE(NULLIF(TRIM(p_motivo), ''), motivo),
           operador_nome = v_nome,
           setor_id      = COALESCE(v_setor, setor_id),
           atualizado_em = NOW()
     WHERE id = v_atual.id
    RETURNING * INTO v_atual;

    PERFORM public.fn_pix_log(
      p_empresa_id, NULL, '—', 'saldo_alterado',
      'Alterou o saldo de ' || v_nome
        || ': R$ ' || public.fn_pix_valor_br(v_antes)
        || ' → R$ ' || public.fn_pix_valor_br(v_novo),
      v_novo, p_operador_id, v_nome,
      jsonb_build_object('valor', v_antes), jsonb_build_object('valor', v_novo));
  END IF;

  RETURN v_atual;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pix_saldo_definir(UUID, UUID, NUMERIC, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_pix_saldo_definir(UUID, UUID, NUMERIC, TEXT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.fn_pix_saldo_definir(UUID, UUID, NUMERIC, TEXT, BOOLEAN) IS
  'Anota, soma, substitui ou zera o saldo de divergencia de um operador. '
  'Recusa enquanto o saldo estiver reservado num acordo.';

-- ── Aplicar o saldo num acordo aprovado e nao pago ──────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pix_saldo_aplicar(p_acordo_id UUID)
RETURNS public.pix_automatico_acordos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_acordo public.pix_automatico_acordos;
  v_saldo  public.pix_automatico_saldos;
  v_autor  UUID := auth.uid();
  v_nome   TEXT;
BEGIN
  SELECT * INTO v_acordo FROM public.pix_automatico_acordos WHERE id = p_acordo_id FOR UPDATE;

  IF v_acordo.id IS NULL THEN
    RAISE EXCEPTION 'PIX_SALDO_ACORDO: registro nao encontrado — recarregue a lista.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.fn_can_access_empresa(v_acordo.empresa_id) THEN
    RAISE EXCEPTION 'PIX_SALDO_EMPRESA: esta empresa nao e sua.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_pix_pode_ajustar_saldo() THEN
    RAISE EXCEPTION 'PIX_SALDO_SEM_PERMISSAO: voce nao pode aplicar correcao de valor.'
      USING ERRCODE = '42501';
  END IF;
  IF v_acordo.status <> 'aprovado' THEN
    RAISE EXCEPTION
      'PIX_SALDO_SO_APROVADO: o NR % esta como "%" — a correcao so entra em acordo aprovado.',
      v_acordo.nr_cliente, v_acordo.status USING ERRCODE = 'check_violation';
  END IF;
  IF v_acordo.pago THEN
    RAISE EXCEPTION
      'PIX_SALDO_JA_PAGO: a comissao do NR % ja foi paga. Desfaca o pagamento antes de aplicar a correcao.',
      v_acordo.nr_cliente USING ERRCODE = 'check_violation';
  END IF;
  IF v_acordo.ajuste_valor IS NOT NULL THEN
    RAISE EXCEPTION
      'PIX_SALDO_JA_APLICADO: o NR % ja carrega uma correcao.', v_acordo.nr_cliente
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_saldo
    FROM public.pix_automatico_saldos
   WHERE empresa_id = v_acordo.empresa_id AND operador_id = v_acordo.operador_id
     FOR UPDATE;

  IF v_saldo.id IS NULL THEN
    RAISE EXCEPTION
      'PIX_SALDO_INEXISTENTE: nao ha saldo de divergencia para este operador.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_saldo.acordo_id IS NOT NULL THEN
    RAISE EXCEPTION
      'PIX_SALDO_RESERVADO: este saldo ja esta aplicado em outro acordo aguardando pagamento.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = v_autor;

  UPDATE public.pix_automatico_acordos
     SET ajuste_valor    = v_saldo.valor,
         ajuste_motivo   = v_saldo.motivo,
         ajuste_em       = NOW(),
         ajuste_por      = v_autor,
         ajuste_por_nome = v_nome
   WHERE id = v_acordo.id
  RETURNING * INTO v_acordo;

  UPDATE public.pix_automatico_saldos
     SET acordo_id = v_acordo.id, reservado_em = NOW(), atualizado_em = NOW()
   WHERE id = v_saldo.id;

  PERFORM public.fn_pix_log(
    v_acordo.empresa_id, v_acordo.id, v_acordo.nr_cliente, 'saldo_aplicado',
    'Aplicou correcao de R$ ' || public.fn_pix_valor_br(v_saldo.valor)
      || ' no NR ' || v_acordo.nr_cliente
      || COALESCE(' — ' || v_saldo.motivo, ''),
    v_saldo.valor, v_acordo.operador_id, v_acordo.operador_nome,
    NULL, jsonb_build_object('ajuste_valor', v_saldo.valor));

  RETURN v_acordo;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pix_saldo_aplicar(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_pix_saldo_aplicar(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_pix_saldo_aplicar(UUID) IS
  'Carimba o saldo do operador num acordo aprovado e nao pago, e reserva o '
  'saldo nele. O saldo so e quitado quando esse acordo for pago.';

-- ── Retirar a correcao antes do pagamento ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pix_saldo_retirar(p_acordo_id UUID)
RETURNS public.pix_automatico_acordos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_acordo public.pix_automatico_acordos;
  v_valor  NUMERIC(12,2);
BEGIN
  SELECT * INTO v_acordo FROM public.pix_automatico_acordos WHERE id = p_acordo_id FOR UPDATE;

  IF v_acordo.id IS NULL THEN
    RAISE EXCEPTION 'PIX_SALDO_ACORDO: registro nao encontrado — recarregue a lista.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.fn_can_access_empresa(v_acordo.empresa_id) THEN
    RAISE EXCEPTION 'PIX_SALDO_EMPRESA: esta empresa nao e sua.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_pix_pode_ajustar_saldo() THEN
    RAISE EXCEPTION 'PIX_SALDO_SEM_PERMISSAO: voce nao pode retirar a correcao.'
      USING ERRCODE = '42501';
  END IF;
  IF v_acordo.ajuste_valor IS NULL THEN
    RAISE EXCEPTION 'PIX_SALDO_SEM_CORRECAO: este acordo nao carrega correcao.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Pago e historico. Retirar aqui reescreveria o que ja saiu do caixa; o
  -- caminho e desfazer o pagamento, que devolve o saldo sozinho.
  IF v_acordo.pago THEN
    RAISE EXCEPTION
      'PIX_SALDO_JA_PAGO: a comissao do NR % ja foi paga. Desfaca o pagamento para reabrir a correcao.',
      v_acordo.nr_cliente USING ERRCODE = 'check_violation';
  END IF;

  v_valor := v_acordo.ajuste_valor;

  UPDATE public.pix_automatico_acordos
     SET ajuste_valor = NULL, ajuste_motivo = NULL,
         ajuste_em = NULL, ajuste_por = NULL, ajuste_por_nome = NULL
   WHERE id = v_acordo.id
  RETURNING * INTO v_acordo;

  UPDATE public.pix_automatico_saldos
     SET acordo_id = NULL, reservado_em = NULL, atualizado_em = NOW()
   WHERE acordo_id = p_acordo_id;

  PERFORM public.fn_pix_log(
    v_acordo.empresa_id, v_acordo.id, v_acordo.nr_cliente, 'saldo_retirado',
    'Retirou a correcao de R$ ' || public.fn_pix_valor_br(v_valor)
      || ' do NR ' || v_acordo.nr_cliente || ' — o saldo voltou a ficar livre',
    v_valor, v_acordo.operador_id, v_acordo.operador_nome,
    jsonb_build_object('ajuste_valor', v_valor), NULL);

  RETURN v_acordo;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pix_saldo_retirar(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_pix_saldo_retirar(UUID) TO authenticated;

-- ── O pagamento quita; desfazer o pagamento devolve ─────────────────────────
--
-- AFTER UPDATE, e nao BEFORE: o saldo so pode sumir depois de o pagamento ter
-- de fato passado por `fn_pix_valida_pagamento`. Quitar antes e depois a
-- validacao recusar deixaria a divergencia apagada sem pagamento nenhum — o
-- ROLLBACK cobre isso, mas depender do rollback para uma regra que da para
-- escrever na ordem certa e frouxo.

CREATE OR REPLACE FUNCTION public.fn_pix_saldo_no_pagamento()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_saldo public.pix_automatico_saldos;
  v_total NUMERIC(12,2);
BEGIN
  IF NEW.ajuste_valor IS NULL THEN
    RETURN NEW;
  END IF;

  -- Pagou: o acerto aconteceu. O saldo morre aqui, e so aqui.
  IF NEW.pago AND NOT COALESCE(OLD.pago, FALSE) THEN
    DELETE FROM public.pix_automatico_saldos
     WHERE acordo_id = NEW.id;

    PERFORM public.fn_pix_log(
      NEW.empresa_id, NEW.id, NEW.nr_cliente, 'saldo_quitado',
      'Quitou o saldo de R$ ' || public.fn_pix_valor_br(NEW.ajuste_valor)
        || ' no pagamento do NR ' || NEW.nr_cliente,
      NEW.ajuste_valor, NEW.operador_id, NEW.operador_nome,
      jsonb_build_object('ajuste_valor', NEW.ajuste_valor), NULL);

  -- Desfez o pagamento: o acerto nao aconteceu. O saldo volta reservado NESTE
  -- acordo — sem isto, "Pagar" e "Desfazer" apagariam a divergencia de graca.
  ELSIF NOT NEW.pago AND COALESCE(OLD.pago, FALSE) THEN
    /*
     * Nao da para usar `ON CONFLICT DO UPDATE` aqui.
     *
     * O conflito acontece quando alguem anotou um saldo NOVO depois do
     * pagamento: os dois sao devidos, entao somam. Mas a soma pode dar ZERO
     * (+10 devolvido sobre -10 anotado), e a coluna tem `CHECK (valor <> 0)` —
     * o UPDATE estouraria a constraint e derrubaria o "Desfazer" inteiro, com
     * uma mensagem que nao explica nada.
     *
     * Entao a soma e feita antes, e o zero vira DELETE. Saldo zerado e saldo
     * inexistente.
     */
    SELECT * INTO v_saldo
      FROM public.pix_automatico_saldos
     WHERE empresa_id = NEW.empresa_id AND operador_id = NEW.operador_id
       FOR UPDATE;

    IF v_saldo.id IS NULL THEN
      INSERT INTO public.pix_automatico_saldos (
        empresa_id, operador_id, operador_nome, setor_id, valor, motivo,
        acordo_id, reservado_em, criado_por, criado_por_nome
      ) VALUES (
        NEW.empresa_id, NEW.operador_id, NEW.operador_nome, NEW.setor_id,
        NEW.ajuste_valor, NEW.ajuste_motivo, NEW.id, NOW(),
        NEW.ajuste_por, NEW.ajuste_por_nome
      );
    ELSE
      v_total := ROUND(v_saldo.valor + NEW.ajuste_valor, 2);
      IF v_total = 0 THEN
        DELETE FROM public.pix_automatico_saldos WHERE id = v_saldo.id;
      ELSE
        UPDATE public.pix_automatico_saldos
           SET valor        = v_total,
               acordo_id    = COALESCE(acordo_id, NEW.id),
               reservado_em = COALESCE(reservado_em, NOW()),
               atualizado_em = NOW()
         WHERE id = v_saldo.id;
      END IF;
    END IF;

    PERFORM public.fn_pix_log(
      NEW.empresa_id, NEW.id, NEW.nr_cliente, 'saldo_devolvido',
      'Desfez o pagamento do NR ' || NEW.nr_cliente
        || ' — o saldo de R$ ' || public.fn_pix_valor_br(NEW.ajuste_valor)
        || ' voltou a ficar pendente',
      NEW.ajuste_valor, NEW.operador_id, NEW.operador_nome,
      NULL, jsonb_build_object('ajuste_valor', NEW.ajuste_valor));
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pix_saldo_no_pagamento ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_saldo_no_pagamento
AFTER UPDATE OF pago ON public.pix_automatico_acordos
FOR EACH ROW EXECUTE FUNCTION public.fn_pix_saldo_no_pagamento();

-- ── Excluir acordo com correcao devolve o saldo ─────────────────────────────
--
-- O `ON DELETE SET NULL` da FK ja solta a reserva, mas em silencio: o saldo
-- ficaria livre sem nada explicando que o acordo onde ele estava sumiu. Aqui
-- ele volta a ficar livre COM registro no historico.

CREATE OR REPLACE FUNCTION public.fn_pix_saldo_no_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.ajuste_valor IS NULL THEN RETURN OLD; END IF;

  UPDATE public.pix_automatico_saldos
     SET acordo_id = NULL, reservado_em = NULL, atualizado_em = NOW()
   WHERE acordo_id = OLD.id;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pix_saldo_no_delete ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_saldo_no_delete
BEFORE DELETE ON public.pix_automatico_acordos
FOR EACH ROW EXECUTE FUNCTION public.fn_pix_saldo_no_delete();

-- ── Auditoria geral ─────────────────────────────────────────────────────────
-- Alem do log da aba, a trilha do sistema. Categoria financeira e severidade de
-- aviso: e dinheiro, e nao e rotina.
DROP TRIGGER IF EXISTS trg_log_pix_saldos ON public.pix_automatico_saldos;
CREATE TRIGGER trg_log_pix_saldos
AFTER INSERT OR DELETE OR UPDATE ON public.pix_automatico_saldos
FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria(
  'financeiro', 'pix_saldo', 'o saldo de divergencia do Pix',
  'operador_nome', '', 'empresa_id', 'aviso');

-- ── Catalogo: a chave nova ──────────────────────────────────────────────────

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object(
         'pix_ajustar_saldo',
         cp.cargo IN ('lider', 'elite', 'gerencia')
       ),
       atualizado_em = NOW()
  FROM public.empresas e
 WHERE e.id = cp.empresa_id
   AND lower(e.slug) = 'bookplay';

-- Empresa que nao e BookPlay recebe a chave desligada: o catalogo exige que
-- toda chave exista em todo cargo (ver 20260815154058), e o Pix nao existe la.
UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object('pix_ajustar_saldo', FALSE),
       atualizado_em = NOW()
  FROM public.empresas e
 WHERE e.id = cp.empresa_id
   AND lower(e.slug) <> 'bookplay'
   AND NOT (cp.permissoes ? 'pix_ajustar_saldo');

-- Acesso total nasce com tudo ligado.
UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('pix_ajustar_saldo', TRUE),
       atualizado_em = NOW()
 WHERE cargo IN ('administrador', 'super_admin');

-- ── Catalogo SQL: a chave nova tambem aqui ─────────────────────────────────
-- Este catalogo semeia empresa NOVA. Ele e a copia em SQL de
-- src/lib/permissoes-catalogo.ts, e o teste de contrato le a definicao mais
-- recente — entao toda migration que acrescenta chave redefine a funcao
-- inteira, e nao so a linha nova.
CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH atalhos AS (
    SELECT
      ARRAY['lider','elite','gerencia','diretoria']::TEXT[] AS lideranca,
      ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[] AS todos,
      ARRAY['gerencia','diretoria']::TEXT[] AS cupula,
      ARRAY[]::TEXT[] AS ninguem
  )
  SELECT t.* FROM atalhos, LATERAL (VALUES
    -- Abas e telas
    ('ver_acordos',                 ARRAY['bookplay'],  todos,     false),
    ('ver_analitico',               NULL::TEXT[],       todos,     false),
    ('ver_painel_lider',            NULL::TEXT[],       lideranca, false),
    ('ver_painel_diretoria',        NULL::TEXT[],       ARRAY['diretoria'], false),
    ('ver_ouvidoria',               ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('ver_campanha_facil',          ARRAY['bookplay'],  lideranca, false),
    ('ver_solicitacoes_whatsapp',   NULL::TEXT[],       todos,     false),
    ('ver_pix_automatico',          ARRAY['bookplay'],  todos,     false),
    ('ver_tickets',                 NULL::TEXT[],       ARRAY['lider','elite','gerencia','diretoria','ouvidoria'], false),
    ('ver_lixeira',                 NULL::TEXT[],       todos,     false),
    ('ver_logs',                    NULL::TEXT[],       ninguem,   false),
    ('ver_configuracoes',           NULL::TEXT[],       ninguem,   false),
    -- Acordos
    -- Acordos: escopo por aba (fase 5a) — bookplay-only, como a chave da aba
    ('acordos_escopo_individual',    ARRAY['bookplay'], todos,     false),
    ('acordos_escopo_equipe',        ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('acordos_escopo_setor',         ARRAY['bookplay'], lideranca, false),
    ('acordos_escopo_todos_setores', ARRAY['bookplay'], cupula,    false),
    ('criar_acordos',               NULL::TEXT[],       todos,     false),
    ('editar_acordos',              NULL::TEXT[],       todos,     false),
    ('excluir_acordos',             NULL::TEXT[],       todos,     false),
    ('excluir_em_lote',             NULL::TEXT[],       lideranca, false),
    -- Importacoes
    ('importar_excel',              NULL::TEXT[],       todos,     false),
    ('importar_analitico',          NULL::TEXT[],       lideranca, false),
    ('importar_diario',             NULL::TEXT[],       lideranca, false),
    -- Gestao de pessoas
    ('ver_usuarios',                NULL::TEXT[],       lideranca, false),
    ('ver_equipes',                 NULL::TEXT[],       lideranca, false),
    ('ver_operadores',              NULL::TEXT[],       lideranca, false),
    ('usuarios_escopo_setor',         NULL::TEXT[], todos, false),
    ('usuarios_escopo_todos_setores', NULL::TEXT[], ARRAY['gerencia','diretoria','ouvidoria'], false),
    -- Metas
    ('ver_metas',                   NULL::TEXT[],       lideranca, false),
    ('usuarios_administrar',         NULL::TEXT[], ninguem, false),
    ('usuarios_editar_do_setor',     NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('usuarios_transferir',          NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria'], false),
    ('equipes_criar_editar',         NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('equipes_excluir',              NULL::TEXT[], ninguem, false),
    ('equipes_gerenciar_composicao', NULL::TEXT[], ARRAY['lider','gerencia'], false),
    ('metas_editar',                 NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('metas_excluir',                NULL::TEXT[], ninguem, false),
    ('metas_editar_dias_uteis',      NULL::TEXT[], ARRAY['lider'], false),
    ('metas_excluir_dias_uteis',     NULL::TEXT[], ninguem, false),
    -- Filtros e visao (globais — em desmonte pela reestruturacao por aba)
    ('filtrar_por_usuario',         NULL::TEXT[],       lideranca, false),
    -- Pix Automatico: escopo por aba (fase 5b)
    ('pix_escopo_individual',        ARRAY['bookplay'], todos,     false),
    ('pix_escopo_equipe',            ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_escopo_setor',             ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_escopo_todos_setores',     ARRAY['bookplay'], ARRAY['gerencia'], false),
    ('pix_editar_configuracoes',     ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_ajustar_saldo',            ARRAY['bookplay'], ARRAY['lider','elite','gerencia'], false),
    -- Painel Diretoria: escopo por aba (fase 6a)
    ('painel_diretoria_escopo_setor',         NULL::TEXT[], ARRAY['gerencia'],  false),
    ('painel_diretoria_escopo_todos_setores', NULL::TEXT[], ARRAY['diretoria'], false),
    -- Acoes especificas
    ('administrar_sistema',    NULL::TEXT[], ninguem, false),
    ('comemoracoes_gerenciar', NULL::TEXT[], ARRAY['diretoria'], false),
    ('editar_ouvidoria',            ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('gerenciar_acessos_ouvidoria', ARRAY['pagueplay'], ninguem,   false),
    ('criar_solicitacao_whatsapp',  NULL::TEXT[],       todos,     false),
    ('aprovar_pix_automatico',      ARRAY['bookplay'],  lideranca, false),
    ('ignorar_fechamento_mes',      NULL::TEXT[],       ninguem,   true),
    -- Lixeira (fase 1)
    ('lixeira_escopo_individual',   NULL::TEXT[],       todos,     false),
    ('lixeira_escopo_equipe',       NULL::TEXT[],       lideranca, false),
    ('lixeira_escopo_setor',        NULL::TEXT[],       lideranca, false),
    ('lixeira_escopo_todos_setores', NULL::TEXT[],      cupula,    false),
    ('lixeira_restaurar',           NULL::TEXT[],       todos,     false),
    ('lixeira_limpar',              NULL::TEXT[],       todos,     false),
    -- Painel Lider (fase 2)
    ('painel_lider_escopo_setor',            NULL::TEXT[], lideranca, false),
    ('painel_lider_escopo_todos_setores',    NULL::TEXT[], ARRAY['diretoria'], false),
    ('painel_lider_sub_acompanhamento',      NULL::TEXT[], lideranca, false),
    ('painel_lider_sub_desempenho_equipes',  NULL::TEXT[], lideranca, false),
    ('painel_lider_sub_quartis',             NULL::TEXT[], lideranca, false),
    ('painel_lider_sub_grafico_recebimento', NULL::TEXT[], lideranca, false),
    -- Dashboard (fase 3a) — sem chave de aba, de proposito
    ('dashboard_escopo_individual',    NULL::TEXT[], todos,     false),
    ('dashboard_escopo_equipe',        NULL::TEXT[], lideranca, false),
    ('dashboard_escopo_setor',         NULL::TEXT[], lideranca, false),
    ('dashboard_escopo_todos_setores', NULL::TEXT[], cupula,    false),
    -- Analitico (fase 4) — encerra veTodosOsSetores
    ('analitico_escopo_individual',      NULL::TEXT[], ARRAY['operador','elite'], false),
    ('analitico_escopo_setor',           NULL::TEXT[], ARRAY['lider','elite','gerencia','ouvidoria','diretoria'], false),
    ('analitico_escopo_todos_setores',   NULL::TEXT[], cupula,    false),
    ('analitico_sub_analitico',          NULL::TEXT[], todos,     false),
    ('analitico_sub_recebimento_diario', NULL::TEXT[], todos,     false),
    ('analitico_sub_colchao',            NULL::TEXT[], todos,     false),
    ('analitico_sub_por_operador',       NULL::TEXT[], todos,     false),
    ('analitico_sub_formas_pagamento',   NULL::TEXT[], todos,     false),
    ('analitico_sub_ranking',            NULL::TEXT[], todos,     false),
    ('analitico_sub_destaques_dia',      NULL::TEXT[], todos,     false),
    ('analitico_sub_sem_operador',       NULL::TEXT[], todos,     false)
  ) AS t(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo oficial de permissoes. Espelha src/lib/permissoes-catalogo.ts; os '
  'testes de contrato quebram a CI se divergirem.';

COMMIT;
