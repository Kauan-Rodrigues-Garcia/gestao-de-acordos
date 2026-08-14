-- ============================================================
-- direto_extra_rpcs_2026_04_27.sql
-- RPCs com SECURITY DEFINER para contornar RLS em operações
-- cruzadas entre operadores na lógica Direto/Extra.
-- EXECUTAR NO SQL EDITOR DO SUPABASE.
-- ============================================================

-- 1. Verifica se um usuário tem a lógica Direto/Extra ativa
--    (bypassa RLS na tabela perfis e direto_extra_config)
CREATE OR REPLACE FUNCTION public.fn_direto_extra_ativo(
  p_user_id    UUID,
  p_empresa_id UUID
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor_id  UUID;
  v_equipe_id UUID;
  v_ativo     boolean;
BEGIN
  SELECT setor_id, equipe_id
  INTO v_setor_id, v_equipe_id
  FROM perfis
  WHERE id = p_user_id;

  -- 1. Config individual (usuario)
  SELECT ativo INTO v_ativo
  FROM direto_extra_config
  WHERE empresa_id = p_empresa_id
    AND escopo = 'usuario'
    AND referencia_id = p_user_id
  LIMIT 1;
  IF FOUND THEN RETURN v_ativo; END IF;

  -- 2. Config de equipe
  IF v_equipe_id IS NOT NULL THEN
    SELECT ativo INTO v_ativo
    FROM direto_extra_config
    WHERE empresa_id = p_empresa_id
      AND escopo = 'equipe'
      AND referencia_id = v_equipe_id
    LIMIT 1;
    IF FOUND THEN RETURN v_ativo; END IF;
  END IF;

  -- 3. Config de setor
  IF v_setor_id IS NOT NULL THEN
    SELECT ativo INTO v_ativo
    FROM direto_extra_config
    WHERE empresa_id = p_empresa_id
      AND escopo = 'setor'
      AND referencia_id = v_setor_id
    LIMIT 1;
    IF FOUND THEN RETURN v_ativo; END IF;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_direto_extra_ativo TO authenticated;

-- ============================================================
-- 2. Vincula um EXTRA ao seu DIRETO (Caso A):
--    - seta vinculo_operador_id/nome no acordo DIRETO
--    - sincroniza valor, vencimento, nome_cliente, tipo, whatsapp, parcelas
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_vincular_extra_ao_direto(
  p_direto_id       UUID,
  p_extra_op_id     UUID,
  p_extra_op_nome   TEXT,
  p_valor           NUMERIC,
  p_vencimento      DATE,
  p_nome_cliente    TEXT,
  p_tipo            TEXT,
  p_whatsapp        TEXT DEFAULT NULL,
  p_parcelas        INT  DEFAULT 1
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE acordos SET
    vinculo_operador_id   = p_extra_op_id,
    vinculo_operador_nome = p_extra_op_nome,
    valor                 = p_valor,
    vencimento            = p_vencimento,
    nome_cliente          = p_nome_cliente,
    tipo                  = p_tipo,
    whatsapp              = p_whatsapp,
    parcelas              = p_parcelas
  WHERE id = p_direto_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_vincular_extra_ao_direto TO authenticated;

-- ============================================================
-- 3. Converte um acordo DIRETO em EXTRA (Caso B):
--    - atualiza tipo_vinculo → 'extra'
--    - seta vinculo_operador_id/nome apontando para o novo DIRETO
--    - sincroniza dados
--    - remove entrada de nr_registros (trigger recria para o novo DIRETO)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_converter_para_extra(
  p_acordo_id           UUID,
  p_novo_direto_op_id   UUID,
  p_novo_direto_op_nome TEXT,
  p_valor               NUMERIC,
  p_vencimento          DATE,
  p_nome_cliente        TEXT,
  p_tipo                TEXT,
  p_whatsapp            TEXT DEFAULT NULL,
  p_parcelas            INT  DEFAULT 1
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE acordos SET
    tipo_vinculo          = 'extra',
    vinculo_operador_id   = p_novo_direto_op_id,
    vinculo_operador_nome = p_novo_direto_op_nome,
    valor                 = p_valor,
    vencimento            = p_vencimento,
    nome_cliente          = p_nome_cliente,
    tipo                  = p_tipo,
    whatsapp              = p_whatsapp,
    parcelas              = p_parcelas
  WHERE id = p_acordo_id;

  -- Liberar NR para que o trigger recrie ao INSERT do novo DIRETO
  DELETE FROM nr_registros WHERE acordo_id = p_acordo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_converter_para_extra TO authenticated;

-- ============================================================
-- 4. Sincroniza dados entre par DIRETO/EXTRA após edição ou
--    mudança de status (MUITO IMPORTANTE: accordos 100% sincronizados).
--    Localiza o par pelo mesmo nr_cliente/instituicao na mesma empresa.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_sync_par_vinculo(
  p_acordo_id    UUID,
  p_valor        NUMERIC,
  p_vencimento   DATE,
  p_nome_cliente TEXT,
  p_tipo         TEXT,
  p_whatsapp     TEXT DEFAULT NULL,
  p_parcelas     INT  DEFAULT 1,
  p_status       TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id   UUID;
  v_nr_cliente   TEXT;
  v_instituicao  TEXT;
  v_tipo_vinculo TEXT;
  v_status_atual TEXT;
  v_par_id       UUID;
BEGIN
  SELECT empresa_id, nr_cliente, instituicao, tipo_vinculo, status
  INTO v_empresa_id, v_nr_cliente, v_instituicao, v_tipo_vinculo, v_status_atual
  FROM acordos WHERE id = p_acordo_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Localizar o par pelo tipo oposto + mesma chave NR
  IF v_tipo_vinculo = 'extra' THEN
    SELECT id INTO v_par_id FROM acordos
    WHERE empresa_id = v_empresa_id
      AND (tipo_vinculo = 'direto' OR tipo_vinculo IS NULL)
      AND id != p_acordo_id
      AND (
        (v_nr_cliente  IS NOT NULL AND v_nr_cliente  <> '' AND nr_cliente  = v_nr_cliente) OR
        (v_instituicao IS NOT NULL AND v_instituicao <> '' AND instituicao = v_instituicao)
      )
    LIMIT 1;
  ELSE
    SELECT id INTO v_par_id FROM acordos
    WHERE empresa_id = v_empresa_id
      AND tipo_vinculo = 'extra'
      AND id != p_acordo_id
      AND (
        (v_nr_cliente  IS NOT NULL AND v_nr_cliente  <> '' AND nr_cliente  = v_nr_cliente) OR
        (v_instituicao IS NOT NULL AND v_instituicao <> '' AND instituicao = v_instituicao)
      )
    LIMIT 1;
  END IF;

  IF v_par_id IS NULL THEN RETURN; END IF;

  UPDATE acordos SET
    valor        = p_valor,
    vencimento   = p_vencimento,
    nome_cliente = p_nome_cliente,
    tipo         = p_tipo,
    whatsapp     = p_whatsapp,
    parcelas     = p_parcelas,
    status       = COALESCE(p_status, status)
  WHERE id = v_par_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_sync_par_vinculo TO authenticated;
