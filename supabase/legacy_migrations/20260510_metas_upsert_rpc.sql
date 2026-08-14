-- RPC SECURITY DEFINER para upsert de metas
-- Contorna qualquer inconsistência de RLS na tabela metas,
-- mantendo a verificação de autorização dentro da função.

CREATE OR REPLACE FUNCTION public.upsert_metas(
  p_payloads JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perfil   TEXT;
  v_empresa  UUID;
  v_item     JSONB;
BEGIN
  -- Verifica perfil do usuário logado
  SELECT perfil::text, empresa_id
    INTO v_perfil, v_empresa
    FROM public.perfis
   WHERE id = auth.uid()
   LIMIT 1;

  IF v_perfil IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF v_perfil NOT IN ('administrador','lider','super_admin','elite','gerencia') THEN
    RAISE EXCEPTION 'Permissão negada: cargo % não pode salvar metas', v_perfil;
  END IF;

  -- Processa cada meta do array
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payloads)
  LOOP
    -- Garante que o empresa_id do payload pertence ao usuário logado
    IF (v_item->>'empresa_id')::UUID != v_empresa AND v_perfil != 'super_admin' THEN
      RAISE EXCEPTION 'Permissão negada: empresa_id inválido';
    END IF;

    INSERT INTO public.metas (tipo, referencia_id, empresa_id, meta_valor, meta_acordos, mes, ano)
    VALUES (
      v_item->>'tipo',
      (v_item->>'referencia_id')::UUID,
      (v_item->>'empresa_id')::UUID,
      (v_item->>'meta_valor')::NUMERIC,
      (v_item->>'meta_acordos')::INTEGER,
      (v_item->>'mes')::INTEGER,
      (v_item->>'ano')::INTEGER
    )
    ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano)
    DO UPDATE SET
      meta_valor   = EXCLUDED.meta_valor,
      meta_acordos = EXCLUDED.meta_acordos,
      updated_at   = now();
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_metas(JSONB) TO authenticated;
