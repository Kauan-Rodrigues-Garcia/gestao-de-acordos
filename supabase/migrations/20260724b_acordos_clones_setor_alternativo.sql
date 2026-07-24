-- ═══════════════════════════════════════════════════════════════════════════
-- Acordos visíveis para o líder do SETOR ALTERNATIVO via CLONE (BookPlay)
-- ═══════════════════════════════════════════════════════════════════════════
-- Complemento da 20260723b. O setor alternativo (ex.: Digital Amauri) é formado
-- por operadores CLONADOS de outros setores (Play 4 / Play 5). O líder/gerência
-- do setor alternativo precisa VER e GERIR os acordos desses operadores "como se
-- fossem do setor dele".
--
-- Esta migration é puramente ADITIVA: acrescenta UM predicado que apenas CONCEDE
-- visibilidade quando o operador do acordo está clonado numa equipe do setor do
-- usuário. Não remove nem afrouxa nenhuma regra existente — o fechamento por
-- setor (fail-closed) continua idêntico. Fora da relação de clone, nada muda.
--
-- Regra do clone: operador clonado numa equipe cujo setor == setor do usuário.

-- ─── Helper: operador está clonado numa equipe deste setor? ──────────────────
CREATE OR REPLACE FUNCTION public.fn_operador_clonado_no_setor(
  p_operador_id UUID,
  p_setor_id    UUID
)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p_setor_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.equipe_operadores_clones c
    JOIN public.equipes e ON e.id = c.equipe_id
    WHERE c.operador_id = p_operador_id
      AND e.setor_id   = p_setor_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.fn_operador_clonado_no_setor(UUID, UUID) TO authenticated;

-- ─── SELECT ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "acordos_select" ON public.acordos;
CREATE POLICY "acordos_select" ON public.acordos
  FOR SELECT USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_is_super_admin()
      OR (
        public.fn_user_empresa_is_bookplay() AND (
          public.fn_user_has_any_role(ARRAY['administrador','diretoria'])
          OR (
            public.fn_user_has_any_role(ARRAY['lider','elite','gerencia'])
            AND (
              setor_id = public.fn_user_setor_id()
              OR (setor_id IS NULL AND public.fn_operador_setor_id(operador_id) = public.fn_user_setor_id())
              OR public.fn_operador_clonado_no_setor(operador_id, public.fn_user_setor_id())
            )
          )
        )
      )
      OR (
        NOT public.fn_user_empresa_is_bookplay()
        AND public.fn_user_has_any_role(ARRAY['lider','administrador'])
      )
    )
  );

-- ─── INSERT ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "acordos_insert" ON public.acordos;
CREATE POLICY "acordos_insert" ON public.acordos
  FOR INSERT WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_is_super_admin()
      OR (
        public.fn_user_empresa_is_bookplay() AND (
          public.fn_user_has_any_role(ARRAY['administrador','diretoria'])
          OR (
            public.fn_user_has_any_role(ARRAY['lider','elite','gerencia'])
            AND (
              setor_id = public.fn_user_setor_id()
              OR (setor_id IS NULL AND public.fn_operador_setor_id(operador_id) = public.fn_user_setor_id())
              OR public.fn_operador_clonado_no_setor(operador_id, public.fn_user_setor_id())
            )
          )
        )
      )
      OR (
        NOT public.fn_user_empresa_is_bookplay()
        AND public.fn_user_has_any_role(ARRAY['lider','administrador'])
      )
    )
  );

-- ─── UPDATE ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "acordos_update" ON public.acordos;
CREATE POLICY "acordos_update" ON public.acordos
  FOR UPDATE
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_is_super_admin()
      OR (
        public.fn_user_empresa_is_bookplay() AND (
          public.fn_user_has_any_role(ARRAY['administrador','diretoria'])
          OR (
            public.fn_user_has_any_role(ARRAY['lider','elite','gerencia'])
            AND (
              setor_id = public.fn_user_setor_id()
              OR (setor_id IS NULL AND public.fn_operador_setor_id(operador_id) = public.fn_user_setor_id())
              OR public.fn_operador_clonado_no_setor(operador_id, public.fn_user_setor_id())
            )
          )
        )
      )
      OR (
        NOT public.fn_user_empresa_is_bookplay()
        AND public.fn_user_has_any_role(ARRAY['lider','administrador'])
      )
    )
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_is_super_admin()
      OR (
        public.fn_user_empresa_is_bookplay() AND (
          public.fn_user_has_any_role(ARRAY['administrador','diretoria'])
          OR (
            public.fn_user_has_any_role(ARRAY['lider','elite','gerencia'])
            AND (
              setor_id = public.fn_user_setor_id()
              OR (setor_id IS NULL AND public.fn_operador_setor_id(operador_id) = public.fn_user_setor_id())
              OR public.fn_operador_clonado_no_setor(operador_id, public.fn_user_setor_id())
            )
          )
        )
      )
      OR (
        NOT public.fn_user_empresa_is_bookplay()
        AND public.fn_user_has_any_role(ARRAY['lider','administrador'])
      )
    )
  );

-- ─── DELETE (admin/gestão) ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "acordos_delete_admin" ON public.acordos;
CREATE POLICY "acordos_delete_admin" ON public.acordos
  FOR DELETE USING (
    public.fn_user_is_super_admin()
    OR (
      empresa_id = public.fn_user_empresa_id()
      AND (
        public.fn_user_has_any_role(ARRAY['administrador'])
        OR (
          public.fn_user_empresa_is_bookplay()
          AND public.fn_user_has_any_role(ARRAY['lider','elite','gerencia'])
          AND (
            setor_id = public.fn_user_setor_id()
            OR (setor_id IS NULL AND public.fn_operador_setor_id(operador_id) = public.fn_user_setor_id())
            OR public.fn_operador_clonado_no_setor(operador_id, public.fn_user_setor_id())
          )
        )
        OR (
          NOT public.fn_user_empresa_is_bookplay()
          AND public.fn_user_has_any_role(ARRAY['lider'])
        )
      )
    )
  );
