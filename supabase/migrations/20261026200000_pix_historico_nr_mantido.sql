-- ═══════════════════════════════════════════════════════════════════════════
-- Pix Automático: «Manter com …» entra no Histórico (26/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O caso
--
-- Na sub-aba «NRs divergentes», o líder decide com quem fica um NR em disputa.
-- «Transferir» já aparecia no Histórico — tira o acordo de um (exclusão) e cria
-- o do outro (registro), e os gatilhos de `pix_automatico_acordos` escrevem as
-- duas linhas. «Manter» não aparecia em lugar nenhum: a recusa
-- (`fn_pix_nr_pedido_decidir`, p_aprovar = false) só muda o pedido para
-- `recusado`, nenhum acordo é tocado, e o Histórico só ouve os acordos.
--
-- A decisão de um líder sobre de quem é um NR sumia da auditoria da aba.
--
-- ## O que muda
--
--   1. A ação `nr_mantido` no Histórico.
--   2. Um gatilho em `pix_automatico_nr_pedidos`: o pedido que passa de
--      `pendente` a `recusado` escreve uma linha no Histórico do acordo que
--      ficou (`conflito_acordo_id`), em nome do dono dele, com quem decidiu e
--      o motivo.
--   3. Os pedidos já recusados ganham a linha, na data da decisão.
--
-- Escrito por gatilho, como o resto do Histórico: log que a tela grava tem furo
-- no dia em que alguém esquece de chamar. A linha leva o autor do próprio
-- pedido (`decidido_por`), e não `auth.uid()`, para que o preenchimento do
-- passado diga quem decidiu de verdade.
--
-- Reaplicável.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. A ação nova ──────────────────────────────────────────────────────────
--
-- A lista de 20260823080000, mais `nr_mantido`.

ALTER TABLE public.pix_automatico_log
  DROP CONSTRAINT IF EXISTS pix_automatico_log_acao_check;

ALTER TABLE public.pix_automatico_log
  ADD CONSTRAINT pix_automatico_log_acao_check CHECK (acao IN (
    'registrado', 'restaurado', 'editado',
    'aprovado', 'desaprovado', 'voltou_pendente',
    'pago', 'pagamento_desfeito', 'excluido',
    'saldo_anotado', 'saldo_alterado', 'saldo_removido',
    'saldo_aplicado', 'saldo_retirado', 'saldo_quitado', 'saldo_devolvido',
    'nr_mantido'
  ));

-- ── 2. A frase ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pix_nr_mantido_descricao(p public.pix_automatico_nr_pedidos)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT 'Manteve o NR ' || p.nr_cliente
      || ' com ' || coalesce(nullif(trim(p.conflito_operador), ''), 'quem já tinha')
      -- `fn_pix_valor_br(NULL)` dá '0,00': sem o valor, a frase o omite.
      || CASE WHEN p.conflito_valor IS NULL THEN ''
              ELSE ' (R$ ' || public.fn_pix_valor_br(p.conflito_valor) || ')' END
      || '. O pedido de ' || coalesce(nullif(trim(p.operador_nome), ''), 'outra pessoa')
      || ' para registrá-lo (R$ ' || public.fn_pix_valor_br(p.valor) || ') foi recusado.'
      || coalesce(' Motivo: ' || nullif(trim(p.decisao_motivo), '') || '.', '');
$function$;

-- ── 3. O gatilho ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pix_log_nr_mantido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.pix_automatico_log (
    empresa_id, acordo_id, nr_cliente, acao, descricao, valor,
    operador_id, operador_nome, autor_id, autor_nome, antes, depois, criado_em
  ) VALUES (
    NEW.empresa_id, NEW.conflito_acordo_id, NEW.nr_cliente, 'nr_mantido',
    public.fn_pix_nr_mantido_descricao(NEW), NEW.conflito_valor,
    NEW.conflito_operador_id, NEW.conflito_operador,
    NEW.decidido_por, coalesce(nullif(trim(NEW.decidido_por_nome), ''), 'Sistema'),
    to_jsonb(OLD), to_jsonb(NEW), coalesce(NEW.decidido_em, now())
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pix_log_nr_mantido ON public.pix_automatico_nr_pedidos;
CREATE TRIGGER trg_pix_log_nr_mantido
  AFTER UPDATE OF status ON public.pix_automatico_nr_pedidos
  FOR EACH ROW
  WHEN (OLD.status = 'pendente' AND NEW.status = 'recusado')
  EXECUTE FUNCTION public.fn_pix_log_nr_mantido();

COMMENT ON FUNCTION public.fn_pix_log_nr_mantido() IS
  'Escreve no Histórico do Pix a decisão «Manter com …» (pedido de NR recusado), '
  'no acordo que ficou. Ver 20261026200000.';

-- ── 4. O passado ────────────────────────────────────────────────────────────
--
-- Os pedidos já recusados, na data da decisão. `depois` guarda o id do pedido,
-- e é por ele que a reaplicação não duplica.

INSERT INTO public.pix_automatico_log (
  empresa_id, acordo_id, nr_cliente, acao, descricao, valor,
  operador_id, operador_nome, autor_id, autor_nome, antes, depois, criado_em
)
SELECT
  p.empresa_id, p.conflito_acordo_id, p.nr_cliente, 'nr_mantido',
  public.fn_pix_nr_mantido_descricao(p), p.conflito_valor,
  p.conflito_operador_id, p.conflito_operador,
  p.decidido_por, coalesce(nullif(trim(p.decidido_por_nome), ''), 'Sistema'),
  NULL, to_jsonb(p), coalesce(p.decidido_em, p.criado_em)
FROM public.pix_automatico_nr_pedidos p
WHERE p.status = 'recusado'
  AND NOT EXISTS (
    SELECT 1 FROM public.pix_automatico_log l
     WHERE l.acao = 'nr_mantido'
       AND l.depois ->> 'id' = p.id::text
  );

COMMIT;
