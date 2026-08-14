-- ============================================================================
-- 20260731a — Notificações: destino do clique + aviso de mensagem do chat
-- ============================================================================
--
-- Duas coisas:
--
-- 1. Coluna `rota` em `notificacoes`. Até aqui o clique só sabia navegar quando
--    havia `acordo_id`; o resto abria um detalhe sem saída. Guardar o destino no
--    momento em que a notificação nasce é mais honesto que adivinhar pelo texto
--    do título na hora do clique.
--
-- 2. Mensagem de chat vira notificação de verdade. Antes o aviso era só do SO e
--    só existia enquanto a aba "Solicitar Atendimento" estivesse aberta — quem
--    estivesse em qualquer outra tela não ficava sabendo de nada. Agora um
--    trigger grava em `notificacoes`, e o sino (que já roda no app inteiro) toca
--    em qualquer página.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================================

-- ── 1. Destino do clique ────────────────────────────────────────────────────

ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS rota TEXT;

COMMENT ON COLUMN public.notificacoes.rota IS
  'Para onde o clique leva (caminho interno, ex: /analitico?aba=diario). '
  'NULL = sem destino; a tela cai no palpite pelo título.';

-- Notificações antigas ganham destino sem precisar de reimportação. O texto dos
-- títulos é fixo, gerado pelo front (analitico.service / diario.service).
UPDATE public.notificacoes
   SET rota = '/analitico'
 WHERE rota IS NULL AND titulo = 'Analítico atualizado';

UPDATE public.notificacoes
   SET rota = '/analitico?aba=diario'
 WHERE rota IS NULL AND titulo = 'Recebimento diário atualizado';

-- ── 2. Mensagem do chat vira notificação ────────────────────────────────────

-- SECURITY DEFINER porque a linha nasce para OUTRA pessoa: a policy
-- `notificacoes_own` só deixa cada um mexer no que é seu (usuario_id =
-- auth.uid()), então um INSERT para o destinatário seria recusado.
-- `search_path` fixo para o SECURITY DEFINER não ser sequestrado por um schema
-- no caminho do chamador.
CREATE OR REPLACE FUNCTION public.fn_wpp_notificar_mensagem()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol      public.solicitacoes_whatsapp%ROWTYPE;
  v_cliente  TEXT;
  v_autor    TEXT;
BEGIN
  SELECT * INTO v_sol
    FROM public.solicitacoes_whatsapp
   WHERE id = NEW.solicitacao_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_cliente := COALESCE(NULLIF(TRIM(v_sol.nome_cliente), ''), v_sol.codigo_cliente, 'cliente');

  SELECT COALESCE(NULLIF(TRIM(SPLIT_PART(p.nome, ' ', 1)), ''), 'Alguém')
    INTO v_autor
    FROM public.perfis p
   WHERE p.id = NEW.autor_id;

  -- Participantes da thread menos o autor. O DISTINCT cobre o caso de o
  -- solicitante ter assumido o próprio pedido (os dois campos iguais), que
  -- geraria duas notificações idênticas.
  INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
  SELECT DISTINCT destinatario,
         NEW.empresa_id,
         'Nova mensagem — ' || v_cliente,
         COALESCE(v_autor, 'Alguém') || ': ' || LEFT(NEW.conteudo, 140),
         false,
         '/solicitacoes-whatsapp'
    FROM (
      SELECT v_sol.solicitante_id AS destinatario
      UNION
      SELECT v_sol.responsavel_id
    ) AS participantes
   WHERE destinatario IS NOT NULL
     AND destinatario <> NEW.autor_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_wpp_notificar_mensagem() IS
  'Mensagem nova no chat de uma solicitação vira notificação para o outro lado '
  'da thread. Sem isto o aviso só existia com a aba de solicitações aberta.';

DROP TRIGGER IF EXISTS trg_wpp_notificar_mensagem
  ON public.solicitacoes_whatsapp_mensagens;

CREATE TRIGGER trg_wpp_notificar_mensagem
  AFTER INSERT ON public.solicitacoes_whatsapp_mensagens
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_wpp_notificar_mensagem();
