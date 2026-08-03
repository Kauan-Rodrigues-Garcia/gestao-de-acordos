-- ============================================================================
-- 20260803e_solicitacao_bloqueia_cpf.sql
-- Solicitar Atendimento: CPF RECUSADO no código e na mensagem do pedido.
-- ============================================================================
--
-- ## Por que aqui é bloqueio e no chat é prazo
--
-- A migration anterior (20260803d) deixou o CPF passar no CHAT, com 12 horas de
-- prazo. Ali bloquear pioraria: chat é conversa entre pessoas, e recusar a
-- mensagem trava o atendimento e empurra o dado para fora do sistema.
--
-- O formulário de NOVA SOLICITAÇÃO é outra coisa. O campo é literalmente o
-- CÓDIGO do cliente — existe substituto — e a mensagem é um texto que o
-- operador redige antes de existir conversa nenhuma. Recusar não trava nada:
-- só obriga a usar o campo certo. Então recusa, como nos acordos
-- (migrations 20260803a/b).
--
-- ## O que isto muda na 20260803d
--
-- Lá, `solicitacoes_whatsapp.mensagem` era MARCADA e apagada em 12 h. Agora
-- conteúdo NOVO com CPF nem entra. O gatilho de marcação sai e entra o de
-- bloqueio.
--
-- As colunas `msg_tem_cpf` / `msg_expurgar_em` / `msg_expurgado_em` FICAM, e o
-- expurgo continua rodando: elas agora servem só ao passivo — as linhas que já
-- estavam no banco quando a 20260803d passou. Sem isso, o legado ficaria preso
-- para sempre, porque bloquear a escrita não apaga o que já está gravado.
--
-- Depende de `fn_texto_tem_cpf` e `fn_eh_cpf` (migrations 20260803a/b).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_solicitacao_recusa_cpf()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- O código do cliente é o campo que mais recebe CPF por engano: os dois são
  -- "aquele número do cliente" na cabeça de quem digita depressa.
  IF public.fn_eh_cpf(NEW.codigo_cliente)
     AND (TG_OP = 'INSERT' OR NEW.codigo_cliente IS DISTINCT FROM OLD.codigo_cliente)
  THEN
    RAISE EXCEPTION
      'O codigo do cliente nao pode ser um CPF. Use o codigo do cliente no ERP.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Na mensagem o CPF vem no meio do texto ("cliente Joao, CPF 529...").
  --
  -- A condição de UPDATE é deliberada: linha ANTIGA que já tem CPF pode ser
  -- atualizada por outro motivo (status, responsável) sem tropeçar aqui. Só o
  -- conteúdo NOVO é recusado. Quem limpa o passivo é o expurgo da 20260803d.
  IF public.fn_texto_tem_cpf(NEW.mensagem)
     AND (TG_OP = 'INSERT' OR NEW.mensagem IS DISTINCT FROM OLD.mensagem)
  THEN
    RAISE EXCEPTION
      'A mensagem contem um CPF. Use o codigo do cliente - CPF nao pode ser gravado no sistema.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Sai o gatilho que MARCAVA a mensagem para expurgo: conteúdo novo com CPF
-- não entra mais, então não há o que marcar.
DROP TRIGGER IF EXISTS trg_marcar_cpf_solicitacao ON public.solicitacoes_whatsapp;

DROP TRIGGER IF EXISTS trg_solicitacao_recusa_cpf ON public.solicitacoes_whatsapp;
CREATE TRIGGER trg_solicitacao_recusa_cpf
  BEFORE INSERT OR UPDATE OF codigo_cliente, mensagem
  ON public.solicitacoes_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.fn_solicitacao_recusa_cpf();

-- ── Passivo ─────────────────────────────────────────────────────────────────
--
-- Duas listas para conferir antes de considerar o assunto fechado.
--
-- A primeira é a que o expurgo resolve sozinho em até 12 horas. A segunda são
-- CÓDIGOS que são CPF — esses o expurgo NÃO toca, porque apagar o código
-- deixaria a solicitação sem identificar o cliente. Precisam de correção
-- manual: trocar pelo código do ERP.

SELECT 'mensagem' AS onde, id, criado_em, msg_expurgar_em AS apaga_em
  FROM public.solicitacoes_whatsapp
 WHERE msg_tem_cpf AND msg_expurgado_em IS NULL
 ORDER BY criado_em DESC;

SELECT 'codigo_cliente' AS onde, id, criado_em, codigo_cliente
  FROM public.solicitacoes_whatsapp
 WHERE public.fn_eh_cpf(codigo_cliente)
 ORDER BY criado_em DESC;
