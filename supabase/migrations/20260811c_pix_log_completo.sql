-- ═══════════════════════════════════════════════════════════════════════════
-- PIX AUTOMÁTICO — NR único enquanto existir, pagamento travado e log de tudo
-- ═══════════════════════════════════════════════════════════════════════════
-- Três decisões da operação (11/08/2026), na sequência em que foram pedidas.
--
-- 1. UM NR, UM REGISTRO — enquanto ele existir
--    A 20260811a tinha afrouxado demais: só "aprovado + pago" trancava, o que
--    deixava dois operadores registrarem o mesmo NR e ficarem os dois
--    pendentes. A regra certa é mais simples e é a que o time já tinha na
--    cabeça: existe linha com aquele NR, não entra outra. Apagou a linha (ou
--    mandou para a lixeira), o NR volta a ficar livre.
--
--    Isso mantém resolvido o bug de origem — o que travava era o REGISTRO
--    HISTÓRICO sobrevivendo ao acordo excluído. O portão agora é a linha viva,
--    e linha excluída não é linha viva.
--
-- 2. PAGAR SÓ O QUE ESTÁ APROVADO, E UMA VEZ SÓ
--    O cliente já filtrava por status; faltava o banco garantir, e faltava
--    impedir o segundo pagamento sobre o que já está pago.
--
-- 3. LOG DE TUDO
--    Registro, edição, aprovação, desaprovação, volta para pendente, pagamento,
--    desfazer pagamento, exclusão e restauração. `logs_sistema` não serve: só
--    administrador consegue ler, e quem precisa do histórico é o líder do
--    setor. Tabela própria, com RLS que espelha a da aba.
--
-- Idempotente.

-- ─── 1. NR único enquanto existir registrado ────────────────────────────────
--
-- Vale para QUALQUER status, inclusive desaprovado — "existe registrado" é o
-- critério, e um desaprovado ocupa o NR. A saída para o engano continua sendo
-- a mesma de sempre: o dono apaga o próprio desaprovado (ou usa "Limpar
-- desaprovados"), e o expurgo automático de 2 dias úteis faz isso sozinho.
CREATE OR REPLACE FUNCTION public.fn_pix_nr_bloqueia_duplicado()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status TEXT;
BEGIN
  SELECT a.status INTO v_status
    FROM public.pix_automatico_acordos a
   WHERE a.empresa_id = NEW.empresa_id
     AND a.id <> NEW.id
     AND public.fn_pix_nr_normalizar(a.nr_cliente)
         = public.fn_pix_nr_normalizar(NEW.nr_cliente)
   LIMIT 1;

  IF v_status IS NOT NULL THEN
    RAISE EXCEPTION
      'NR % já está registrado no Pix automático (status: %). Exclua o registro existente para liberá-lo.',
      NEW.nr_cliente, v_status
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_pix_nr_bloqueia_duplicado() IS
  'v4 — um NR só pode ter UM registro vivo, em qualquer status. Excluir a '
  'linha libera o NR. O registro histórico deixou de ser portão na v3 (era ele '
  'que travava NR de acordo já excluído). Ver 20260811c.';

-- O índice da v3 era parcial (só aprovado e pago) e não serve mais: agora a
-- busca é por NR em qualquer status.
DROP INDEX IF EXISTS public.idx_pix_auto_nr_aprovado_pago;

CREATE INDEX IF NOT EXISTS idx_pix_auto_nr_busca
  ON public.pix_automatico_acordos
     (empresa_id, public.fn_pix_nr_normalizar(nr_cliente));

-- A garantia de verdade seria um índice ÚNICO — o trigger sozinho tem janela de
-- corrida entre o SELECT e o INSERT.
--
-- Ele só pode ser criado se a tabela já estiver limpa, e ela pode não estar: a
-- 20260721i registra que "duplicados antigos do mesmo NR continuam existindo em
-- pix_automatico_acordos" — o bloqueio de então valia só para inserts novos.
--
-- Por isso a tentativa é protegida. Com duplicados, a migration NÃO falha: o
-- trigger continua barrando novos, e o aviso diz o que resolver. A consulta do
-- aviso está no comentário abaixo para não precisar ser reescrita na hora.
--
--   SELECT empresa_id, public.fn_pix_nr_normalizar(nr_cliente) AS nr, COUNT(*)
--     FROM public.pix_automatico_acordos
--    GROUP BY 1, 2 HAVING COUNT(*) > 1;
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pix_auto_nr_unico
    ON public.pix_automatico_acordos
       (empresa_id, public.fn_pix_nr_normalizar(nr_cliente));
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING
    'idx_pix_auto_nr_unico NAO criado: ja existem NRs duplicados em pix_automatico_acordos. O trigger segue barrando novos registros; limpe os duplicados e rode este bloco de novo.';
END $$;

-- ─── 2. Pagamento: só aprovado, e uma vez ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pix_valida_pagamento()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pago AND NOT COALESCE(OLD.pago, FALSE) THEN
    IF NEW.status <> 'aprovado' THEN
      RAISE EXCEPTION
        'PIX_PAGA_SO_APROVADO: o NR % está como "%" — só acordo aprovado pode ser pago.',
        NEW.nr_cliente, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Segundo pagamento sobre o que já está pago. `pago` é booleano, então o
  -- clique repetido não somaria nada; o que ele faz é reescrever `pago_em` e
  -- `pago_por`, apagando quem de fato pagou e quando. É esse rastro que se
  -- protege aqui.
  IF NEW.pago AND COALESCE(OLD.pago, FALSE)
     AND (NEW.pago_em IS DISTINCT FROM OLD.pago_em
          OR NEW.pago_por IS DISTINCT FROM OLD.pago_por) THEN
    RAISE EXCEPTION
      'PIX_JA_PAGO: a comissão do NR % já foi paga. Use "Desfazer" antes de pagar de novo.',
      NEW.nr_cliente
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pix_valida_pagamento ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_valida_pagamento
  BEFORE UPDATE ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_valida_pagamento();

-- ─── 3. Log da aba ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pix_automatico_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- Sem FK: o log sobrevive à exclusão da linha — é para isso que ele existe.
  acordo_id     UUID NOT NULL,
  nr_cliente    TEXT NOT NULL,
  acao          TEXT NOT NULL CHECK (acao IN (
                  'registrado', 'restaurado', 'editado',
                  'aprovado', 'desaprovado', 'voltou_pendente',
                  'pago', 'pagamento_desfeito', 'excluido')),
  -- Frase pronta. A tela mostra o histórico sem ter de reconstruir a redação a
  -- partir dos JSONs, e a redação não muda quando a tela muda.
  descricao     TEXT NOT NULL,
  valor         NUMERIC(12,2),
  -- Dono do registro (de quem é a comissão), que não é quem fez a ação.
  operador_id   UUID,
  operador_nome TEXT,
  autor_id      UUID,
  autor_nome    TEXT,
  -- Só os campos que mudaram, para o caso de alguém precisar do detalhe.
  antes         JSONB,
  depois        JSONB,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pix_log_empresa
  ON public.pix_automatico_log (empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pix_log_acordo
  ON public.pix_automatico_log (acordo_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pix_log_operador
  ON public.pix_automatico_log (empresa_id, operador_id, criado_em DESC);

ALTER TABLE public.pix_automatico_log ENABLE ROW LEVEL SECURITY;

-- Mesma régua do SELECT em pix_automatico_acordos: o operador vê o que é dele,
-- líder+ vê o setor/empresa. Escrita SÓ pelos triggers (SECURITY DEFINER) —
-- nenhuma policy de INSERT/UPDATE/DELETE. Log que o cliente escreve não é log.
DROP POLICY IF EXISTS "pix_log_select" ON public.pix_automatico_log;
CREATE POLICY "pix_log_select" ON public.pix_automatico_log
  FOR SELECT USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_has_any_role(
           ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'])
    )
  );

-- Valor em formato BR sem depender de lc_numeric (G e D seguem o locale do
-- servidor, que no Supabase é en_US e devolveria "1,234.56").
CREATE OR REPLACE FUNCTION public.fn_pix_valor_br(p_valor NUMERIC)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS
$$ SELECT replace(to_char(COALESCE(p_valor, 0), 'FM9999999990.00'), '.', ',') $$;

/**
 * Grava uma linha do log. Resolve o nome de quem fez a ação a partir de
 * auth.uid() — as telas não passam isso em todo caminho de escrita, e um log
 * que depende do cliente lembrar de preencher tem furo por definição.
 */
CREATE OR REPLACE FUNCTION public.fn_pix_log(
  p_empresa_id    UUID,
  p_acordo_id     UUID,
  p_nr            TEXT,
  p_acao          TEXT,
  p_descricao     TEXT,
  p_valor         NUMERIC,
  p_operador_id   UUID,
  p_operador_nome TEXT,
  p_antes         JSONB DEFAULT NULL,
  p_depois        JSONB DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_autor UUID := auth.uid();
  v_nome  TEXT;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguém')
    INTO v_nome FROM public.perfis p WHERE p.id = v_autor;

  INSERT INTO public.pix_automatico_log (
    empresa_id, acordo_id, nr_cliente, acao, descricao, valor,
    operador_id, operador_nome, autor_id, autor_nome, antes, depois
  ) VALUES (
    p_empresa_id, p_acordo_id, p_nr, p_acao, p_descricao, p_valor,
    p_operador_id, p_operador_nome, v_autor, COALESCE(v_nome, 'Sistema'),
    p_antes, p_depois
  );
END;
$$;

-- ─── 3a. Registro (ou restauração) ──────────────────────────────────────────
--
-- A restauração da lixeira também é um INSERT, e sem marcação apareceria no
-- histórico como "registrou", que é falso. `fn_pix_restaurar_lixeira` liga uma
-- variável de sessão antes de inserir; ela morre com a transação.
CREATE OR REPLACE FUNCTION public.fn_pix_log_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_restaurando BOOLEAN := COALESCE(current_setting('pix.restaurando', true), '') = 'on';
BEGIN
  PERFORM public.fn_pix_log(
    NEW.empresa_id, NEW.id, NEW.nr_cliente,
    CASE WHEN v_restaurando THEN 'restaurado' ELSE 'registrado' END,
    CASE WHEN v_restaurando
         THEN 'Restaurou da lixeira o NR ' || NEW.nr_cliente
              || ' (R$ ' || public.fn_pix_valor_br(NEW.valor) || ', ' || NEW.status || ')'
         ELSE 'Registrou o NR ' || NEW.nr_cliente
              || ' no valor de R$ ' || public.fn_pix_valor_br(NEW.valor)
    END,
    NEW.valor, NEW.operador_id, NEW.operador_nome,
    NULL, to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$;

-- ─── 3b. Alterações ─────────────────────────────────────────────────────────
--
-- Uma linha de log por MUDANÇA, não por UPDATE: aprovar e pagar no mesmo
-- comando viraria um evento só, e o histórico perderia justamente a ordem que
-- importa quando se discute uma comissão.
CREATE OR REPLACE FUNCTION public.fn_pix_log_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.fn_pix_log(
      NEW.empresa_id, NEW.id, NEW.nr_cliente,
      CASE NEW.status
        WHEN 'aprovado'    THEN 'aprovado'
        WHEN 'desaprovado' THEN 'desaprovado'
        ELSE 'voltou_pendente'
      END,
      CASE NEW.status
        WHEN 'aprovado'    THEN 'Aprovou o NR ' || NEW.nr_cliente
                                || ' (comissão de ' || COALESCE(NEW.pct_comissao::TEXT, '—') || '%)'
        WHEN 'desaprovado' THEN 'Desaprovou o NR ' || NEW.nr_cliente
        ELSE 'Voltou o NR ' || NEW.nr_cliente || ' para pendente'
      END,
      NEW.valor, NEW.operador_id, NEW.operador_nome,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'pct_comissao', NEW.pct_comissao)
    );
  END IF;

  IF NEW.pago IS DISTINCT FROM OLD.pago THEN
    PERFORM public.fn_pix_log(
      NEW.empresa_id, NEW.id, NEW.nr_cliente,
      CASE WHEN NEW.pago THEN 'pago' ELSE 'pagamento_desfeito' END,
      CASE WHEN NEW.pago
           THEN 'Marcou como paga a comissão do NR ' || NEW.nr_cliente
           ELSE 'Desfez o pagamento da comissão do NR ' || NEW.nr_cliente
      END,
      NEW.valor, NEW.operador_id, NEW.operador_nome,
      jsonb_build_object('pago', OLD.pago, 'pago_em', OLD.pago_em),
      jsonb_build_object('pago', NEW.pago, 'pago_em', NEW.pago_em, 'pago_por_nome', NEW.pago_por_nome)
    );
  END IF;

  IF NEW.nr_cliente IS DISTINCT FROM OLD.nr_cliente
     OR NEW.valor   IS DISTINCT FROM OLD.valor THEN
    PERFORM public.fn_pix_log(
      NEW.empresa_id, NEW.id, NEW.nr_cliente, 'editado',
      'Editou o registro: '
        || CASE WHEN NEW.nr_cliente IS DISTINCT FROM OLD.nr_cliente
                THEN 'NR ' || OLD.nr_cliente || ' → ' || NEW.nr_cliente || '. ' ELSE '' END
        || CASE WHEN NEW.valor IS DISTINCT FROM OLD.valor
                THEN 'Valor R$ ' || public.fn_pix_valor_br(OLD.valor)
                     || ' → R$ ' || public.fn_pix_valor_br(NEW.valor) || '.' ELSE '' END,
      NEW.valor, NEW.operador_id, NEW.operador_nome,
      jsonb_build_object('nr_cliente', OLD.nr_cliente, 'valor', OLD.valor),
      jsonb_build_object('nr_cliente', NEW.nr_cliente, 'valor', NEW.valor)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 3c. Exclusão ───────────────────────────────────────────────────────────
--
-- Substitui a gravação em `logs_sistema` que a 20260811a fazia: aquela tabela
-- só é legível por administrador, e quem precisa do histórico é o líder. A
-- NOTIFICAÇÃO ao operador continua aqui — ela é o aviso, o log é o registro.
CREATE OR REPLACE FUNCTION public.fn_pix_registrar_exclusao()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_quem UUID := auth.uid();
  v_nome TEXT;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguém')
    INTO v_nome FROM public.perfis p WHERE p.id = v_quem;

  PERFORM public.fn_pix_log(
    OLD.empresa_id, OLD.id, OLD.nr_cliente, 'excluido',
    'Excluiu o NR ' || OLD.nr_cliente
      || ' (R$ ' || public.fn_pix_valor_br(OLD.valor) || ', ' || OLD.status || ')',
    OLD.valor, OLD.operador_id, OLD.operador_nome,
    to_jsonb(OLD), NULL
  );

  -- Ninguém precisa ser avisado do próprio clique.
  IF OLD.operador_id IS NOT NULL
     AND (v_quem IS NULL OR OLD.operador_id <> v_quem) THEN
    INSERT INTO public.notificacoes
      (usuario_id, empresa_id, titulo, mensagem, lida, rota)
    VALUES (
      OLD.operador_id,
      OLD.empresa_id,
      'Pix automático — registro excluído',
      COALESCE(v_nome, 'Alguém') || ' excluiu o seu registro do NR '
        || OLD.nr_cliente || ' (R$ ' || public.fn_pix_valor_br(OLD.valor)
        || ', ' || OLD.status || ').',
      false,
      '/acordos?tab=pix'
    );
  END IF;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.fn_pix_registrar_exclusao() IS
  'Grava a exclusão no log da aba e avisa o operador dono quando quem apagou '
  'foi outra pessoa. Deixou de escrever em logs_sistema na 20260811c — aquela '
  'tabela só administrador lê.';

DROP TRIGGER IF EXISTS trg_pix_log_insert ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_log_insert
  AFTER INSERT ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_log_insert();

DROP TRIGGER IF EXISTS trg_pix_log_update ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_log_update
  AFTER UPDATE ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_log_update();

-- ─── 4. Restaurar avisa o log de que é restauração ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pix_restaurar_lixeira(p_item_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item  public.lixeira_pix_automatico%ROWTYPE;
  v_dados JSONB;
  v_novo  UUID;
BEGIN
  SELECT * INTO v_item FROM public.lixeira_pix_automatico WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIXEIRA_ITEM_NAO_ENCONTRADO';
  END IF;

  -- SECURITY DEFINER ignora RLS: a autorização é conferida aqui, à mão.
  IF NOT public.fn_can_access_empresa(v_item.empresa_id)
     OR NOT public.fn_user_has_any_role(
          ARRAY['lider','elite','gerencia','administrador','super_admin']) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO_RESTAURAR';
  END IF;

  v_dados := v_item.dados_completos;

  -- Lida pelo trigger de log. `SET LOCAL` morre no fim da transação.
  PERFORM set_config('pix.restaurando', 'on', true);

  INSERT INTO public.pix_automatico_acordos (
    id, empresa_id, operador_id, operador_nome, setor_id,
    nr_cliente, valor, status, pct_comissao,
    avaliado_por, avaliado_por_nome, avaliado_em,
    pago, pago_em, pago_por, pago_por_nome, criado_em
  ) VALUES (
    v_item.acordo_id,
    v_item.empresa_id,
    (v_dados->>'operador_id')::UUID,
    v_dados->>'operador_nome',
    NULLIF(v_dados->>'setor_id', '')::UUID,
    v_dados->>'nr_cliente',
    (v_dados->>'valor')::NUMERIC,
    v_dados->>'status',
    NULLIF(v_dados->>'pct_comissao', '')::NUMERIC,
    NULLIF(v_dados->>'avaliado_por', '')::UUID,
    v_dados->>'avaliado_por_nome',
    NULLIF(v_dados->>'avaliado_em', '')::TIMESTAMPTZ,
    COALESCE((v_dados->>'pago')::BOOLEAN, FALSE),
    NULLIF(v_dados->>'pago_em', '')::TIMESTAMPTZ,
    NULLIF(v_dados->>'pago_por', '')::UUID,
    v_dados->>'pago_por_nome',
    COALESCE(NULLIF(v_dados->>'criado_em', '')::TIMESTAMPTZ, NOW())
  )
  RETURNING id INTO v_novo;

  PERFORM set_config('pix.restaurando', 'off', true);

  -- O AFTER INSERT acabou de gravar o registro de NR como 'pendente' — é o que
  -- ele faz para linha nova. Aqui a linha não é nova: ela volta com o status
  -- que tinha, e o registro precisa dizer o mesmo.
  UPDATE public.pix_automatico_nr_registro r SET
    status            = CASE v_dados->>'status'
                          WHEN 'aprovado'    THEN 'validado'
                          WHEN 'desaprovado' THEN 'recusado'
                          ELSE 'pendente'
                        END,
    avaliado_por      = NULLIF(v_dados->>'avaliado_por', '')::UUID,
    avaliado_por_nome = v_dados->>'avaliado_por_nome',
    avaliado_em       = NULLIF(v_dados->>'avaliado_em', '')::TIMESTAMPTZ,
    atualizado_em     = NOW()
  WHERE r.empresa_id     = v_item.empresa_id
    AND r.nr_normalizado = public.fn_pix_nr_normalizar(v_item.nr_cliente)
    AND r.acordo_id      = v_novo;

  DELETE FROM public.lixeira_pix_automatico WHERE id = p_item_id;

  RETURN v_novo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_pix_restaurar_lixeira(UUID) TO authenticated;

-- ─── 5. Semente do log com o que já existe ──────────────────────────────────
--
-- Sem isto a aba abriria com o histórico vazio para registros antigos, dando a
-- impressão de que nada aconteceu com eles. Uma linha 'registrado' por acordo
-- vivo, com a data real de criação. Autor desconhecido: ninguém estava
-- gravando isso na época.
INSERT INTO public.pix_automatico_log (
  empresa_id, acordo_id, nr_cliente, acao, descricao, valor,
  operador_id, operador_nome, autor_id, autor_nome, criado_em
)
SELECT
  a.empresa_id, a.id, a.nr_cliente, 'registrado',
  'Registrou o NR ' || a.nr_cliente
    || ' no valor de R$ ' || public.fn_pix_valor_br(a.valor)
    || ' (importado do histórico anterior ao log)',
  a.valor, a.operador_id, a.operador_nome, a.operador_id, a.operador_nome,
  a.criado_em
FROM public.pix_automatico_acordos a
WHERE NOT EXISTS (
  SELECT 1 FROM public.pix_automatico_log l WHERE l.acordo_id = a.id
);
