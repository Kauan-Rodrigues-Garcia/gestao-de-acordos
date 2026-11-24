-- ============================================================================
-- Tickets: participantes (várias pessoas no mesmo ticket) e anexos do pedido
-- ============================================================================
--
-- ## O que muda
--
-- 1. PARTICIPANTES. Um ticket tinha duas pessoas: quem abriu e quem assumiu.
--    Agora dá para chamar mais gente — o líder de outro setor envolvido, o
--    segundo atendente que entende do assunto. Participante:
--      * ENXERGA o ticket, mesmo fora do próprio setor;
--      * FALA na conversa e manda anexo;
--      * RECEBE aviso de mensagem, de mudança de estado e de transferência;
--      * NÃO muda estado, prioridade nem responsável (a guarda de edição segue
--        igual: isso continua sendo de quem atende).
--    Quem chama: quem atende, quem abriu ou quem já participa. Quem tira: os
--    mesmos, e a própria pessoa (sair do ticket).
--
-- 2. ANEXOS DO PEDIDO. O formulário de abertura passa a aceitar fotos e
--    prints. Eles sobem depois de o ticket existir (o caminho no balde leva o
--    id dele) e são gravados como mensagem com `do_pedido = true` — a tela os
--    mostra dentro do cartão do pedido, e não como uma fala solta. Só quem
--    abriu pode gravar mensagem do pedido.
--
-- 3. TRANSFERIR não precisa de banco novo: `responsavel_id` já aceita outra
--    pessoa para quem atende. O aviso de troca de responsável passa a chegar
--    também a quem largou o ticket e aos participantes.
--
-- ## Visibilidade
--
-- `fn_ticket_visivel(empresa, setor, aberto_por)` não sabe QUAL ticket é, e
-- por isso não tem como perguntar por participante. Nasce a versão de quatro
-- argumentos (id primeiro), que é a antiga OU participante. As políticas de
-- leitura de tickets, mensagens e eventos passam para ela. A de três fica —
-- `fn_ticket_excluir` e a política de UPDATE continuam usando, e para elas o
-- participante não muda nada.
--
-- Os anexos no balde não precisam de política nova: a leitura e a escrita
-- perguntam `EXISTS (SELECT 1 FROM tickets ...)`, que passa pela RLS de
-- `tickets` — e essa agora conhece o participante.
--
-- Idempotente: pode rodar de novo sem quebrar.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Tabela de participantes ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tickets_participantes (
  ticket_id      UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  perfil_id      UUID NOT NULL REFERENCES public.perfis(id)  ON DELETE CASCADE,
  -- Cópia do nome, como em `tickets.responsavel_nome`: a lista abre sem JOIN.
  perfil_nome    TEXT,
  adicionado_por UUID,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, perfil_id)
);

CREATE INDEX IF NOT EXISTS idx_tickets_participantes_perfil
  ON public.tickets_participantes(perfil_id);

ALTER TABLE public.tickets_participantes ENABLE ROW LEVEL SECURITY;

-- ── 2. Anexo do pedido ──────────────────────────────────────────────────────

ALTER TABLE public.tickets_mensagens
  ADD COLUMN IF NOT EXISTS do_pedido BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.tickets_mensagens.do_pedido IS
  'Anexos enviados no formulário de abertura. A tela mostra dentro do cartão do pedido.';

-- ── 3. Visibilidade que conhece o participante ──────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ticket_visivel(
  p_ticket_id UUID, p_empresa_id UUID, p_setor_id UUID, p_aberto_por UUID
)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.fn_ticket_visivel(p_empresa_id, p_setor_id, p_aberto_por)
      OR (
           public.fn_can_access_empresa(p_empresa_id)
           AND EXISTS (
             SELECT 1 FROM public.tickets_participantes tp
              WHERE tp.ticket_id = p_ticket_id
                AND tp.perfil_id = (SELECT auth.uid())
           )
         );
$$;

COMMENT ON FUNCTION public.fn_ticket_visivel(UUID, UUID, UUID, UUID) IS
  'fn_ticket_visivel(empresa, setor, aberto_por) OU participante do ticket.';

REVOKE ALL ON FUNCTION public.fn_ticket_visivel(UUID, UUID, UUID, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_ticket_visivel(UUID, UUID, UUID, UUID) TO authenticated;

ALTER POLICY tickets_select ON public.tickets
  USING (public.fn_ticket_visivel(id, empresa_id, setor_id, aberto_por));

ALTER POLICY tickets_msg_select ON public.tickets_mensagens
  USING (EXISTS (
    SELECT 1 FROM public.tickets t
     WHERE t.id = ticket_id
       AND public.fn_ticket_visivel(t.id, t.empresa_id, t.setor_id, t.aberto_por)
  ));

-- Mensagem do pedido (`do_pedido`) só de quem abriu: é o que a pessoa anexou
-- ao pedir, e ninguém mais fala por ela ali.
ALTER POLICY tickets_msg_insert ON public.tickets_mensagens
  WITH CHECK (
    autor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tickets t
       WHERE t.id = ticket_id
         AND public.fn_ticket_visivel(t.id, t.empresa_id, t.setor_id, t.aberto_por)
         AND (NOT do_pedido OR t.aberto_por = (SELECT auth.uid()))
    )
  );

ALTER POLICY tickets_ev_select ON public.tickets_eventos
  USING (EXISTS (
    SELECT 1 FROM public.tickets t
     WHERE t.id = ticket_id
       AND public.fn_ticket_visivel(t.id, t.empresa_id, t.setor_id, t.aberto_por)
  ));

DROP POLICY IF EXISTS tickets_part_select ON public.tickets_participantes;
CREATE POLICY tickets_part_select ON public.tickets_participantes FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tickets t
   WHERE t.id = ticket_id
     AND public.fn_ticket_visivel(t.id, t.empresa_id, t.setor_id, t.aberto_por)
));

-- Sem INSERT/DELETE direto: entra e sai pelas funções abaixo, que gravam a
-- trilha e avisam. Participante que entra sem trilha é gente lendo escondido.
GRANT SELECT ON public.tickets_participantes TO authenticated;
REVOKE ALL ON public.tickets_participantes FROM anon;

-- ── 4. Chamar e tirar participantes ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ticket_participantes_adicionar(
  p_ticket UUID, p_perfis UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_autor  TEXT := public.fn_ticket_nome_do_autor();
  v_t      public.tickets%ROWTYPE;
  v_novos  UUID[];
  v_nomes  TEXT;
  v_qtd    INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'TICKET_SEM_PERMISSAO: Sessão expirada. Entre novamente.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_t FROM public.tickets WHERE id = p_ticket;
  IF NOT FOUND
     OR NOT public.fn_ticket_visivel(v_t.id, v_t.empresa_id, v_t.setor_id, v_t.aberto_por) THEN
    RAISE EXCEPTION 'TICKET_SEM_PERMISSAO: Ticket não encontrado.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
       public.fn_ticket_pode_atender()
    OR v_t.aberto_por = v_uid
    OR EXISTS (SELECT 1 FROM public.tickets_participantes
                WHERE ticket_id = p_ticket AND perfil_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'TICKET_SEM_PERMISSAO: só quem atende, quem abriu ou quem já participa chama mais pessoas.'
      USING ERRCODE = '42501';
  END IF;

  IF v_t.status IN ('concluido','recusado','cancelado') THEN
    RAISE EXCEPTION 'TICKET_SEM_PERMISSAO: ticket encerrado não recebe novos participantes.'
      USING ERRCODE = '42501';
  END IF;

  -- Só gente da mesma empresa e ativa. Quem abriu já está no ticket por
  -- definição e não vira participante.
  WITH novos AS (
    INSERT INTO public.tickets_participantes (ticket_id, perfil_id, perfil_nome, adicionado_por)
    SELECT p_ticket, p.id, COALESCE(p.nome, p.usuario, 'Sem nome'), v_uid
      FROM public.perfis p
     WHERE p.id = ANY(COALESCE(p_perfis, ARRAY[]::UUID[]))
       AND p.empresa_id = v_t.empresa_id
       AND COALESCE(p.ativo, TRUE)
       AND p.id <> v_t.aberto_por
    ON CONFLICT (ticket_id, perfil_id) DO NOTHING
    RETURNING perfil_id, perfil_nome
  )
  SELECT array_agg(perfil_id), string_agg(perfil_nome, ', ' ORDER BY perfil_nome), count(*)
    INTO v_novos, v_nomes, v_qtd
    FROM novos;

  IF COALESCE(v_qtd, 0) = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.tickets_eventos (ticket_id, autor_id, autor_nome, tipo, para)
  VALUES (p_ticket, v_uid, v_autor, 'participante_entrou', v_nomes);

  PERFORM public.fn_ticket_notificar(
    v_t.empresa_id, p_ticket, v_novos,
    'Ticket #' || v_t.numero || ': você foi chamado',
    v_autor || ' chamou você para o ticket "' || v_t.assunto || '".'
  );

  -- O toque que faz a fila reler (o aviso da lista escuta `tickets`).
  UPDATE public.tickets SET atualizado_em = now() WHERE id = p_ticket;

  RETURN v_qtd;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_ticket_participante_remover(
  p_ticket UUID, p_perfil UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_t     public.tickets%ROWTYPE;
  v_nome  TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'TICKET_SEM_PERMISSAO: Sessão expirada. Entre novamente.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_t FROM public.tickets WHERE id = p_ticket;
  IF NOT FOUND
     OR NOT public.fn_ticket_visivel(v_t.id, v_t.empresa_id, v_t.setor_id, v_t.aberto_por) THEN
    RAISE EXCEPTION 'TICKET_SEM_PERMISSAO: Ticket não encontrado.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.fn_ticket_pode_atender() OR v_t.aberto_por = v_uid OR p_perfil = v_uid) THEN
    RAISE EXCEPTION 'TICKET_SEM_PERMISSAO: só quem atende ou quem abriu tira outra pessoa do ticket.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.tickets_participantes
   WHERE ticket_id = p_ticket AND perfil_id = p_perfil
  RETURNING perfil_nome INTO v_nome;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.tickets_eventos (ticket_id, autor_id, autor_nome, tipo, de)
  VALUES (p_ticket, v_uid, public.fn_ticket_nome_do_autor(),
          CASE WHEN p_perfil = v_uid THEN 'participante_saiu_sozinho' ELSE 'participante_saiu' END,
          v_nome);

  UPDATE public.tickets SET atualizado_em = now() WHERE id = p_ticket;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ticket_participantes_adicionar(UUID, UUID[]) FROM anon, public;
REVOKE ALL ON FUNCTION public.fn_ticket_participante_remover(UUID, UUID)      FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_ticket_participantes_adicionar(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ticket_participante_remover(UUID, UUID)      TO authenticated;

-- ── 5. Avisos chegam aos participantes ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ticket_participantes_ids(p_ticket UUID)
RETURNS UUID[]
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(perfil_id), ARRAY[]::UUID[])
    FROM public.tickets_participantes WHERE ticket_id = p_ticket;
$$;

REVOKE ALL ON FUNCTION public.fn_ticket_participantes_ids(UUID) FROM anon, public, authenticated;

/** Rótulo de gente para o estado, na frase da notificação. */
CREATE OR REPLACE FUNCTION public.fn_ticket_rotulo_status(p_status TEXT)
RETURNS TEXT
LANGUAGE SQL IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT CASE p_status
    WHEN 'aberto'       THEN 'Aberto'
    WHEN 'em_andamento' THEN 'Em andamento'
    WHEN 'pendente'     THEN 'Pendente'
    WHEN 'concluido'    THEN 'Concluído'
    WHEN 'recusado'     THEN 'Recusado'
    WHEN 'cancelado'    THEN 'Cancelado'
    ELSE p_status
  END;
$$;

CREATE OR REPLACE FUNCTION public.fn_ticket_apos_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_nome TEXT   := public.fn_ticket_nome_do_autor();
  v_part UUID[] := public.fn_ticket_participantes_ids(NEW.id);
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.tickets_eventos (ticket_id, autor_id, autor_nome, tipo, de, para)
    VALUES (NEW.id, auth.uid(), v_nome, 'status', OLD.status, NEW.status);

    PERFORM public.fn_ticket_notificar(
      NEW.empresa_id, NEW.id, ARRAY[NEW.aberto_por, NEW.responsavel_id] || v_part,
      'Ticket #' || NEW.numero || ': ' || public.fn_ticket_rotulo_status(NEW.status),
      v_nome || ' mudou o ticket "' || NEW.assunto || '" para '
        || public.fn_ticket_rotulo_status(NEW.status) || '.'
    );
  END IF;

  IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
    INSERT INTO public.tickets_eventos (ticket_id, autor_id, autor_nome, tipo, de, para)
    VALUES (NEW.id, auth.uid(), v_nome, 'responsavel',
            OLD.responsavel_nome, NEW.responsavel_nome);

    -- Quem largou o ticket também fica sabendo para onde ele foi.
    PERFORM public.fn_ticket_notificar(
      NEW.empresa_id, NEW.id,
      ARRAY[NEW.aberto_por, NEW.responsavel_id, OLD.responsavel_id] || v_part,
      CASE
        WHEN NEW.responsavel_id IS NULL THEN 'Ticket #' || NEW.numero || ' voltou para a fila'
        WHEN OLD.responsavel_id IS NULL THEN 'Ticket #' || NEW.numero || ' tem responsável'
        ELSE 'Ticket #' || NEW.numero || ' foi transferido'
      END,
      CASE
        WHEN NEW.responsavel_id IS NULL
          THEN v_nome || ' devolveu "' || NEW.assunto || '" para a fila.'
        WHEN OLD.responsavel_id IS NULL
          THEN COALESCE(NEW.responsavel_nome, 'Alguém') || ' está cuidando de "' || NEW.assunto || '".'
        ELSE v_nome || ' transferiu "' || NEW.assunto || '" de '
               || COALESCE(OLD.responsavel_nome, 'alguém') || ' para '
               || COALESCE(NEW.responsavel_nome, 'alguém') || '.'
      END
    );
  END IF;

  IF NEW.prioridade IS DISTINCT FROM OLD.prioridade THEN
    INSERT INTO public.tickets_eventos (ticket_id, autor_id, autor_nome, tipo, de, para)
    VALUES (NEW.id, auth.uid(), v_nome, 'prioridade', OLD.prioridade, NEW.prioridade);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_ticket_apos_mensagem()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  t public.tickets%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Anexo do pedido não é conversa: quem atende já foi avisado da abertura.
  IF NOT COALESCE(NEW.do_pedido, FALSE) THEN
    -- Quem abriu, quem assumiu e quem foi chamado. O resto da liderança do
    -- setor vê na aba; avisar todos transformaria a campainha em ruído.
    PERFORM public.fn_ticket_notificar(
      t.empresa_id, t.id,
      ARRAY[t.aberto_por, t.responsavel_id] || public.fn_ticket_participantes_ids(t.id),
      'Ticket #' || t.numero || ': nova mensagem',
      COALESCE(NEW.autor_nome, 'Alguém') || ': '
        || LEFT(COALESCE(NULLIF(TRIM(NEW.texto), ''), '[anexo]'), 120)
    );
  END IF;

  UPDATE public.tickets SET atualizado_em = NOW() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

-- ── Verificação ─────────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF to_regclass('public.tickets_participantes') IS NULL THEN
    RAISE EXCEPTION 'tickets_participantes não foi criada.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tickets_mensagens' AND column_name = 'do_pedido'
  ) THEN
    RAISE EXCEPTION 'tickets_mensagens.do_pedido não foi criada.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'tickets' AND policyname = 'tickets_select'
       AND qual LIKE '%fn_ticket_visivel(id,%'
  ) THEN
    RAISE EXCEPTION 'tickets_select não passou para a visibilidade com participante.';
  END IF;
END;
$verificacao$;

COMMIT;
