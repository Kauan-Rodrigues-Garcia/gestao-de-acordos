
-- ================================================
-- EXTENSÕES
-- ================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- ENUM TYPES
-- ================================================
DO $$ BEGIN
  CREATE TYPE perfil_usuario AS ENUM ('operador', 'lider', 'administrador');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE status_acordo AS ENUM ('pendente', 'pago', 'verificar', 'vencido', 'cancelado', 'em_acompanhamento');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_acordo AS ENUM ('boleto', 'pix', 'cartao');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ================================================
-- TABELA: perfis (extensão do auth.users)
-- ================================================
CREATE TABLE IF NOT EXISTS public.perfis (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  perfil perfil_usuario NOT NULL DEFAULT 'operador',
  ativo BOOLEAN NOT NULL DEFAULT true,
  lider_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

-- ================================================
-- TABELA: acordos
-- ================================================
CREATE TABLE IF NOT EXISTS public.acordos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_cliente TEXT NOT NULL,
  nr_cliente TEXT NOT NULL,
  data_cadastro DATE NOT NULL DEFAULT CURRENT_DATE,
  vencimento DATE NOT NULL,
  valor NUMERIC(12, 2) NOT NULL,
  tipo tipo_acordo NOT NULL DEFAULT 'boleto',
  parcelas INTEGER DEFAULT 1,
  whatsapp TEXT,
  status status_acordo NOT NULL DEFAULT 'pendente',
  operador_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE RESTRICT,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.acordos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_acordos_operador ON public.acordos(operador_id);
CREATE INDEX IF NOT EXISTS idx_acordos_vencimento ON public.acordos(vencimento);
CREATE INDEX IF NOT EXISTS idx_acordos_status ON public.acordos(status);
CREATE INDEX IF NOT EXISTS idx_acordos_nr_cliente ON public.acordos(nr_cliente);

-- ================================================
-- TABELA: historico_acordos
-- ================================================
CREATE TABLE IF NOT EXISTS public.historico_acordos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  acordo_id UUID NOT NULL REFERENCES public.acordos(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE RESTRICT,
  campo_alterado TEXT NOT NULL,
  valor_anterior TEXT,
  valor_novo TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.historico_acordos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_historico_acordo ON public.historico_acordos(acordo_id);

-- ================================================
-- TABELA: logs_whatsapp
-- ================================================
CREATE TABLE IF NOT EXISTS public.logs_whatsapp (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  acordo_id UUID NOT NULL REFERENCES public.acordos(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE RESTRICT,
  mensagem TEXT NOT NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.logs_whatsapp ENABLE ROW LEVEL SECURITY;

-- ================================================
-- TABELA: modelos_mensagem
-- ================================================
CREATE TABLE IF NOT EXISTS public.modelos_mensagem (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.modelos_mensagem ENABLE ROW LEVEL SECURITY;

INSERT INTO public.modelos_mensagem (nome, conteudo) VALUES
('Lembrete Padrão','Olá, {{nome_cliente}}, passando para lembrar do seu acordo NR {{nr_cliente}}, no valor de {{valor}}, com vencimento em {{vencimento}}. Qualquer dúvida, estamos à disposição.')
ON CONFLICT DO NOTHING;

-- ================================================
-- TABELA: logs_sistema
-- ================================================
CREATE TABLE IF NOT EXISTS public.logs_sistema (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  tabela TEXT,
  registro_id TEXT,
  detalhes JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.logs_sistema ENABLE ROW LEVEL SECURITY;

-- ================================================
-- TRIGGERS: timestamps automáticos
-- ================================================
CREATE OR REPLACE FUNCTION public.fn_atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_perfis_updated
  BEFORE UPDATE ON public.perfis FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp();

CREATE OR REPLACE TRIGGER trg_acordos_updated
  BEFORE UPDATE ON public.acordos FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp();

-- ================================================
-- TRIGGER: criar perfil no signup
-- ================================================
CREATE OR REPLACE FUNCTION public.fn_criar_perfil_novo_usuario()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfis (id, nome, email, perfil)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'perfil')::perfil_usuario, 'operador')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_novo_usuario
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.fn_criar_perfil_novo_usuario();

-- ================================================
-- RLS: perfis
-- ================================================
DROP POLICY IF EXISTS "perfis_select" ON public.perfis;
CREATE POLICY "perfis_select" ON public.perfis FOR SELECT USING (
  auth.uid() = id OR EXISTS (
    SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.perfil IN ('lider','administrador')
  )
);
DROP POLICY IF EXISTS "perfis_update_own" ON public.perfis;
CREATE POLICY "perfis_update_own" ON public.perfis FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "perfis_admin_all" ON public.perfis;
CREATE POLICY "perfis_admin_all" ON public.perfis FOR ALL USING (
  EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.perfil = 'administrador')
);

-- ================================================
-- RLS: acordos
-- ================================================
DROP POLICY IF EXISTS "acordos_access" ON public.acordos;
CREATE POLICY "acordos_access" ON public.acordos FOR ALL USING (
  operador_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.perfil IN ('lider','administrador')
  )
);

-- ================================================
-- RLS: historico_acordos
-- ================================================
DROP POLICY IF EXISTS "historico_select" ON public.historico_acordos;
CREATE POLICY "historico_select" ON public.historico_acordos FOR SELECT USING (
  usuario_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.perfil IN ('lider','administrador')
  )
);
DROP POLICY IF EXISTS "historico_insert" ON public.historico_acordos;
CREATE POLICY "historico_insert" ON public.historico_acordos FOR INSERT WITH CHECK (usuario_id = auth.uid());

-- ================================================
-- RLS: logs_whatsapp
-- ================================================
DROP POLICY IF EXISTS "logs_wa_select" ON public.logs_whatsapp;
CREATE POLICY "logs_wa_select" ON public.logs_whatsapp FOR SELECT USING (
  usuario_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.perfil IN ('lider','administrador')
  )
);
DROP POLICY IF EXISTS "logs_wa_insert" ON public.logs_whatsapp;
CREATE POLICY "logs_wa_insert" ON public.logs_whatsapp FOR INSERT WITH CHECK (usuario_id = auth.uid());

-- ================================================
-- RLS: modelos_mensagem
-- ================================================
DROP POLICY IF EXISTS "modelos_select" ON public.modelos_mensagem;
CREATE POLICY "modelos_select" ON public.modelos_mensagem FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "modelos_admin" ON public.modelos_mensagem;
CREATE POLICY "modelos_admin" ON public.modelos_mensagem FOR ALL USING (
  EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.perfil = 'administrador')
);

-- ================================================
-- RLS: logs_sistema
-- ================================================
DROP POLICY IF EXISTS "logs_sis_admin" ON public.logs_sistema;
CREATE POLICY "logs_sis_admin" ON public.logs_sistema FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.perfil = 'administrador')
);
DROP POLICY IF EXISTS "logs_sis_insert" ON public.logs_sistema;
CREATE POLICY "logs_sis_insert" ON public.logs_sistema FOR INSERT WITH CHECK (auth.role() = 'authenticated');
