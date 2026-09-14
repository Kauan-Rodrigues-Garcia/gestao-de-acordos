-- ============================================================================
-- Tickets: excluir
-- ============================================================================
--
-- Pedido de 14/09/2026: «botao para excluir tickets». Decisao do mesmo dia:
-- chave propria no painel, exclusao DEFINITIVA com confirmacao.
--
-- ## Depende de 20260914170000
--
-- A cadeia de `fn_permissoes_catalogo` parte do retrato congelado pela aba
-- Fechamento (`fn_permissoes_catalogo_antes_fechamento_20260914`). Aplicar esta
-- migration antes daquela falha no passo 1, sem alterar nada.
--
-- ## Por que RPC, e nao a policy de DELETE
--
-- `tickets_delete` so libera `administrar_sistema`. Abrir a policy para a chave
-- nova deixaria qualquer cliente montar `DELETE FROM tickets` sem o recorte de
-- quem ENXERGA o ticket. `fn_ticket_excluir` confere as duas coisas: a chave e
-- `fn_ticket_visivel` sobre o proprio ticket.
--
-- Mensagens e eventos saem em cascata (FK ON DELETE CASCADE). A trilha do
-- ticket some junto — o registro da exclusao fica no log de auditoria, gravado
-- pelo cliente depois que esta funcao responde.
--
-- ## Os anexos
--
-- Moram no bucket `tickets`, sob `empresa/ticket/`. O Storage nao aceita apagar
-- arquivo por SQL, entao o cliente apaga o prefixo depois da exclusao. A policy
-- de DELETE do bucket so deixava o DONO do arquivo apagar; quem tem a chave
-- passa a poder tambem.
--
-- Escrita de dados: nenhuma. Nenhum cargo ganha a chave aqui — administrador e
-- super_admin a recebem por acesso total; os demais, pelo painel de Permissoes.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. Catalogo de permissoes
-- ============================================================================
--
-- Congela o catalogo de hoje (corpo de 20260914170000) e redefine a de cima.

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo_antes_tickets_excluir_20260914()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_fechamento_20260914()
  UNION ALL
  SELECT * FROM (VALUES
    ('ver_fechamento',                  ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('fechamento_escopo_setor',         ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('fechamento_escopo_todos_setores', ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('fechamento_editar',               ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_tickets_excluir_20260914() IS
  'Retrato do catalogo antes da chave tickets_excluir (14/09/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_tickets_excluir_20260914()
  UNION ALL
  SELECT * FROM (VALUES
    -- Excluir ticket. Nas duas operacoes, como as outras chaves de Tickets.
    -- Padrao vazio: ninguem nasce com ela.
    ('tickets_excluir', NULL::TEXT[], ARRAY[]::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

-- ============================================================================
-- 2. A exclusao
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_ticket_excluir(p_ticket UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ticket public.tickets%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'TICKET_SEM_PERMISSAO: Sessao expirada. Entre novamente.';
  END IF;

  IF NOT public.fn_user_tem('tickets_excluir') THEN
    RAISE EXCEPTION 'TICKET_SEM_PERMISSAO: Excluir ticket depende da permissao «Tickets: excluir».';
  END IF;

  SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket FOR UPDATE;

  -- Nao existe e nao enxerga respondem igual: dizer «existe, mas nao e seu»
  -- confirmaria um ticket de outro setor.
  IF NOT FOUND
     OR NOT public.fn_ticket_visivel(v_ticket.empresa_id, v_ticket.setor_id, v_ticket.aberto_por) THEN
    RAISE EXCEPTION 'TICKET_SEM_PERMISSAO: Ticket nao encontrado.';
  END IF;

  DELETE FROM public.tickets WHERE id = p_ticket;

  RETURN jsonb_build_object(
    'id',         v_ticket.id,
    'numero',     v_ticket.numero,
    'empresa_id', v_ticket.empresa_id,
    'assunto',    v_ticket.assunto
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ticket_excluir(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ticket_excluir(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_ticket_excluir(UUID) IS
  'Exclui um ticket de vez (mensagens e eventos em cascata). Exige tickets_excluir e '
  'enxergar o ticket (fn_ticket_visivel). Devolve id, numero, empresa_id e assunto '
  'para o cliente apagar os anexos e registrar o log.';

-- ============================================================================
-- 3. Os anexos do ticket excluido
-- ============================================================================

DROP POLICY IF EXISTS tickets_anexo_delete_excluir ON storage.objects;
CREATE POLICY tickets_anexo_delete_excluir ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'tickets' AND (SELECT public.fn_user_tem('tickets_excluir')));

COMMIT;
