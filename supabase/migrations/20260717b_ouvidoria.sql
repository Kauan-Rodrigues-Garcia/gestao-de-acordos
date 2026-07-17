-- ═══════════════════════════════════════════════════════════════════════════
-- OUVIDORIA (PaguePlay)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Novo cargo `ouvidoria` no enum perfil_usuario.
-- 2. fn_user_has_any_role passa a tratar ouvidoria como LÍDER em todas as
--    policies existentes e futuras (o cargo "tem acesso à planilha como se
--    fosse um líder"). Onde uma policy aceita 'lider', ouvidoria também passa.
-- 3. Tabelas ouvidoria_atendimentos (demandas de suporte: reclamações e
--    sugestões) e ouvidoria_acessos (liberação por usuário: ver | editar).
-- 4. Permissões padrão do cargo em cargos_permissoes (espelho de líder +
--    chaves da ouvidoria).
--
-- Acesso à aba Ouvidoria:
--   • cargo ouvidoria  → total (e gerencia quem mais acessa)
--   • administrador / super_admin → total
--   • demais usuários  → somente se houver linha em ouvidoria_acessos
--     (nivel 'ver' = leitura; 'editar' = leitura + escrita)

-- ─── 1. Enum ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'perfil_usuario'::regtype
      AND enumlabel = 'ouvidoria'
  ) THEN
    ALTER TYPE perfil_usuario ADD VALUE 'ouvidoria';
  END IF;
END;
$$;

-- ─── 2. Ouvidoria herda os gates de líder ───────────────────────────────────
-- Toda policy do sistema que checa papéis usa esta função. O remap abaixo faz
-- o cargo ouvidoria passar em qualquer verificação que aceite 'lider', sem
-- precisar reescrever policy por policy (acordos, metas, perfis, lixeira...).
CREATE OR REPLACE FUNCTION public.fn_user_has_any_role(roles text[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid()
      AND (
        perfil::text = ANY(roles)
        OR (perfil::text = 'ouvidoria' AND 'lider' = ANY(roles))
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ─── 3. Tabelas ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ouvidoria_atendimentos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  criado_por        UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_por_nome   TEXT,
  tipo              TEXT NOT NULL DEFAULT 'reclamacao',  -- 'reclamacao' | 'sugestao'
  status            TEXT NOT NULL DEFAULT 'pendente',    -- 'pendente' | 'resolvido'
  nome_cliente      TEXT NOT NULL,
  estado_uf         TEXT,
  whatsapp          TEXT,
  email             TEXT,
  link              TEXT,
  codigo            TEXT,           -- mesmo Código/Inscrição usado nos acordos
  descricao         TEXT,           -- detalhes da reclamação/sugestão
  iniciado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- data/hora da tabulação
  resolvido_em      TIMESTAMPTZ,
  resolvido_por     UUID,
  resolvido_por_nome TEXT,
  resolucao         TEXT,           -- como o caso foi resolvido (obrigatório ao concluir)
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ouvidoria_atend_empresa ON public.ouvidoria_atendimentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ouvidoria_atend_status  ON public.ouvidoria_atendimentos(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_ouvidoria_atend_codigo  ON public.ouvidoria_atendimentos(codigo);

-- Reaproveita o trigger genérico que atualiza atualizado_em (novos_cargos)
DROP TRIGGER IF EXISTS trg_ouvidoria_atend_updated ON public.ouvidoria_atendimentos;
CREATE TRIGGER trg_ouvidoria_atend_updated
  BEFORE UPDATE ON public.ouvidoria_atendimentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_cargos();

CREATE TABLE IF NOT EXISTS public.ouvidoria_acessos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario_id        UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  nivel             TEXT NOT NULL DEFAULT 'ver',  -- 'ver' | 'editar'
  concedido_por     UUID,
  concedido_por_nome TEXT,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_ouvidoria_acessos_usuario ON public.ouvidoria_acessos(usuario_id);

-- ─── 4. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.ouvidoria_atendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ouvidoria_acessos      ENABLE ROW LEVEL SECURITY;

-- Nível efetivo do usuário na ouvidoria da empresa:
--   'editar'  → cargo ouvidoria/admin/super_admin OU acesso concedido 'editar'
--   'ver'     → acesso concedido 'ver'
--   'nenhum'  → sem acesso
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_nivel(target_empresa_id UUID)
RETURNS TEXT AS $$
  SELECT CASE
    WHEN public.fn_user_has_any_role(ARRAY['ouvidoria','administrador','super_admin'])
      THEN 'editar'
    ELSE COALESCE(
      (SELECT a.nivel FROM public.ouvidoria_acessos a
        WHERE a.usuario_id = auth.uid()
          AND a.empresa_id = target_empresa_id
        LIMIT 1),
      'nenhum')
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- atendimentos
DROP POLICY IF EXISTS "ouvidoria_atend_select" ON public.ouvidoria_atendimentos;
CREATE POLICY "ouvidoria_atend_select" ON public.ouvidoria_atendimentos
  FOR SELECT USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_ouvidoria_nivel(empresa_id) IN ('ver','editar')
  );

DROP POLICY IF EXISTS "ouvidoria_atend_insert" ON public.ouvidoria_atendimentos;
CREATE POLICY "ouvidoria_atend_insert" ON public.ouvidoria_atendimentos
  FOR INSERT WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_ouvidoria_nivel(empresa_id) = 'editar'
  );

DROP POLICY IF EXISTS "ouvidoria_atend_update" ON public.ouvidoria_atendimentos;
CREATE POLICY "ouvidoria_atend_update" ON public.ouvidoria_atendimentos
  FOR UPDATE USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_ouvidoria_nivel(empresa_id) = 'editar'
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_ouvidoria_nivel(empresa_id) = 'editar'
  );

-- Excluir: somente o responsável (ouvidoria) e admins
DROP POLICY IF EXISTS "ouvidoria_atend_delete" ON public.ouvidoria_atendimentos;
CREATE POLICY "ouvidoria_atend_delete" ON public.ouvidoria_atendimentos
  FOR DELETE USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['ouvidoria','administrador','super_admin'])
  );

-- acessos: cada usuário lê a própria linha (para saber se vê a aba);
-- ouvidoria/admin leem e gerenciam todas as linhas da empresa
DROP POLICY IF EXISTS "ouvidoria_acessos_select" ON public.ouvidoria_acessos;
CREATE POLICY "ouvidoria_acessos_select" ON public.ouvidoria_acessos
  FOR SELECT USING (
    usuario_id = auth.uid()
    OR (
      public.fn_can_access_empresa(empresa_id)
      AND public.fn_user_has_any_role(ARRAY['ouvidoria','administrador','super_admin'])
    )
  );

DROP POLICY IF EXISTS "ouvidoria_acessos_write" ON public.ouvidoria_acessos;
CREATE POLICY "ouvidoria_acessos_write" ON public.ouvidoria_acessos
  FOR ALL USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['ouvidoria','administrador','super_admin'])
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['ouvidoria','administrador','super_admin'])
  );

-- ─── 5. Permissões padrão do cargo (todas as empresas) ──────────────────────
-- Espelho de líder + chaves da ouvidoria. A aba em si só existe na PaguePlay
-- (gate por tenant no frontend).
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT
  id AS empresa_id,
  'ouvidoria',
  '{
    "ver_acordos_gerais": true,
    "ver_acordos_proprios": true,
    "ver_analiticos_setor": true,
    "ver_operadores": true,
    "ver_painel_lider": true,
    "criar_acordos": true,
    "editar_acordos": true,
    "excluir_acordos": false,
    "ver_lixeira": true,
    "importar_excel": true,
    "ver_metas": true,
    "ver_usuarios": true,
    "ver_equipes": true,
    "ver_ouvidoria": true,
    "editar_ouvidoria": true,
    "gerenciar_acessos_ouvidoria": true
  }'::jsonb,
  'Responsável pela ouvidoria: acesso de líder + aba Ouvidoria e gestão de quem a acessa'
FROM public.empresas
ON CONFLICT (empresa_id, cargo) DO NOTHING;
