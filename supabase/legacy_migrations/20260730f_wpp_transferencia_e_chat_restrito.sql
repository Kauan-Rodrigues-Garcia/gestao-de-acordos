-- ═══════════════════════════════════════════════════════════════════════════
-- 20260730f — Transferência de atendimento + chat restrito aos 2 envolvidos
-- ═══════════════════════════════════════════════════════════════════════════
-- Três mudanças:
--
-- 1) O `responsavel_id` só era gravado na PRIMEIRA vez que o pedido entrava em
--    'em_andamento' (trigger fn_wpp_carimbos, condição `iniciado_em IS NULL`).
--    Depois disso ninguém mais mudava, então o card seguia mostrando a foto de
--    quem pegou primeiro mesmo quando outra pessoa dava continuidade. Agora
--    existe transferência explícita, e ela troca o dono do atendimento.
--
-- 2) O histórico só registrava troca de STATUS. Passa a registrar também troca
--    de RESPONSÁVEL — quem passou para quem, e quando.
--
-- 3) A conversa era gravável por qualquer um que enxergasse o pedido (líder+ e
--    todos os responsáveis). Passa a aceitar mensagem apenas dos DOIS
--    envolvidos: quem abriu e quem está atendendo AGORA. Líder continua lendo.
--
-- Idempotente.

-- ─── 1. Histórico ganha o tipo de evento ────────────────────────────────────
ALTER TABLE public.solicitacoes_whatsapp_eventos
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'status';

ALTER TABLE public.solicitacoes_whatsapp_eventos
  ADD COLUMN IF NOT EXISTS responsavel_anterior UUID REFERENCES public.perfis(id) ON DELETE SET NULL;

ALTER TABLE public.solicitacoes_whatsapp_eventos
  ADD COLUMN IF NOT EXISTS responsavel_novo UUID REFERENCES public.perfis(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'solicitacoes_whatsapp_eventos_tipo_check'
  ) THEN
    ALTER TABLE public.solicitacoes_whatsapp_eventos
      ADD CONSTRAINT solicitacoes_whatsapp_eventos_tipo_check
      CHECK (tipo IN ('status', 'responsavel'));
  END IF;
END $$;

-- ─── 2. Trigger de histórico: status E responsável ──────────────────────────
-- Continua SECURITY DEFINER e sem policy de INSERT na tabela de eventos: o
-- histórico não depende de o usuário ter permissão de escrever nele, e ninguém
-- o reescreve.
CREATE OR REPLACE FUNCTION public.fn_wpp_registrar_evento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.solicitacoes_whatsapp_eventos
      (empresa_id, solicitacao_id, tipo, status_anterior, status_novo, autor_id)
    VALUES (NEW.empresa_id, NEW.id, 'status', NULL, NEW.status, NEW.solicitante_id);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.solicitacoes_whatsapp_eventos
      (empresa_id, solicitacao_id, tipo, status_anterior, status_novo, autor_id)
    VALUES (NEW.empresa_id, NEW.id, 'status', OLD.status, NEW.status, auth.uid());
  END IF;

  -- Troca de responsável. `status_novo` é NOT NULL, então repetimos o status
  -- atual — o que distingue a linha é o `tipo`.
  IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
    INSERT INTO public.solicitacoes_whatsapp_eventos
      (empresa_id, solicitacao_id, tipo, status_anterior, status_novo,
       responsavel_anterior, responsavel_novo, autor_id)
    VALUES (NEW.empresa_id, NEW.id, 'responsavel', NEW.status, NEW.status,
            OLD.responsavel_id, NEW.responsavel_id, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 3. Quem pode FALAR na conversa ─────────────────────────────────────────
-- Só os dois envolvidos: quem abriu e quem está atendendo AGORA. Líder e demais
-- responsáveis continuam LENDO (a policy de SELECT não muda) — a conversa é
-- registro do atendimento, mas conversa a três vira ruído e tira do responsável
-- a clareza de com quem ele está falando.
--
-- Consequência desejada: transferir o atendimento transfere também a voz. Quem
-- entregou para de escrever, quem assumiu passa a escrever.
CREATE OR REPLACE FUNCTION public.fn_wpp_pode_falar(p_solicitacao_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.solicitacoes_whatsapp s
    WHERE s.id = p_solicitacao_id
      AND (s.solicitante_id = auth.uid() OR s.responsavel_id = auth.uid())
  );
$$;

DROP POLICY IF EXISTS "sol_wpp_msg_insert" ON public.solicitacoes_whatsapp_mensagens;
CREATE POLICY "sol_wpp_msg_insert" ON public.solicitacoes_whatsapp_mensagens
  FOR INSERT WITH CHECK (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND autor_id = (SELECT auth.uid())
    AND public.fn_wpp_pode_falar(solicitacao_id)
    AND public.fn_wpp_chat_aberto(solicitacao_id)
  );

-- O SELECT das mensagens segue intocado: o histórico da conversa é anexo
-- permanente do atendimento e continua legível por quem enxerga o pedido.

COMMENT ON FUNCTION public.fn_wpp_pode_falar(UUID) IS
  'True se o usuário é um dos DOIS envolvidos no atendimento (quem abriu ou '
  'quem está atendendo agora). Governa só o envio de mensagem; a leitura da '
  'conversa continua valendo para quem enxerga o pedido.';
