-- ═══════════════════════════════════════════════════════════════════════════
-- CAMPANHA FÁCIL (BookPlay)
-- ═══════════════════════════════════════════════════════════════════════════
-- Persistência COMPARTILHADA por empresa das configurações do Campanha Fácil:
--   • mensagens adicionadas pelo usuário (biblioteca da campanha)
--   • configurações de desconto salvas
--   • quais mensagens PADRÃO foram ocultadas
--
-- No app original tudo isso ficava no localStorage (por navegador). Aqui passa
-- a viver no banco, visível/editável por toda a empresa BookPlay. O gate de
-- "só BookPlay" é feito na UI (aba aparece só no tenant bookplay); no banco a
-- isolação é por empresa_id + RLS (cada empresa só enxerga as suas linhas).
--
-- Acesso: qualquer membro da empresa pode ler e escrever (decisão: todos os
-- usuários logados da BookPlay usam a ferramenta). fn_can_access_empresa já
-- cobre "membro da empresa OU super_admin".

-- ─── 1. Mensagens adicionadas (biblioteca compartilhada) ─────────────────────
CREATE TABLE IF NOT EXISTS public.campanha_facil_mensagens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  titulo         TEXT NOT NULL,
  categoria      TEXT NOT NULL DEFAULT 'Personalizadas',
  -- corpo é preservado EXATAMENTE como digitado (só variáveis {{...}} são
  -- substituídas na geração da campanha) — nunca normalizar aqui.
  corpo          TEXT NOT NULL,
  criado_por     UUID,
  criado_por_nome TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cf_mensagens_empresa
  ON public.campanha_facil_mensagens(empresa_id, criado_em);

ALTER TABLE public.campanha_facil_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cf_mensagens_select" ON public.campanha_facil_mensagens;
CREATE POLICY "cf_mensagens_select" ON public.campanha_facil_mensagens
  FOR SELECT USING (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS "cf_mensagens_insert" ON public.campanha_facil_mensagens;
CREATE POLICY "cf_mensagens_insert" ON public.campanha_facil_mensagens
  FOR INSERT WITH CHECK (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS "cf_mensagens_update" ON public.campanha_facil_mensagens;
CREATE POLICY "cf_mensagens_update" ON public.campanha_facil_mensagens
  FOR UPDATE USING (public.fn_can_access_empresa(empresa_id))
  WITH CHECK (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS "cf_mensagens_delete" ON public.campanha_facil_mensagens;
CREATE POLICY "cf_mensagens_delete" ON public.campanha_facil_mensagens
  FOR DELETE USING (public.fn_can_access_empresa(empresa_id));

-- ─── 2. Configurações de desconto salvas (compartilhadas) ────────────────────
CREATE TABLE IF NOT EXISTS public.campanha_facil_descontos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  -- percentuais 0..100 (a UI valida; DB só guarda). Nomes espelham as chaves
  -- do app: overdue/settlement/interest/bundle/annual.
  overdue        NUMERIC(6,2) NOT NULL DEFAULT 0,
  settlement     NUMERIC(6,2) NOT NULL DEFAULT 0,
  interest       NUMERIC(6,2) NOT NULL DEFAULT 0,
  bundle         NUMERIC(6,2) NOT NULL DEFAULT 0,
  annual         NUMERIC(6,2) NOT NULL DEFAULT 0,
  criado_por     UUID,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Um nome de configuração por empresa (case-insensitive), como no app original
-- que atualizava a configuração existente ao salvar com o mesmo nome.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cf_descontos_empresa_nome
  ON public.campanha_facil_descontos(empresa_id, lower(nome));

ALTER TABLE public.campanha_facil_descontos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cf_descontos_select" ON public.campanha_facil_descontos;
CREATE POLICY "cf_descontos_select" ON public.campanha_facil_descontos
  FOR SELECT USING (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS "cf_descontos_insert" ON public.campanha_facil_descontos;
CREATE POLICY "cf_descontos_insert" ON public.campanha_facil_descontos
  FOR INSERT WITH CHECK (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS "cf_descontos_update" ON public.campanha_facil_descontos;
CREATE POLICY "cf_descontos_update" ON public.campanha_facil_descontos
  FOR UPDATE USING (public.fn_can_access_empresa(empresa_id))
  WITH CHECK (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS "cf_descontos_delete" ON public.campanha_facil_descontos;
CREATE POLICY "cf_descontos_delete" ON public.campanha_facil_descontos
  FOR DELETE USING (public.fn_can_access_empresa(empresa_id));

-- ─── 3. Mensagens PADRÃO ocultadas (por empresa) ─────────────────────────────
-- template_id é o id do modelo embutido no código (ex: 'garanta-desconto').
-- Ocultar/restaurar vale para toda a empresa.
CREATE TABLE IF NOT EXISTS public.campanha_facil_mensagens_ocultas (
  empresa_id   UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  template_id  TEXT NOT NULL,
  ocultado_por UUID,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, template_id)
);

ALTER TABLE public.campanha_facil_mensagens_ocultas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cf_ocultas_select" ON public.campanha_facil_mensagens_ocultas;
CREATE POLICY "cf_ocultas_select" ON public.campanha_facil_mensagens_ocultas
  FOR SELECT USING (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS "cf_ocultas_insert" ON public.campanha_facil_mensagens_ocultas;
CREATE POLICY "cf_ocultas_insert" ON public.campanha_facil_mensagens_ocultas
  FOR INSERT WITH CHECK (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS "cf_ocultas_delete" ON public.campanha_facil_mensagens_ocultas;
CREATE POLICY "cf_ocultas_delete" ON public.campanha_facil_mensagens_ocultas
  FOR DELETE USING (public.fn_can_access_empresa(empresa_id));
