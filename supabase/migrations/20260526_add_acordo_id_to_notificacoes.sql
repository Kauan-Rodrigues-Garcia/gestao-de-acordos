-- Adiciona coluna acordo_id na tabela notificacoes para permitir navegação
-- direta ao acordo ao clicar em uma notificação de "Não Pago".
ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS acordo_id UUID REFERENCES public.acordos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notificacoes_acordo ON public.notificacoes(acordo_id);
