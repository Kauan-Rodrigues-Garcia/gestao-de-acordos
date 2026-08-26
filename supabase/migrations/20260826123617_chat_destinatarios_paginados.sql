-- ============================================================================
-- Chat — destinatários paginados de um disparo
-- ============================================================================
--
-- `chat_disparo_destinos` já deixa o autor ler as próprias linhas pela RLS.
-- O nome e a foto, porém, moram em `perfis`, cuja RLS é mais estreita para
-- alguns cargos. Um operador que pôde fazer o disparo pela RPC de contatos não
-- necessariamente pode consultar depois cada perfil diretamente pela Data API.
--
-- Esta função atravessa somente essa diferença: ela devolve os dados mínimos
-- dos destinatários, mas apenas quando:
--
--   * existe uma sessão autenticada;
--   * o chat continua liberado para a pessoa;
--   * auth.uid() é o autor do disparo pedido.
--
-- Disparo inexistente e disparo de outra pessoa produzem a mesma lista vazia,
-- sem revelar se o UUID pertence a alguém.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_chat_destinos_disparo(
  p_disparo UUID,
  p_inicio  INTEGER DEFAULT 0,
  p_limite  INTEGER DEFAULT 51
)
RETURNS TABLE (
  perfil_id    UUID,
  conversa_id  UUID,
  nome         TEXT,
  usuario      TEXT,
  foto_url     TEXT,
  empresa_slug TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT destino.perfil_id,
         destino.conversa_id,
         perfil.nome,
         perfil.usuario,
         perfil.foto_url,
         empresa.slug
    FROM public.chat_disparo_destinos AS destino
    JOIN public.perfis AS perfil
      ON perfil.id = destino.perfil_id
    LEFT JOIN public.empresas AS empresa
      ON empresa.id = perfil.empresa_id
   WHERE destino.disparo_id = p_disparo
     AND public.fn_chat_pode_usar()
     AND EXISTS (
       SELECT 1
         FROM public.chat_disparos AS disparo
        WHERE disparo.id = destino.disparo_id
          AND disparo.autor_id = (SELECT auth.uid())
     )
   ORDER BY destino.perfil_id
  OFFSET GREATEST(COALESCE(p_inicio, 0), 0)
   LIMIT LEAST(GREATEST(COALESCE(p_limite, 51), 1), 51);
$$;

REVOKE ALL ON FUNCTION public.fn_chat_destinos_disparo(UUID, INTEGER, INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_chat_destinos_disparo(UUID, INTEGER, INTEGER)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_destinos_disparo(UUID, INTEGER, INTEGER)
  TO authenticated;

COMMENT ON FUNCTION public.fn_chat_destinos_disparo(UUID, INTEGER, INTEGER) IS
  'Lista paginada dos destinatarios de um disparo. So o autor autenticado, com chat liberado, recebe linhas.';
