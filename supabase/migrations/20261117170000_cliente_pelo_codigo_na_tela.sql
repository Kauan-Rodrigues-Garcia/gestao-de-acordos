-- ============================================================================
-- Tela de novo acordo: nome e instituição ao digitar o NR / Código
-- ============================================================================
--
-- ## Por que
--
-- Pedido do Cleber, 17/11/2026: «igual à Cofen». Na regra Cofen, digitar o
-- Código já busca o cliente na tabela `profissionais` (hook useProfissional) e
-- preenche o formulário. Na BookPlay não havia nada parecido: o nome e a
-- instituição só eram completados pelo gatilho, DEPOIS de salvar
-- (20261117120000).
--
-- ## O que entra
--
-- `fn_cliente_pelo_codigo`: a mesma busca do gatilho (`fn_cliente_conhecido`
-- — acordo anterior da chave, senão o relatório), aberta para a tela.
--
-- Quem pode ler: a mesma regra de `profissionais` (política prof_select) —
-- qualquer pessoa da empresa, ou quem tem acesso multiempresa. A busca exige
-- chave com 4 caracteres ou mais, como o useProfissional.
--
-- PRÉ-REQUISITO: 20261117120000 e 20261117150000 (nome sem o código do ERP).
--
-- Reaplicável. Não escreve em nenhuma linha.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_cliente_pelo_codigo(
  p_empresa_id  uuid,
  p_nr_cliente  text,
  p_instituicao text
)
RETURNS TABLE (cliente_nome text, cliente_instituicao text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_empresa_id IS NULL THEN
    RETURN;
  END IF;

  -- Mesma régua da política prof_select de `profissionais`.
  IF NOT (public.fn_user_acesso_multiempresa()
          OR p_empresa_id = public.fn_user_empresa_id()) THEN
    RETURN;
  END IF;

  IF length(coalesce(public.fn_acordo_chave_valor(p_nr_cliente, p_instituicao), '')) < 4 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT c.cliente_nome, c.cliente_instituicao
      FROM public.fn_cliente_conhecido(p_empresa_id, p_nr_cliente, p_instituicao) c;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cliente_pelo_codigo(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cliente_pelo_codigo(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.fn_cliente_pelo_codigo(uuid, text, text) IS
  'Tela de novo acordo: nome e instituição já conhecidos do NR/Código (fn_cliente_conhecido), para quem é da empresa. Ver 20261117170000.';

COMMIT;
