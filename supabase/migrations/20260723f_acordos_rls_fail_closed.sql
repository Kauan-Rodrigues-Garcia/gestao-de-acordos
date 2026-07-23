-- ═══════════════════════════════════════════════════════════════════════════
-- ITEM 3 (revisão 2) — RLS de acordos FAIL-CLOSED e centralizada
-- ═══════════════════════════════════════════════════════════════════════════
-- A 20260723b escopava por setor SÓ quando fn_user_empresa_is_bookplay() era
-- true. Se essa função retornasse false por qualquer motivo, o líder caía no
-- ramo "não-bookplay → vê tudo" (FAIL-OPEN, o pior para segurança).
--
-- Aqui a lógica vira FAIL-CLOSED e é chaveada pelo POSITIVO de PaguePlay:
--   • Só PaguePlay (checado explicitamente) mantém o líder vendo tudo (legado).
--   • Qualquer outra empresa (BookPlay ou "não identificada") prende líder/
--     elite/gerência ao próprio setor. Se o slug falhar, o resultado é MENOS
--     acesso, não mais.
--
-- Regras finais:
--   • super_admin, administrador           → tudo (ambos tenants)
--   • PaguePlay + líder                     → tudo (comportamento antigo da PP)
--   • BookPlay + diretoria                  → tudo
--   • BookPlay + líder/elite/gerência       → só o próprio setor
--   • operador (e demais)                   → só os próprios acordos
--
-- IMPORTANTE: isto SÓ tem efeito se a view acordos_deduplicados respeitar a RLS
-- (migration 20260723d — security_invoker). A listagem lê dessa view; sem o
-- security_invoker a view roda como dono e ignora TODA policy abaixo.

-- ─── Helper: empresa do usuário é PaguePlay? ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_user_empresa_is_pagueplay()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfis p
    JOIN public.empresas e ON e.id = p.empresa_id
    WHERE p.id = auth.uid() AND lower(e.slug) = 'pagueplay'
  );
$$;

-- ─── Regra única de visibilidade/gestão de um acordo ─────────────────────────
-- Recebe o setor e o operador do acordo (linha corrente) e decide se o usuário
-- atual pode agir sobre ele. Centralizar evita divergência entre as políticas.
CREATE OR REPLACE FUNCTION public.fn_pode_gerir_acordo(p_setor_id UUID, p_operador_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT
    p_operador_id = auth.uid()                                   -- dono do acordo
    OR public.fn_user_is_super_admin()
    OR public.fn_user_has_any_role(ARRAY['administrador'])       -- admin: tudo (ambos)
    OR (
      public.fn_user_empresa_is_pagueplay()
      AND public.fn_user_has_any_role(ARRAY['lider'])            -- PP: líder vê tudo (legado)
    )
    OR (
      NOT public.fn_user_empresa_is_pagueplay()                  -- BookPlay / não-PP (fail-closed)
      AND (
        public.fn_user_has_any_role(ARRAY['diretoria'])         -- diretoria: tudo
        OR (
          public.fn_user_has_any_role(ARRAY['lider','elite','gerencia'])
          AND (
            p_setor_id = public.fn_user_setor_id()
            OR (p_setor_id IS NULL AND public.fn_operador_setor_id(p_operador_id) = public.fn_user_setor_id())
          )
        )
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.fn_user_empresa_is_pagueplay()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pode_gerir_acordo(UUID, UUID)        TO authenticated;

-- ─── Recria as políticas usando a regra única ────────────────────────────────
DROP POLICY IF EXISTS "acordos_select" ON public.acordos;
CREATE POLICY "acordos_select" ON public.acordos
  FOR SELECT USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_pode_gerir_acordo(setor_id, operador_id)
  );

DROP POLICY IF EXISTS "acordos_insert" ON public.acordos;
CREATE POLICY "acordos_insert" ON public.acordos
  FOR INSERT WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_pode_gerir_acordo(setor_id, operador_id)
  );

DROP POLICY IF EXISTS "acordos_update" ON public.acordos;
CREATE POLICY "acordos_update" ON public.acordos
  FOR UPDATE
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_pode_gerir_acordo(setor_id, operador_id)
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_pode_gerir_acordo(setor_id, operador_id)
  );

-- DELETE: mantém acordos_delete_own (operador apaga o próprio); a via de gestão
-- passa a usar a regra única (admin/super/diretoria/PP-líder/BP-líder-do-setor).
DROP POLICY IF EXISTS "acordos_delete_admin" ON public.acordos;
CREATE POLICY "acordos_delete_admin" ON public.acordos
  FOR DELETE USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_pode_gerir_acordo(setor_id, operador_id)
  );
