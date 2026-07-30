-- ============================================================================
-- 20260731b — Tabular analítico volta a salvar a UF do cliente
-- ============================================================================
--
-- SINTOMA: dezenas de
--   ERROR: new row violates row-level security policy for table "profissionais"
-- nos logs, vindas do PostgREST.
--
-- CAUSA: ao tabular uma linha do analítico de um cliente sem cadastro, a tela
-- pergunta a UF e tenta gravá-la em `profissionais` — INSERT quando o código
-- ainda não existe, UPDATE quando existe sem UF. `profissionais` é legível por
-- toda a empresa mas **não tem policy de escrita**, então os dois eram
-- recusados. E o código não conferia o retorno: a pessoa respondia a UF, a tela
-- seguia normalmente e a resposta era descartada. Na tabulação seguinte do
-- mesmo cliente, perguntava de novo.
--
-- POR QUE NÃO UMA POLICY DE INSERT/UPDATE:
-- `profissionais` é o cadastro canônico do cliente (nome, telefone, estado_uf)
-- e acabou de receber uma carga de 295.862 registros. Uma policy de UPDATE para
-- "qualquer usuário da empresa" deixaria qualquer operador reescrever nome e
-- telefone de qualquer cliente — RLS é por linha, não dá para limitar a UMA
-- coluna. Esta função faz só o que o fluxo precisa e nada além:
--
--   • cliente não existe   → cria com código, nome e UF;
--   • existe e SEM UF      → preenche a UF;
--   • existe e JÁ TEM UF   → não toca em nada.
--
-- Nome e telefone de cadastro existente nunca são alterados por aqui.
--
-- Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_profissional_registrar_uf(
  p_empresa_id UUID,
  p_codigo     TEXT,
  p_estado_uf  TEXT,
  p_nome       TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo TEXT := btrim(COALESCE(p_codigo, ''));
  v_uf     TEXT := upper(btrim(COALESCE(p_estado_uf, '')));
  v_nome   TEXT := btrim(COALESCE(p_nome, ''));
  v_id     UUID;
BEGIN
  -- Mesma checagem das policies da casa: ou é super admin, ou é a própria
  -- empresa. Sem isto o SECURITY DEFINER viraria uma porta para escrever em
  -- qualquer tenant.
  IF NOT (
    public.fn_user_is_super_admin()
    OR p_empresa_id = public.fn_user_empresa_id()
  ) THEN
    RAISE EXCEPTION 'sem permissão para gravar profissionais desta empresa'
      USING ERRCODE = '42501';
  END IF;

  IF v_codigo = '' THEN
    RAISE EXCEPTION 'código do cliente é obrigatório' USING ERRCODE = '22023';
  END IF;

  -- A coluna é char(2); qualquer coisa fora disso é entrada errada.
  IF length(v_uf) <> 2 THEN
    RAISE EXCEPTION 'UF inválida: %', p_estado_uf USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_id
    FROM public.profissionais
   WHERE empresa_id = p_empresa_id
     AND codigo     = v_codigo
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- Só preenche buraco. Cadastro que já tem UF fica como está — o mailing é
    -- fonte melhor que um palpite digitado no meio da tabulação.
    UPDATE public.profissionais
       SET estado_uf     = v_uf,
           atualizado_em = NOW()
     WHERE id = v_id
       AND (estado_uf IS NULL OR btrim(estado_uf) = '');
    RETURN v_id;
  END IF;

  BEGIN
    INSERT INTO public.profissionais (empresa_id, codigo, nome, estado_uf)
    VALUES (p_empresa_id, v_codigo, NULLIF(v_nome, ''), v_uf)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- Dois operadores tabulando o mesmo código ao mesmo tempo: o outro ganhou.
    SELECT id INTO v_id
      FROM public.profissionais
     WHERE empresa_id = p_empresa_id
       AND codigo     = v_codigo
     LIMIT 1;
  END;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.fn_profissional_registrar_uf(UUID, TEXT, TEXT, TEXT) IS
  'Cria o cadastro do cliente ou preenche a UF que faltava, a partir da '
  'tabulação do analítico. Nunca sobrescreve UF, nome ou telefone existentes.';

REVOKE ALL ON FUNCTION public.fn_profissional_registrar_uf(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_profissional_registrar_uf(UUID, TEXT, TEXT, TEXT) TO authenticated;
