-- ============================================================================
-- 20260731c — Quem abriu o pedido pode excluí-lo, e quem atende fica sabendo
-- ============================================================================
--
-- ANTES: o dono perdia o botão de excluir assim que o pedido saía de
-- 'pendente'. Na prática o pedido que precisa sumir é justamente o que já
-- andou — o cliente ligou de volta, o código estava errado, a mensagem não é
-- mais necessária. Quem abriu é quem sabe disso, e ficava dependendo de um
-- líder para apagar.
--
-- AGORA: o solicitante exclui em qualquer status. O responsável continua de
-- fora (atende, não descarta) e líder+ segue podendo tudo.
--
-- A contrapartida: excluir um pedido que está com alguém tira trabalho da mesa
-- dessa pessoa sem aviso. O trigger abaixo notifica quem estava envolvido.
--
-- Idempotente.
-- ============================================================================

-- ── 1. Policy: o dono não depende mais do status ────────────────────────────

DROP POLICY IF EXISTS "sol_wpp_delete" ON public.solicitacoes_whatsapp;
CREATE POLICY "sol_wpp_delete" ON public.solicitacoes_whatsapp
  FOR DELETE USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (
      (SELECT public.fn_user_has_any_role(
         ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']))
      OR solicitante_id = (SELECT auth.uid())
    )
  );

-- ── 2. Aviso para quem estava envolvido ─────────────────────────────────────
--
-- SECURITY DEFINER pelo mesmo motivo de `fn_wpp_notificar_mensagem`: a linha
-- nasce para OUTRA pessoa, e a policy `notificacoes_own` só deixa cada um
-- escrever no que é seu. `search_path` fixo para o DEFINER não ser sequestrado.
--
-- BEFORE DELETE, não AFTER: os eventos e mensagens caem por CASCADE junto com o
-- pedido, e ler `OLD` antes disso é o momento em que tudo ainda está de pé.

CREATE OR REPLACE FUNCTION public.fn_wpp_notificar_exclusao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente TEXT;
  v_autor   TEXT;
  v_quem    UUID := auth.uid();
BEGIN
  v_cliente := COALESCE(NULLIF(TRIM(OLD.nome_cliente), ''), OLD.codigo_cliente, 'o cliente');

  SELECT COALESCE(NULLIF(TRIM(SPLIT_PART(p.nome, ' ', 1)), ''), 'Alguém')
    INTO v_autor
    FROM public.perfis p
   WHERE p.id = v_quem;

  -- Solicitante e responsável, menos quem clicou. O DISTINCT cobre o caso de os
  -- dois serem a mesma pessoa (abriu e assumiu o próprio pedido).
  INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
  SELECT DISTINCT
         destinatario,
         OLD.empresa_id,
         'Solicitação excluída — ' || v_cliente,
         COALESCE(v_autor, 'Alguém')
           || CASE WHEN destinatario = OLD.responsavel_id
                   THEN ' excluiu o pedido de ' || v_cliente
                        || ' (' || OLD.codigo_cliente || '), que estava com você.'
                   ELSE ' excluiu o seu pedido de ' || v_cliente
                        || ' (' || OLD.codigo_cliente || ').'
              END,
         false,
         '/solicitacoes-whatsapp'
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

COMMENT ON FUNCTION public.fn_wpp_notificar_exclusao() IS
  'Avisa solicitante e responsável quando o pedido é excluído por outra '
  'pessoa. Sem isto o atendimento sumia da tela de quem estava atendendo.';

DROP TRIGGER IF EXISTS trg_wpp_notificar_exclusao ON public.solicitacoes_whatsapp;

CREATE TRIGGER trg_wpp_notificar_exclusao
  BEFORE DELETE ON public.solicitacoes_whatsapp
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_wpp_notificar_exclusao();
