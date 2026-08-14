-- ═══════════════════════════════════════════════════════════════════════════
-- 20260725b — Líder por equipe (BookPlay)
-- ═══════════════════════════════════════════════════════════════════════════
-- Mudança de modelo: o líder (cargo 'lider') deixa de "morar" numa equipe via
-- perfis.equipe_id. Cada equipe passa a definir explicitamente qual(is) líder(es)
-- a comandam, escolhendo entre os líderes do próprio setor OU clonando um líder
-- de outro setor. Uma equipe pode ter mais de um líder; um líder pode liderar
-- várias equipes (de qualquer setor).
--
-- Espelha o padrão de equipe_operadores_clones. Idempotente.

CREATE TABLE IF NOT EXISTS public.equipe_lideres (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  equipe_id   UUID NOT NULL REFERENCES public.equipes(id)  ON DELETE CASCADE,
  lider_id    UUID NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  criado_por  UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (equipe_id, lider_id)
);

CREATE INDEX IF NOT EXISTS idx_equipe_lideres_equipe ON public.equipe_lideres (equipe_id);
CREATE INDEX IF NOT EXISTS idx_equipe_lideres_lider  ON public.equipe_lideres (lider_id);

ALTER TABLE public.equipe_lideres ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário da empresa (os painéis mostram os líderes para todos)
DROP POLICY IF EXISTS "equipe_lideres_select_empresa" ON public.equipe_lideres;
CREATE POLICY "equipe_lideres_select_empresa" ON public.equipe_lideres
  FOR SELECT
  USING (public.fn_can_access_empresa(empresa_id));

-- Escrita: quem gerencia equipes (líder+ da empresa; o front restringe ao setor)
DROP POLICY IF EXISTS "equipe_lideres_write_gestao" ON public.equipe_lideres;
CREATE POLICY "equipe_lideres_write_gestao" ON public.equipe_lideres
  FOR ALL
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['lider','gerencia','administrador','super_admin'])
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['lider','gerencia','administrador','super_admin'])
  );
