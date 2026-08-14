-- ═══════════════════════════════════════════════════════════════════════════
-- 20260730d — Conversa encerra 24 h depois do chamado ser fechado
-- ═══════════════════════════════════════════════════════════════════════════
-- Regra pedida: o chat de um atendimento é finalizado 24 h após o chamado ser
-- fechado, "ficando só o histórico anexado".
--
-- Duas metades, e a distinção importa:
--   ESCRITA  fecha  — depois da janela, ninguém manda mensagem nova.
--   LEITURA  NUNCA fecha — o histórico continua visível para sempre, preso ao
--                          atendimento. É o registro do que foi combinado.
--
-- A regra vive na policy, não só na tela: caixa de texto desabilitada é
-- sugestão, policy é garantia.
--
-- Idempotente.

-- ─── A conversa ainda aceita mensagem? ──────────────────────────────────────
-- Aberta enquanto:
--   • o chamado não está 'feito'; OU
--   • está 'feito' mas foi fechado há menos de 24 h.
--
-- `finalizado_em IS NULL` com status 'feito' não deveria acontecer (o trigger
-- fn_wpp_carimbos preenche), mas se acontecer tratamos como aberta — errar para
-- o lado de deixar as pessoas se comunicarem.
CREATE OR REPLACE FUNCTION public.fn_wpp_chat_aberto(p_solicitacao_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.solicitacoes_whatsapp s
    WHERE s.id = p_solicitacao_id
      AND (
        s.status <> 'feito'
        OR s.finalizado_em IS NULL
        OR s.finalizado_em > NOW() - INTERVAL '24 hours'
      )
  );
$$;

-- ─── INSERT de mensagem passa a exigir a conversa aberta ────────────────────
DROP POLICY IF EXISTS "sol_wpp_msg_insert" ON public.solicitacoes_whatsapp_mensagens;
CREATE POLICY "sol_wpp_msg_insert" ON public.solicitacoes_whatsapp_mensagens
  FOR INSERT WITH CHECK (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND autor_id = (SELECT auth.uid())
    AND public.fn_wpp_pode_ver_solicitacao(solicitacao_id)
    AND public.fn_wpp_chat_aberto(solicitacao_id)
  );

-- O SELECT das mensagens fica INTOCADO de propósito: o histórico é anexo
-- permanente do atendimento. Encerrar a conversa não apaga nem esconde nada.

-- ─── Carimbar leitura também para depois do encerramento ────────────────────
-- Sem isto, abrir um atendimento antigo deixaria mensagens eternamente como
-- "não lidas" no badge. Marcar como lida é leitura, não conversa.
-- (A policy de UPDATE já existente continua valendo; nada a alterar aqui —
--  este comentário existe para registrar que a omissão é deliberada.)

COMMENT ON FUNCTION public.fn_wpp_chat_aberto(UUID) IS
  'True enquanto a conversa do atendimento aceita mensagem nova: chamado não '
  'fechado, ou fechado há menos de 24 h. Leitura do histórico não depende disto.';
