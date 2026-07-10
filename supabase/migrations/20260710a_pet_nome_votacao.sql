-- ============================================================
-- Migration: votação do nome do mascote (2026-07-10)
--
-- Uma janela central abre para TODOS os usuários (admin e não-admin, nos dois
-- tenants) que ainda não votaram, com 3 opções de nome: Aura, Lupi, Albi.
-- O voto fica salvo por usuário (1 voto, final) e guarda a empresa para apurar
-- BookPlay e PaguePlay separadamente.
--
-- Privacidade do placar: cada usuário só enxerga o próprio voto (RLS). A
-- apuração (porcentagem por nome/empresa) é exclusiva de admin/super_admin,
-- via fn_pet_nome_resultado() (SECURITY DEFINER).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pet_nome_votos (
  usuario_id     UUID PRIMARY KEY REFERENCES public.perfis(id) ON DELETE CASCADE,
  empresa_id     UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  nome_escolhido TEXT NOT NULL CHECK (nome_escolhido IN ('Aura', 'Lupi', 'Albi')),
  votado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pet_nome_votos_empresa
  ON public.pet_nome_votos(empresa_id, nome_escolhido);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Cada usuário lê e insere apenas o próprio voto. Sem UPDATE/DELETE: voto final.

ALTER TABLE public.pet_nome_votos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pet_nome_votos_select" ON public.pet_nome_votos;
CREATE POLICY "pet_nome_votos_select" ON public.pet_nome_votos
  FOR SELECT USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS "pet_nome_votos_insert" ON public.pet_nome_votos;
CREATE POLICY "pet_nome_votos_insert" ON public.pet_nome_votos
  FOR INSERT WITH CHECK (usuario_id = auth.uid());

-- ── RPC: apuração (só admin/super_admin) ─────────────────────────────────────
-- super_admin vê todas as empresas; admin vê a(s) empresa(s) que acessa.

CREATE OR REPLACE FUNCTION public.fn_pet_nome_resultado()
RETURNS TABLE(empresa_id UUID, empresa_slug TEXT, nome_escolhido TEXT, votos BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.empresa_id, e.slug, v.nome_escolhido, COUNT(*)::BIGINT
  FROM public.pet_nome_votos v
  LEFT JOIN public.empresas e ON e.id = v.empresa_id
  WHERE public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
    AND (
      public.fn_user_has_any_role(ARRAY['super_admin'])
      OR public.fn_can_access_empresa(v.empresa_id)
    )
  GROUP BY v.empresa_id, e.slug, v.nome_escolhido
  ORDER BY e.slug, votos DESC;
$$;
