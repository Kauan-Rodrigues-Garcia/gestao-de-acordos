-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFICAÇÕES — quem causou a notificação vira dado, não texto
-- ═══════════════════════════════════════════════════════════════════════════
-- Pedido de 11/08/2026: a notificação de mensagem do chat precisa mostrar a
-- FOTO de quem escreveu, e destacar a MENSAGEM em vez do título do atendimento
-- — como um mensageiro faz.
--
-- Hoje nada disso é possível: o autor existe apenas grudado no meio do texto
-- ("João: bom dia"), então a tela não tem como saber de quem é a foto nem onde
-- termina o nome e começa a mensagem.
--
-- Três colunas resolvem: id, nome e foto de quem causou.
--
-- ── Por que DESNORMALIZAR nome e foto ───────────────────────────────────────
-- Guardar só `autor_id` e resolver o perfil na hora de desenhar tem um problema
-- concreto neste projeto: a notificação chega por REALTIME, e o payload do
-- realtime é a linha crua — sem junção. A foto só apareceria depois de uma
-- consulta extra por notificação, justamente no card temporário, que dura
-- segundos. Guardando os três campos, o aviso nasce completo.
--
-- O custo é a foto congelar no valor da época. Para uma notificação, que vive
-- dias, isso não é defeito — e é o mesmo padrão que o resto do banco já usa
-- (`operador_nome`, `pago_por_nome`, `excluido_por_nome`).
--
-- Idempotente.

-- ─── 1. As colunas ──────────────────────────────────────────────────────────
ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS autor_id   UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS autor_nome TEXT,
  ADD COLUMN IF NOT EXISTS autor_foto TEXT;

COMMENT ON COLUMN public.notificacoes.autor_id IS
  'Quem causou a notificação (escreveu a mensagem, excluiu o registro). NULL '
  'quando não há pessoa por trás — importação, expurgo automático. Ver 20260811d.';
COMMENT ON COLUMN public.notificacoes.autor_nome IS
  'Nome do autor no momento do aviso. Desnormalizado de propósito: o payload do '
  'realtime não traz junção. Ver 20260811d.';
COMMENT ON COLUMN public.notificacoes.autor_foto IS
  'Foto do autor no momento do aviso. Mesmo motivo de autor_nome.';

-- ─── 2. Mensagem do chat: autor sai do texto e vira dado ────────────────────
--
-- `mensagem` passa a guardar SÓ o conteúdo. Antes vinha "João: bom dia", e a
-- tela não tinha como separar as duas coisas para dar destaque à frase.
--
-- O `titulo` continua "Nova mensagem — CLIENTE": ele é o que a classificação
-- por título lê (`notificacoes-tipo.ts`) e o que aparece em qualquer lugar que
-- não conheça o formato novo.
--
-- Linhas antigas seguem com o prefixo no texto; a tela remove quando reconhece.
CREATE OR REPLACE FUNCTION public.fn_wpp_notificar_mensagem()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol       public.solicitacoes_whatsapp%ROWTYPE;
  v_cliente   TEXT;
  v_autor     TEXT;
  v_foto      TEXT;
BEGIN
  SELECT * INTO v_sol
    FROM public.solicitacoes_whatsapp
   WHERE id = NEW.solicitacao_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_cliente := COALESCE(NULLIF(TRIM(v_sol.nome_cliente), ''), v_sol.codigo_cliente, 'cliente');

  -- Nome COMPLETO, não mais só o primeiro: agora ele é o título do aviso, e é
  -- onde a pessoa reconhece quem falou. O primeiro nome sozinho confunde quando
  -- há duas Marias na equipe.
  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguém'), p.foto_url
    INTO v_autor, v_foto
    FROM public.perfis p
   WHERE p.id = NEW.autor_id;

  -- Participantes da thread menos o autor. O DISTINCT cobre o caso de o
  -- solicitante ter assumido o próprio pedido (os dois campos iguais), que
  -- geraria duas notificações idênticas.
  INSERT INTO public.notificacoes
    (usuario_id, empresa_id, titulo, mensagem, lida, rota,
     autor_id, autor_nome, autor_foto)
  SELECT DISTINCT destinatario,
         NEW.empresa_id,
         'Nova mensagem — ' || v_cliente,
         LEFT(NEW.conteudo, 140),
         false,
         '/solicitacoes-whatsapp',
         NEW.autor_id,
         COALESCE(v_autor, 'Alguém'),
         v_foto
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
  'da thread, com autor, nome e foto em colunas próprias — a tela mostra a '
  'mensagem em destaque e a foto de quem escreveu. Ver 20260811d.';

-- ─── 3. Os outros avisos também ganham autor ────────────────────────────────
--
-- Não é enfeite: "Alguém excluiu o seu registro" com a cara da pessoa ao lado é
-- outra conversa. Os dois casos abaixo são os que têm uma pessoa identificável
-- por trás (`auth.uid()`); o resto do sistema — importação, expurgo por prazo —
-- não tem autor e continua com as colunas nulas, que é a verdade.

CREATE OR REPLACE FUNCTION public.fn_wpp_notificar_exclusao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente TEXT;
  v_autor   TEXT;
  v_foto    TEXT;
  v_quem    UUID := auth.uid();
BEGIN
  v_cliente := COALESCE(NULLIF(TRIM(OLD.nome_cliente), ''), OLD.codigo_cliente, 'o cliente');

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguém'), p.foto_url
    INTO v_autor, v_foto
    FROM public.perfis p
   WHERE p.id = v_quem;

  -- Solicitante e responsável, menos quem clicou. O DISTINCT cobre o caso de os
  -- dois serem a mesma pessoa (abriu e assumiu o próprio pedido).
  INSERT INTO public.notificacoes
    (usuario_id, empresa_id, titulo, mensagem, lida, rota,
     autor_id, autor_nome, autor_foto)
  SELECT DISTINCT
         destinatario,
         OLD.empresa_id,
         'Solicitação excluída — ' || v_cliente,
         COALESCE(SPLIT_PART(v_autor, ' ', 1), 'Alguém')
           || CASE WHEN destinatario = OLD.responsavel_id
                   THEN ' excluiu o pedido de ' || v_cliente
                        || ' (' || OLD.codigo_cliente || '), que estava com você.'
                   ELSE ' excluiu o seu pedido de ' || v_cliente
                        || ' (' || OLD.codigo_cliente || ').'
              END,
         false,
         '/solicitacoes-whatsapp',
         v_quem,
         v_autor,
         v_foto
    FROM (
      SELECT OLD.responsavel_id AS destinatario
      UNION
      SELECT OLD.solicitante_id
    ) AS envolvidos
   WHERE destinatario IS NOT NULL
     AND (v_quem IS NULL OR destinatario <> v_quem);

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_pix_registrar_exclusao()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_quem UUID := auth.uid();
  v_nome TEXT;
  v_foto TEXT;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguém'), p.foto_url
    INTO v_nome, v_foto
    FROM public.perfis p
   WHERE p.id = v_quem;

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
      (usuario_id, empresa_id, titulo, mensagem, lida, rota,
       autor_id, autor_nome, autor_foto)
    VALUES (
      OLD.operador_id,
      OLD.empresa_id,
      'Pix automático — registro excluído',
      COALESCE(v_nome, 'Alguém') || ' excluiu o seu registro do NR '
        || OLD.nr_cliente || ' (R$ ' || public.fn_pix_valor_br(OLD.valor)
        || ', ' || OLD.status || ').',
      false,
      '/acordos?tab=pix',
      v_quem,
      v_nome,
      v_foto
    );
  END IF;

  RETURN OLD;
END;
$$;
