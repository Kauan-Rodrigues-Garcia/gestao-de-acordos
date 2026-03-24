-- ================================================
-- IA: Configuração de integração (OpenAI via Edge Function)
-- ================================================

CREATE TABLE IF NOT EXISTS public.ai_config (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enabled      BOOLEAN NOT NULL DEFAULT false,
  model        TEXT    NOT NULL DEFAULT 'gpt-4o-mini',
  temperature  NUMERIC NOT NULL DEFAULT 0.2,
  max_rows     INT     NOT NULL DEFAULT 120,
  max_cols     INT     NOT NULL DEFAULT 20,
  prompt_system TEXT   NOT NULL DEFAULT 'Você é um assistente que normaliza dados de acordos financeiros importados de planilhas. Responda APENAS com JSON válido, sem markdown.',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.ai_config (enabled)
SELECT false
WHERE NOT EXISTS (SELECT 1 FROM public.ai_config);

ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;

-- Leitura liberada para qualquer usuário autenticado (o conteúdo não contém segredos)
DROP POLICY IF EXISTS "ai_config_select_auth" ON public.ai_config;
CREATE POLICY "ai_config_select_auth" ON public.ai_config
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Escrita somente para administradores
DROP POLICY IF EXISTS "ai_config_admin_write" ON public.ai_config;
CREATE POLICY "ai_config_admin_write" ON public.ai_config
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.perfil = 'administrador')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.perfil = 'administrador')
  );

