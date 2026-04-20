-- ═══════════════════════════════════════════════════════════════════════════
--  DIRETO E EXTRA — Nova lógica de vínculos de acordos
--  Data: 2026-04-20
--
--  OBJETIVO
--  ────────
--  Adiciona a possibilidade de um usuário cadastrar um acordo com um NR ou
--  inscrição que já esteja vinculado a outro operador — nesse caso o acordo
--  entra como "extra" em vez de ser bloqueado.
--
--  A lógica é *opt-in* por setor, por equipe ou por usuário.
--
--  ESTRUTURA
--  ─────────
--  1. direto_extra_config  — tabela que armazena as ativações (por escopo)
--  2. acordos.tipo_vinculo         — 'direto' | 'extra'
--  3. acordos.vinculo_operador_id  — operador DIRETO quando este acordo é extra
--  4. acordos.vinculo_operador_nome
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabela de configuração ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.direto_extra_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL,
  escopo        TEXT NOT NULL CHECK (escopo IN ('setor', 'equipe', 'usuario')),
  referencia_id UUID NOT NULL,        -- id do setor / equipe / usuário
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uma config única por (empresa, escopo, referência)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_direto_extra_config
  ON public.direto_extra_config (empresa_id, escopo, referencia_id);

CREATE INDEX IF NOT EXISTS idx_direto_extra_config_empresa
  ON public.direto_extra_config (empresa_id);

CREATE INDEX IF NOT EXISTS idx_direto_extra_config_ativo
  ON public.direto_extra_config (empresa_id, ativo);

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.direto_extra_config ENABLE ROW LEVEL SECURITY;

-- Todos autenticados podem ler (necessário para verificação em tempo real)
CREATE POLICY "direto_extra_config_select"
  ON public.direto_extra_config FOR SELECT
  TO authenticated
  USING (true);

-- Apenas admin / lider / super_admin podem inserir
CREATE POLICY "direto_extra_config_insert"
  ON public.direto_extra_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfis p
      WHERE p.id = auth.uid()
        AND p.perfil IN ('lider', 'administrador', 'super_admin', 'gerencia')
    )
  );

CREATE POLICY "direto_extra_config_update"
  ON public.direto_extra_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfis p
      WHERE p.id = auth.uid()
        AND p.perfil IN ('lider', 'administrador', 'super_admin', 'gerencia')
    )
  )
  WITH CHECK (true);

CREATE POLICY "direto_extra_config_delete"
  ON public.direto_extra_config FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfis p
      WHERE p.id = auth.uid()
        AND p.perfil IN ('lider', 'administrador', 'super_admin', 'gerencia')
    )
  );

-- ─── Trigger de updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_direto_extra_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_direto_extra_config_updated_at ON public.direto_extra_config;
CREATE TRIGGER trg_direto_extra_config_updated_at
  BEFORE UPDATE ON public.direto_extra_config
  FOR EACH ROW EXECUTE FUNCTION public.set_direto_extra_config_updated_at();

-- ─── Realtime ──────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.direto_extra_config;

-- ─── 2. Colunas em acordos ─────────────────────────────────────────────────
ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS tipo_vinculo TEXT
    NOT NULL DEFAULT 'direto'
    CHECK (tipo_vinculo IN ('direto', 'extra'));

ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS vinculo_operador_id UUID;

ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS vinculo_operador_nome TEXT;

-- Índice para localizar rapidamente os "extras" de um operador direto
CREATE INDEX IF NOT EXISTS idx_acordos_tipo_vinculo
  ON public.acordos (tipo_vinculo)
  WHERE tipo_vinculo = 'extra';

CREATE INDEX IF NOT EXISTS idx_acordos_vinculo_operador
  ON public.acordos (vinculo_operador_id)
  WHERE vinculo_operador_id IS NOT NULL;

-- ─── Comentários ───────────────────────────────────────────────────────────
COMMENT ON TABLE  public.direto_extra_config           IS 'Ativação da lógica Direto e Extra — por setor, equipe ou usuário';
COMMENT ON COLUMN public.direto_extra_config.escopo    IS 'setor | equipe | usuario';
COMMENT ON COLUMN public.direto_extra_config.referencia_id IS 'ID do setor, equipe ou usuário (conforme escopo)';
COMMENT ON COLUMN public.acordos.tipo_vinculo          IS 'direto = acordo principal; extra = acordo adicional sobre um NR já vinculado a outro operador';
COMMENT ON COLUMN public.acordos.vinculo_operador_id   IS 'Operador que possui o vínculo DIRETO do mesmo NR (preenchido somente quando tipo_vinculo = extra)';

-- ═══════════════════════════════════════════════════════════════════════════
-- ─── 3. Recriar a view `acordos_deduplicados` ───────────────────────────────
-- A view foi originalmente criada em 2026-04-17 com `SELECT a.*`. Embora
-- essa sintaxe deveria herdar novas colunas automaticamente, o PostgreSQL
-- materializa a lista de colunas no momento da criação da view — ou seja,
-- as colunas `tipo_vinculo`, `vinculo_operador_id` e `vinculo_operador_nome`
-- adicionadas acima NÃO aparecem em SELECT via view até que ela seja
-- recriada. Recriamos aqui para garantir que a listagem de acordos traga
-- os novos campos e que a UI consiga exibir corretamente os acordos Extra.
-- ═══════════════════════════════════════════════════════════════════════════
DROP VIEW IF EXISTS public.acordos_deduplicados;

CREATE VIEW public.acordos_deduplicados AS
SELECT DISTINCT ON (
  COALESCE(a.acordo_grupo_id::text, a.id::text)
)
  a.*
FROM public.acordos a
ORDER BY
  COALESCE(a.acordo_grupo_id::text, a.id::text),
  a.numero_parcela DESC NULLS LAST,
  a.criado_em DESC;

COMMENT ON VIEW public.acordos_deduplicados IS
  'Acordos deduplicados por acordo_grupo_id (mantém apenas a parcela com maior numero_parcela de cada grupo). Recriada em 2026-04-20 após adição das colunas tipo_vinculo / vinculo_operador_id / vinculo_operador_nome.';
