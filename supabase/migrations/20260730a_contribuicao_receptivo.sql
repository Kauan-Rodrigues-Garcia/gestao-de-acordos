-- ═══════════════════════════════════════════════════════════════════════════
-- 20260730a — Contribuição Receptivo por setor/mês (BookPlay)
-- ═══════════════════════════════════════════════════════════════════════════
-- O card "Contribuição Receptivo" da aba Desempenho Equipes era preenchido à
-- mão e guardado em `localStorage` (decisão da época: "sem banco, como pedido",
-- commit f075c16). Consequência: o valor existia só no navegador de quem
-- digitou. Dois líderes do MESMO setor viam números diferentes, e trocar de
-- máquina zerava o card.
--
-- Esta tabela move o valor para o banco: uma linha por (empresa, setor, mês),
-- compartilhada por todos — se um edita, edita para todos.
--
-- Idempotente. Tabela pequena (uma linha por setor/mês), sem lock relevante.

CREATE TABLE IF NOT EXISTS public.contribuicao_receptivo (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id        UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  -- 'yyyy-MM' — mesmo formato que a aba usa para navegar entre meses.
  mes             TEXT NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  acumulado       NUMERIC(14,2) NOT NULL DEFAULT 0,
  meta            NUMERIC(14,2) NOT NULL DEFAULT 0,
  atualizado_por  UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A chave do upsert do cliente. É o que garante uma única verdade por
  -- setor/mês em vez de uma linha por edição.
  UNIQUE (empresa_id, setor_id, mes)
);

-- Serve o filtro da tela: WHERE empresa_id = $ AND mes = $
CREATE INDEX IF NOT EXISTS idx_contrib_receptivo_empresa_mes
  ON public.contribuicao_receptivo (empresa_id, mes);

ALTER TABLE public.contribuicao_receptivo ENABLE ROW LEVEL SECURITY;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- As chamadas de sessão vão embrulhadas em (SELECT ...) para o planner
-- promovê-las a InitPlan e avaliá-las uma vez por query, não por linha — mesma
-- técnica das migrations 20260726a e 20260729a. Aqui a tabela é pequena e o
-- ganho é irrelevante; é consistência de padrão.
--
-- fn_can_access_empresa(x) é, por definição:
--     fn_user_is_super_admin() OR x = fn_user_empresa_id()
-- e está inlined nessa forma para que as duas chamadas virem InitPlan.

-- Leitura: qualquer usuário da empresa. O card aparece para todo mundo que
-- abre a aba, e o valor entra no consolidado do setor.
DROP POLICY IF EXISTS "contrib_receptivo_select" ON public.contribuicao_receptivo;
CREATE POLICY "contrib_receptivo_select" ON public.contribuicao_receptivo
  FOR SELECT USING (
    (SELECT public.fn_user_is_super_admin())
    OR empresa_id = (SELECT public.fn_user_empresa_id())
  );

-- Escrita: líder e acima. Mesmo público que já enxerga a aba Desempenho
-- Equipes; 'ouvidoria' fica fora de propósito (nível 2, mas outra trilha).
DROP POLICY IF EXISTS "contrib_receptivo_insert" ON public.contribuicao_receptivo;
CREATE POLICY "contrib_receptivo_insert" ON public.contribuicao_receptivo
  FOR INSERT WITH CHECK (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (SELECT public.fn_user_has_any_role(
           ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']))
  );

DROP POLICY IF EXISTS "contrib_receptivo_update" ON public.contribuicao_receptivo;
CREATE POLICY "contrib_receptivo_update" ON public.contribuicao_receptivo
  FOR UPDATE USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (SELECT public.fn_user_has_any_role(
           ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']))
  ) WITH CHECK (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (SELECT public.fn_user_has_any_role(
           ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']))
  );

DROP POLICY IF EXISTS "contrib_receptivo_delete" ON public.contribuicao_receptivo;
CREATE POLICY "contrib_receptivo_delete" ON public.contribuicao_receptivo
  FOR DELETE USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (SELECT public.fn_user_has_any_role(
           ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']))
  );

-- ─── atualizado_em automático ───────────────────────────────────────────────
-- O upsert do cliente não manda `atualizado_em`; sem o trigger a coluna ficaria
-- congelada no valor do INSERT e "quem editou por último" seria inútil.
CREATE OR REPLACE FUNCTION public.fn_contrib_receptivo_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrib_receptivo_touch ON public.contribuicao_receptivo;
CREATE TRIGGER trg_contrib_receptivo_touch
  BEFORE UPDATE ON public.contribuicao_receptivo
  FOR EACH ROW EXECUTE FUNCTION public.fn_contrib_receptivo_touch();

-- ─── Realtime ───────────────────────────────────────────────────────────────
-- "Se um editar, edita para todos" só vale na hora com o evento chegando por
-- WebSocket. REPLICA IDENTITY FULL para o filtro por empresa_id funcionar em
-- qualquer evento (sem ela, o payload de DELETE traz apenas a PK e o filtro
-- nunca casa) — mesmo motivo de nr_registros e notificacoes.
ALTER TABLE public.contribuicao_receptivo REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contribuicao_receptivo'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contribuicao_receptivo;
  END IF;
END $$;

COMMENT ON TABLE public.contribuicao_receptivo IS
  'Contribuição do Receptivo por setor/mês, preenchida à mão na aba Desempenho '
  'Equipes (BookPlay). Uma linha por (empresa, setor, mes); o acumulado soma no '
  'card consolidado do setor, a meta NÃO (decisão do usuário em 30/07/2026).';
