-- ═══════════════════════════════════════════════════════════════════════════
-- 20260712a — BookPlay: órfãos com setor + clones de operador em equipes
--
-- 1) analitico_recebimentos.setor_id — o "setor da importação". Linhas SEM
--    operador (órfãos) não têm como derivar setor; passam a pertencer ao
--    setor de quem importou o relatório (admin escolhe o setor no modal).
--    Com isso o card "Total recebido" do setor fecha com o total do arquivo.
--
-- 2) equipe_operadores_clones — um operador pode ser "clonado" para outras
--    equipes: o recebimento do analítico conta em todas as equipes em que
--    ele está (painel Desempenho Equipes e filtros de equipe).
--
-- Idempotente — pode rodar mais de uma vez sem efeito colateral.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Coluna setor_id + backfill dos órfãos existentes ──────────────────────

ALTER TABLE public.analitico_recebimentos
  ADD COLUMN IF NOT EXISTS setor_id UUID REFERENCES public.setores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_analitico_recebimentos_setor
  ON public.analitico_recebimentos (setor_id)
  WHERE setor_id IS NOT NULL;

-- Órfãos já importados herdam o setor do perfil de quem importou
UPDATE public.analitico_recebimentos ar
   SET setor_id = p.setor_id
  FROM public.perfis p
 WHERE ar.setor_id IS NULL
   AND ar.operador_id IS NULL
   AND p.id = ar.importado_por_id
   AND p.setor_id IS NOT NULL;

-- ── 2. Clones de operador em equipes ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.equipe_operadores_clones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  equipe_id   UUID NOT NULL REFERENCES public.equipes(id)  ON DELETE CASCADE,
  operador_id UUID NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  criado_por  UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (equipe_id, operador_id)
);

ALTER TABLE public.equipe_operadores_clones ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário da empresa (os painéis somam clones para todos)
DROP POLICY IF EXISTS "clones_select_empresa" ON public.equipe_operadores_clones;
CREATE POLICY "clones_select_empresa" ON public.equipe_operadores_clones
  FOR SELECT
  USING (public.fn_can_access_empresa(empresa_id));

-- Escrita: quem gerencia equipes (líder+ da empresa; o front restringe ao setor)
DROP POLICY IF EXISTS "clones_write_gestao" ON public.equipe_operadores_clones;
CREATE POLICY "clones_write_gestao" ON public.equipe_operadores_clones
  FOR ALL
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['lider','gerencia','administrador','super_admin'])
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['lider','gerencia','administrador','super_admin'])
  );
