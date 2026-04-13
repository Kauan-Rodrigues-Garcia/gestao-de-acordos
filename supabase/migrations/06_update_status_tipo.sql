-- ============================================================
-- Migration 06: Atualização de enums status_acordo e tipo_acordo
-- ============================================================
-- Idempotente: usa blocos DO $$ BEGIN ... EXCEPTION ... END $$

-- ── 1. Migrar dados antes de alterar o enum ──────────────────
-- Converter status antigos para os novos valores
UPDATE public.acordos
  SET status = 'verificar_pendente'
  WHERE status::text IN ('pendente', 'verificar', 'em_acompanhamento', 'vencido');

UPDATE public.acordos
  SET status = 'nao_pago'
  WHERE status::text = 'cancelado';

-- ── 2. Recriar enum status_acordo com novos valores ──────────
-- PostgreSQL não suporta remoção de valores de enum; a forma segura é:
-- a) converter a coluna para text, b) dropar enum, c) recriar, d) reconverter

ALTER TABLE public.acordos ALTER COLUMN status TYPE text;

DO $$ BEGIN
  DROP TYPE IF EXISTS status_acordo;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE status_acordo AS ENUM ('verificar_pendente', 'pago', 'nao_pago');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.acordos
  ALTER COLUMN status TYPE status_acordo USING status::status_acordo,
  ALTER COLUMN status SET DEFAULT 'verificar_pendente';

-- ── 3. Adicionar novos valores ao enum tipo_acordo ────────────
DO $$ BEGIN
  ALTER TYPE tipo_acordo ADD VALUE IF NOT EXISTS 'cartao_recorrente';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE tipo_acordo ADD VALUE IF NOT EXISTS 'pix_automatico';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── 4. Criar tabela notificacoes (se não existir) ─────────────
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   UUID REFERENCES public.perfis(id) ON DELETE CASCADE,
  titulo       TEXT NOT NULL,
  mensagem     TEXT NOT NULL,
  lida         BOOLEAN NOT NULL DEFAULT false,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "notificacoes_own" ON public.notificacoes
    FOR ALL USING (usuario_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. RLS: líderes podem atualizar perfis dos seus operadores ─
DO $$ BEGIN
  CREATE POLICY "perfis_lider_update" ON public.perfis
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM public.perfis p
        WHERE p.id = auth.uid()
          AND p.perfil = 'lider'
          AND public.perfis.lider_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. RLS: permitir delete em acordos para operador dono ──────
DO $$ BEGIN
  CREATE POLICY "acordos_delete_own" ON public.acordos
    FOR DELETE USING (operador_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Admins/líderes também podem deletar (se policy admin_all não cobre)
DO $$ BEGIN
  CREATE POLICY "acordos_delete_admin" ON public.acordos
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM public.perfis p
        WHERE p.id = auth.uid()
          AND p.perfil IN ('administrador', 'lider')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
