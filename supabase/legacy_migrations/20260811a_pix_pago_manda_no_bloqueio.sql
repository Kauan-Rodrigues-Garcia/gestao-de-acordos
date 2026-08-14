-- ═══════════════════════════════════════════════════════════════════════════
-- PIX AUTOMÁTICO — quem manda no bloqueio do NR passa a ser o PAGAMENTO
-- ═══════════════════════════════════════════════════════════════════════════
-- O problema real, relatado em 2026-08-11: apagaram um registro sem querer e,
-- ao tentar registrar o mesmo NR de novo, o banco recusava dizendo que aquele
-- NR já tinha sido aprovado. O acordo não existia mais, mas o REGISTRO
-- histórico (`pix_automatico_nr_registro`) continuava dizendo `validado` — e
-- era ele o portão.
--
-- A 20260810c já tinha tirado o registro ÓRFÃO do caminho. Isto vai além e
-- troca o critério inteiro, como pedido:
--
--   ANTES  bloqueia se existe registro de NR 'pendente' ou 'validado'
--   AGORA  bloqueia se existe ACORDO VIVO com status 'aprovado' E pago = TRUE
--
-- Ou seja: só o dinheiro que já saiu tranca o NR. Enquanto a comissão está
-- "a pagar", o registro pode ser excluído (a lixeira guarda 3 dias) e o NR
-- volta a ficar livre sozinho — sem faxina manual no registro histórico.
--
-- A contrapartida é o outro lado da mesma regra: LINHA PAGA NÃO PODE MAIS SER
-- EXCLUÍDA. Sem isso "aprovado + pago" seria um portão que qualquer um abre
-- apagando a linha, e a proteção não valeria nada.
--
-- Junto vêm as duas exigências de auditoria: toda exclusão vai para
-- `logs_sistema` (permanente — a lixeira expira em 3 dias) e o operador dono
-- do registro é notificado de quem apagou.
--
-- `pix_automatico_nr_registro` continua sendo mantido pelos triggers e continua
-- servindo de histórico. Ele apenas deixa de decidir quem entra.
--
-- Idempotente.

-- ─── 1. O bloqueio passa a olhar o acordo, não o registro ───────────────────
--
-- A consulta é na tabela de acordos de propósito: `pago` mora lá, e é a linha
-- viva que interessa. Copiar `pago` para o registro criaria dois lugares para a
-- mesma verdade, e um deles ficaria velho.
CREATE OR REPLACE FUNCTION public.fn_pix_nr_bloqueia_duplicado()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existe BOOLEAN;
BEGIN
  SELECT TRUE INTO v_existe
    FROM public.pix_automatico_acordos a
   WHERE a.empresa_id = NEW.empresa_id
     AND a.id <> NEW.id
     AND public.fn_pix_nr_normalizar(a.nr_cliente)
         = public.fn_pix_nr_normalizar(NEW.nr_cliente)
     AND a.status = 'aprovado'
     AND a.pago   = TRUE
   LIMIT 1;

  IF v_existe THEN
    RAISE EXCEPTION
      'NR % já foi aprovado E pago no Pix automático — não pode ser registrado de novo.',
      NEW.nr_cliente
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_pix_nr_bloqueia_duplicado() IS
  'v3 — bloqueia só quando o NR já tem acordo VIVO aprovado E pago. Pendente, '
  'aprovado a pagar e desaprovado deixaram de trancar: o que tranca é o '
  'dinheiro pago. Ver 20260811a.';

-- Índice do caminho que o trigger percorre a cada INSERT. Parcial porque o
-- conjunto que importa (aprovado e pago) é uma fração pequena da tabela.
CREATE INDEX IF NOT EXISTS idx_pix_auto_nr_aprovado_pago
  ON public.pix_automatico_acordos
     (empresa_id, public.fn_pix_nr_normalizar(nr_cliente))
  WHERE status = 'aprovado' AND pago = TRUE;

-- ─── 2. Linha paga não se exclui ────────────────────────────────────────────
--
-- Por que TRIGGER e não policy: policy que exclui a linha do `USING` faz o
-- DELETE casar com ZERO linhas e voltar sem erro. A tela diria "registro não
-- encontrado — recarregue a lista", que é mentira e manda o usuário tentar de
-- novo para sempre. O trigger recusa com o motivo escrito.
--
-- Vale para líder+ também. Desfazer o pagamento é um clique ("Desfazer" na
-- linha) e é o caminho certo: primeiro se admite que o pagamento não valia,
-- depois se apaga.
CREATE OR REPLACE FUNCTION public.fn_pix_impede_excluir_pago()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.pago THEN
    RAISE EXCEPTION
      'PIX_PAGO_NAO_EXCLUI: o NR % já teve a comissão paga. Desfaça o pagamento antes de excluir.',
      OLD.nr_cliente
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.fn_pix_impede_excluir_pago() IS
  'Recusa a exclusão de registro do Pix cuja comissão já foi paga. É o outro '
  'lado do bloqueio por "aprovado + pago": sem isto, apagar a linha abriria o '
  'NR de novo. Ver 20260811a.';

-- ─── 3. Log permanente + aviso ao operador ──────────────────────────────────
--
-- A lixeira já grava quem excluiu, mas ela EXPIRA em 3 dias — não serve de
-- log. `logs_sistema` é permanente e é onde o fluxo de acordos divergentes já
-- registra exclusão feita por terceiro.
--
-- BEFORE DELETE, como `fn_wpp_notificar_exclusao`: é o momento em que a linha
-- ainda está de pé para ser lida.
--
-- SECURITY DEFINER porque a notificação nasce para OUTRA pessoa e a policy
-- `notificacoes_own` só deixa cada um escrever no que é seu. `search_path`
-- fixo para o DEFINER não ser sequestrado.
CREATE OR REPLACE FUNCTION public.fn_pix_registrar_exclusao()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_quem  UUID := auth.uid();
  v_nome  TEXT;
  v_valor TEXT;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguém')
    INTO v_nome
    FROM public.perfis p
   WHERE p.id = v_quem;

  -- `to_char` com G/D segue o lc_numeric do servidor (en_US no Supabase), que
  -- devolveria "1,234.56". Formato fixo + troca do ponto dá o BR sem depender
  -- de locale.
  v_valor := replace(to_char(OLD.valor, 'FM9999999990.00'), '.', ',');

  INSERT INTO public.logs_sistema
    (usuario_id, empresa_id, acao, tabela, registro_id, detalhes)
  VALUES (
    v_quem,
    OLD.empresa_id,
    'pix_automatico_exclusao',
    'pix_automatico_acordos',
    OLD.id::TEXT,
    jsonb_build_object(
      'nr_cliente',        OLD.nr_cliente,
      'valor',             OLD.valor,
      'status',            OLD.status,
      'pago',              OLD.pago,
      'operador_id',       OLD.operador_id,
      'operador_nome',     OLD.operador_nome,
      'setor_id',          OLD.setor_id,
      'excluido_por',      v_quem,
      'excluido_por_nome', COALESCE(v_nome, 'Alguém'),
      'excluido_em',       NOW()
    )
  );

  -- Aviso ao dono do registro. Quem apagou o próprio registro não precisa ser
  -- avisado do próprio clique.
  IF OLD.operador_id IS NOT NULL
     AND (v_quem IS NULL OR OLD.operador_id <> v_quem) THEN
    INSERT INTO public.notificacoes
      (usuario_id, empresa_id, titulo, mensagem, lida, rota)
    VALUES (
      OLD.operador_id,
      OLD.empresa_id,
      'Pix automático — registro excluído',
      COALESCE(v_nome, 'Alguém') || ' excluiu o seu registro do NR '
        || OLD.nr_cliente || ' (R$ ' || v_valor || ', ' || OLD.status || ').',
      false,
      '/acordos?tab=pix'
    );
  END IF;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.fn_pix_registrar_exclusao() IS
  'Grava toda exclusão do Pix automático em logs_sistema (permanente — a '
  'lixeira expira em 3 dias) e avisa o operador dono quando quem apagou foi '
  'outra pessoa. Ver 20260811a.';

-- Nomes com sufixo alfabético: triggers do mesmo evento disparam em ordem de
-- nome, e a recusa do pago tem de vir antes de gastar INSERT em log.
DROP TRIGGER IF EXISTS trg_pix_a_impede_pago    ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_a_impede_pago
  BEFORE DELETE ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_impede_excluir_pago();

DROP TRIGGER IF EXISTS trg_pix_b_registra_exclusao ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_b_registra_exclusao
  BEFORE DELETE ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_registrar_exclusao();

-- ─── 4. Restaurar também devolve o pagamento ────────────────────────────────
--
-- `fn_pix_restaurar_lixeira` (20260810c) reinseria sem as colunas de pagamento:
-- um registro pago voltava da lixeira como não pago, e a comissão apareceria
-- como devida de novo. A partir do item 2 nenhuma linha paga entra mais na
-- lixeira, mas as que já entraram antes desta migration continuam lá.
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

  -- O AFTER INSERT acabou de gravar o registro de NR como 'pendente' — é o que
  -- ele faz para linha nova. Aqui a linha não é nova: ela volta com o status
  -- que tinha, e o registro precisa dizer o mesmo. Mesmo mapeamento de
  -- `fn_pix_nr_apos_update`.
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

COMMENT ON FUNCTION public.fn_pix_restaurar_lixeira(UUID) IS
  'Restaura registro do Pix automático da lixeira: reinsere com o status e o '
  'PAGAMENTO originais, realinha o registro de NR e remove da lixeira, em uma '
  'transação. Só líder+. Ver 20260810c e 20260811a.';

GRANT EXECUTE ON FUNCTION public.fn_pix_restaurar_lixeira(UUID) TO authenticated;

-- ─── 5. Registro histórico preso não segura mais ninguém ────────────────────
--
-- Depois do item 1 o registro deixou de ser portão, então nada precisa ser
-- apagado para "liberar" NR: os que estavam presos com `validado` e acordo
-- inexistente já saem liberados. O que sobra é higiene — deixar o histórico
-- coerente com o que de fato existe, para quem for consultá-lo não ler um
-- 'validado' que não corresponde a acordo nenhum.
UPDATE public.pix_automatico_nr_registro r
   SET status        = 'pendente',
       avaliado_por  = NULL,
       avaliado_por_nome = NULL,
       avaliado_em   = NULL,
       atualizado_em = NOW()
 WHERE r.acordo_id IS NULL
   AND r.status = 'validado';
